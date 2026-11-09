-- What a role change has to carry with it, found by testing set_user_role against tasks and leave. Idempotent.

-- The first day a former admin owes updates; their admin days must not show as missed. Null means since joining.
alter table public.profiles add column if not exists reports_since timestamptz;

create or replace function public.set_user_role(p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_old text;
begin
  -- One at a time, checked after the wait: two admins demoting each other at once would otherwise leave none.
  perform pg_advisory_xact_lock(hashtext('public.set_user_role'));
  if not public.is_admin() then
    raise exception 'permission denied: only admins change roles' using errcode = '42501';
  end if;
  -- The caller always stays an admin, so there is always someone left who can undo a mistake.
  if p_user = auth.uid() then
    raise exception 'cannot change your own role' using errcode = '42501';
  end if;
  -- The row lock makes a task or leave request sent right now either finish first, so the checks below see it, or wait
  -- and then find the new role.
  select role into v_old from public.profiles where id = p_user for update;
  if not found then
    raise exception 'no such person' using errcode = 'P0002';
  end if;
  if p_role = 'admin' and v_old <> 'admin' then
    -- Admins never hold tasks, and finished ones are only history.
    if exists (
      select 1 from public.task_assignments a join public.tasks t on t.id = a.task_id
        where a.user_id = p_user and t.status <> 'completed'
    ) then
      raise exception 'person still has open tasks' using errcode = '23514';
    end if;
    -- Admins decide leave, so a waiting request would let someone approve their own.
    if exists (select 1 from public.leave_requests r where r.user_id = p_user and r.status = 'pending') then
      raise exception 'person still has open leave requests' using errcode = '23514';
    end if;
  end if;
  update public.profiles
    set role = p_role, reports_since = case when v_old = 'admin' and p_role <> 'admin' then now() else reports_since end
    where id = p_user;
end $$;

-- Waits out a promotion in progress; the foreign key's own lock doesn't conflict with changing the role.
create or replace function public.task_assignee_is_staff()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_role text;
begin
  select role into v_role from public.profiles where id = new.user_id for share;
  if v_role = 'admin' or (v_role = 'manager' and not public.is_admin()) then
    raise exception 'tasks can only be given to staff' using errcode = '23514';
  end if;
  return new;
end $$;

-- A finished task can be reopened after its assignee became an admin.
create or replace function public.remind_pending_tasks(p_at timestamptz default now())
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamp := p_at at time zone 'Asia/Kolkata';
  r record;
begin
  if extract(isodow from v_now) = 7 or v_now::time < '09:00' or v_now::time >= '21:00'
    or exists (select 1 from public.holidays h where h.day = v_now::date) then
    return;
  end if;
  for r in
    with due as (
      update public.task_assignments a set reminded_at = now()
        from public.tasks t, public.profiles p
        -- 29 rather than 30: the job runs every 5 minutes, and a tick a moment early shouldn't push one back to 35.
        where t.id = a.task_id and t.status = 'pending' and p.id = a.user_id and p.role <> 'admin'
          and coalesce(a.reminded_at, a.assigned_at) <= now() - interval '29 minutes'
        returning a.task_id, a.user_id, t.title
    )
    select task_id, title, array_agg(user_id) as users from due group by task_id, title
  loop
    perform public.push_event('taskReminder', 'task', r.task_id, r.users, jsonb_build_object('text', r.title));
  end loop;
end $$;
revoke execute on function public.remind_pending_tasks(timestamptz) from public, anon, authenticated;

-- Leaving the admin role is like joining: yearly leave for the months left. A credit already given this year stands.
create or replace function public.credit_new_joiner()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if new.role <> 'admin' and (tg_op = 'INSERT' or old.role = 'admin') then
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

drop trigger if exists profiles_credit_leave on public.profiles;
create trigger profiles_credit_leave after insert or update of role on public.profiles
  for each row execute function public.credit_new_joiner();

notify pgrst, 'reload schema';
