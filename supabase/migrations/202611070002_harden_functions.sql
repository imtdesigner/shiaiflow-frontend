-- Keep RLS helper functions out of the exposed API schema (Supabase advisor 0028/0029).
-- Policies reference functions by OID, so moving them keeps the policies working.
create schema if not exists private;
grant usage on schema private to anon, authenticated;

alter function public.has_tournament_role(uuid, text[]) set schema private;
alter function public.can_view_tournament(uuid) set schema private;
alter function public.category_tournament(uuid) set schema private;
alter function public.match_tournament(uuid) set schema private;

revoke execute on function private.has_tournament_role(uuid, text[]) from public;
revoke execute on function private.can_view_tournament(uuid) from public;
revoke execute on function private.category_tournament(uuid) from public;
revoke execute on function private.match_tournament(uuid) from public;
grant execute on function private.has_tournament_role(uuid, text[]) to anon, authenticated;
grant execute on function private.can_view_tournament(uuid) to anon, authenticated;
grant execute on function private.category_tournament(uuid) to anon, authenticated;
grant execute on function private.match_tournament(uuid) to anon, authenticated;

-- Trigger functions never need to be called directly.
revoke execute on function public.add_tournament_owner() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
