-- Fighting spirit (owner, 2026-11-23): one person per category (in team
-- categories one member of a team). Each table proposes one right after its
-- last fight of the category (shinpan asked as they leave the shiaijo); the
-- organizer takes a single proposal, picks between two, or overrides by hand.

alter table public.tournaments add column if not exists fighting_spirit boolean not null default true;

alter table public.categories add column if not exists fighting_spirit_competitor_id uuid
  references public.competitors(id) on delete set null;

create table if not exists public.fighting_spirit_proposals (
  category_id uuid not null references public.categories(id) on delete cascade,
  shiaijo int not null,
  competitor_id uuid references public.competitors(id) on delete cascade, -- null = skipped
  created_at timestamptz not null default now(),
  primary key (category_id, shiaijo)
);

alter table public.fighting_spirit_proposals enable row level security;

create policy "Staff read" on public.fighting_spirit_proposals for select to authenticated
  using (private.has_tournament_role(private.category_tournament(category_id), array['owner', 'organizer', 'scorer']));
create policy "Staff write" on public.fighting_spirit_proposals for all to authenticated
  using (private.has_tournament_role(private.category_tournament(category_id), array['owner', 'organizer', 'scorer']))
  with check (private.has_tournament_role(private.category_tournament(category_id), array['owner', 'organizer', 'scorer']));

grant select, insert, update, delete on public.fighting_spirit_proposals to authenticated;
