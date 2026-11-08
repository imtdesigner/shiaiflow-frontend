-- Fight rules per category (owner, 2026-11-08):
--   sanbon-shobu (two ippons) or ippon-shobu (first point wins);
--   uneven pools: even split (7 by 3 → 3+2+2, Excel pool count) or bigger
--   pools (7 by 3 → 4+3);
--   fight time per KO round: quarterfinal / semifinal (null = KO time; the
--   final already has its own);
--   daihyosen tie: encho length (null = until a point) and hantei after it;
--   3rd place shared (default) or a fight for 3rd place between the
--   semifinal losers (KO fight after the final number, codes L<n>).
alter table public.categories
  add column fight_system text not null default 'sanbon' check (fight_system in ('sanbon', 'ippon')),
  add column pool_split text not null default 'even' check (pool_split in ('even', 'bigger')),
  add column qf_fight_seconds integer check (qf_fight_seconds > 0),
  add column sf_fight_seconds integer check (sf_fight_seconds > 0),
  add column daihyosen_encho_seconds integer check (daihyosen_encho_seconds > 0),
  add column daihyosen_hantei boolean not null default false,
  add column third_place text not null default 'shared' check (third_place in ('shared', 'fight'));
