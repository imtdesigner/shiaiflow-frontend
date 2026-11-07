-- ShiaiFlow tournament core schema.
-- Model follows shiaiflow/excel-analiza-i-specifikacija.md (DP HKS 2026 Excel system).
-- One shared database for all shiaijo replaces the per-mat Excel copies.

-- ---------------------------------------------------------------------------
-- Tournaments and access
-- ---------------------------------------------------------------------------

create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete restrict,
  name text not null check (length(trim(name)) > 0),
  slug text unique check (slug ~ '^[a-z0-9-]+$'),
  start_date date,
  end_date date,
  venue text,
  city text,
  country text,
  shiaijo_count smallint not null default 2 check (shiaijo_count between 1 and 12),
  status text not null default 'draft'
    check (status in ('draft', 'registration', 'running', 'finished')),
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create table public.tournament_members (
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'organizer', 'scorer')),
  created_at timestamptz not null default now(),
  primary key (tournament_id, user_id)
);

-- Role check used by RLS. security definer so policies on tournament_members
-- do not recurse.
create or replace function public.has_tournament_role(t_id uuid, roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tournament_members m
    where m.tournament_id = t_id
      and m.user_id = (select auth.uid())
      and m.role = any (roles)
  );
$$;

create or replace function public.can_view_tournament(t_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tournaments t
    where t.id = t_id
      and (t.is_public
           or exists (select 1 from public.tournament_members m
                      where m.tournament_id = t.id and m.user_id = (select auth.uid())))
  );
$$;

-- Creator becomes owner member automatically.
create or replace function public.add_tournament_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.tournament_members (tournament_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict do nothing;
  return new;
end;
$$;

create trigger tournaments_add_owner
  after insert on public.tournaments
  for each row execute procedure public.add_tournament_owner();

create trigger tournaments_set_updated_at
  before update on public.tournaments
  for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Competitors, teams, categories, entries
-- ---------------------------------------------------------------------------

create table public.competitors (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  last_name text not null check (length(trim(last_name)) > 0),
  first_name text not null default '',
  display_name text, -- short name for scoreboards, e.g. "URSIĆ G."
  club text,
  country text,
  grade text, -- e.g. '3 kyu', '2 dan'
  created_at timestamptz not null default now()
);
create index competitors_tournament_idx on public.competitors (tournament_id);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  club text,
  created_at timestamptz not null default now(),
  unique (tournament_id, name)
);

create table public.team_members (
  team_id uuid not null references public.teams (id) on delete cascade,
  competitor_id uuid not null references public.competitors (id) on delete cascade,
  sort_order smallint not null default 0,
  primary key (team_id, competitor_id)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  name text not null check (length(trim(name)) > 0), -- 'DAN M', 'Kyu Ž', 'Ekipno odrasli'
  kind text not null default 'individual' check (kind in ('individual', 'team')),
  team_size smallint check (team_size in (3, 5)),
  pool_size smallint not null default 3 check (pool_size between 1 and 8), -- 1 = direct KO
  advancing smallint not null default 2 check (advancing between 0 and 2), -- 0 = pools only
  pool_fight_seconds integer not null default 180 check (pool_fight_seconds > 0),
  ko_fight_seconds integer not null default 180 check (ko_fight_seconds > 0),
  final_fight_seconds integer not null default 240 check (final_fight_seconds > 0),
  ranking_criteria text[] not null default array['wins', 'losses', 'draws', 'scored', 'conceded'],
  auto_hansoku_ippon boolean not null default true,
  ko_template_code text, -- e.g. 'K052'
  ko_template jsonb, -- per-category copy (may be edited for this draw)
  draw_seed bigint, -- reproducible random draw
  status text not null default 'registration'
    check (status in ('registration', 'drawn', 'pools', 'ko', 'finished')),
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  check ((kind = 'team') = (team_size is not null))
);
create index categories_tournament_idx on public.categories (tournament_id);

create table public.entries (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories (id) on delete cascade,
  competitor_id uuid references public.competitors (id) on delete cascade,
  team_id uuid references public.teams (id) on delete cascade,
  checked_in boolean not null default false,
  created_at timestamptz not null default now(),
  check ((competitor_id is null) <> (team_id is null)),
  unique (category_id, competitor_id),
  unique (category_id, team_id)
);
create index entries_category_idx on public.entries (category_id);

-- ---------------------------------------------------------------------------
-- Pools and matches
-- ---------------------------------------------------------------------------

create table public.pools (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories (id) on delete cascade,
  number smallint not null check (number > 0),
  unique (category_id, number)
);

