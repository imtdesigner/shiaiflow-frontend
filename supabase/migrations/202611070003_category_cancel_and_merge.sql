-- Small categories (owner's rule, 2026-11-07): with 3 entries there is no KO,
-- so the organizer may cancel the category or move everyone to a stronger one.

alter table public.categories drop constraint categories_status_check;
alter table public.categories add constraint categories_status_check
  check (status in ('registration', 'drawn', 'pools', 'ko', 'finished', 'cancelled'));

-- Move all entries of `src` into `dst` (same tournament and kind, both still in
-- registration) and cancel `src`. Entries already present in `dst` are dropped
-- from `src`. Runs as the caller, so RLS still applies; returns moved count.
create or replace function public.move_category_entries(src uuid, dst uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  t_id uuid;
  moved integer;
begin
  if src = dst then
    raise exception 'Odaberi drugu kategoriju.';
  end if;

  select s.tournament_id into t_id
  from public.categories s
  join public.categories d on d.tournament_id = s.tournament_id and d.kind = s.kind
  where s.id = src and d.id = dst;
  if t_id is null then
    raise exception 'Kategorije moraju biti u istom turniru i iste vrste (pojedinačno/ekipno).';
  end if;

  if not private.has_tournament_role(t_id, array['owner', 'organizer']) then
    raise exception 'Samo organizator može premještati prijave.';
  end if;

  if exists (select 1 from public.categories where id in (src, dst) and status <> 'registration') then
    raise exception 'Obje kategorije moraju biti u fazi prijava (bez ždrijeba).';
  end if;

  delete from public.entries e
  using public.entries d
  where e.category_id = src
    and d.category_id = dst
    and (e.competitor_id = d.competitor_id or e.team_id = d.team_id);

  update public.entries set category_id = dst where category_id = src;
  get diagnostics moved = row_count;

  update public.categories set status = 'cancelled' where id = src;
  return moved;
end;
$$;

revoke execute on function public.move_category_entries(uuid, uuid) from public, anon;
grant execute on function public.move_category_entries(uuid, uuid) to authenticated;
