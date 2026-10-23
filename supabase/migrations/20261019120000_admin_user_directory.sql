-- Admin overrides on daily statuses, plus per-person totals for the team directory.

-- Admins may correct or remove anyone's update. Insert stays own-only, so admin edits go through
-- UPDATE by id: an upsert would hit the insert policy's check even when it ends up updating.
drop policy if exists "statuses: admin update" on public.daily_statuses;
create policy "statuses: admin update" on public.daily_statuses for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists "statuses: admin delete" on public.daily_statuses;
create policy "statuses: admin delete" on public.daily_statuses for delete to authenticated
  using ((select public.is_admin()));

-- An edit must never move an update to someone else (the upsert also rewrites user_id, so a
-- column grant can't be used here).
create or replace function public.keep_status_owner()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'daily status owner cannot change' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists daily_statuses_keep_owner on public.daily_statuses;
create trigger daily_statuses_keep_owner before update on public.daily_statuses
  for each row execute function public.keep_status_owner();

-- security_invoker runs the view under the caller's RLS: admins get everyone, others only themselves.
create or replace view public.daily_status_user_stats with (security_invoker = true) as
  select user_id, count(*)::int as submissions, max(date) as last_date,
    coalesce(sum(hours_logged), 0)::float8 as total_hours
  from public.daily_statuses
  group by user_id;

revoke all on public.daily_status_user_stats from anon, public;
grant select on public.daily_status_user_stats to authenticated;

notify pgrst, 'reload schema';
