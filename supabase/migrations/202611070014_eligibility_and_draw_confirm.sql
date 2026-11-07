-- Category rules and smart registration (owner, 2026-11-07):
--   a category may limit gender, age (by birth year: tournament year − birth
--   year) and grade (mudan −7, 6 kyu −6 … 1 kyu −1, 1 dan 1 … 8 dan 8);
--   the public form preselects every allowed category, forbidden ones cannot
--   be chosen (enforced here too).
-- Draws confirmed: after it editors stop changing the setup; entries may still
-- change and the draw is adjusted with as little change as possible.

alter table public.competitors
  add column gender text check (gender in ('M', 'F')),
  add column birth_year smallint check (birth_year between 1900 and 2100),
  add column grade_rank smallint check (grade_rank between -7 and 8);

alter table public.categories
  add column gender text check (gender in ('M', 'F')),
  add column min_age smallint check (min_age between 0 and 120),
  add column max_age smallint check (max_age between 0 and 120),
  add column min_grade smallint check (min_grade between -7 and 8),
  add column max_grade smallint check (max_grade between -7 and 8);

alter table public.tournaments add column draws_confirmed boolean not null default false;

-- Contact of a competitor (for change notifications later). Kept out of the
-- public competitors table: only owner/organizers can read it.
create table public.competitor_contacts (
  competitor_id uuid primary key references public.competitors (id) on delete cascade,
  email text check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);
alter table public.competitor_contacts enable row level security;
grant select, insert, update, delete on public.competitor_contacts to authenticated;
create policy "Organizers see contacts" on public.competitor_contacts for all to authenticated
  using (private.has_tournament_role((select c.tournament_id from public.competitors c where c.id = competitor_id), array['owner', 'organizer']))
  with check (private.has_tournament_role((select c.tournament_id from public.competitors c where c.id = competitor_id), array['owner', 'organizer']));

-- Same rules as eligibility.js; null = may enter.
create or replace function private.ineligible_reason(
  c public.categories, p_gender text, p_birth_year integer, p_grade integer, t_year integer
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when c.gender is not null and p_gender is distinct from c.gender then
      case when c.gender = 'M' then 'men only' else 'women only' end
    when (c.min_age is not null or c.max_age is not null) and p_birth_year is null then 'birth year needed'
    when c.min_age is not null and t_year - p_birth_year < c.min_age then 'from ' || c.min_age || ' years'
    when c.max_age is not null and t_year - p_birth_year > c.max_age then 'up to ' || c.max_age || ' years'
    when (c.min_grade is not null or c.max_grade is not null) and p_grade is null then 'grade needed'
    when c.min_grade is not null and p_grade < c.min_grade then 'grade too low'
    when c.max_grade is not null and p_grade > c.max_grade then 'grade too high'
    else null
  end;
$$;

drop function if exists public.public_register(uuid, text, text, text, text, uuid, text);

create or replace function public.public_register(
  c_id uuid, last_name text, first_name text default '', club text default null, grade text default null,
  team_id uuid default null, team_name text default null,
  gender text default null, birth_year integer default null, grade_rank integer default null,
  email text default null
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
begin
  select * into cat from public.categories where id = c_id;
  if cat.id is null then raise exception 'Unknown category.'; end if;
  select * into t from public.tournaments where id = cat.tournament_id;
  if not private.registration_is_open(t.id) then raise exception 'Registration is closed.'; end if;
  if cat.status <> 'registration' and not t.draws_confirmed then raise exception 'This category is already drawn.'; end if;
  if length(ln) = 0 then raise exception 'Last name is required.'; end if;
  why := private.ineligible_reason(cat, gender, birth_year, grade_rank,
    extract(year from coalesce(t.start_date, current_date))::integer);
  if why is not null then raise exception '%: %', cat.name, why; end if;

  select id into comp_id from public.competitors
    where tournament_id = t.id and competitors.last_name = ln and competitors.first_name = fn
      and coalesce(competitors.club, '') = coalesce(cl, '')
    limit 1;
  if comp_id is null then
    insert into public.competitors (tournament_id, last_name, first_name, club, grade, gender, birth_year, grade_rank)
    values (t.id, ln, fn, cl, nullif(trim(coalesce(grade, '')), ''), gender, birth_year, grade_rank)
    returning id into comp_id;
  else
    update public.competitors set
      gender = coalesce(competitors.gender, public_register.gender),
      birth_year = coalesce(competitors.birth_year, public_register.birth_year),
      grade_rank = coalesce(competitors.grade_rank, public_register.grade_rank),
      grade = coalesce(competitors.grade, nullif(trim(coalesce(public_register.grade, '')), ''))
    where id = comp_id;
  end if;

  if nullif(trim(coalesce(email, '')), '') is not null then
    insert into public.competitor_contacts (competitor_id, email) values (comp_id, trim(email))
    on conflict (competitor_id) do update set email = excluded.email;
  end if;

  if cat.kind = 'individual' then
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

  insert into public.team_members (team_id, competitor_id, sort_order)
  values (tm_id, comp_id, (select count(*) from public.team_members where team_members.team_id = tm_id))
  on conflict do nothing;
  insert into public.entries (category_id, team_id) values (c_id, tm_id)
  on conflict (category_id, team_id) do nothing;
  return comp_id;
end;
$$;
revoke execute on function public.public_register(uuid, text, text, text, text, uuid, text, text, integer, integer, text) from public;
grant execute on function public.public_register(uuid, text, text, text, text, uuid, text, text, integer, integer, text) to anon, authenticated;
