-- Table devices (owner, 2026-11-20): a scorer (joined through the Table door
-- with the PIN) changes only how a fight runs — start, timer, result, the
-- fighters filled in after a fight, the court order when a later fight is
-- started — never the plan: category, phase, label, pool, KO number / slots,
-- shiaijo, manual court, queue order, end block. Owners and organizers are
-- not limited.
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
    or new.end_block is distinct from old.end_block then
    raise exception 'A scoretable can only score fights, not change the plan.';
  end if;
  return new;
end;
$$;

revoke execute on function private.scorer_fight_progress_only() from public;

create trigger matches_scorer_progress_only
  before update on public.matches
  for each row execute function private.scorer_fight_progress_only();
