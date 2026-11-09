-- Leave: types the admin sets up, requests that go pending -> approved/rejected/withdrawn/cancelled, and a ledger whose
-- sum is the balance. Staff and managers read their own, admins read everything, and every write goes through the
-- functions below so days are counted and balances checked on the server. Idempotent: safe to re-run.

create extension if not exists btree_gist with schema extensions;

create table if not exists public.leave_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z_]{2,20}$'),
  name text not null check (length(trim(name)) between 1 and 50),
  name_hi text check (length(name_hi) <= 50),
  name_gu text check (length(name_gu) <= 50),
  yearly_quota numeric(4, 1) not null default 0 check (yearly_quota >= 0),
  accrual text not null default 'yearly' check (accrual in ('yearly', 'monthly', 'none')),
  carry_forward_max numeric(4, 1) not null default 0 check (carry_forward_max >= 0),
  allow_half_day boolean not null default true,
  allow_negative boolean not null default false,
  sandwich boolean not null default false,
  needs_balance boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type_id uuid not null references public.leave_types (id) on delete restrict,
  start_day date not null,
  end_day date not null,
  start_half text not null default 'full',
  end_half text not null default 'full',
  days numeric(4, 1) not null check (days > 0),
  reason text not null check (length(trim(reason)) between 1 and 500),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'withdrawn', 'cancelled')),
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  decision_note text check (length(decision_note) <= 300),
  created_at timestamptz not null default now(),
  -- Each day is two slots, so a morning off and an afternoon off on one day don't collide but anything else does.
  slots int4range generated always as (int4range(
    (start_day - date '2000-01-01') * 2 + (start_half = 'second')::int,
    (end_day - date '2000-01-01') * 2 + (end_half <> 'first')::int,
    '[]'
  )) stored,
  constraint leave_requests_dates_check check (end_day >= start_day and end_day - start_day < 366),
  constraint leave_requests_halves_check check (
    case when start_day = end_day
      then start_half = end_half and start_half in ('full', 'first', 'second')
      else start_half in ('full', 'second') and end_half in ('full', 'first')
    end
  ),
  constraint leave_requests_no_overlap exclude using gist (user_id with =, slots with &&)
    where (status in ('pending', 'approved'))
);
create index if not exists leave_requests_user_idx on public.leave_requests (user_id, start_day desc);
create index if not exists leave_requests_status_idx on public.leave_requests (status, start_day);
create index if not exists leave_requests_type_idx on public.leave_requests (type_id);
create index if not exists leave_requests_decided_by_idx on public.leave_requests (decided_by);

create table if not exists public.leave_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  type_id uuid not null references public.leave_types (id) on delete restrict,
  days numeric(5, 2) not null check (days <> 0),
  kind text not null check (kind in ('credit', 'debit', 'reversal', 'adjust', 'lapse')),
  -- The month or year a scheduled line belongs to, so running the job twice can't credit twice.
  period date,
  request_id uuid references public.leave_requests (id) on delete set null,
  note text check (length(note) <= 300),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists leave_ledger_period_idx on public.leave_ledger (user_id, type_id, kind, period)
  where period is not null;
create index if not exists leave_ledger_user_idx on public.leave_ledger (user_id, type_id);
create index if not exists leave_ledger_type_idx on public.leave_ledger (type_id);
create index if not exists leave_ledger_request_idx on public.leave_ledger (request_id);
create index if not exists leave_ledger_created_by_idx on public.leave_ledger (created_by);

alter table public.leave_types enable row level security;
alter table public.leave_requests enable row level security;
alter table public.leave_ledger enable row level security;

do $$ declare p record; begin
  for p in select policyname, tablename from pg_policies
    where schemaname = 'public' and tablename in ('leave_types', 'leave_requests', 'leave_ledger') loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

create policy "leave types: everyone reads" on public.leave_types for select to authenticated using (true);
create policy "leave types: admin writes" on public.leave_types for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "leave requests: own or admin reads" on public.leave_requests for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "leave ledger: own or admin reads" on public.leave_ledger for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