create table public.pool_entries (
  pool_id uuid not null references public.pools (id) on delete cascade,
  entry_id uuid not null references public.entries (id) on delete cascade,
  position smallint not null check (position > 0),
  final_place smallint, -- set when the pool is ranked
  primary key (pool_id, entry_id),
  unique (pool_id, position)
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories (id) on delete cascade,
  phase text not null check (phase in ('pool', 'ipponshobu', 'ko')),
  label text not null, -- 'P1.2', 'P1.D', '7'
  pool_id uuid references public.pools (id) on delete cascade,
  ko_no smallint, -- KO match number from the template
  red_code text, -- template slot, e.g. '011' or 'W03'
  white_code text,
  red_entry_id uuid references public.entries (id) on delete set null,
  white_entry_id uuid references public.entries (id) on delete set null,
  shiaijo smallint check (shiaijo > 0),
  queue_order integer,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'running', 'finished', 'cancelled')),
  is_encho boolean not null default false,
  is_hikiwake boolean not null default false,
  decision text check (decision in ('red', 'white')), -- hantei / ipponshobu result
  winner_entry_id uuid references public.entries (id) on delete set null,
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (category_id, label),
  check ((phase = 'ko') = (ko_no is not null)),
  check (phase = 'ko' or pool_id is not null)
);
create index matches_category_idx on public.matches (category_id);
create index matches_queue_idx on public.matches (shiaijo, status, queue_order);

create trigger matches_set_updated_at
  before update on public.matches
  for each row execute procedure public.set_updated_at();

-- Team matches: one bout per position (+ optional daihyosen).
create table public.bouts (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  position text not null
    check (position in ('senpo', 'jiho', 'chuken', 'fukusho', 'taisho', 'daihyosen')),
  red_competitor_id uuid references public.competitors (id) on delete set null,
  white_competitor_id uuid references public.competitors (id) on delete set null,
  is_encho boolean not null default false,
  decision text check (decision in ('red', 'white')),
  unique (match_id, position)
);

