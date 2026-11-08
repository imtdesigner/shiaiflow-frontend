-- A verified dojo / federation keeps its name and website: changing them
-- would carry the verification over to another organization. Admins (or
-- change_account_kind, which resets the verification) can still change them.
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
  if old.verified_at is not null and old.role in ('dojo', 'regional', 'continental')
     and (new.name is distinct from old.name or new.website is distinct from old.website) then
    raise exception 'The name and website of a verified organization are changed by the app admins.';
  end if;
  return new;
end;
$$;