revoke all on public.leave_types, public.leave_requests, public.leave_ledger from anon, authenticated;
grant select, insert, update, delete on public.leave_types to authenticated;
grant select on public.leave_requests, public.leave_ledger to authenticated;

-- `used` is this leave year (January to December); balance runs across years, with lapses written at year end.
create or replace view public.leave_balances with (security_invoker = true) as
  select user_id, type_id, sum(balance) as balance, sum(pending) as pending, sum(balance) - sum(pending) as available,
    sum(used) as used
  from (
    select user_id, type_id, days as balance, 0::numeric as pending,
      case when kind in ('debit', 'reversal')
        and created_at >= date_trunc('year', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata'
        then -days else 0 end as used
    from public.leave_ledger
    union all
    select user_id, type_id, 0, days, 0 from public.leave_requests where status = 'pending'
  ) lines
  group by user_id, type_id;
revoke all on public.leave_balances from anon, authenticated;
grant select on public.leave_balances to authenticated;

-- Working days a request uses: Sundays and holidays don't count, unless the type's sandwich rule counts the ones
-- between two leave days. Core's leaveDays follows the same rules for the preview in the form.
create or replace function public.leave_day_count(
  p_start date, p_end date, p_start_half text, p_end_half text, p_sandwich boolean
) returns numeric language sql stable set search_path = '' as $$
  with work as (
    select d::date as day from generate_series(p_start::timestamp, p_end::timestamp, interval '1 day') d
    where extract(isodow from d) <> 7 and not exists (select 1 from public.holidays h where h.day = d::date)
  ), span as (
    select count(*) as n, min(day) as a, max(day) as b, coalesce(bool_or(day = p_start), false) as has_start,
      coalesce(bool_or(day = p_end), false) as has_end
    from work
  )
  select case
    when n = 0 then 0
    when p_start = p_end then case when p_start_half = 'full' then 1 else 0.5 end
    else case when p_sandwich then b - a + 1 else n end
      - case when has_start and p_start_half <> 'full' then 0.5 else 0 end
      - case when has_end and p_end_half <> 'full' then 0.5 else 0 end
  end::numeric from span
$$;
revoke execute on function public.leave_day_count(date, date, text, text, boolean) from public, anon, authenticated;

create or replace function public.apply_leave(
  p_type uuid, p_start date, p_end date, p_start_half text, p_end_half text, p_reason text
) returns public.leave_requests language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_type public.leave_types;
  v_days numeric;
  v_row public.leave_requests;
begin
  -- The lock makes two requests sent at once take turns, so they can't both spend the same balance.
  if not exists (select 1 from public.profiles where id = v_user and role <> 'admin' for no key update) then
    raise exception 'permission denied: admins do not take leave here' using errcode = '42501';
  end if;
  select * into v_type from public.leave_types where id = p_type and active;
  if not found then raise exception 'leave type not available' using errcode = '22023'; end if;
  if p_end < p_start or p_end - p_start >= 366 then
    raise exception 'leave dates invalid' using errcode = '22023';
  end if;
  if p_start < (now() at time zone 'Asia/Kolkata')::date - 7 then
    raise exception 'leave date too far back' using errcode = '22023';
  end if;
  if not v_type.allow_half_day and (p_start_half <> 'full' or p_end_half <> 'full') then
    raise exception 'leave half day not allowed' using errcode = '22023';
  end if;
  v_days := public.leave_day_count(p_start, p_end, p_start_half, p_end_half, v_type.sandwich);
  if v_days = 0 then raise exception 'leave has no working days' using errcode = '22023'; end if;
  if v_type.needs_balance and not v_type.allow_negative and v_days >
    coalesce((select sum(days) from public.leave_ledger where user_id = v_user and type_id = p_type), 0)
    - coalesce((select sum(days) from public.leave_requests
        where user_id = v_user and type_id = p_type and status = 'pending'), 0) then
    raise exception 'leave balance too low' using errcode = '22023';
  end if;
  insert into public.leave_requests (user_id, type_id, start_day, end_day, start_half, end_half, days, reason)
  values (v_user, p_type, p_start, p_end, p_start_half, p_end_half, v_days, trim(p_reason))
  returning * into v_row;
  return v_row;
end $$;
revoke execute on function public.apply_leave(uuid, date, date, text, text, text) from public, anon;
grant execute on function public.apply_leave(uuid, date, date, text, text, text) to authenticated;

create or replace function public.decide_leave(p_id uuid, p_approve boolean, p_note text default null)
returns public.leave_requests language plpgsql security definer set search_path = '' as $$
declare
  v_row public.leave_requests;
  v_type public.leave_types;
begin
  if not public.is_admin() then raise exception 'permission denied' using errcode = '42501'; end if;
  select * into v_row from public.leave_requests where id = p_id for update;
  if v_row.status is distinct from 'pending' then
    raise exception 'leave request already closed' using errcode = '22023';
  end if;
  if p_approve then
    perform 1 from public.profiles where id = v_row.user_id for no key update;
    select * into v_type from public.leave_types where id = v_row.type_id;
    if v_type.needs_balance and not v_type.allow_negative and v_row.days >
      coalesce((select sum(days) from public.leave_ledger where user_id = v_row.user_id and type_id = v_row.type_id), 0) then
      raise exception 'leave balance too low' using errcode = '22023';
    end if;
    insert into public.leave_ledger (user_id, type_id, days, kind, request_id)
    values (v_row.user_id, v_row.type_id, -v_row.days, 'debit', v_row.id);
  end if;
  update public.leave_requests
    set status = case when p_approve then 'approved' else 'rejected' end,
      decided_by = auth.uid(), decided_at = now(), decision_note = nullif(trim(p_note), '')
    where id = p_id returning * into v_row;
  return v_row;
end $$;
revoke execute on function public.decide_leave(uuid, boolean, text) from public, anon;
grant execute on function public.decide_leave(uuid, boolean, text) to authenticated;

-- A person can take back their own request while it's pending, or once approved until the day it starts. Admins can
-- also cancel leave that has already started.
create or replace function public.cancel_leave(p_id uuid, p_note text default null)
returns public.leave_requests language plpgsql security definer set search_path = '' as $$
declare
  v_row public.leave_requests;
  v_admin boolean := public.is_admin();
begin
  select * into v_row from public.leave_requests where id = p_id for update;
  if not found or not (v_admin or v_row.user_id = auth.uid()) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if v_row.status not in ('pending', 'approved') then
    raise exception 'leave request already closed' using errcode = '22023';
  end if;
  if v_row.status = 'approved' then
    if not v_admin and v_row.start_day <= (now() at time zone 'Asia/Kolkata')::date then
      raise exception 'leave already started' using errcode = '22023';
    end if;
    insert into public.leave_ledger (user_id, type_id, days, kind, request_id)
    values (v_row.user_id, v_row.type_id, v_row.days, 'reversal', v_row.id);
  end if;
  update public.leave_requests
    set status = case when v_row.status = 'approved' then 'cancelled' else 'withdrawn' end,
      decided_by = auth.uid(), decided_at = now(), decision_note = nullif(trim(p_note), '')
    where id = p_id returning * into v_row;
  return v_row;
end $$;
revoke execute on function public.cancel_leave(uuid, text) from public, anon;
grant execute on function public.cancel_leave(uuid, text) to authenticated;

-- Manual lines: opening balances and corrections.
create or replace function public.adjust_leave_balance(p_user uuid, p_type uuid, p_days numeric, p_note text)
returns public.leave_ledger language plpgsql security definer set search_path = '' as $$
declare v_row public.leave_ledger;
begin
  if not public.is_admin() then raise exception 'permission denied' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where id = p_user and role <> 'admin' for no key update) then
    raise exception 'permission denied: admins do not take leave here' using errcode = '42501';
  end if;
  if coalesce(p_days, 0) = 0 or length(trim(coalesce(p_note, ''))) = 0 then
    raise exception 'leave adjustment invalid' using errcode = '22023';
  end if;
  insert into public.leave_ledger (user_id, type_id, days, kind, note)
  values (p_user, p_type, p_days, 'adjust', trim(p_note))
  returning * into v_row;
  return v_row;
