-- Pool places live (2026-11-25): when a pool's places change (a pool finished,
-- a corrected fight scored again at a table, an order by hand) Manage must see
-- it at once — the KO check after a correction reads these places. Places are
-- written after the fight itself, so the fight's own broadcast can come too
-- early: pool_entries and pools now broadcast to 'run:<tournament id>' as well.

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
  elsif tg_table_name = 'pools' then
    t_id := private.category_tournament(rec.category_id);
  elsif tg_table_name = 'pool_entries' then
    t_id := (select private.category_tournament(p.category_id) from public.pools p where p.id = rec.pool_id);
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

-- only real place / order changes, not the draw inserting its pools
create trigger pool_entries_broadcast after update of final_place on public.pool_entries
  for each row when (old.final_place is distinct from new.final_place)
  execute function private.broadcast_run_change();
create trigger pools_broadcast after update of manual_order on public.pools
  for each row when (old.manual_order is distinct from new.manual_order)
  execute function private.broadcast_run_change();
