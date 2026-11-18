-- No hantei in the last rounds (owner, 2026-11-18): the final, or the
-- semifinals (incl. the fight for 3rd place) and the final, are decided by
-- ippon-shobu on a tie — encho until the first point, whatever the KO
-- encho / hantei setting says. null = the KO setting applies to every round.
alter table public.categories
  add column no_hantei_from text check (no_hantei_from in ('final', 'semifinal'));
