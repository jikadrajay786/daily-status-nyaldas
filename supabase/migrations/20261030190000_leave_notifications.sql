-- Tell people about leave the same way as tasks and updates: a phone push and a desktop alert through push_event().
-- A new request goes to the admins and the person's store or agency manager; a decision goes to the person.
-- Needs 20261030180000 (bosses_of) first. Idempotent: safe to re-run.

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in ('status', 'task', 'leave'));

-- Plain day/month: the message is written here once, for readers in any language.
create or replace function public.leave_dates(p_start date, p_end date)
returns text language sql immutable set search_path = '' as $$
  select case when p_start = p_end then to_char(p_start, 'DD/MM')
    else to_char(p_start, 'DD/MM') || ' - ' || to_char(p_end, 'DD/MM') end
$$;
revoke execute on function public.leave_dates(date, date) from public, anon, authenticated;

create or replace function public.push_leave_requested()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.push_event('leaveRequested', 'leave', new.id,
    public.push_admins() || public.bosses_of(array[new.user_id]),
    jsonb_build_object('name', public.push_name(new.user_id),
      'text', public.leave_dates(new.start_day, new.end_day) || ': ' || left(new.reason, 140)));
  return null;
end $$;
revoke execute on function public.push_leave_requested() from public, anon, authenticated;

drop trigger if exists leave_requests_push_new on public.leave_requests;
create trigger leave_requests_push_new after insert on public.leave_requests
  for each row execute function public.push_leave_requested();

create or replace function public.push_leave_decided()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_dates text := public.leave_dates(new.start_day, new.end_day);
  v_text text := v_dates || coalesce(': ' || left(new.decision_note, 140), '');
  v_own boolean := new.user_id = auth.uid();
begin
  if new.status is not distinct from old.status then return null; end if;
  if new.status = 'approved' then
    perform public.push_event('leaveApproved', 'leave', new.id, array[new.user_id], jsonb_build_object('text', v_text));
  elsif new.status = 'rejected' then
    perform public.push_event('leaveRejected', 'leave', new.id, array[new.user_id], jsonb_build_object('text', v_text));
  elsif not v_own and new.status in ('cancelled', 'withdrawn') then
    perform public.push_event('leaveCancelled', 'leave', new.id, array[new.user_id], jsonb_build_object('text', v_text));
  -- Someone was counting on this approved leave. A request nobody had decided just leaves the list.
  elsif v_own and new.status = 'cancelled' then
    perform public.push_event('leaveTakenBack', 'leave', new.id,
      public.push_admins() || public.bosses_of(array[new.user_id]),
      jsonb_build_object('name', public.push_name(new.user_id), 'text', v_dates));
  end if;
  return null;
end $$;
revoke execute on function public.push_leave_decided() from public, anon, authenticated;

drop trigger if exists leave_requests_push_decided on public.leave_requests;
create trigger leave_requests_push_decided after update of status on public.leave_requests
  for each row execute function public.push_leave_decided();
