-- Push notifications for team activity. Idempotent: safe to re-run.
-- Triggers decide who hears about what; push_event() posts it through pg_net to the notify Edge Function, which writes
-- each phone's message in its language and sends it with Expo. The function's address and shared secret live in Vault
-- (notify_url, notify_secret) rather than here; without them nothing is sent and every write still succeeds.
--
--   update submitted        → admins
--   task status changed     → admins, when staff changed it
--   task assigned           → that person
--   comment                 → the update's author or the task's assignees, everyone who has written in the thread,
--                             and all admins when staff write and no admin is in the thread yet
-- Whoever caused the event is never told about it.

create extension if not exists pg_net with schema extensions;

create or replace function public.push_event(p_event text, p_kind text, p_id uuid, p_to uuid[], p_vars jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_to uuid[] := array(select distinct u from unnest(p_to) u where u is not null and u is distinct from auth.uid());
  v_url text;
  v_secret text;
begin
  if cardinality(v_to) = 0 then return; end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'notify_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'notify_secret';
  if v_url is null or v_secret is null then return; end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', v_secret),
    body := jsonb_build_object('event', p_event, 'kind', p_kind, 'id', p_id, 'to', to_jsonb(v_to), 'vars', p_vars)
  );
-- A notification is never worth losing someone's update, task or comment over.
exception when others then
  raise warning 'push_event % failed: %', p_event, sqlerrm;
end $$;
revoke execute on function public.push_event(text, text, uuid, uuid[], jsonb) from public, anon, authenticated;

create or replace function public.push_name(p_user uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(trim(p.full_name), ''), p.email, '') from public.profiles p where p.id = p_user
$$;
revoke execute on function public.push_name(uuid) from public, anon, authenticated;

create or replace function public.push_admins()
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(p.id), '{}') from public.profiles p where p.role = 'admin'
$$;
revoke execute on function public.push_admins() from public, anon, authenticated;

-- Only a first save is "submitted"; the upsert's later saves arrive as updates and stay quiet.
create or replace function public.push_status_submitted()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select p.role from public.profiles p where p.id = new.user_id) = 'user' then
    perform public.push_event('statusSubmitted', 'status', new.id, public.push_admins(),
      jsonb_build_object('name', public.push_name(new.user_id), 'text', left(new.description_text, 140)));
  end if;
  return null;
end $$;
revoke execute on function public.push_status_submitted() from public, anon, authenticated;

drop trigger if exists daily_statuses_push on public.daily_statuses;
create trigger daily_statuses_push after insert on public.daily_statuses
  for each row execute function public.push_status_submitted();

create or replace function public.push_task_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    perform public.push_event('taskStatus', 'task', new.id, public.push_admins(),
      jsonb_build_object('name', public.push_name(auth.uid()), 'title', new.title, 'status', new.status));
  end if;
  return null;
end $$;
revoke execute on function public.push_task_status() from public, anon, authenticated;

drop trigger if exists tasks_push_status on public.tasks;
create trigger tasks_push_status after update of status on public.tasks
  for each row when (old.status is distinct from new.status) execute function public.push_task_status();

create or replace function public.push_task_assigned()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.push_event('taskAssigned', 'task', new.task_id, array[new.user_id],
    jsonb_build_object('text', (select t.title from public.tasks t where t.id = new.task_id)));
  return null;
end $$;
revoke execute on function public.push_task_assigned() from public, anon, authenticated;

drop trigger if exists task_assignments_push on public.task_assignments;
create trigger task_assignments_push after insert on public.task_assignments
  for each row execute function public.push_task_assigned();

create or replace function public.push_comment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_to uuid[] := array(
    select s.user_id from public.daily_statuses s where s.id = new.status_id
    union select a.user_id from public.task_assignments a where a.task_id = new.task_id
    union select c.author_id from public.comments c
      where c.id <> new.id and (c.status_id = new.status_id or c.task_id = new.task_id)
  );
begin
  -- Staff writing into a thread no admin has joined are talking to management, so every admin hears it.
  if new.author_role = 'user'
    and not exists (select 1 from public.profiles p where p.id = any(v_to) and p.role = 'admin') then
    v_to := v_to || public.push_admins();
  end if;
  perform public.push_event('comment', case when new.status_id is null then 'task' else 'status' end,
    coalesce(new.status_id, new.task_id), v_to,
    jsonb_build_object('name', new.author_name, 'text', left(new.body, 140)));
  return null;
end $$;
revoke execute on function public.push_comment() from public, anon, authenticated;

drop trigger if exists comments_push on public.comments;
create trigger comments_push after insert on public.comments
  for each row execute function public.push_comment();
