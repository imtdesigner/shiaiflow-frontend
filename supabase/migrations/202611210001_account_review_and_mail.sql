-- Account review (owner, 2026-11-21): besides Verify, the app admins can ask
-- for more information or reject a dojo / federation account, with a short
-- note the account sees. The account corrects its data and sends it again
-- (RPC resubmit_account) → waiting again.
-- Emails: new account waiting → the app admins; verified / more info /
-- rejected → the account. Rows go to public.account_mail (queue, no client
-- access) and pg_net wakes the edge function `account-mail`, which sends the
-- queued, unsent rows through Resend (secret RESEND_API_KEY on the function).

alter table public.users
  add column review_state text check (review_state in ('needs_info', 'rejected')),
  add column review_note text;

-- review_state / review_note: admins only, or resubmit_account / change_account_kind
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
     or new.needs_review is distinct from old.needs_review
     or new.review_state is distinct from old.review_state
     or new.review_note is distinct from old.review_note then
    raise exception 'Account kind and verification are changed by the app admins only.';
  end if;
  if old.verified_at is not null and old.role in ('dojo', 'regional', 'continental')
     and (new.name is distinct from old.name or new.website is distinct from old.website) then
    raise exception 'The name and website of a verified organization are changed by the app admins.';
  end if;
  return new;
end;
$$;

-- A kind change starts the review again: clear the admins' last answer.
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
    needs_review = (new_role = 'person' and old_role in ('dojo', 'regional', 'continental')),
    review_state = null,
    review_note = null
  where id = me;
  perform set_config('shiaiflow.kind_change', 'off', true);
  return new_role;
end;
$$;

-- After "more information" or "rejected": the account fixed its data and sends it again.
create or replace function public.resubmit_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then raise exception 'Sign in first.'; end if;
  perform set_config('shiaiflow.kind_change', 'on', true);
  update public.users set review_state = null
  where id = me and review_state is not null and verified_at is null;
  perform set_config('shiaiflow.kind_change', 'off', true);
end;
$$;
revoke execute on function public.resubmit_account() from public, anon;
grant execute on function public.resubmit_account() to authenticated;

-- Mail queue: only the edge function (service role) reads it.
create table public.account_mail (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  event text not null check (event in ('waiting', 'verified', 'needs_info', 'rejected')),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  error text
);
alter table public.account_mail enable row level security;
revoke all on public.account_mail from anon, authenticated;

create extension if not exists pg_net with schema extensions;

create or replace function private.queue_account_mail()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ev text;
  waits_now boolean := new.verified_at is null and new.review_state is null
    and (new.role in ('dojo', 'regional', 'continental') or new.needs_review);
  waited boolean;
begin
  if tg_op = 'INSERT' then
    if waits_now then ev := 'waiting'; end if;
  else
    waited := old.verified_at is null and old.review_state is null
      and (old.role in ('dojo', 'regional', 'continental') or old.needs_review);
    if new.verified_at is not null and old.verified_at is null then ev := 'verified';
    elsif new.review_state is not null and new.review_state is distinct from old.review_state then ev := new.review_state;
    elsif waits_now and not waited then ev := 'waiting';
    end if;
  end if;
  if ev is null then return new; end if;
  insert into public.account_mail (user_id, event) values (new.id, ev);
  perform net.http_post(
    url := 'https://baxyawzwfpkrylprztad.supabase.co/functions/v1/account-mail',
    body := '{}'::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  return new;
end;
$$;
create trigger users_queue_account_mail
  after insert or update of role, verified_at, needs_review, review_state on public.users
  for each row execute procedure private.queue_account_mail();

-- the edge function (service role) reads the queue, the admins and the accounts
grant select, update on public.account_mail to service_role;
grant select on public.app_admins to service_role;
grant select on public.users to service_role;
