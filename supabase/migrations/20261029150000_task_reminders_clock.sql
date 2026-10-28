-- Lets remind_pending_tasks() be run as if at another time, so the working-hours rule can be tested at night.
-- Only the hours check uses p_at; "30 minutes since the last reminder" stays on the real clock. Idempotent.

drop function if exists public.remind_pending_tasks();

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
revoke execute on function public.remind_pending_tasks(timestamptz) from public, anon, authenticated;
