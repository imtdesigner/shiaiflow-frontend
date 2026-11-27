-- Category requests + note to the organizer (owner, 2026-11-27). A person who
-- does not fit a category's rules may ask to enter anyway (with a reason): the
-- request waits in Registration (Accept = entry, or ronin in a team category;
-- Decline). Not drawn while waiting. Any person may leave a free note to the
-- organizer (competitor_contacts.note, organizers only).

create table public.category_requests (
  category_id uuid not null references public.categories (id) on delete cascade,
  competitor_id uuid not null references public.competitors (id) on delete cascade,
  reason text,
  rule text, -- which rule the person does not meet, at the time of asking
  created_at timestamptz not null default now(),
  primary key (category_id, competitor_id)
);
alter table public.category_requests enable row level security;
grant select, insert, update, delete on public.category_requests to authenticated;
create policy "Organizers" on public.category_requests for all to authenticated
  using (private.has_tournament_role(private.category_tournament(category_id), array['owner', 'organizer']))
  with check (private.has_tournament_role(private.category_tournament(category_id), array['owner', 'organizer']));

alter table public.competitor_contacts add column note text check (length(note) <= 1000);

drop function if exists public.public_register(uuid, text, text, text, text, uuid, text, text, integer, integer, text, date, text, jsonb, boolean);

create or replace function public.public_register(
  c_id uuid, last_name text, first_name text default '', club text default null, grade text default null,
  team_id uuid default null, team_name text default null,
  gender text default null, birth_year integer default null, grade_rank integer default null,
  email text default null, birth_date date default null,
  dojo_email text default null, consents jsonb default null,
  as_ronin boolean default false,
  as_request boolean default false, request_reason text default null, note text default null
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
  f jsonb;
  k text;
  em text := nullif(trim(coalesce(email, '')), '');
  dem text := nullif(trim(coalesce(dojo_email, '')), '');
  given jsonb := '{}'::jsonb;
  nt text := nullif(trim(coalesce(note, '')), '');
  pending boolean := false;
begin
  select * into cat from public.categories where id = c_id;
  if cat.id is null then raise exception 'Unknown category.'; end if;
  select * into t from public.tournaments where id = cat.tournament_id;
  if not private.registration_is_open(t.id) then raise exception 'Registration is closed.'; end if;
  if cat.status <> 'registration' and not t.draws_confirmed then raise exception 'This category is already drawn.'; end if;
  if length(ln) = 0 then raise exception 'Last name is required.'; end if;
  -- fields and consents the organizer asks for
  f := coalesce(t.signup_fields, '{}'::jsonb);
  if f->>'email' = 'required' and em is null then raise exception 'Email is required.'; end if;
  if f->>'dojo_email' = 'required' and dem is null then raise exception 'Dojo email is required.'; end if;
  for k in select key from jsonb_each_text(coalesce(f->'consents', '{}'::jsonb)) where value in ('ask', 'required') loop
    if f->'consents'->>k = 'required' and coalesce((consents->>k)::boolean, false) is not true then
      raise exception 'Consent needed: %.', replace(k, '_', ' ');
    end if;
    given := given || jsonb_build_object(k, coalesce((consents->>k)::boolean, false));
  end loop;
  why := private.rule_reason(to_jsonb(cat), gender,
    private.rule_age(t.age_basis, b_year, birth_date, coalesce(t.start_date, current_date)), grade_rank, t.age_basis);
  -- a category the person does not fit: refused, or asked for (the organizer decides)
  if why is not null then
    if not coalesce(as_request, false) then raise exception '%: %', cat.name, why; end if;
    pending := true;
  end if;

  select id into comp_id from public.competitors
    where tournament_id = t.id and competitors.last_name = ln and competitors.first_name = fn
      and coalesce(competitors.club, '') = coalesce(cl, '')
    limit 1;
  if comp_id is null then
    insert into public.competitors (tournament_id, last_name, first_name, club, grade, gender, birth_year, grade_rank)
    values (t.id, ln, fn, cl, nullif(trim(coalesce(grade, '')), ''), gender, b_year, grade_rank)
    returning id into comp_id;
  else
    update public.competitors set
      gender = coalesce(competitors.gender, public_register.gender),
      birth_year = coalesce(competitors.birth_year, b_year),
      grade_rank = coalesce(competitors.grade_rank, public_register.grade_rank),
      grade = coalesce(competitors.grade, nullif(trim(coalesce(public_register.grade, '')), ''))
    where id = comp_id;
  end if;

  if em is not null or birth_date is not null or dem is not null or given <> '{}'::jsonb or nt is not null then
    insert into public.competitor_contacts (competitor_id, email, birth_date, dojo_email, consents, consents_at, note)
    values (comp_id, em, birth_date, dem, nullif(given, '{}'::jsonb), case when given <> '{}'::jsonb then now() end, nt)
    on conflict (competitor_id) do update set
      email = coalesce(excluded.email, competitor_contacts.email),
      birth_date = coalesce(excluded.birth_date, competitor_contacts.birth_date),
      dojo_email = coalesce(excluded.dojo_email, competitor_contacts.dojo_email),
      consents = coalesce(excluded.consents, competitor_contacts.consents),
      consents_at = coalesce(excluded.consents_at, competitor_contacts.consents_at),
      note = coalesce(excluded.note, competitor_contacts.note);
  end if;

  if pending then
    insert into public.category_requests (category_id, competitor_id, reason, rule)
    values (c_id, comp_id, nullif(trim(coalesce(request_reason, '')), ''), why)
    on conflict (category_id, competitor_id) do update set reason = excluded.reason, rule = excluded.rule;
    return comp_id;
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

  -- Ronin (owner, 2026-11-27): no team yet, the organizer places the person in one
  if coalesce(as_ronin, false) then
    if exists (
      select 1 from public.team_members m join public.entries e on e.team_id = m.team_id
      where m.competitor_id = comp_id and e.category_id = c_id
    ) then
      raise exception '%: already in a team of this category.', cat.name;
    end if;
    insert into public.ronin (category_id, competitor_id) values (c_id, comp_id)
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
revoke execute on function public.public_register(uuid, text, text, text, text, uuid, text, text, integer, integer, text, date, text, jsonb, boolean, boolean, text, text) from public;
grant execute on function public.public_register(uuid, text, text, text, text, uuid, text, text, integer, integer, text, date, text, jsonb, boolean, boolean, text, text) to anon, authenticated;


