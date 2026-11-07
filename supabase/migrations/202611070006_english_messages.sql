-- UI language is English: error messages of move_category_entries in English.
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
    raise exception 'Choose a different category.';
  end if;

  select s.tournament_id into t_id
  from public.categories s
  join public.categories d on d.tournament_id = s.tournament_id and d.kind = s.kind
  where s.id = src and d.id = dst;
  if t_id is null then
    raise exception 'Both categories must be in the same tournament and of the same type (individual/team).';
  end if;

  if not private.has_tournament_role(t_id, array['owner', 'organizer']) then
    raise exception 'Only organizers can move entries.';
  end if;

  if exists (select 1 from public.categories where id in (src, dst) and status <> 'registration') then
    raise exception 'Both categories must still be in registration (no draw yet).';
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

