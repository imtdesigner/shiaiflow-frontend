-- Seeds (nositelji): 1 = top seed. Used by the draw to keep seeds apart
-- along the KO bracket (owner's rule, 2026-11-07).
alter table public.entries add column seed smallint check (seed between 1 and 32);
create unique index entries_category_seed_key on public.entries (category_id, seed) where seed is not null;
