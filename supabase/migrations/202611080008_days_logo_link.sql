-- Tournament (owner, 2026-11-08):
--   several days, each with a start and end time; each category on a day;
--   a logo; an own link name (/t/<link>). The link belongs to one owner: the
--   same owner may give it to next year's tournament too — then the link opens
--   the newest published edition and earlier years stay as an archive.

alter table public.tournaments
  add column days jsonb check (days is null or jsonb_typeof(days) = 'array'),
  add column logo_url text;

alter table public.categories add column day smallint not null default 1 check (day between 1 and 14);

-- One link, several editions of the same owner.
alter table public.tournaments drop constraint tournaments_slug_key;
alter table public.tournaments drop constraint tournaments_slug_check;
alter table public.tournaments add constraint tournaments_slug_check
  check (slug ~ '^[a-z0-9]([a-z0-9-]{1,58}[a-z0-9])$');
create index tournaments_slug_idx on public.tournaments (slug) where slug is not null;

create or replace function private.slug_owner_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.slug is not null and exists (
    select 1 from public.tournaments where slug = new.slug and owner_id <> new.owner_id and id <> new.id
  ) then
    raise exception 'The link name "%" is taken — choose another.', new.slug;
  end if;
  return new;
end;
$$;
create trigger slug_owner_guard before insert or update of slug, owner_id on public.tournaments
  for each row execute function private.slug_owner_guard();

/** 'free', 'yours' (used by your own earlier tournament) or 'taken'. */
create or replace function public.link_status(s text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not exists (select 1 from public.tournaments where slug = lower(s)) then 'free'
    when exists (select 1 from public.tournaments where slug = lower(s) and owner_id <> (select auth.uid())) then 'taken'
    else 'yours'
  end;
$$;
revoke execute on function public.link_status(text) from public, anon;
grant execute on function public.link_status(text) to authenticated;

-- Logos: public bucket, folder = tournament id, written by its owner / organizers.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tournament-logos', 'tournament-logos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'])
on conflict (id) do nothing;

create or replace function private.can_edit_logo(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t uuid;
begin
  begin
    t := (storage.foldername(object_name))[1]::uuid;
  exception when others then
    return false;
  end;
  return private.has_tournament_role(t, array['owner', 'organizer']);
end;
$$;
grant execute on function private.can_edit_logo(text) to authenticated;

create policy "Organizers upload tournament logos" on storage.objects for insert to authenticated
  with check (bucket_id = 'tournament-logos' and private.can_edit_logo(name));
create policy "Organizers change tournament logos" on storage.objects for update to authenticated
  using (bucket_id = 'tournament-logos' and private.can_edit_logo(name))
  with check (bucket_id = 'tournament-logos' and private.can_edit_logo(name));
create policy "Organizers delete tournament logos" on storage.objects for delete to authenticated
  using (bucket_id = 'tournament-logos' and private.can_edit_logo(name));
