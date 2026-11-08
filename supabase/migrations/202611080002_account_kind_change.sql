-- Changing the account kind (owner, 2026-11-08):
--   individual → dojo / federation: allowed, then the same admin verification;
--   dojo / federation → individual: allowed, but publishing the signup and
--     starting a tournament need the admins' approval again (no way around
--     the restriction); tournaments then show as personal.
-- Done only through change_account_kind(); the guard trigger keeps direct
-- edits of role / verification out.

alter table public.users add column needs_review boolean not null default false;

-- The guard lets change_account_kind through (it runs as definer, but auth.uid()
-- is still the user): mark it with a transaction-local setting.
create or replace function private.guard_user_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or private.is_app_admin()
     or current_setting('shiaiflow.kind_change', true) = 'on' then
    return new;
  end if;
  if new.role is distinct from old.role
     or new.verified_at is distinct from old.verified_at
     or new.verified_by is distinct from old.verified_by
     or new.needs_review is distinct from old.needs_review then
    raise exception 'Account kind and verification are changed by the app admins only.';
  end if;
  return new;
end;
$$;

create or replace function public.change_account_kind(
  new_role text, new_name text, new_website text default null,
  new_contact_name text default null, new_contact_email text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  old_role text;
begin
  if me is null then raise exception 'Sign in first.'; end if;
  if new_role not in ('person', 'dojo', 'regional', 'continental') then raise exception 'Unknown account kind.'; end if;
  if length(trim(coalesce(new_name, ''))) = 0 then raise exception 'Name is required.'; end if;
  select role into old_role from public.users where id = me;
  if new_role = old_role then return old_role; end if;
  if new_role <> 'person' and length(trim(coalesce(new_contact_name, ''))) = 0 then
    raise exception 'The responsible person is required for a dojo or federation.';
  end if;
  perform set_config('shiaiflow.kind_change', 'on', true);
  update public.users set
    role = new_role,
    name = trim(new_name),
    website = case when new_role = 'person' then website else nullif(trim(coalesce(new_website, '')), '') end,
    contact_name = case when new_role = 'person' then contact_name else trim(new_contact_name) end,
    contact_email = case when new_role = 'person' then contact_email else nullif(trim(coalesce(new_contact_email, '')), '') end,
    dojo_name = case when new_role = 'dojo' then trim(new_name) else dojo_name end,
    federation_name = case when new_role in ('regional', 'continental') then trim(new_name) else federation_name end,
    verified_at = null,
    verified_by = null,
    needs_review = (new_role = 'person' and old_role in ('dojo', 'regional', 'continental'))
  where id = me;
  perform set_config('shiaiflow.kind_change', 'off', true);
  return new_role;
end;
$$;
revoke execute on function public.change_account_kind(text, text, text, text, text) from public, anon;
grant execute on function public.change_account_kind(text, text, text, text, text) to authenticated;

-- Restriction now also covers a former organization turned individual.
create or replace function private.require_verified_organizer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  acc record;
begin
  if not ((new.is_public and (tg_op = 'INSERT' or not old.is_public))
          or (new.status = 'running' and (tg_op = 'INSERT' or old.status <> 'running'))) then
    return new;
  end if;
  select role, verified_at, needs_review into acc from public.users where id = new.owner_id;
  if acc.verified_at is null and (acc.role in ('dojo', 'regional', 'continental') or acc.needs_review) then
    raise exception 'Your account is waiting for verification by the app admins — you can set everything up, but publishing the signup and starting the tournament wait for it.';
  end if;
  return new;
end;
$$;

-- Organizer info: "waiting" also for a former organization turned individual.
create or replace function public.tournament_organizers(ids uuid[])
returns table (tournament_id uuid, name text, kind text, verified boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id,
         coalesce(nullif(u.name, ''), u.dojo_name, u.federation_name, 'Organizer'),
         case when u.role = 'dojo' then 'dojo' when u.role in ('regional', 'continental') then 'federation' else 'person' end,
         u.verified_at is not null or (u.role = 'person' and not u.needs_review)
  from public.tournaments t
  join public.users u on u.id = t.owner_id
  where t.id = any (ids)
    and (t.is_public or private.has_tournament_role(t.id, array['owner', 'organizer', 'scorer']));
$$;
