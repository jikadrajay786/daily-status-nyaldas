-- Profiles are created once an email is verified, not at sign-up, so abandoned sign-ups never appear as
-- team members. Admin-created and auto-confirmed accounts are already confirmed on insert.

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row when (new.email_confirmed_at is not null)
  execute function public.handle_new_user();

drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed after update of email_confirmed_at on auth.users
  for each row when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.handle_new_user();

-- Unverified accounts can't sign in, so nothing references these rows; they come back from the account's
-- metadata (handle_new_user) when the email is verified.
delete from public.profiles p using auth.users u
where u.id = p.id and u.email_confirmed_at is null;
