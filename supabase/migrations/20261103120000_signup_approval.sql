-- New accounts wait for an admin. Anyone can still create one (the project also serves Fun app), but a profile, and with
-- it every bit of access, only exists once an admin approves. Without a profile RLS shows nothing and every write fails
-- its profiles foreign key, so no other rule needs to know about waiting people. Idempotent: safe to re-run.
--
-- The request is made by the app itself (request_access() on the waiting screen), not at sign-up, so Fun app accounts
-- that never open Daily Status never reach the list.

-- Profiles used to appear the moment an email was confirmed.
drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_auth_user_confirmed on auth.users;

create table if not exists public.signup_requests (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text check (length(full_name) <= 100),
  status text not null default 'waiting' check (status in ('waiting', 'approved', 'declined')),
  created_at timestamptz not null default now(),
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz
);
create index if not exists signup_requests_waiting_idx on public.signup_requests (created_at) where status = 'waiting';

alter table public.signup_requests enable row level security;
drop policy if exists "signups: own or admin" on public.signup_requests;
create policy "signups: own or admin" on public.signup_requests for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
revoke all on public.signup_requests from public, anon, authenticated;
grant select on public.signup_requests to authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'signup_requests') then
    alter publication supabase_realtime add table public.signup_requests;
  end if;
end $$;

-- The caller's place in the queue, joining it on first call: 'approved', 'waiting' or 'declined'.
create or replace function public.request_access()
returns text language plpgsql security definer set search_path = '' as $$
declare v_status text;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if exists (select 1 from public.profiles where id = auth.uid()) then
    return 'approved';
  end if;
  insert into public.signup_requests (user_id, email, full_name)
    select u.id, u.email, left(nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''), 100)
      from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null and u.email is not null
    on conflict (user_id) do nothing;
  select status into v_status from public.signup_requests where user_id = auth.uid();
  if v_status is null then
    raise exception 'email not confirmed' using errcode = '42501';
  end if;
  return v_status;
end $$;
revoke execute on function public.request_access() from public, anon;
grant execute on function public.request_access() to authenticated;

-- A declined request can still be approved later, so a mistaken decline is one tap to undo.
create or replace function public.approve_signup(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.signup_requests;
begin
  if not public.is_admin() then
    raise exception 'permission denied: only admins approve sign-ups' using errcode = '42501';
  end if;
  select * into r from public.signup_requests where user_id = p_user and status <> 'approved' for update;
  if not found then
    raise exception 'no such request' using errcode = 'P0002';
  end if;
  -- Joining today: days before approval are never counted as missed.
  insert into public.profiles (id, email, full_name) values (r.user_id, r.email, r.full_name)
    on conflict (id) do nothing;
  update public.signup_requests set status = 'approved', decided_by = auth.uid(), decided_at = now()
    where user_id = p_user;
end $$;
revoke execute on function public.approve_signup(uuid) from public, anon;
grant execute on function public.approve_signup(uuid) to authenticated;

-- The account itself stays: it may belong to Fun app, and deleting it is for the dashboard.
create or replace function public.decline_signup(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'permission denied: only admins decline sign-ups' using errcode = '42501';
  end if;
  update public.signup_requests set status = 'declined', decided_by = auth.uid(), decided_at = now()
    where user_id = p_user and status = 'waiting';
  if not found then
    raise exception 'no such request' using errcode = 'P0002';
  end if;
end $$;
revoke execute on function public.decline_signup(uuid) from public, anon;
grant execute on function public.decline_signup(uuid) to authenticated;

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('status', 'task', 'leave', 'person'));

create or replace function public.push_signup_waiting()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.push_event('signupWaiting', 'person', new.user_id, public.push_admins(),
    jsonb_build_object('text', coalesce(new.full_name, split_part(new.email, '@', 1))));
  return null;
end $$;
revoke execute on function public.push_signup_waiting() from public, anon, authenticated;

drop trigger if exists signup_requests_push on public.signup_requests;
create trigger signup_requests_push after insert on public.signup_requests
  for each row execute function public.push_signup_waiting();

notify pgrst, 'reload schema';
