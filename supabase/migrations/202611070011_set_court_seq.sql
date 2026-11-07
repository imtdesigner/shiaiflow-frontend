-- Set the order on the court (court_seq) of many fights at once: at tournament
-- start, and when a scorer starts a fight further down the queue. Runs as the
-- caller, so RLS on matches still decides who may do it.
create or replace function public.set_court_seq(ids uuid[], seqs integer[])
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.matches m
  set court_seq = s.seq
  from unnest(ids, seqs) as s(id, seq)
  where m.id = s.id;
$$;
revoke execute on function public.set_court_seq(uuid[], integer[]) from public, anon;
grant execute on function public.set_court_seq(uuid[], integer[]) to authenticated;
