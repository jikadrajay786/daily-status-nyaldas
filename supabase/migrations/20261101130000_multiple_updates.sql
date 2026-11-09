-- A person can send several updates a day. "Days submitted" counts dates; a new `updates` column counts the updates.
-- Apply this only once the apps that use addStatus are out: older apps save with an upsert that needs the old constraint.
create index if not exists daily_statuses_user_day_idx
  on public.daily_statuses (user_id, date desc, created_at desc, id);

alter table public.daily_statuses drop constraint if exists daily_statuses_user_id_status_date_key;

-- 24 hours a day across a person's updates. The lock makes two saves at once for one person and day take turns.
-- Security definer so an admin's edit and a person's own save count the same rows, whatever RLS would show.
create or replace function public.check_day_hours()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text || new.date::text, 0));
  if (
    select coalesce(sum(s.hours_logged), 0) + new.hours_logged
    from public.daily_statuses s
    where s.user_id = new.user_id and s.date = new.date and s.id <> new.id
  ) > 24 then
    raise exception 'daily hours over 24';
  end if;
  return new;
end;
$$;

revoke all on function public.check_day_hours() from public, anon, authenticated;

drop trigger if exists daily_statuses_day_hours on public.daily_statuses;
create trigger daily_statuses_day_hours
  before insert or update of hours_logged, date, user_id on public.daily_statuses
  for each row execute function public.check_day_hours();

create or replace view public.daily_status_user_stats
with (security_invoker = true) as
select
  user_id,
  (count(distinct date))::integer as submissions,
  max(date) as last_date,
  (coalesce(sum(hours_logged), (0)::numeric))::double precision as total_hours,
  (count(*))::integer as updates
from public.daily_statuses
group by user_id;
