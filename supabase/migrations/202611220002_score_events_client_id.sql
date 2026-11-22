-- Offline-safe scoretable (owner, 2026-11-22): every point / hansoku click gets an id on the
-- device (client_id), so a click sent again after a network drop is stored once.
alter table public.score_events add column client_id uuid unique;
