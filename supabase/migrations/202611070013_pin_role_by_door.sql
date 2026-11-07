-- One PIN per tournament, the door decides the role (owner, 2026-11-07):
--   "Editor" + PIN → organizer (edits before the start, Manage after it),
--                    open only once the owner has published the tournament;
--   "Table"  + PIN → scorer (scoretable only; the table picks its shiaijo),
--                    open only once the tournament is running.
-- Joining again through the other door switches the role; the owner keeps 'owner'.
drop function if exists public.claim_tournament(uuid, text);

create or replace function public.claim_tournament(t_id uuid, p text, as_role text default 'organizer')
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  r text;
begin
  if (select auth.uid()) is null then raise exception 'Sign in first.'; end if;
  if as_role not in ('organizer', 'scorer') then raise exception 'Unknown role.'; end if;
  if not exists (select 1 from public.tournament_pins where tournament_id = t_id and pin = p) then
    raise exception 'Wrong PIN for this tournament.';
  end if;
  if as_role = 'organizer' and not exists (select 1 from public.tournaments where id = t_id and is_public) then
    raise exception 'Editors can join once the owner publishes the tournament.';
  end if;
  if as_role = 'scorer' and not exists (select 1 from public.tournaments where id = t_id and status = 'running') then
    raise exception 'Scoretables open once the tournament is started.';
  end if;
  insert into public.tournament_members (tournament_id, user_id, role)
  values (t_id, (select auth.uid()), as_role)
  on conflict (tournament_id, user_id) do update
    set role = excluded.role
    where public.tournament_members.role <> 'owner';
  select role into r from public.tournament_members where tournament_id = t_id and user_id = (select auth.uid());
  return r;
end;
$$;
revoke execute on function public.claim_tournament(uuid, text, text) from public, anon;
grant execute on function public.claim_tournament(uuid, text, text) to authenticated;

-- Publishing is the owner's decision (editors exist only after it).
create or replace function private.only_owner_publishes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_public is distinct from old.is_public and old.owner_id <> (select auth.uid()) then
    raise exception 'Only the owner can publish or hide the tournament.';
  end if;
  return new;
end;
$$;
create trigger tournaments_only_owner_publishes
  before update of is_public on public.tournaments
  for each row execute procedure private.only_owner_publishes();
