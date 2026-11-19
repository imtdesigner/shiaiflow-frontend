-- Apply AFTER the frontend that listens to 'run:<tournament id>' broadcasts is
-- deployed: nobody listens to row changes of these tables any more.
alter publication supabase_realtime drop table public.matches, public.score_events, public.bouts;
