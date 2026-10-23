-- Staff can change or delete their own update only until 2 days after its date (Monday's update stays open through
-- Wednesday). Admins keep the separate "admin update/delete" policies, so they can still correct anything.
-- Inserts are untouched: filling in a missed day is allowed, it just locks once saved if it's already old.

-- India time, the team's timezone: current_date is UTC, which would close the window 5½ hours early.
create or replace function public.status_editable(d date)
returns boolean language sql stable set search_path = '' as $$
  select d >= (now() at time zone 'Asia/Kolkata')::date - 2
$$;
revoke execute on function public.status_editable(date) from public, anon;
grant execute on function public.status_editable(date) to authenticated;

drop policy if exists "statuses: update own" on public.daily_statuses;
create policy "statuses: update own" on public.daily_statuses for update to authenticated
  using (user_id = (select auth.uid()) and public.status_editable(date))
  with check (user_id = (select auth.uid()) and public.status_editable(date));

drop policy if exists "statuses: delete own" on public.daily_statuses;
create policy "statuses: delete own" on public.daily_statuses for delete to authenticated
  using (user_id = (select auth.uid()) and public.status_editable(date));
