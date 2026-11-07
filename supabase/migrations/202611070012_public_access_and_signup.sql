-- Access model (owner, 2026-11-07):
--   owner      = main account, everything, always;
--   PIN holder = one PIN per tournament for editors and tables: edits the
--                tournament before the start, manages / scores after it;
--   public     = once the owner publishes the tournament (is_public): setup,
--                categories, entries (also while registration is open), draw,
--                schedule and live results; competitors register with a form
--                (no account) while registration is open.
-- Replaces the per-shiaijo PINs of 202611070010.

drop function if exists public.claim_shiaijo(uuid, smallint, text);
drop table if exists public.tournament_scorers;
drop table if exists public.shiaijo_pins;

alter table public.tournaments
  alter column is_public set default false,
  add column registration_open boolean not null default true,
  add column registration_deadline timestamptz,
  add column team_signup text not null default 'with_competitor'
    check (team_signup in ('with_competitor', 'team_first')),
  add column multi_team boolean not null default false;

-- The PIN lives in its own table: only owner/organizers can read or change it.
create table public.tournament_pins (
  tournament_id uuid primary key references public.tournaments (id) on delete cascade,
  pin text not null check (pin ~ '^[0-9]{4,8}$')
);
alter table public.tournament_pins enable row level security;
grant select, insert, update, delete on public.tournament_pins to authenticated;
create policy "Organizers manage the PIN" on public.tournament_pins for all to authenticated
  using (private.has_tournament_role(tournament_id, array['owner', 'organizer']))
  with check (private.has_tournament_role(tournament_id, array['owner', 'organizer']));

/** Join a tournament with its PIN (anonymous sign-in is enough) → organizer. */
create or replace function public.claim_tournament(t_id uuid, p text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  r text;
begin
  if (select auth.uid()) is null then raise exception 'Sign in first.'; end if;
  if not exists (select 1 from public.tournament_pins where tournament_id = t_id and pin = p) then
    raise exception 'Wrong PIN for this tournament.';
  end if;
  insert into public.tournament_members (tournament_id, user_id, role)
  values (t_id, (select auth.uid()), 'organizer')
  on conflict (tournament_id, user_id) do nothing;
  select role into r from public.tournament_members where tournament_id = t_id and user_id = (select auth.uid());
  return r;
end;
$$;
revoke execute on function public.claim_tournament(uuid, text) from public, anon;
grant execute on function public.claim_tournament(uuid, text) to authenticated;

create or replace function private.registration_is_open(t_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.tournaments t
    where t.id = t_id and t.is_public and t.registration_open
      and (t.registration_deadline is null or now() < t.registration_deadline));
$$;

/**
 * Public registration (no account) while registration is open.
 * Individual category: person → entry. Team category with team_signup =
 * 'with_competitor': the person joins an existing team (team_id) or a new one
 * (team_name); the team gets its entry in the category. A person in teams of
 * other categories only when the tournament allows multi_team.
 */
create or replace function public.public_register(
  c_id uuid, last_name text, first_name text default '', club text default null, grade text default null,
  team_id uuid default null, team_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  cat record;
  t record;
  comp_id uuid;
  tm_id uuid;
  ln text := upper(trim(last_name));
  fn text := coalesce(trim(first_name), '');
  cl text := nullif(trim(coalesce(club, '')), '');
begin
  select * into cat from public.categories where id = c_id;
  if cat is null then raise exception 'Unknown category.'; end if;
  select * into t from public.tournaments where id = cat.tournament_id;
  if not private.registration_is_open(t.id) then raise exception 'Registration is closed.'; end if;
  if cat.status <> 'registration' then raise exception 'This category is already drawn.'; end if;
  if length(ln) = 0 then raise exception 'Last name is required.'; end if;

  select id into comp_id from public.competitors
    where tournament_id = t.id and competitors.last_name = ln and competitors.first_name = fn
      and coalesce(competitors.club, '') = coalesce(cl, '')
    limit 1;
  if comp_id is null then
    insert into public.competitors (tournament_id, last_name, first_name, club, grade)
    values (t.id, ln, fn, cl, nullif(trim(coalesce(grade, '')), '')) returning id into comp_id;
  end if;

  if cat.kind = 'individual' then
    insert into public.entries (category_id, competitor_id) values (c_id, comp_id)
    on conflict (category_id, competitor_id) do nothing;
    return comp_id;
  end if;

  -- team category
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
revoke execute on function public.public_register(uuid, text, text, text, text, uuid, text) from public;
grant execute on function public.public_register(uuid, text, text, text, text, uuid, text) to anon, authenticated;

/**
 * Team registration when team_signup = 'team_first': the team registers with
 * its name and picks its members from competitors already registered.
 */
create or replace function public.public_register_team(c_id uuid, team_name text, club text, member_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  cat record;
  t record;
  tm_id uuid;
  m uuid;
  i int := 0;
begin
  select * into cat from public.categories where id = c_id;
  if cat is null or cat.kind <> 'team' then raise exception 'Not a team category.'; end if;
  select * into t from public.tournaments where id = cat.tournament_id;
  if not private.registration_is_open(t.id) then raise exception 'Registration is closed.'; end if;
  if cat.status <> 'registration' then raise exception 'This category is already drawn.'; end if;
  if length(trim(coalesce(team_name, ''))) = 0 then raise exception 'Team name is required.'; end if;
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
  insert into public.entries (category_id, team_id) values (c_id, tm_id);
  return tm_id;
end;
$$;
revoke execute on function public.public_register_team(uuid, text, text, uuid[]) from public;
grant execute on function public.public_register_team(uuid, text, text, uuid[]) to anon, authenticated;
