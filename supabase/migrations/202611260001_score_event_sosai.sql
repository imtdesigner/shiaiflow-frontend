-- FIK Art. 20.1 (owner, 2026-11-26): sosai — at 1–1 a 2nd hansoku committed by
-- both at once is cancelled; stored as one event of type 'sosai' (side is not
-- used: both get a hansoku, nobody a point). 'I' stays for older data.
alter table public.score_events drop constraint if exists score_events_type_check;
alter table public.score_events add constraint score_events_type_check
  check (type in ('M', 'K', 'D', 'T', 'I', 'hansoku', 'sosai'));
