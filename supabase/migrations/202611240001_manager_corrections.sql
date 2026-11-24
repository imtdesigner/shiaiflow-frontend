-- Manager corrections (owner, 2026-11-24): the manager can fix anything while
-- the tournament runs — a pool order by hand, the fighters of a KO fight by
-- hand, fights to be fought again after a correction (or kept as fought) —
-- and every such change is written to a log.

alter table public.pools
  add column manual_order boolean not null default false,
  add column manual_reason text;

alter table public.matches
  add column manual_entries boolean not null default false,
  add column kept_as_fought boolean not null default false;

create table public.correction_log (
  id bigint generated always as identity primary key,
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  category_id uuid references public.categories(id) on delete cascade,
  match_id uuid references public.matches(id) on delete set null,
  kind text not null check (kind in ('reopen', 'replay', 'keep', 'order', 'order_reset', 'swap', 'swap_reset')),
  note text,
  before jsonb,
  after jsonb,
  by_user uuid default auth.uid(),
  at timestamptz not null default now()
);
create index correction_log_tournament on public.correction_log (tournament_id, at desc);
create index correction_log_category on public.correction_log (category_id);
create index correction_log_match on public.correction_log (match_id);

alter table public.correction_log enable row level security;
create policy "Managers read" on public.correction_log for select to authenticated
  using (private.has_tournament_role(tournament_id, array['owner', 'organizer']));
create policy "Managers write" on public.correction_log for insert to authenticated
  with check (private.has_tournament_role(tournament_id, array['owner', 'organizer']));

-- a scorer still only scores: the manual flags are the manager's
create or replace function private.scorer_fight_progress_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then return new; end if;
  if private.has_tournament_role(private.category_tournament(old.category_id), array['owner', 'organizer']) then
    return new;
  end if;
  if new.category_id is distinct from old.category_id
    or new.phase is distinct from old.phase
    or new.label is distinct from old.label
    or new.pool_id is distinct from old.pool_id
    or new.ko_no is distinct from old.ko_no
    or new.red_code is distinct from old.red_code
    or new.white_code is distinct from old.white_code
    or new.shiaijo is distinct from old.shiaijo
    or new.court_manual is distinct from old.court_manual
    or new.queue_order is distinct from old.queue_order
    or new.end_block is distinct from old.end_block
    or new.manual_entries is distinct from old.manual_entries
    or new.kept_as_fought is distinct from old.kept_as_fought
    or (old.manual_entries and (new.red_entry_id is distinct from old.red_entry_id
      or new.white_entry_id is distinct from old.white_entry_id)) then
    raise exception 'A scoretable can only score fights, not change the plan.';
  end if;
  return new;
end;
$$;

grant select, insert on public.correction_log to authenticated;
