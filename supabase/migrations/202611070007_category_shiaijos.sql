-- Shiaijo plan (owner, 2026-11-07): the tournament director picks the number
-- of courts, then the courts each category runs on (e.g. Junior A on 1+2,
-- Junior B on 3+4). Pools are spread over those courts, KO halves too.
alter table public.categories
  add column shiaijos smallint[] not null default '{1}'
  check (cardinality(shiaijos) between 1 and 12 and 0 < all (shiaijos) and 13 > all (shiaijos));
