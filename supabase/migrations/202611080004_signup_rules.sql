-- Signup rules (owner, 2026-11-08):
--   age by birth year or by exact age on the first tournament day (organizer
--   picks per tournament; exact age needs the date of birth);
--   optionally a competitor may enter only one individual category;
--   teams: 3+1 or 5+2 members, same dojo only (optional), optional rules per
--   position (senpo … taisho: gender / age / grade) — then the fighting order
--   is fixed; off = the team list is handed in at the tournament.

alter table public.tournaments
  add column age_basis text not null default 'birth_year' check (age_basis in ('birth_year', 'birth_date')),
  add column single_category boolean not null default false;

alter table public.competitors add column birth_date date;

alter table public.categories
  add column team_same_dojo boolean not null default false,
  add column position_rules jsonb check (position_rules is null or jsonb_typeof(position_rules) = 'array');

/** Age for the rules: tournament year − birth year, or exact age on the day. */
create or replace function private.rule_age(basis text, p_birth_year integer, p_birth_date date, t_date date)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when basis = 'birth_date' then
      case when p_birth_date is null then null else extract(year from age(t_date, p_birth_date))::integer end
    else
      case when coalesce(p_birth_year, extract(year from p_birth_date)::integer) is null then null
           else extract(year from t_date)::integer - coalesce(p_birth_year, extract(year from p_birth_date)::integer) end
  end;
$$;

/**
 * Why a person does not meet a rule set (category row as jsonb, or one
 * position rule {gender, min_age, max_age, min_grade, max_grade}); null = ok.
 * Same as eligibility.js.
 */
