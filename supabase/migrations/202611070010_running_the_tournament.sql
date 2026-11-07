-- Running the tournament (owner, 2026-11-07).

-- Tournament: start time (fight plan shows clock times) and whether the
-- scoretable runs the official timer (off when a separate timekeeper is used).
alter table public.tournaments
  add column start_time time,
  add column use_timer boolean not null default true;

-- Per category, separately for pools and KO:
--   pools: a tie at time is hikiwake, or encho; KO: always encho.
--   encho length (null = until the first point) and whether hantei follows it.
alter table public.categories
  add column pool_tie text not null default 'hikiwake' check (pool_tie in ('hikiwake', 'encho')),
  add column pool_encho_seconds integer check (pool_encho_seconds > 0),
  add column pool_hantei boolean not null default false,
  add column ko_encho_seconds integer check (ko_encho_seconds > 0),
  add column ko_hantei boolean not null default false;

-- Fights: fusen-gachi (OO, 2-0 for the winner), order on the court once the
-- tournament started (skipped fights move below the one that started), and
-- the shared timer (elapsed + running since) so every screen shows the same.
alter table public.matches
  add column fusen text check (fusen in ('red', 'white')),
  add column court_seq integer,
  add column timer_elapsed_ms integer not null default 0,
  add column timer_started_at timestamptz;

-- Score events: I = ippon from the opponent's second hansoku (Excel letter);
-- hantei (HH) and fusen-gachi (OO) are stored on the match, not as events.
alter table public.score_events drop constraint score_events_type_check;
alter table public.score_events add constraint score_events_type_check
  check (type in ('M', 'K', 'D', 'T', 'I', 'hansoku'));

-- Shiaijo PINs: the manager gives each scoretable a PIN; a scorer (anonymous
-- sign-in) claims the court with it and becomes a scorer of the tournament.
create table public.shiaijo_pins (
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  shiaijo smallint not null check (shiaijo between 1 and 12),
  pin text not null check (pin ~ '^[0-9]{4,8}$'),
  primary key (tournament_id, shiaijo)
);
alter table public.shiaijo_pins enable row level security;
grant select, insert, update, delete on public.shiaijo_pins to authenticated;
create policy "Organizers manage PINs" on public.shiaijo_pins for all to authenticated
  using (private.has_tournament_role(tournament_id, array['owner', 'organizer']))
  with check (private.has_tournament_role(tournament_id, array['owner', 'organizer']));

create table public.tournament_scorers (
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  shiaijo smallint not null,
  claimed_at timestamptz not null default now(),
  primary key (tournament_id, user_id)
);
alter table public.tournament_scorers enable row level security;
grant select on public.tournament_scorers to authenticated;
create policy "See own court or manage" on public.tournament_scorers for select to authenticated
  using (user_id = (select auth.uid())
         or private.has_tournament_role(tournament_id, array['owner', 'organizer']));

create or replace function public.claim_shiaijo(t_id uuid, court smallint, p text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in first.';
  end if;
  if not exists (select 1 from public.shiaijo_pins where tournament_id = t_id and shiaijo = court and pin = p) then
    raise exception 'Wrong PIN for this shiaijo.';
  end if;
  insert into public.tournament_members (tournament_id, user_id, role)
  values (t_id, (select auth.uid()), 'scorer')
  on conflict (tournament_id, user_id) do nothing;
  insert into public.tournament_scorers (tournament_id, user_id, shiaijo)
  values (t_id, (select auth.uid()), court)
  on conflict (tournament_id, user_id) do update set shiaijo = excluded.shiaijo, claimed_at = now();
  return true;
end;
$$;
revoke execute on function public.claim_shiaijo(uuid, smallint, text) from public, anon;
grant execute on function public.claim_shiaijo(uuid, smallint, text) to authenticated;

-- Scorers run the fight flow on their screen: record pool places, add the
-- ipponshobu fight right after a tied pool.
create policy "Scorers record places" on public.pool_entries for update to authenticated
  using (private.has_tournament_role(private.category_tournament(
    (select p.category_id from public.pools p where p.id = pool_id)), array['scorer']))
  with check (private.has_tournament_role(private.category_tournament(
    (select p.category_id from public.pools p where p.id = pool_id)), array['scorer']));
create policy "Scorers add ipponshobu" on public.matches for insert to authenticated
  with check (phase = 'ipponshobu'
              and private.has_tournament_role(private.category_tournament(category_id), array['scorer']));

-- Live screens follow pools too (places), not only matches and events.
alter publication supabase_realtime add table public.pool_entries;
