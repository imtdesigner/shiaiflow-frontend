-- check_team: the position of a member is its sort_order (a position may stay
-- empty while the team is filled up), not its place in the list.
create or replace function private.check_team(cat public.categories, tm_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  t record;
  tm record;
  m record;
  n integer := 0;
  why text;
  a integer;
  ok boolean;
  names text[] := case when cat.team_size = 3 then array['senpo', 'chuken', 'taisho']
                       else array['senpo', 'jiho', 'chuken', 'fukusho', 'taisho'] end;
begin
  select * into t from public.tournaments where id = cat.tournament_id;
  select * into tm from public.teams where id = tm_id;
  for m in
    select c.*, cc.birth_date, tmm.sort_order from public.team_members tmm
    join public.competitors c on c.id = tmm.competitor_id
    left join public.competitor_contacts cc on cc.competitor_id = c.id
    where tmm.team_id = tm_id order by tmm.sort_order, c.last_name
  loop
    n := n + 1;
    a := private.rule_age(t.age_basis, m.birth_year, m.birth_date, coalesce(t.start_date, current_date));
    why := private.rule_reason(to_jsonb(cat), m.gender, a, m.grade_rank, t.age_basis);
    if why is not null then raise exception '% %: %', m.last_name, m.first_name, why; end if;
    if cat.team_same_dojo and lower(coalesce(m.club, '')) is distinct from lower(coalesce(tm.club, '')) then
      raise exception '% %: the team must be from one dojo (%).', m.last_name, m.first_name, coalesce(tm.club, 'no dojo given');
    end if;
    if cat.position_rules is not null then
      if m.sort_order < cat.team_size then
        why := private.rule_reason(coalesce(cat.position_rules -> m.sort_order, '{}'::jsonb), m.gender, a, m.grade_rank, t.age_basis);
        if why is not null then
          raise exception '% % as %: %', m.last_name, m.first_name, names[m.sort_order + 1], why;
        end if;
      else
        select bool_or(private.rule_reason(p, m.gender, a, m.grade_rank, t.age_basis) is null) into ok
        from jsonb_array_elements(cat.position_rules) p;
        if not coalesce(ok, true) then
          raise exception '% % (reserve) fits no position of the team.', m.last_name, m.first_name;
        end if;
      end if;
    end if;
  end loop;
  if n > private.team_max_members(cat.team_size)
     or exists (select 1 from public.team_members x where x.team_id = tm_id and x.sort_order >= private.team_max_members(cat.team_size)) then
    raise exception 'A team has at most % members (% + %), and each must fit a free place.', private.team_max_members(cat.team_size), cat.team_size,
      private.team_max_members(cat.team_size) - cat.team_size;
  end if;
end;
$$;
