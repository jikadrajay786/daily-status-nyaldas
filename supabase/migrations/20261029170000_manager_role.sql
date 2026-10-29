-- Managers: staff who also hand out tasks. They report, get tasks and reminders like staff, and additionally see
-- staff names, create tasks for staff, and manage only the tasks they created. Idempotent: safe to re-run.
-- Promote someone as the dashboard's postgres role:
--   update public.profiles set role = 'manager' where email = 'someone@company.com';

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('user', 'manager', 'admin'));
alter table public.comments drop constraint if exists comments_author_role_check;
alter table public.comments add constraint comments_author_role_check
  check (author_role in ('user', 'manager', 'admin'));

create or replace function public.is_manager()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'manager')
$$;
revoke execute on function public.is_manager() from public, anon;
grant execute on function public.is_manager() to authenticated;

-- security definer: tasks and task_assignments policies read each other, which would recurse under RLS.
create or replace function public.manages_task(p_task uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_manager()
    and exists (select 1 from public.tasks t where t.id = p_task and t.created_by = auth.uid())
$$;
revoke execute on function public.manages_task(uuid) from public, anon;
grant execute on function public.manages_task(uuid) to authenticated;

-- Names for the assignment picker and the board; their updates stay hidden (daily_statuses is unchanged).
drop policy if exists "profiles: managers read staff" on public.profiles;
create policy "profiles: managers read staff" on public.profiles for select to authenticated
  using (role = 'user' and (select public.is_manager()));

drop policy if exists "tasks: manager own" on public.tasks;
create policy "tasks: manager own" on public.tasks for all to authenticated
  using ((select public.is_manager()) and created_by = (select auth.uid()))
  with check ((select public.is_manager()) and created_by = (select auth.uid()));

drop policy if exists "assignments: manager own tasks" on public.task_assignments;
create policy "assignments: manager own tasks" on public.task_assignments for all to authenticated
  using (public.manages_task(task_id)) with check (public.manages_task(task_id));

-- A manager edits their own tasks like an admin, but can never hand one to someone else's name.
create or replace function public.guard_task_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if public.is_manager() and old.created_by = auth.uid() then
    if (new.id, new.created_by, new.created_at) is distinct from (old.id, old.created_by, old.created_at) then
      raise exception 'only the task status can change' using errcode = '42501';
    end if;
  elsif not public.is_admin()
    and (new.id, new.title, new.description, new.due_date, new.created_by, new.created_at)
      is distinct from (old.id, old.title, old.description, old.due_date, old.created_by, old.created_at) then
    raise exception 'only the task status can change' using errcode = '42501';
  end if;
  new.updated_at = now();
  return new;
end $$;

-- Admins never get tasks; managers get them from admins only, so a manager can't task a fellow manager.
create or replace function public.task_assignee_is_staff()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_role text := (select role from public.profiles where id = new.user_id);
begin
  if v_role = 'admin' or (v_role = 'manager' and not public.is_admin()) then
    raise exception 'tasks can only be given to staff' using errcode = '23514';
  end if;
  return new;
end $$;

-- Task threads also belong to the manager who created the task.
create or replace function public.can_comment_on(p_status uuid, p_task uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_admin()
    or exists (select 1 from public.daily_statuses s where s.id = p_status and s.user_id = auth.uid())
    or exists (select 1 from public.task_assignments a where a.task_id = p_task and a.user_id = auth.uid())
    or public.manages_task(p_task)
$$;

-- Managers report like staff, so their first save tells the admins too.
create or replace function public.push_status_submitted()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select p.role from public.profiles p where p.id = new.user_id) <> 'admin' then
    perform public.push_event('statusSubmitted', 'status', new.id, public.push_admins(),
      jsonb_build_object('name', public.push_name(new.user_id), 'text', left(new.description_text, 140)));
  end if;
  return null;
end $$;

-- The manager who created a task hears about it; admins hear about their own tasks as before.
create or replace function public.task_owner(p_task uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select t.created_by from public.tasks t join public.profiles p on p.id = t.created_by
    where t.id = p_task and p.role = 'manager'
$$;
revoke execute on function public.task_owner(uuid) from public, anon, authenticated;

create or replace function public.push_task_status()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := public.task_owner(new.id);
begin
  if not public.is_admin() then
    perform public.push_event('taskStatus', 'task', new.id,
      case when v_owner is null then public.push_admins() else array[v_owner] end,
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
    union select c.author_id from public.comments c
      where c.id <> new.id and (c.status_id = new.status_id or c.task_id = new.task_id)
  );
begin
  if v_owner is not null then
    v_to := v_to || v_owner;
  -- Staff writing into a thread no admin has joined are talking to management, so every admin hears it.
  elsif new.author_role <> 'admin'
    and not exists (select 1 from public.profiles p where p.id = any(v_to) and p.role = 'admin') then
    v_to := v_to || public.push_admins();
  end if;
  perform public.push_event('comment', case when new.status_id is null then 'task' else 'status' end,
    coalesce(new.status_id, new.task_id), v_to,
    jsonb_build_object('name', new.author_name, 'text', left(new.body, 140)));
  return null;
end $$;

notify pgrst, 'reload schema';
