-- Idempotent: safe to re-run in the SQL Editor or via `supabase db push`.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists role text not null default 'user' check (role in ('user', 'admin'));
-- The pre-existing table has updated_at NOT NULL without a default, which would fail every trigger insert.
alter table public.profiles alter column updated_at set default now();

-- The pre-existing profiles table may lack the auth.users FK; NOT VALID skips checking legacy rows.
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.profiles'::regclass and contype = 'f') then
    alter table public.profiles add constraint profiles_id_fkey
      foreign key (id) references auth.users (id) on delete cascade not valid;
  end if;
end $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- role is never taken from metadata: users control raw_user_meta_data at signup.
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

insert into public.profiles (id, email, full_name)
select id, email, raw_user_meta_data ->> 'full_name' from auth.users
on conflict (id) do nothing;

-- security definer lets policies on profiles check the caller's role without recursing into themselves.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
$$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create table if not exists public.daily_statuses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  -- No default: current_date is UTC, so the client sends the user's local date.
  status_date date not null,
  status text not null default 'in_progress' check (status in ('completed', 'in_progress', 'blocked')),
  summary text not null check (length(trim(summary)) > 0),
  blockers text,
  hours numeric(4, 2) not null default 0 check (hours between 0 and 24),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, status_date)
);
-- Guarded because 20261016140000 renames status_date to date (the index follows the rename).
do $$ begin
  if exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'daily_statuses' and column_name = 'status_date') then
    create index if not exists daily_statuses_status_date_idx on public.daily_statuses (status_date);
  end if;
end $$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists daily_statuses_touch on public.daily_statuses;
create trigger daily_statuses_touch before update on public.daily_statuses
  for each row execute function public.touch_updated_at();
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

alter table public.profiles enable row level security;
alter table public.daily_statuses enable row level security;

-- Permissive policies OR together, so any leftover policy would widen access; start from a clean slate.
do $$ declare p record; begin
  for p in select policyname, tablename from pg_policies
    where schemaname = 'public' and tablename in ('profiles', 'daily_statuses') loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

create policy "profiles: read own or admin" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));
create policy "profiles: update own" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "statuses: read own or admin" on public.daily_statuses for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "statuses: insert own" on public.daily_statuses for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "statuses: update own" on public.daily_statuses for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "statuses: delete own" on public.daily_statuses for delete to authenticated
  using (user_id = (select auth.uid()));

-- Column-level update grant: users may rename themselves but never touch role, id or email.
revoke all on public.profiles, public.daily_statuses from anon;
revoke insert, update, delete on public.profiles from authenticated;
grant select, update (full_name) on public.profiles to authenticated;
grant select, insert, update, delete on public.daily_statuses to authenticated;

-- Promote the first admin once, as the dashboard's postgres role:
-- update public.profiles set role = 'admin' where email = 'you@company.com';