end $$;
revoke execute on function public.adjust_leave_balance(uuid, uuid, numeric, text) from public, anon;
grant execute on function public.adjust_leave_balance(uuid, uuid, numeric, text) to authenticated;

-- Runs on the 1st of each month. January first lapses whatever is over the carry-forward cap, leaving this period's
-- own lines out of the sum so a second run can't lapse a credit it just wrote.
create or replace function public.credit_leave(p_on date default (now() at time zone 'Asia/Kolkata')::date)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_month date := date_trunc('month', p_on)::date;
  v_year date := date_trunc('year', p_on)::date;
begin
  if v_month = v_year then
    insert into public.leave_ledger (user_id, type_id, days, kind, period, note, created_by)
    select l.user_id, l.type_id, -(sum(l.days) - t.carry_forward_max), 'lapse', v_year, null, null
      from public.leave_ledger l
      join public.leave_types t on t.id = l.type_id and t.needs_balance
      where l.period is distinct from v_year
      group by l.user_id, l.type_id, t.carry_forward_max
      having sum(l.days) > t.carry_forward_max
    on conflict (user_id, type_id, kind, period) where period is not null do nothing;
    insert into public.leave_ledger (user_id, type_id, days, kind, period, created_by)
    select p.id, t.id, t.yearly_quota, 'credit', v_year, null
      from public.profiles p
      join public.leave_types t on t.active and t.needs_balance and t.accrual = 'yearly' and t.yearly_quota > 0
      where p.role <> 'admin'
    on conflict (user_id, type_id, kind, period) where period is not null do nothing;
  end if;
  insert into public.leave_ledger (user_id, type_id, days, kind, period, created_by)
  select p.id, t.id, round(t.yearly_quota / 12, 2), 'credit', v_month, null
    from public.profiles p
    join public.leave_types t on t.active and t.needs_balance and t.accrual = 'monthly' and t.yearly_quota > 0
    where p.role <> 'admin'
  on conflict (user_id, type_id, kind, period) where period is not null do nothing;
