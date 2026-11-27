-- Start category (owner, 2026-11-27): between categories the screens show
-- "Next: <category>" and its fights appear only once the manager or one of its
-- tables presses Start category (categories.started_at). A category whose
-- fight already started counts as started too. Sends a live broadcast.

alter table public.categories add column started_at timestamptz;

create or replace function public.start_category(c_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  t_id uuid := private.category_tournament(c_id);
  ts timestamptz;
begin
  if t_id is null then raise exception 'Unknown category.'; end if;
  if not private.has_tournament_role(t_id, array['owner', 'organizer', 'scorer']) then
    raise exception 'Only the tournament manager or a scoretable can start a category.';
  end if;
  if (select status from public.tournaments where id = t_id) <> 'running' then
    raise exception 'Start the tournament first.';
  end if;
  update public.categories set started_at = coalesce(started_at, now()) where id = c_id returning started_at into ts;
  perform realtime.send(jsonb_build_object('table', 'categories', 'category_id', c_id), 'change', 'run:' || t_id, false);
  return ts;
end;
$$;
revoke execute on function public.start_category(uuid) from public, anon;
grant execute on function public.start_category(uuid) to authenticated;
