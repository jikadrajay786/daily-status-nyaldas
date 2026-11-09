-- A profile made any other way (by hand in SQL, say) also settles that person's request, so the admins' list never
-- shows someone who is already in. Idempotent: safe to re-run.

create or replace function public.settle_signup()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.signup_requests set status = 'approved', decided_at = coalesce(decided_at, now())
    where user_id = new.id and status <> 'approved';
  return null;
end $$;
revoke execute on function public.settle_signup() from public, anon, authenticated;

drop trigger if exists profiles_settle_signup on public.profiles;
create trigger profiles_settle_signup after insert on public.profiles
  for each row execute function public.settle_signup();

update public.signup_requests r set status = 'approved', decided_at = coalesce(r.decided_at, now())
  from public.profiles p where p.id = r.user_id and r.status <> 'approved';
