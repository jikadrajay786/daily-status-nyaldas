-- Phones whose build can reply from a comment notification say so when they register. The notify function sends
-- those phones comment pushes as data only, which the app draws with a Reply box; every other phone keeps getting a
-- plain push, so older builds don't lose comment notifications.
alter table public.push_tokens add column if not exists replies boolean not null default false;

drop function if exists public.register_push_token(text, text, text);
create or replace function public.register_push_token(
  p_token text, p_platform text, p_lang text, p_replies boolean default false
)
returns void language sql security definer set search_path = '' as $$
  insert into public.push_tokens (token, user_id, platform, lang, session_id, replies)
  values (p_token, auth.uid(), p_platform, p_lang, (auth.jwt() ->> 'session_id')::uuid, p_replies)
  on conflict (token) do update
    set user_id = excluded.user_id, platform = excluded.platform, lang = excluded.lang,
        session_id = excluded.session_id, replies = excluded.replies, updated_at = now();
  delete from public.push_tokens where user_id = auth.uid() and token not in (
    select t.token from public.push_tokens t where t.user_id = auth.uid() order by t.updated_at desc limit 10);
$$;
revoke execute on function public.register_push_token(text, text, text, boolean) from public, anon;
grant execute on function public.register_push_token(text, text, text, boolean) to authenticated;

notify pgrst, 'reload schema';