-- Every ippon / hansoku as an event (replaces letters typed into cells).
create table public.score_events (
  id bigint generated always as identity primary key,
  match_id uuid not null references public.matches (id) on delete cascade,
  bout_id uuid references public.bouts (id) on delete cascade,
  side text not null check (side in ('red', 'white')),
  type text not null check (type in ('M', 'K', 'D', 'T', 'H', 'hansoku')),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index score_events_match_idx on public.score_events (match_id);

-- Helper: tournament id of a category (for RLS on child tables).
create or replace function public.category_tournament(c_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select tournament_id from public.categories where id = c_id;
$$;

create or replace function public.match_tournament(m_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.tournament_id
  from public.matches m join public.categories c on c.id = m.category_id
  where m.id = m_id;
$$;

-- ---------------------------------------------------------------------------
-- Row level security
--   read:   public tournaments for everyone, private ones for members
--   write:  owner/organizer for setup; scorer may score matches
-- ---------------------------------------------------------------------------

alter table public.tournaments enable row level security;
alter table public.tournament_members enable row level security;
alter table public.competitors enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.categories enable row level security;
alter table public.entries enable row level security;
alter table public.pools enable row level security;
alter table public.pool_entries enable row level security;
alter table public.matches enable row level security;
alter table public.bouts enable row level security;
alter table public.score_events enable row level security;

grant select on public.tournaments, public.competitors, public.teams, public.team_members,
  public.categories, public.entries, public.pools, public.pool_entries, public.matches,
  public.bouts, public.score_events to anon, authenticated;
grant insert, update, delete on public.tournaments, public.tournament_members, public.competitors,
  public.teams, public.team_members, public.categories, public.entries, public.pools,
  public.pool_entries, public.matches, public.bouts, public.score_events to authenticated;
grant select on public.tournament_members to authenticated;

-- tournaments
create policy "View public or own tournaments" on public.tournaments
  for select to anon, authenticated
  using (is_public
         or owner_id = (select auth.uid()) -- needed for insert ... returning (owner row added by trigger)
         or public.has_tournament_role(id, array['owner', 'organizer', 'scorer']));
create policy "Create tournament as owner" on public.tournaments
  for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "Organizers edit tournament" on public.tournaments
  for update to authenticated
  using (public.has_tournament_role(id, array['owner', 'organizer']))
  with check (public.has_tournament_role(id, array['owner', 'organizer']));
create policy "Owner deletes tournament" on public.tournaments
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- tournament_members
create policy "Members see the team" on public.tournament_members
  for select to authenticated
  using (user_id = (select auth.uid())
         or public.has_tournament_role(tournament_id, array['owner', 'organizer']));
create policy "Owner manages members" on public.tournament_members
  for all to authenticated
  using (public.has_tournament_role(tournament_id, array['owner']))
  with check (public.has_tournament_role(tournament_id, array['owner']) and role <> 'owner');

-- tables keyed by tournament_id
create policy "View" on public.competitors for select to anon, authenticated
  using (public.can_view_tournament(tournament_id));
create policy "Organizers write" on public.competitors for all to authenticated
  using (public.has_tournament_role(tournament_id, array['owner', 'organizer']))
  with check (public.has_tournament_role(tournament_id, array['owner', 'organizer']));

create policy "View" on public.teams for select to anon, authenticated
  using (public.can_view_tournament(tournament_id));
create policy "Organizers write" on public.teams for all to authenticated
  using (public.has_tournament_role(tournament_id, array['owner', 'organizer']))
  with check (public.has_tournament_role(tournament_id, array['owner', 'organizer']));

create policy "View" on public.categories for select to anon, authenticated
  using (public.can_view_tournament(tournament_id));
create policy "Organizers write" on public.categories for all to authenticated
  using (public.has_tournament_role(tournament_id, array['owner', 'organizer']))
  with check (public.has_tournament_role(tournament_id, array['owner', 'organizer']));

-- team_members via team
create policy "View" on public.team_members for select to anon, authenticated
  using (public.can_view_tournament((select t.tournament_id from public.teams t where t.id = team_id)));
create policy "Organizers write" on public.team_members for all to authenticated
  using (public.has_tournament_role((select t.tournament_id from public.teams t where t.id = team_id),
                                    array['owner', 'organizer']))
  with check (public.has_tournament_role((select t.tournament_id from public.teams t where t.id = team_id),
                                         array['owner', 'organizer']));

-- tables keyed by category_id
create policy "View" on public.entries for select to anon, authenticated
  using (public.can_view_tournament(public.category_tournament(category_id)));
create policy "Organizers write" on public.entries for all to authenticated
  using (public.has_tournament_role(public.category_tournament(category_id), array['owner', 'organizer']))
  with check (public.has_tournament_role(public.category_tournament(category_id), array['owner', 'organizer']));

create policy "View" on public.pools for select to anon, authenticated
  using (public.can_view_tournament(public.category_tournament(category_id)));
create policy "Organizers write" on public.pools for all to authenticated
  using (public.has_tournament_role(public.category_tournament(category_id), array['owner', 'organizer']))
  with check (public.has_tournament_role(public.category_tournament(category_id), array['owner', 'organizer']));

create policy "View" on public.pool_entries for select to anon, authenticated
  using (public.can_view_tournament(public.category_tournament(
    (select p.category_id from public.pools p where p.id = pool_id))));
create policy "Organizers write" on public.pool_entries for all to authenticated
  using (public.has_tournament_role(public.category_tournament(
    (select p.category_id from public.pools p where p.id = pool_id)), array['owner', 'organizer']))
  with check (public.has_tournament_role(public.category_tournament(
    (select p.category_id from public.pools p where p.id = pool_id)), array['owner', 'organizer']));

-- matches: organizers create/delete; scorers may update (status, result)
create policy "View" on public.matches for select to anon, authenticated
  using (public.can_view_tournament(public.category_tournament(category_id)));
create policy "Organizers create" on public.matches for insert to authenticated
  with check (public.has_tournament_role(public.category_tournament(category_id), array['owner', 'organizer']));
create policy "Organizers delete" on public.matches for delete to authenticated
  using (public.has_tournament_role(public.category_tournament(category_id), array['owner', 'organizer']));
create policy "Staff update" on public.matches for update to authenticated
  using (public.has_tournament_role(public.category_tournament(category_id), array['owner', 'organizer', 'scorer']))
  with check (public.has_tournament_role(public.category_tournament(category_id), array['owner', 'organizer', 'scorer']));

-- bouts and score events: whole staff
create policy "View" on public.bouts for select to anon, authenticated
  using (public.can_view_tournament(public.match_tournament(match_id)));
create policy "Staff write" on public.bouts for all to authenticated
  using (public.has_tournament_role(public.match_tournament(match_id), array['owner', 'organizer', 'scorer']))
  with check (public.has_tournament_role(public.match_tournament(match_id), array['owner', 'organizer', 'scorer']));

create policy "View" on public.score_events for select to anon, authenticated
  using (public.can_view_tournament(public.match_tournament(match_id)));
create policy "Staff insert" on public.score_events for insert to authenticated
  with check (public.has_tournament_role(public.match_tournament(match_id), array['owner', 'organizer', 'scorer']));
create policy "Staff delete" on public.score_events for delete to authenticated
  using (public.has_tournament_role(public.match_tournament(match_id), array['owner', 'organizer', 'scorer']));

-- ---------------------------------------------------------------------------
-- Realtime for live scoreboards and the public dashboard
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.matches, public.score_events, public.bouts;
