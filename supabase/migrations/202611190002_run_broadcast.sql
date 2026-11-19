-- Live updates per tournament (owner, 2026-11-19): every change of a fight,
-- a score event or a team bout sends one small broadcast to the topic
-- 'run:<tournament id>'. Screens listen only to their own tournament instead
-- of every change in the database (postgres_changes), so several tournaments
-- on the same day do not wake each other's screens. The payload carries ids
-- only; screens reload what they show through RLS as before.

create or replace function private.broadcast_run_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec record := coalesce(new, old);
  t_id uuid;
  m_id uuid;
begin
  if tg_table_name = 'matches' then
    m_id := rec.id;
    t_id := private.category_tournament(rec.category_id);
  else
    m_id := rec.match_id;
    t_id := private.match_tournament(rec.match_id); -- null when the match itself is being deleted
  end if;
  if t_id is not null then
    perform realtime.send(jsonb_build_object('table', tg_table_name, 'match_id', m_id), 'change', 'run:' || t_id, false);
  end if;
  return null;
end;
$$;

create trigger matches_broadcast after insert or update or delete on public.matches
  for each row execute function private.broadcast_run_change();
create trigger score_events_broadcast after insert or update or delete on public.score_events
  for each row execute function private.broadcast_run_change();
create trigger bouts_broadcast after insert or update or delete on public.bouts
  for each row execute function private.broadcast_run_change();

-- The old row-change feed (supabase_realtime publication) stays until the new
-- frontend is deployed; then 202611190003 removes these tables from it.
