-- Day programme (owner, 2026-11-21): hall opens, warm-up, shinai check, shinpan meeting,
-- line-up, fights begin, awards — the same every day; relative to the day's start / end
-- until a time is typed (src/lib/tournament/program.js). null = the proposal.
alter table public.tournaments add column program jsonb;
