-- "Used this year" came from ledger dates, so leave approved in December and cancelled in January read as -1, and leave
-- approved in December for January counted in the wrong year. Now it's approved leave, by the year it starts. Idempotent.
create or replace view public.leave_balances with (security_invoker = true) as
  select user_id, type_id, sum(balance) as balance, sum(pending) as pending, sum(balance) - sum(pending) as available,
    sum(used) as used
  from (
    select user_id, type_id, days as balance, 0::numeric as pending, 0::numeric as used
    from public.leave_ledger
    union all
    select user_id, type_id, 0, case when status = 'pending' then days else 0 end,
      case when status = 'approved'
        and extract(year from start_day) = extract(year from now() at time zone 'Asia/Kolkata')
        then days else 0 end
    from public.leave_requests where status in ('pending', 'approved')
  ) lines
  group by user_id, type_id;

notify pgrst, 'reload schema';
