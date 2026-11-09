-- Store and agency managers: staff report to one of them through profiles.reports_to, and that manager sees their
-- updates, handles their tasks and decides their leave. Plain managers are unchanged; admins handle everything.
-- Needs 20261030150000 (leave) and 20261030160000 (role fixes) first. Idempotent: safe to re-run.

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('user', 'manager', 'store_manager', 'agency_manager', 'admin'));
alter table public.comments drop constraint if exists comments_author_role_check;
alter table public.comments add constraint comments_author_role_check
  check (author_role in ('user', 'manager', 'store_manager', 'agency_manager', 'admin'));

-- Outside the column grant, like role: only set_user_manager writes it through the API.
alter table public.profiles add column if not exists reports_to uuid references public.profiles (id) on delete set null;
create index if not exists profiles_reports_to_idx on public.profiles (reports_to) where reports_to is not null;

-- Also catches a change made by hand in SQL.
create or replace function public.check_reports_to()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.reports_to is not null and (
    new.role <> 'user'
    or not exists (select 1 from public.profiles p
      where p.id = new.reports_to and p.role in ('store_manager', 'agency_manager'))
  ) then
    raise exception 'only staff report to a store or agency manager' using errcode = '23514';
  end if;
  return new;
end $$;
revoke execute on function public.check_reports_to() from public, anon, authenticated;
drop trigger if exists profiles_check_reports_to on public.profiles;
create trigger profiles_check_reports_to before insert or update of reports_to, role on public.profiles
  for each row execute function public.check_reports_to();

create or replace function public.is_lead()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles
    where id = auth.uid() and role in ('store_manager', 'agency_manager'))
$$;
revoke execute on function public.is_lead() from public, anon;
grant execute on function public.is_lead() to authenticated;

-- Everyone who hands out tasks and manages the ones they created.
create or replace function public.is_manager()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles
    where id = auth.uid() and role in ('manager', 'store_manager', 'agency_manager'))
$$;

-- Sets rather than per-row checks, so policies run them once and admins' long lists don't pay for them.
create or replace function public.my_staff()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select p.id from public.profiles p where p.reports_to = auth.uid() and p.role = 'user' and public.is_lead()
$$;
revoke execute on function public.my_staff() from public, anon;
grant execute on function public.my_staff() to authenticated;

create or replace function public.my_staff_tasks()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select a.task_id from public.task_assignments a where a.user_id in (select public.my_staff())
$$;
revoke execute on function public.my_staff_tasks() from public, anon;
grant execute on function public.my_staff_tasks() to authenticated;

drop policy if exists "profiles: managers read staff" on public.profiles;
drop policy if exists "profiles: leads read own staff" on public.profiles;
create policy "profiles: leads read own staff" on public.profiles for select to authenticated
  using (id in (select public.my_staff()));

drop policy if exists "statuses: leads read own staff" on public.daily_statuses;
create policy "statuses: leads read own staff" on public.daily_statuses for select to authenticated
  using (user_id in (select public.my_staff()));

drop policy if exists "tasks: leads read staff tasks" on public.tasks;
create policy "tasks: leads read staff tasks" on public.tasks for select to authenticated
  using (id in (select public.my_staff_tasks()));
-- guard_task_update limits this to status, unless they created the task.
drop policy if exists "tasks: leads update staff tasks" on public.tasks;
create policy "tasks: leads update staff tasks" on public.tasks for update to authenticated
  using (id in (select public.my_staff_tasks())) with check (id in (select public.my_staff_tasks()));
drop policy if exists "assignments: leads read staff tasks" on public.task_assignments;
create policy "assignments: leads read staff tasks" on public.task_assignments for select to authenticated
  using (task_id in (select public.my_staff_tasks()));

drop policy if exists "leave requests: leads read own staff" on public.leave_requests;
create policy "leave requests: leads read own staff" on public.leave_requests for select to authenticated
  using (user_id in (select public.my_staff()));
drop policy if exists "leave ledger: leads read own staff" on public.leave_ledger;
create policy "leave ledger: leads read own staff" on public.leave_ledger for select to authenticated
  using (user_id in (select public.my_staff()));

-- Names only for the assignment picker: all staff for a manager, their own for a store or agency manager.
create or replace function public.staff_names()
returns table (id uuid, full_name text) language sql stable security definer set search_path = '' as $$
  select p.id, coalesce(nullif(trim(p.full_name), ''), split_part(p.email, '@', 1))
    from public.profiles p
    where p.role = 'user' and public.is_manager() and (not public.is_lead() or p.reports_to = auth.uid())
    order by 2
$$;
revoke execute on function public.staff_names() from public, anon;
grant execute on function public.staff_names() to authenticated;

-- The share lock waits out a promotion in progress; the foreign key's own lock doesn't conflict with changing a role.
create or replace function public.task_assignee_is_staff()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_target public.profiles;
begin
  select * into v_target from public.profiles where id = new.user_id for share;
  if v_target.role = 'admin' or (not public.is_admin() and (v_target.role <> 'user'
    or (public.is_lead() and v_target.reports_to is distinct from auth.uid()))) then
    raise exception 'tasks can only be given to staff' using errcode = '23514';
  end if;
  return new;
end $$;

-- Staff who reported to someone leaving a store or agency manager role go back to reporting to nobody.
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
  if p_role is distinct from v_old then
    update public.profiles set reports_to = null where reports_to = p_user;
  end if;
  update public.profiles
    set role = p_role,
      reports_since = case when v_old = 'admin' and p_role <> 'admin' then now() else reports_since end,
      reports_to = case when p_role = 'user' then reports_to end
    where id = p_user;
