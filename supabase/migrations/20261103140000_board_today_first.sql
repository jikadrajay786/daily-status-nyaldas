-- The phone's board puts today's work first, then late tasks, then the rest (core TASK_GROUPS). "Today" is still to do
-- today: due from now until the end of the phone's day; anything due earlier is late. Each side still walks
-- tasks_open_due_idx or tasks_done_idx in order, so the first page costs the same however many tasks exist.
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
  ),
  todo as not materialized (
    select o.id, o.due_date
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
  )
  select t.*
  from (
    (
      select o.id, 0 as side, row_number() over (order by o.due_date, o.id) as n
      from todo o
      where o.due_date >= p_now and o.due_date < p_day_start + interval '1 day'
      order by o.due_date, o.id
      limit p_limit + p_offset
    )
    union all
    (
      -- Sorted by due date, late tasks come before later ones once today's are taken out.
      select o.id, 1, row_number() over (order by o.due_date, o.id)
      from todo o
      where o.due_date < p_now or o.due_date >= p_day_start + interval '1 day'
      order by o.due_date, o.id
      limit p_limit + p_offset
    )
    union all
    (
      select d.id, 2, row_number() over (order by d.updated_at desc, d.id)
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
