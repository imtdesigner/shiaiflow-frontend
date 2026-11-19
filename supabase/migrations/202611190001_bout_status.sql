-- Team matches: state of each position bout, so the court display (and later
-- the team scoretable) knows which bout is running, which are done, and a
-- fusen per bout. A bout row with both competitors = that position of both
-- lineups is known; lineups are written only after both teams confirm them.
alter table public.bouts
  add column status text not null default 'scheduled'
    check (status in ('scheduled', 'running', 'finished')),
  add column fusen text check (fusen in ('red', 'white'));

-- Deleting a tournament with lineups failed: competitors (set null on bouts)
-- and matches (cascade to bouts) were removed in the same statement. A bout
-- now goes with its competitor.
alter table public.bouts
  drop constraint bouts_red_competitor_id_fkey,
  drop constraint bouts_white_competitor_id_fkey,
  add constraint bouts_red_competitor_id_fkey foreign key (red_competitor_id) references public.competitors (id) on delete cascade,
  add constraint bouts_white_competitor_id_fkey foreign key (white_competitor_id) references public.competitors (id) on delete cascade;
