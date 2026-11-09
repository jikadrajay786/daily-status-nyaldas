-- One row per person per notification, so the desktop app can alert on the very same events and recipients as phone
-- pushes: push_event() now writes here before posting to the notify function. Each person reads only their own rows,
-- which Realtime delivers live. Rows older than 30 days are cleared nightly. Idempotent: safe to re-run.

create table if not exists public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  event text not null,
  kind text not null check (kind in ('status', 'task')),
  target_id uuid not null,
  vars jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_created_idx on public.notifications (created_at);

alter table public.notifications enable row level security;
drop policy if exists "notifications: read own" on public.notifications;
create policy "notifications: read own" on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.notifications from public, anon, authenticated;
grant select on public.notifications to authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

create or replace function public.push_event(p_event text, p_kind text, p_id uuid, p_to uuid[], p_vars jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_to uuid[] := array(select distinct u from unnest(p_to) u where u is not null and u is distinct from auth.uid());
  v_url text;
  v_secret text;
begin
  if cardinality(v_to) = 0 then return; end if;
  -- Its own block, so a failure here still lets the phones hear about it.
  begin
    insert into public.notifications (user_id, event, kind, target_id, vars)
      select u, p_event, p_kind, p_id, coalesce(p_vars, '{}') from unnest(v_to) u
        where exists (select 1 from public.profiles p where p.id = u);
  exception when others then
    raise warning 'push_event % could not record: %', p_event, sqlerrm;
  end;
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

select cron.schedule('notifications-cleanup', '30 3 * * *',
  $$delete from public.notifications where created_at < now() - interval '30 days'$$);
