-- Initial ShiaiFlow backend schema for Supabase.
-- Safe to run once on a new project.

create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  email text not null default '',
  role text not null default 'person'
    check (role in ('person', 'dojo', 'regional', 'continental')),
  country text not null default '',
  dojo_name text,
  dojo_city text,
  federation_name text,
  federation_type text,
  avatar_url text,
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.users enable row level security;

revoke all on table public.users from anon, authenticated;
grant select, insert, update on table public.users to authenticated;

create policy "Users can read their own profile"
on public.users
for select
to authenticated
using ((select auth.uid()) = id);

create policy "Users can create their own profile"
on public.users
for insert
to authenticated
with check ((select auth.uid()) = id);

create policy "Users can update their own profile"
on public.users
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (
    id,
    email,
    name,
    role,
    country,
    dojo_name,
    federation_name
  )
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    case
      when new.raw_user_meta_data ->> 'role' in ('person', 'dojo', 'regional', 'continental')
        then new.raw_user_meta_data ->> 'role'
      else 'person'
    end,
    coalesce(new.raw_user_meta_data ->> 'country', ''),
    nullif(new.raw_user_meta_data ->> 'dojo_name', ''),
    case
      when new.raw_user_meta_data ->> 'role' in ('dojo', 'regional', 'continental')
        then nullif(new.raw_user_meta_data ->> 'dojo_name', '')
      else null
    end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at
  before update on public.users
  for each row execute procedure public.set_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Users can upload their own avatar files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Users can update their own avatar files"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Users can delete their own avatar files"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
