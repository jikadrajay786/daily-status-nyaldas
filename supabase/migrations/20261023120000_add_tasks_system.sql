-- Admin-assigned tasks. Idempotent: safe to re-run.

do $$ begin
  create type public.task_status as enum ('pending', 'in_progress', 'completed', 'blocked');
exception when duplicate_object then null;
end $$;

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 200),
  description text check (length(description) <= 2000),
  due_date timestamptz not null,
  status public.task_status not null default 'pending',
  created_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tasks_due_date_idx on public.tasks (due_date);

create table if not exists public.task_assignments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  assigned_at timestamptz not null default now(),
  unique (task_id, user_id)
);
create index if not exists task_assignments_user_id_idx on public.task_assignments (user_id);

-- Assignees share the task row with admins, so a column grant can't limit them to status; this trigger does.
create or replace function public.guard_task_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not public.is_admin()
    and (new.id, new.title, new.description, new.due_date, new.created_by, new.created_at)
      is distinct from (old.id, old.title, old.description, old.due_date, old.created_by, old.created_at) then
    raise exception 'only the task status can change' using errcode = '42501';
  end if;
  new.updated_at = now();
  return new;
end $$;
drop trigger if exists tasks_guard_update on public.tasks;
create trigger tasks_guard_update before update on public.tasks
  for each row execute function public.guard_task_update();

alter table public.tasks enable row level security;
alter table public.task_assignments enable row level security;

do $$ declare p record; begin
  for p in select policyname, tablename from pg_policies
    where schemaname = 'public' and tablename in ('tasks', 'task_assignments') loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

create policy "tasks: admin all" on public.tasks for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "tasks: read assigned" on public.tasks for select to authenticated
  using (exists (select 1 from public.task_assignments a
    where a.task_id = tasks.id and a.user_id = (select auth.uid())));
create policy "tasks: update assigned" on public.tasks for update to authenticated
  using (exists (select 1 from public.task_assignments a
    where a.task_id = tasks.id and a.user_id = (select auth.uid())))
  with check (exists (select 1 from public.task_assignments a
    where a.task_id = tasks.id and a.user_id = (select auth.uid())));

create policy "assignments: admin all" on public.task_assignments for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "assignments: read own" on public.task_assignments for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.tasks, public.task_assignments from anon;
grant select, insert, update, delete on public.tasks, public.task_assignments to authenticated;

-- security invoker: RLS still decides, so only admins get past the first insert. One call keeps the task and its
-- assignments in a single transaction.
create or replace function public.create_task(
  p_title text, p_description text, p_due_date timestamptz, p_user_ids uuid[]
) returns public.tasks language plpgsql set search_path = '' as $$
declare t public.tasks;
begin
  if coalesce(cardinality(p_user_ids), 0) = 0 then
    raise exception 'a task needs at least one assignee' using errcode = '22023';
  end if;
  insert into public.tasks (title, description, due_date)
  values (trim(p_title), nullif(trim(p_description), ''), p_due_date)
  returning * into t;
  insert into public.task_assignments (task_id, user_id)
  select t.id, u from unnest(p_user_ids) as u on conflict do nothing;
  return t;
end $$;
revoke execute on function public.create_task(text, text, timestamptz, uuid[]) from public, anon;
grant execute on function public.create_task(text, text, timestamptz, uuid[]) to authenticated;

-- Realtime honours RLS, so each subscriber only hears about tasks they can read.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tasks') then
      alter publication supabase_realtime add table public.tasks;
    end if;
    if not exists (select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'task_assignments') then
      alter publication supabase_realtime add table public.task_assignments;
    end if;
  end if;
end $$;

notify pgrst, 'reload schema';
