-- Schedule estimate (owner, 2026-11-18): time between fights (bow-in,
-- changeover; default 15 s, to be tuned after measuring). Breaks live in the
-- days column: days[i].breaks = [{ from: 'HH:MM', to: 'HH:MM' }].
alter table public.tournaments
  add column changeover_seconds integer not null default 15 check (changeover_seconds between 0 and 600);
