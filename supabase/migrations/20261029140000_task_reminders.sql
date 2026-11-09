-- Reminds people of tasks they haven't started. Idempotent: safe to re-run.
-- Every 30 minutes after the assignment while the task is still "Not started", during working hours only
-- (9 AM to 9 PM India time, Monday to Saturday, not on holidays). It stops once anyone moves the task on, or the person
-- is taken off it; reminders missed outside working hours aren't made up, the next one simply comes at 9 AM.

alter table public.task_assignments add column if not exists reminded_at timestamptz;

create or replace function public.remind_pending_tasks()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamp := now() at time zone 'Asia/Kolkata';
  r record;
begin
  if extract(isodow from v_now) = 7 or v_now::time < '09:00' or v_now::time >= '21:00'
    or exists (select 1 from public.holidays h where h.day = v_now::date) then
    return;
  end if;
  for r in
    with due as (
      update public.task_assignments a set reminded_at = now()
        from public.tasks t
        -- 29 rather than 30: the job runs every 5 minutes, and a tick a moment early shouldn't push one back to 35.
        where t.id = a.task_id and t.status = 'pending'
          and coalesce(a.reminded_at, a.assigned_at) <= now() - interval '29 minutes'
        returning a.task_id, a.user_id, t.title
    )
    select task_id, title, array_agg(user_id) as users from due group by task_id, title
  loop
    perform public.push_event('taskReminder', 'task', r.task_id, r.users, jsonb_build_object('text', r.title));
  end loop;
end $$;
revoke execute on function public.remind_pending_tasks() from public, anon, authenticated;

create extension if not exists pg_cron;
select cron.schedule('task-reminders', '*/5 * * * *', 'select public.remind_pending_tasks()');