create or replace function private.rule_reason(r jsonb, p_gender text, p_age integer, p_grade integer, basis text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when r->>'gender' is not null and p_gender is distinct from r->>'gender' then
      case when r->>'gender' = 'M' then 'men only' else 'women only' end
    when (r->>'min_age' is not null or r->>'max_age' is not null) and p_age is null then
      case when basis = 'birth_date' then 'date of birth needed' else 'birth year needed' end
    when r->>'min_age' is not null and p_age < (r->>'min_age')::integer then 'from ' || (r->>'min_age') || ' years'
    when r->>'max_age' is not null and p_age > (r->>'max_age')::integer then 'up to ' || (r->>'max_age') || ' years'
    when (r->>'min_grade' is not null or r->>'max_grade' is not null) and p_grade is null then 'grade needed'
    when r->>'min_grade' is not null and p_grade < (r->>'min_grade')::integer then 'grade too low'
    when r->>'max_grade' is not null and p_grade > (r->>'max_grade')::integer then 'grade too high'
    else null
  end;
$$;

/** Members allowed in a team: 3+1 or 5+2. */
create or replace function private.team_max_members(team_size integer)
returns integer language sql immutable set search_path = '' as $$
  select case when team_size = 5 then 7 else team_size + 1 end;
$$;

/**
 * Checks a team after a change: size, same dojo, category rules for every
 * member and, with position rules, member i (fighting order) against
 * position i; reserves must fit some position. Raises on the first problem.
 */
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
  pos jsonb;
  ok boolean;
  names text[] := array['senpo', 'jiho', 'chuken', 'fukusho', 'taisho'];
begin
  select * into t from public.tournaments where id = cat.tournament_id;
  select * into tm from public.teams where id = tm_id;
  for m in
    select c.*, tmm.sort_order from public.team_members tmm
    join public.competitors c on c.id = tmm.competitor_id
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
      if n <= cat.team_size then
        pos := cat.position_rules -> (n - 1);
        why := private.rule_reason(coalesce(pos, '{}'::jsonb), m.gender, a, m.grade_rank, t.age_basis);
        if why is not null then
          raise exception '% % as %: %', m.last_name, m.first_name,
            case when cat.team_size = 3 then (array['senpo', 'chuken', 'taisho'])[n] else names[n] end, why;
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
  if n > private.team_max_members(cat.team_size) then
    raise exception 'A team has at most % members (% + %).', private.team_max_members(cat.team_size), cat.team_size,
      private.team_max_members(cat.team_size) - cat.team_size;
  end if;
end;
$$;

drop function if exists private.ineligible_reason(public.categories, text, integer, integer, integer);
drop function if exists public.public_register(uuid, text, text, text, text, uuid, text, text, integer, integer, text);

create or replace function public.public_register(
  c_id uuid, last_name text, first_name text default '', club text default null, grade text default null,
  team_id uuid default null, team_name text default null,
  gender text default null, birth_year integer default null, grade_rank integer default null,
  email text default null, birth_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  cat public.categories;
  t record;
  comp_id uuid;
  tm_id uuid;
  why text;
  ln text := upper(trim(last_name));
  fn text := coalesce(trim(first_name), '');
  cl text := nullif(trim(coalesce(club, '')), '');
  b_year integer := coalesce(birth_year, extract(year from birth_date)::integer);
begin
  select * into cat from public.categories where id = c_id;
  if cat.id is null then raise exception 'Unknown category.'; end if;
  select * into t from public.tournaments where id = cat.tournament_id;
  if not private.registration_is_open(t.id) then raise exception 'Registration is closed.'; end if;
  if cat.status <> 'registration' and not t.draws_confirmed then raise exception 'This category is already drawn.'; end if;
  if length(ln) = 0 then raise exception 'Last name is required.'; end if;
  why := private.rule_reason(to_jsonb(cat), gender,
    private.rule_age(t.age_basis, b_year, birth_date, coalesce(t.start_date, current_date)), grade_rank, t.age_basis);
  if why is not null then raise exception '%: %', cat.name, why; end if;

  select id into comp_id from public.competitors
    where tournament_id = t.id and competitors.last_name = ln and competitors.first_name = fn
      and coalesce(competitors.club, '') = coalesce(cl, '')
    limit 1;
  if comp_id is null then
    insert into public.competitors (tournament_id, last_name, first_name, club, grade, gender, birth_year, birth_date, grade_rank)
    values (t.id, ln, fn, cl, nullif(trim(coalesce(grade, '')), ''), gender, b_year, birth_date, grade_rank)
    returning id into comp_id;
  else
    update public.competitors set
      gender = coalesce(competitors.gender, public_register.gender),
      birth_year = coalesce(competitors.birth_year, b_year),
      birth_date = coalesce(competitors.birth_date, public_register.birth_date),
      grade_rank = coalesce(competitors.grade_rank, public_register.grade_rank),
      grade = coalesce(competitors.grade, nullif(trim(coalesce(public_register.grade, '')), ''))
    where id = comp_id;
  end if;

  if nullif(trim(coalesce(email, '')), '') is not null then
    insert into public.competitor_contacts (competitor_id, email) values (comp_id, trim(email))
    on conflict (competitor_id) do update set email = excluded.email;
  end if;

  if cat.kind = 'individual' then
    if t.single_category and exists (
      select 1 from public.entries e join public.categories c2 on c2.id = e.category_id
      where e.competitor_id = comp_id and c2.tournament_id = t.id and c2.id <> c_id and c2.status <> 'cancelled'
    ) then
      raise exception '%: a competitor may enter only one individual category in this tournament.', cat.name;
    end if;
    insert into public.entries (category_id, competitor_id) values (c_id, comp_id)
    on conflict (category_id, competitor_id) do nothing;
    return comp_id;
  end if;

  if t.team_signup <> 'with_competitor' then
    raise exception 'Teams register as a team in this tournament.';
  end if;
  if team_id is not null then
    select id into tm_id from public.teams where id = team_id and tournament_id = t.id;
    if tm_id is null then raise exception 'Unknown team.'; end if;
  elsif length(trim(coalesce(team_name, ''))) > 0 then
    select id into tm_id from public.teams where tournament_id = t.id and name = upper(trim(team_name));
    if tm_id is null then
      insert into public.teams (tournament_id, name, club) values (t.id, upper(trim(team_name)), cl) returning id into tm_id;
    end if;
  else
    raise exception 'Choose a team or type a new team name.';
  end if;

  if not t.multi_team and exists (
    select 1 from public.team_members m
    join public.entries e on e.team_id = m.team_id
    where m.competitor_id = comp_id and m.team_id <> tm_id and e.category_id <> c_id
  ) then
    raise exception 'This competitor is already in a team of another category.';
  end if;

  -- With position rules the member takes the first free position they fit
  -- (then the reserve places); otherwise the next place.
  if not exists (select 1 from public.team_members where team_members.team_id = tm_id and competitor_id = comp_id) then
    insert into public.team_members (team_id, competitor_id, sort_order)
    values (tm_id, comp_id, coalesce((
      select min(i) from generate_series(0, private.team_max_members(cat.team_size) - 1) i
      where not exists (select 1 from public.team_members x where x.team_id = tm_id and x.sort_order = i)
        and (cat.position_rules is null or i >= cat.team_size
             or private.rule_reason(cat.position_rules -> i, gender,
                  private.rule_age(t.age_basis, b_year, birth_date, coalesce(t.start_date, current_date)), grade_rank, t.age_basis) is null)
    ), private.team_max_members(cat.team_size)));
  end if;
  perform private.check_team(cat, tm_id);
  insert into public.entries (category_id, team_id) values (c_id, tm_id)
  on conflict (category_id, team_id) do nothing;
  return comp_id;
end;
$$;
revoke execute on function public.public_register(uuid, text, text, text, text, uuid, text, text, integer, integer, text, date) from public;
grant execute on function public.public_register(uuid, text, text, text, text, uuid, text, text, integer, integer, text, date) to anon, authenticated;

create or replace function public.public_register_team(c_id uuid, team_name text, club text, member_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  cat public.categories;
  t record;
  tm_id uuid;
  m uuid;
  i int := 0;
begin
  select * into cat from public.categories where id = c_id;
  if cat.id is null or cat.kind <> 'team' then raise exception 'Not a team category.'; end if;
  select * into t from public.tournaments where id = cat.tournament_id;
  if not private.registration_is_open(t.id) then raise exception 'Registration is closed.'; end if;
  if cat.status <> 'registration' then raise exception 'This category is already drawn.'; end if;
  if length(trim(coalesce(team_name, ''))) = 0 then raise exception 'Team name is required.'; end if;
  if cat.team_same_dojo and length(trim(coalesce(club, ''))) = 0 then raise exception 'Enter the dojo of the team.'; end if;
  if exists (select 1 from public.teams where tournament_id = t.id and name = upper(trim(team_name))) then
    raise exception 'A team with this name is already registered.';
  end if;
  insert into public.teams (tournament_id, name, club)
  values (t.id, upper(trim(team_name)), nullif(trim(coalesce(club, '')), '')) returning id into tm_id;
  foreach m in array coalesce(member_ids, '{}') loop
    if not exists (select 1 from public.competitors where id = m and tournament_id = t.id) then
      raise exception 'Unknown competitor.';
    end if;
    if not t.multi_team and exists (
      select 1 from public.team_members tm join public.entries e on e.team_id = tm.team_id
      where tm.competitor_id = m and e.category_id <> c_id
    ) then
      raise exception 'A member is already in a team of another category.';
    end if;
    insert into public.team_members (team_id, competitor_id, sort_order) values (tm_id, m, i);
    i := i + 1;
  end loop;
  perform private.check_team(cat, tm_id);
  insert into public.entries (category_id, team_id) values (c_id, tm_id);
  return tm_id;
end;
$$;
revoke execute on function public.public_register_team(uuid, text, text, uuid[]) from public;
grant execute on function public.public_register_team(uuid, text, text, uuid[]) to anon, authenticated;
