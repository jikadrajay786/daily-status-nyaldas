-- Lists stay fast as the tables grow: indexes for finished and unfinished tasks, and a board list the server filters
-- and pages, so a phone never has to download every unfinished task.
create index if not exists tasks_open_due_idx
  on public.tasks (due_date, id) where status <> 'completed';
create index if not exists tasks_done_idx
  on public.tasks (updated_at desc, id) where status = 'completed';
create index if not exists tasks_created_by_idx on public.tasks (created_by);

-- On top of RLS, a manager's board holds their own tasks, and a lead's their own plus their staff's. The caller's role
-- is read once: looked up per row, the counts took 12 seconds on 500,000 tasks.
-- Unfinished first, soonest due first; then finished, newest first. Each side walks its own index, so the first page
-- costs the same however many tasks exist. Days come from the phone, as its screens count them in local time.
create or replace function public.board_tasks(
  p_view text,
  p_search text,
  p_person uuid,
  p_now timestamptz,
  p_day_start timestamptz,
  p_limit int,
  p_offset int
)
returns setof public.tasks
language sql
stable
set search_path = public
as $$
  with me as materialized (
    select (select auth.uid()) as id, (select role from profiles where id = (select auth.uid())) as role
  )
  select t.*
  from (
    (
      select o.id, 0 as side, row_number() over (order by o.due_date, o.id) as n
      from tasks o, me
      where o.status <> 'completed'
        and p_view <> 'completed'
        and (p_view in ('all', 'overdue', 'today', 'week') or o.status::text = p_view)
        and (p_view <> 'overdue' or o.due_date < p_now)
        and (p_view <> 'today' or (o.due_date >= p_day_start and o.due_date < p_day_start + interval '1 day'))
        and (p_view <> 'week' or (o.due_date >= p_day_start and o.due_date < p_day_start + interval '7 days'))
        and (p_search = '' or o.title ilike '%' || p_search || '%')
        and (p_person is null or exists (select 1 from task_assignments a where a.task_id = o.id and a.user_id = p_person))
        and (me.role not in ('manager', 'store_manager', 'agency_manager') or o.created_by = me.id or (
          me.role <> 'manager' and exists (select 1 from task_assignments a where a.task_id = o.id and a.user_id <> me.id)
        ))
      order by o.due_date, o.id
      limit p_limit + p_offset
    )
    union all
    (
      select d.id, 1, row_number() over (order by d.updated_at desc, d.id)
      from tasks d, me
      where d.status = 'completed'
        and p_view in ('all', 'completed')
        and (p_search = '' or d.title ilike '%' || p_search || '%')
        and (p_person is null or exists (select 1 from task_assignments a where a.task_id = d.id and a.user_id = p_person))
        and (me.role not in ('manager', 'store_manager', 'agency_manager') or d.created_by = me.id or (
          me.role <> 'manager' and exists (select 1 from task_assignments a where a.task_id = d.id and a.user_id <> me.id)
        ))
      order by d.updated_at desc, d.id
      limit p_limit + p_offset
    )
  ) r
  join tasks t on t.id = r.id
  order by r.side, r.n
  limit p_limit offset p_offset
$$;

create or replace function public.board_task_counts(
  p_search text,
  p_person uuid,
  p_now timestamptz,
  p_day_start timestamptz
)
returns table (
  pending bigint,
  in_progress bigint,
  completed bigint,
  blocked bigint,
  overdue bigint,
  today bigint,
  week bigint
)
language sql
stable
set search_path = public
as $$
  with me as materialized (
    select (select auth.uid()) as id, (select role from profiles where id = (select auth.uid())) as role
  )
  select
    count(*) filter (where t.status = 'pending'),
    count(*) filter (where t.status = 'in_progress'),
    count(*) filter (where t.status = 'completed'),
    count(*) filter (where t.status = 'blocked'),
    count(*) filter (where t.status <> 'completed' and t.due_date < p_now),
    count(*) filter (where t.status <> 'completed' and t.due_date >= p_day_start and t.due_date < p_day_start + interval '1 day'),
    count(*) filter (where t.status <> 'completed' and t.due_date >= p_day_start and t.due_date < p_day_start + interval '7 days')
  from tasks t, me
  where (p_search = '' or t.title ilike '%' || p_search || '%')
    and (p_person is null or exists (select 1 from task_assignments a where a.task_id = t.id and a.user_id = p_person))
    and (me.role not in ('manager', 'store_manager', 'agency_manager') or t.created_by = me.id or (
      me.role <> 'manager' and exists (select 1 from task_assignments a where a.task_id = t.id and a.user_id <> me.id)
    ))
$$;

revoke all on function public.board_tasks(text, text, uuid, timestamptz, timestamptz, int, int) from public, anon;
revoke all on function public.board_task_counts(text, uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.board_tasks(text, text, uuid, timestamptz, timestamptz, int, int) to authenticated;
grant execute on function public.board_task_counts(text, uuid, timestamptz, timestamptz) to authenticated;