end $$;
revoke execute on function public.credit_leave(date) from public, anon, authenticated;

-- Someone joining mid-year gets the yearly types for the months left, rounded to a half day. Monthly types start with
-- the next 1st. Everyone already here starts empty: admins enter opening balances once with adjust_leave_balance.
create or replace function public.credit_new_joiner()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if new.role <> 'admin' then
    insert into public.leave_ledger (user_id, type_id, days, kind, period, created_by)
    select new.id, t.id, round(t.yearly_quota * (13 - extract(month from v_today)) / 12 * 2) / 2, 'credit',
      date_trunc('year', v_today)::date, null
    from public.leave_types t
    where t.active and t.needs_balance and t.accrual = 'yearly'
      and round(t.yearly_quota * (13 - extract(month from v_today)) / 12 * 2) > 0
    on conflict (user_id, type_id, kind, period) where period is not null do nothing;
  end if;
  return new;
end $$;
revoke execute on function public.credit_new_joiner() from public, anon, authenticated;

drop trigger if exists profiles_credit_leave on public.profiles;
create trigger profiles_credit_leave after insert on public.profiles
  for each row execute function public.credit_new_joiner();

insert into public.leave_types
  (code, name, name_hi, name_gu, yearly_quota, accrual, carry_forward_max, needs_balance) values
  ('casual', 'Casual leave', 'कैज़ुअल लीव', 'કૅઝ્યુઅલ લીવ', 12, 'yearly', 0, true),
  ('sick', 'Sick leave', 'सिक लीव', 'સિક લીવ', 6, 'yearly', 0, true),
  ('earned', 'Earned leave', 'अर्न्ड लीव', 'અર્ન્ડ લીવ', 15, 'monthly', 30, true),
  ('unpaid', 'Unpaid leave', 'बिना पगार की छुट्टी', 'પગાર વગરની રજા', 0, 'none', 0, false)
on conflict (code) do nothing;

do $$ declare t text; begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['leave_types', 'leave_requests', 'leave_ledger'] loop
      if not exists (select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

create extension if not exists pg_cron;
-- 00:05 UTC on the 1st is 05:35 India time, so it's already the new month there.
select cron.schedule('leave-credits', '5 0 1 * *', 'select public.credit_leave()');

notify pgrst, 'reload schema';
