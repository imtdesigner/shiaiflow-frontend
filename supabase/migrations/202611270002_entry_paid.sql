-- Paid tick in Registration (owner, 2026-11-27): a record only, the app does
-- nothing with it (payments later). Kept apart from entries so only organizers
-- see who paid (entries are public). Applied as 202611270002 (column) + 202611270003 (this table).
create table public.entry_paid (
  entry_id uuid primary key references public.entries (id) on delete cascade,
  paid_at timestamptz not null default now()
);
alter table public.entry_paid enable row level security;
grant select, insert, delete on public.entry_paid to authenticated;
create policy "Organizers" on public.entry_paid for all to authenticated
  using (private.has_tournament_role(private.category_tournament((select e.category_id from public.entries e where e.id = entry_id)), array['owner', 'organizer']))
  with check (private.has_tournament_role(private.category_tournament((select e.category_id from public.entries e where e.id = entry_id)), array['owner', 'organizer']));
