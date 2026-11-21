-- Draws published (owner, 2026-11-22): the draw and schedule show on the public page only
-- once the organizer publishes them (separate from draws_confirmed). Existing tournaments
-- keep showing them (default true); new ones start hidden (Create sets false).
alter table public.tournaments add column draws_public boolean not null default true;