end $$;

create or replace function public.set_user_manager(p_user uuid, p_manager uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  -- The same lock as set_user_role, so a manager can't change role while staff are being linked to them.
  perform pg_advisory_xact_lock(hashtext('public.set_user_role'));
  if not public.is_admin() then
    raise exception 'permission denied: only admins set who staff report to' using errcode = '42501';
  end if;
  update public.profiles set reports_to = p_manager where id = p_user;
  if not found then
    raise exception 'no such person' using errcode = 'P0002';
  end if;
end $$;
revoke execute on function public.set_user_manager(uuid, uuid) from public, anon;
grant execute on function public.set_user_manager(uuid, uuid) to authenticated;

-- A store or agency manager decides their own staff's leave, never their own: they don't report to themselves.
create or replace function public.decide_leave(p_id uuid, p_approve boolean, p_note text default null)
returns public.leave_requests language plpgsql security definer set search_path = '' as $$
declare
  v_row public.leave_requests;
  v_type public.leave_types;
begin
  select * into v_row from public.leave_requests where id = p_id for update;
  if not public.is_admin() and (v_row.user_id is null or v_row.user_id not in (select public.my_staff())) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
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

-- A person can take back their own request while it's pending, or once approved until the day it starts. Admins and
-- the person's store or agency manager can also cancel leave that has already started.
create or replace function public.cancel_leave(p_id uuid, p_note text default null)
returns public.leave_requests language plpgsql security definer set search_path = '' as $$
declare
  v_row public.leave_requests;
  v_over boolean;
begin
  select * into v_row from public.leave_requests where id = p_id for update;
  v_over := public.is_admin() or v_row.user_id in (select public.my_staff());
  if not found or not (coalesce(v_over, false) or v_row.user_id = auth.uid()) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if v_row.status not in ('pending', 'approved') then
    raise exception 'leave request already closed' using errcode = '22023';
  end if;
  if v_row.status = 'approved' then
    if not coalesce(v_over, false) and v_row.start_day <= (now() at time zone 'Asia/Kolkata')::date then
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

-- Task threads belong to whoever manages the task or its staff; update threads also to the author's manager.
create or replace function public.can_comment_on(p_status uuid, p_task uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_admin()
    or exists (select 1 from public.daily_statuses s where s.id = p_status
      and (s.user_id = auth.uid() or s.user_id in (select public.my_staff())))
    or exists (select 1 from public.task_assignments a where a.task_id = p_task and a.user_id = auth.uid())
    or public.manages_task(p_task)
    or p_task in (select public.my_staff_tasks())
$$;

-- Everyone a person's work should reach besides the admins: the store or agency manager they report to.
create or replace function public.bosses_of(p_users uuid[])
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct p.reports_to), '{}') from public.profiles p
    where p.id = any(p_users) and p.reports_to is not null
$$;
revoke execute on function public.bosses_of(uuid[]) from public, anon, authenticated;

create or replace function public.push_status_submitted()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select p.role from public.profiles p where p.id = new.user_id) <> 'admin' then
    perform public.push_event('statusSubmitted', 'status', new.id,
      public.push_admins() || public.bosses_of(array[new.user_id]),
      jsonb_build_object('name', public.push_name(new.user_id), 'text', left(new.description_text, 140)));
  end if;
  return null;
end $$;

create or replace function public.task_owner(p_task uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select t.created_by from public.tasks t join public.profiles p on p.id = t.created_by
    where t.id = p_task and p.role in ('manager', 'store_manager', 'agency_manager')
$$;
revoke execute on function public.task_owner(uuid) from public, anon, authenticated;

create or replace function public.push_task_status()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := public.task_owner(new.id);
begin
  if not public.is_admin() then
    perform public.push_event('taskStatus', 'task', new.id,
      case when v_owner is null then public.push_admins() else array[v_owner] end
        || public.bosses_of(array(select a.user_id from public.task_assignments a where a.task_id = new.id)),
      jsonb_build_object('name', public.push_name(auth.uid()), 'title', new.title, 'status', new.status));
  end if;
  return null;
end $$;

create or replace function public.push_comment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := public.task_owner(new.task_id);
  v_to uuid[] := array(
    select s.user_id from public.daily_statuses s where s.id = new.status_id
    union select a.user_id from public.task_assignments a where a.task_id = new.task_id
    union select c.author_id from public.comments c join public.profiles p on p.id = c.author_id
      where p.role = 'admin' and c.id <> new.id and (c.status_id = new.status_id or c.task_id = new.task_id)
  );
begin
  if v_owner is not null then
    v_to := v_to || v_owner;
  -- Staff writing into a thread no admin has joined are talking to management, so every admin hears it.
  elsif new.author_role <> 'admin'
    and not exists (select 1 from public.profiles p where p.id = any(v_to) and p.role = 'admin') then
    v_to := v_to || public.push_admins();
  end if;
  v_to := v_to || public.bosses_of(v_to);
  perform public.push_event('comment', case when new.status_id is null then 'task' else 'status' end,
    coalesce(new.status_id, new.task_id), v_to,
    jsonb_build_object('name', new.author_name, 'text', left(new.body, 140)));
  return null;
end $$;

notify pgrst, 'reload schema';
