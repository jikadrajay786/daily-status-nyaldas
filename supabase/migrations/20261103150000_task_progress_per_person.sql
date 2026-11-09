-- Everyone given a task has their own progress on it (task_assignments.status); tasks.status is now the whole task's,
-- worked out from theirs: blocked if anyone is, completed once everyone is, in progress once anyone has started, else
-- pending (core taskRollup mirrors it). Clients can no longer write tasks.status. Idempotent: safe to re-run.

do $$ begin
  if not exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'task_assignments' and column_name = 'status') then
    alter table public.task_assignments
      add column status public.task_status not null default 'pending',
      add column updated_at timestamptz not null default now();
    -- Everyone starts where the shared task was, so nothing on the board moves.
    update public.task_assignments a set status = t.status, updated_at = t.updated_at
      from public.tasks t where t.id = a.task_id;
  end if;
end $$;
create index if not exists task_assignments_task_idx on public.task_assignments (task_id);

create or replace function public.task_rollup(p_task uuid)
returns public.task_status language sql stable set search_path = '' as $$
  select (case
    when bool_or(a.status = 'blocked') then 'blocked'
    when bool_and(a.status = 'completed') then 'completed'
    when bool_or(a.status <> 'pending') then 'in_progress'
    else 'pending'
  end)::public.task_status
  from public.task_assignments a where a.task_id = p_task
$$;

create or replace function public.my_tasks()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select a.task_id from public.task_assignments a where a.user_id = auth.uid()
$$;
revoke execute on function public.my_tasks() from public, anon;
grant execute on function public.my_tasks() to authenticated;

-- Only the status is written through the API, and it says when it last changed.
create or replace function public.stamp_assignment()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    new.updated_at := now();
  end if;
  return new;
end $$;
drop trigger if exists task_assignments_stamp on public.task_assignments;
create trigger task_assignments_stamp before update on public.task_assignments
  for each row execute function public.stamp_assignment();

-- The task row lock queues people finishing at the same moment, so the last one sees everyone else's work and the
-- task can't be left in progress with nobody left to do.
create or replace function public.sync_task_status()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := coalesce(new.task_id, old.task_id);
  v_task public.tasks;
  v_now public.task_status;
  v_owner uuid;
  v_all uuid[];
begin
  select * into v_task from public.tasks where id = v_id for update;
  if not found then
    return null;
  end if;
  v_now := public.task_rollup(v_id);
  if v_task.status is distinct from v_now then
    update public.tasks set status = v_now where id = v_id;
  end if;
  -- Admins hear nothing from their own changes; whoever handed the task out hears the rest.
  if tg_op = 'UPDATE' and not public.is_admin() then
    v_owner := public.task_owner(v_id);
    v_all := array(select a.user_id from public.task_assignments a where a.task_id = v_id);
    if v_now = 'completed' and v_task.status <> 'completed' and cardinality(v_all) > 1 then
      perform public.push_event('taskDone', 'task', v_id,
        case when v_owner is null then public.push_admins() else array[v_owner] end || public.bosses_of(v_all),
        jsonb_build_object('text', v_task.title));
    else
      perform public.push_event('taskStatus', 'task', v_id,
        case when v_owner is null then public.push_admins() else array[v_owner] end
          || public.bosses_of(array[new.user_id]),
        jsonb_build_object('name', public.push_name(auth.uid()), 'title', v_task.title, 'status', new.status));
    end if;
  end if;
  return null;
end $$;
revoke execute on function public.sync_task_status() from public, anon, authenticated;
drop trigger if exists task_assignments_rollup on public.task_assignments;
create trigger task_assignments_rollup after insert or delete or update of status on public.task_assignments
  for each row execute function public.sync_task_status();

-- The rollup now reports each person's change, so the task's own change would tell the same people twice.
drop trigger if exists tasks_push_status on public.tasks;

revoke update on public.tasks from authenticated;
grant update (title, description, due_date) on public.tasks to authenticated;
revoke update on public.task_assignments from authenticated;
grant update (status) on public.task_assignments to authenticated;

drop policy if exists "tasks: update assigned" on public.tasks;
drop policy if exists "tasks: leads update staff tasks" on public.tasks;
drop policy if exists "assignments: read co-assignees" on public.task_assignments;
create policy "assignments: read co-assignees" on public.task_assignments for select to authenticated
  using (task_id in (select public.my_tasks()));
drop policy if exists "assignments: update own" on public.task_assignments;
create policy "assignments: update own" on public.task_assignments for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "assignments: leads update own staff" on public.task_assignments;
create policy "assignments: leads update own staff" on public.task_assignments for update to authenticated
  using (user_id in (select public.my_staff())) with check (user_id in (select public.my_staff()));

-- Everyone on a task, for whoever can see it. Staff and managers can't read most profiles, so names come from here;
-- only admins get emails. `editable` mirrors the update policies above.
create or replace function public.task_members(p_tasks uuid[])
returns table (
  task_id uuid, user_id uuid, full_name text, email text, status public.task_status, updated_at timestamptz,
  editable boolean
) language sql stable security definer set search_path = '' as $$
  select a.task_id, a.user_id,
    case when public.is_admin() then p.full_name else coalesce(nullif(trim(p.full_name), ''), split_part(p.email, '@', 1)) end,
    case when public.is_admin() then p.email end,
    a.status, a.updated_at,
    public.is_admin() or public.manages_task(a.task_id) or a.user_id = auth.uid()
      or a.user_id in (select public.my_staff())
  from public.task_assignments a join public.profiles p on p.id = a.user_id
  where a.task_id = any(p_tasks)
    and (public.is_admin() or public.manages_task(a.task_id) or a.task_id in (select public.my_tasks())
      or a.task_id in (select public.my_staff_tasks()))
  order by 3, a.user_id
$$;
revoke execute on function public.task_members(uuid[]) from public, anon;
grant execute on function public.task_members(uuid[]) to authenticated;

-- Reminds each person who hasn't started, not everyone on a task nobody has started.
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
        where t.id = a.task_id and a.status = 'pending' and p.id = a.user_id and p.role <> 'admin'
          and coalesce(a.reminded_at, a.assigned_at) <= now() - interval '29 minutes'
        returning a.task_id, a.user_id, t.title
    )
    select task_id, title, array_agg(user_id) as users from due group by task_id, title
  loop
    perform public.push_event('taskReminder', 'task', r.task_id, r.users, jsonb_build_object('text', r.title));
  end loop;
end $$;
revoke execute on function public.remind_pending_tasks(timestamptz) from public, anon, authenticated;

notify pgrst, 'reload schema';
