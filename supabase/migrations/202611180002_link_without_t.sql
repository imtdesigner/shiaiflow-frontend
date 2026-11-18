-- Link names work without "/t/" (owner, 2026-11-18): app.shiaiflow.com/<name>.
-- Names the app itself uses (pages, now or later) cannot be taken.
create or replace function private.reserved_link(s text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select lower(s) = any (array[
    'about', 'account', 'accounts', 'admin', 'api', 'app', 'assets', 'attend', 'contact', 'create-tournament',
    'dashboard', 'explore', 'help', 'home', 'join', 'login', 'logout', 'new', 'policy', 'pricing', 'privacy',
    'profile', 'register', 'reset-password', 'search', 'settings', 'signup', 'static', 'support', 'terms',
    'tournament', 'tournaments', 'www'
  ]);
$$;

create or replace function private.slug_owner_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.slug is not null and private.reserved_link(new.slug) then
    raise exception 'The link name "%" is used by the app itself — choose another.', new.slug;
  end if;
  if new.slug is not null and exists (
    select 1 from public.tournaments where slug = new.slug and owner_id <> new.owner_id and id <> new.id
  ) then
    raise exception 'The link name "%" is taken — choose another.', new.slug;
  end if;
  return new;
end;
$$;

create or replace function public.link_status(s text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.reserved_link(s) then 'taken'
    when not exists (select 1 from public.tournaments where slug = lower(s)) then 'free'
    when exists (select 1 from public.tournaments where slug = lower(s) and owner_id <> (select auth.uid())) then 'taken'
    else 'yours'
  end;
$$;
