-- Fixes from the October 2026 security audit. Idempotent: safe to re-run.

-- "On time" and "Edited" are read from these timestamps, and the table grant lets staff write them directly through
-- the API. The server's clock decides instead. A day's grace on the date covers people ahead of India time.
create or replace function public.stamp_status()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (tg_op = 'INSERT' or new.date is distinct from old.date)
    and new.date > (now() at time zone 'Asia/Kolkata')::date + 1 then
    raise exception 'an update cannot be dated in the future' using errcode = '23514';
  end if;
  new.created_at := case when tg_op = 'INSERT' then now() else old.created_at end;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.stamp_status() from public, anon, authenticated;

drop trigger if exists daily_statuses_stamp on public.daily_statuses;
create trigger daily_statuses_stamp before insert or update on public.daily_statuses
  for each row execute function public.stamp_status();

-- RLS can't hide single columns, so managers lose direct access to profiles (which holds emails) and get names only.
drop policy if exists "profiles: managers read staff" on public.profiles;

create or replace function public.staff_names()
returns table (id uuid, full_name text) language sql stable security definer set search_path = '' as $$
  select p.id, coalesce(nullif(trim(p.full_name), ''), split_part(p.email, '@', 1))
    from public.profiles p where p.role = 'user' and public.is_manager() order by 2
$$;
revoke execute on function public.staff_names() from public, anon;
grant execute on function public.staff_names() to authenticated;

-- Names travel in comments and notifications, so a blank name shows the part before the @ rather than a full address.
create or replace function public.stamp_comment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select p.id, coalesce(nullif(trim(p.full_name), ''), split_part(p.email, '@', 1), ''), p.role
    into new.author_id, new.author_name, new.author_role
    from public.profiles p where p.id = auth.uid();
  if new.author_id is null then
    raise exception 'no profile for caller' using errcode = '42501';
  end if;
  new.created_at := now();
  return new;
end $$;

create or replace function public.push_name(p_user uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(trim(p.full_name), ''), split_part(p.email, '@', 1), '') from public.profiles p where p.id = p_user
$$;

alter table public.profiles drop constraint if exists profiles_full_name_length;
alter table public.profiles add constraint profiles_full_name_length check (length(full_name) <= 100);

-- Sign-up metadata is user-written, and a long name must not stop the account being confirmed.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- role is never taken from metadata: users control raw_user_meta_data at signup.
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, left(new.raw_user_meta_data ->> 'full_name', 100))
  on conflict (id) do nothing;
  return new;
end $$;

-- Someone taken off a task keeps their old comments but can't read the thread, so only admins are told as past writers;
-- the update's author, current assignees and the task's manager are already covered by their own rules.
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
  perform public.push_event('comment', case when new.status_id is null then 'task' else 'status' end,
    coalesce(new.status_id, new.task_id), v_to,
    jsonb_build_object('name', new.author_name, 'text', left(new.body, 140)));
  return null;
end $$;

-- Ten phones is more than anyone has; this stops one account filling the table with made-up tokens.
create or replace function public.register_push_token(p_token text, p_platform text, p_lang text)
returns void language sql security definer set search_path = '' as $$
  insert into public.push_tokens (token, user_id, platform, lang)
  values (p_token, auth.uid(), p_platform, p_lang)
  on conflict (token) do update
    set user_id = excluded.user_id, platform = excluded.platform, lang = excluded.lang, updated_at = now();
  delete from public.push_tokens where user_id = auth.uid() and token not in (
    select t.token from public.push_tokens t where t.user_id = auth.uid() order by t.updated_at desc limit 10);
$$;

-- Supabase's default privileges granted more than the app uses. RLS already blocks most of this; these close the rest.
-- Triggers still fire after the revokes: Postgres checks EXECUTE when a trigger is created, not when it runs.
revoke truncate, references, trigger on public.profiles, public.daily_statuses, public.tasks, public.task_assignments,
  public.comments, public.holidays from authenticated;
revoke update on public.comments from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.daily_status_user_stats from authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.task_assignee_is_staff() from public, anon, authenticated;

notify pgrst, 'reload schema';
