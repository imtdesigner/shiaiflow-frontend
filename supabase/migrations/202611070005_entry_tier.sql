-- Seed numbers become strength tiers (owner, 2026-11-07):
--   1 last year's champion, 2 runner-up, 3 third place (up to two),
--   4 strong, 5 medium, 6 weaker; null = not rated.
-- Tiers 1-3 must not meet before the semifinal; club conflicts are fixed by
-- swapping only within the same tier.
drop index public.entries_category_seed_key;
alter table public.entries drop constraint entries_seed_check;
alter table public.entries rename column seed to tier;
alter table public.entries add constraint entries_tier_check check (tier between 1 and 6);
-- One champion and one runner-up per category.
create unique index entries_category_tier_key on public.entries (category_id, tier) where tier in (1, 2);
