-- Accounts (owner, 2026-11-08): three kinds — individual (person), dojo,
-- federation (regional/national or continental).
--   * individuals need no verification and may do everything;
--   * dojos and federations are verified by an app admin (real organization,
--     data and email match their website); until then they may set up
--     everything but not publish a tournament (open its signup) nor start it;
--   * tournaments show who organizes them.

alter table public.users
  add column city text,
  add column website text,
  add column contact_name text,   -- responsible person (dojo / federation)
  add column contact_email text,  -- if different from the login email
  add column verified_at timestamptz,
  add column verified_by uuid references auth.users (id) on delete set null;

-- App admins (verify accounts). Readable only through the functions below.
create table public.app_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;
revoke all on public.app_admins from anon, authenticated;

create or replace function private.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.app_admins where user_id = (select auth.uid()));
$$;
grant execute on function private.is_app_admin() to authenticated;

create or replace function public.am_i_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_app_admin();
$$;
revoke execute on function public.am_i_admin() from public, anon;
grant execute on function public.am_i_admin() to authenticated;

-- Admins see and verify every account.
create policy "Admins read accounts" on public.users for select to authenticated
  using (private.is_app_admin());
create policy "Admins update accounts" on public.users for update to authenticated
  using (private.is_app_admin()) with check (private.is_app_admin());

-- Only admins change the account kind and the verification.
create or replace function private.guard_user_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or private.is_app_admin() then return new; end if;
  if new.role is distinct from old.role
     or new.verified_at is distinct from old.verified_at
     or new.verified_by is distinct from old.verified_by then
    raise exception 'Account kind and verification are changed by the app admins only.';
  end if;
  return new;
end;
$$;
create trigger users_guard_fields
  before update on public.users
  for each row execute procedure private.guard_user_fields();

-- New accounts carry the signup form fields.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  r text := case when m ->> 'role' in ('person', 'dojo', 'regional', 'continental') then m ->> 'role' else 'person' end;
begin
  insert into public.users (id, email, name, role, country, city, website, contact_name, contact_email, dojo_name, federation_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(m ->> 'name', ''),
    r,
    coalesce(m ->> 'country', ''),
    nullif(m ->> 'city', ''),
    nullif(m ->> 'website', ''),
    nullif(m ->> 'contact_name', ''),
    nullif(m ->> 'contact_email', ''),
    case when r = 'dojo' then nullif(m ->> 'name', '') else nullif(m ->> 'dojo_name', '') end,
    case when r in ('regional', 'continental') then nullif(m ->> 'name', '') else null end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Unverified dojo / federation: no publishing (signup) and no start.
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
  select role, verified_at into acc from public.users where id = new.owner_id;
  if acc.role in ('dojo', 'regional', 'continental') and acc.verified_at is null then
    raise exception 'Your % account is not verified yet — you can set everything up, but publishing the signup and starting the tournament wait for the verification.',
      case when acc.role = 'dojo' then 'dojo' else 'federation' end;
  end if;
  return new;
end;
$$;
create trigger tournaments_require_verified_organizer
  before insert or update of is_public, status on public.tournaments
  for each row execute procedure private.require_verified_organizer();

-- Who organizes published tournaments (name, kind, verified) for public pages.
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
         u.verified_at is not null
  from public.tournaments t
  join public.users u on u.id = t.owner_id
  where t.id = any (ids)
    and (t.is_public or private.has_tournament_role(t.id, array['owner', 'organizer', 'scorer']));
$$;
grant execute on function public.tournament_organizers(uuid[]) to anon, authenticated;

-- The app owner is the first admin.
insert into public.app_admins (user_id)
select id from auth.users where id = '6eb8d3bb-5139-426a-a02b-62d93276f737'
on conflict do nothing;
