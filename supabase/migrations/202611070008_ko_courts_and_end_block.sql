-- Shiaijo plan options (owner, 2026-11-07), all optional:
--   * a category may play its KO on other courts than its pools
--     (categories.ko_shiaijos; null = same courts as the pools);
--   * the director marks central courts (tournaments.central_shiaijos);
--   * finals — or semifinals and finals — of all categories at the end of the
--     tournament on the central courts (tournaments.end_block);
--     such fights are flagged (matches.end_block) so the queue puts them last.

alter table public.categories
  add column ko_shiaijos smallint[]
  check (ko_shiaijos is null or (cardinality(ko_shiaijos) between 1 and 12 and 0 < all (ko_shiaijos) and 13 > all (ko_shiaijos)));

alter table public.tournaments
  add column central_shiaijos smallint[] not null default '{}'
    check (cardinality(central_shiaijos) <= 12 and 0 < all (central_shiaijos) and 13 > all (central_shiaijos)),
  add column end_block text not null default 'none'
    check (end_block in ('none', 'finals', 'semis_finals'));

alter table public.matches
  add column end_block boolean not null default false;
