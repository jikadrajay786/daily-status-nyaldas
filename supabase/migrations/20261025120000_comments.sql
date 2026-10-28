-- Comments on daily updates and tasks. Idempotent: safe to re-run.
-- Staff can't read other people's profiles, so the author's name and role are copied onto the comment when it's
-- written; a later rename doesn't reach old comments, which is fine for a conversation log.

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  status_id uuid references public.daily_statuses (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  author_name text not null default '',
  author_role text not null default 'user' check (author_role in ('user', 'admin')),
  body text not null check (length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  constraint comments_one_target check (num_nonnulls(status_id, task_id) = 1)
);
create index if not exists comments_status_idx on public.comments (status_id, created_at)
  where status_id is not null;
create index if not exists comments_task_idx on public.comments (task_id, created_at)
  where task_id is not null;
create index if not exists comments_author_idx on public.comments (author_id);

-- The author is always the caller, whatever the client sends; name and role come from their profile.
create or replace function public.stamp_comment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select p.id, coalesce(nullif(trim(p.full_name), ''), p.email, ''), p.role
    into new.author_id, new.author_name, new.author_role
    from public.profiles p where p.id = auth.uid();
  if new.author_id is null then
    raise exception 'no profile for caller' using errcode = '42501';
  end if;
  new.created_at := now();
  return new;
end $$;
revoke execute on function public.stamp_comment() from public, anon, authenticated;

drop trigger if exists comments_stamp on public.comments;
create trigger comments_stamp before insert on public.comments
  for each row execute function public.stamp_comment();

-- Who may read or join a thread: admins, the update's author, and the people a task is given to.
create or replace function public.can_comment_on(p_status uuid, p_task uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_admin()
    or exists (select 1 from public.daily_statuses s where s.id = p_status and s.user_id = auth.uid())
    or exists (select 1 from public.task_assignments a where a.task_id = p_task and a.user_id = auth.uid())
$$;
revoke execute on function public.can_comment_on(uuid, uuid) from public, anon;
grant execute on function public.can_comment_on(uuid, uuid) to authenticated;

alter table public.comments enable row level security;

do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'comments' loop
    execute format('drop policy %I on public.comments', p.policyname);
  end loop;
end $$;

create policy "comments: read thread" on public.comments for select to authenticated
  using (public.can_comment_on(status_id, task_id));
create policy "comments: write to thread" on public.comments for insert to authenticated
  with check (public.can_comment_on(status_id, task_id));
-- No updates: a comment is deleted and written again. Admins may remove any comment.
create policy "comments: delete own or admin" on public.comments for delete to authenticated
  using (author_id = (select auth.uid()) or (select public.is_admin()));

revoke all on public.comments from anon;
grant select, insert, delete on public.comments to authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'comments') then
    alter publication supabase_realtime add table public.comments;
  end if;
end $$;
