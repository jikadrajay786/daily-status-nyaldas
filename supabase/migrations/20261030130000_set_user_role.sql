-- Admins change roles from the People page. Idempotent: safe to re-run.
-- profiles.role stays out of the column grant, so this function is the only way in from the API.
create or replace function public.set_user_role(p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
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
  -- Admins never hold tasks, and finished ones are only history.
  if p_role = 'admin' and exists (
    select 1 from public.task_assignments a join public.tasks t on t.id = a.task_id
      where a.user_id = p_user and t.status <> 'completed'
  ) then
    raise exception 'person still has open tasks' using errcode = '23514';
  end if;
  update public.profiles set role = p_role where id = p_user;
  if not found then
    raise exception 'no such person' using errcode = 'P0002';
  end if;
end $$;
revoke execute on function public.set_user_role(uuid, text) from public, anon;
grant execute on function public.set_user_role(uuid, text) to authenticated;

notify pgrst, 'reload schema';
