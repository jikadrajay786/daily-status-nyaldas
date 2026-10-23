-- Tasks go to staff only; admins hand them out. The app's picker already hides admins, this stops direct API calls.

-- security definer: reads the assignee's role without depending on the caller's view of profiles.
create or replace function public.task_assignee_is_staff()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.profiles where id = new.user_id and role = 'admin') then
    raise exception 'tasks can only be given to staff' using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists task_assignments_staff_only on public.task_assignments;
create trigger task_assignments_staff_only before insert or update of user_id on public.task_assignments
  for each row execute function public.task_assignee_is_staff();
