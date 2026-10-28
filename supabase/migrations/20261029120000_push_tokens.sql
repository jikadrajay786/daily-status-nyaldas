-- Phones registered for push notifications. Idempotent: safe to re-run.
-- One row per phone, keyed by its Expo token: a shared phone moves to whoever signed in last, so the previous
-- person's notifications never reach it. Clients only go through the two functions; the notify Edge Function
-- reads the table with the service role.

create table if not exists public.push_tokens (
  token text primary key check (token ~ '^Expo(nent)?PushToken\[[^\]]{1,200}\]$'),
  user_id uuid not null references public.profiles (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  lang text not null default 'en' check (lang in ('en', 'hi', 'gu')),
  updated_at timestamptz not null default now()
);
create index if not exists push_tokens_user_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;
revoke all on public.push_tokens from public, anon, authenticated;

create or replace function public.register_push_token(p_token text, p_platform text, p_lang text)
returns void language sql security definer set search_path = '' as $$
  insert into public.push_tokens (token, user_id, platform, lang)
  values (p_token, auth.uid(), p_platform, p_lang)
  on conflict (token) do update
    set user_id = excluded.user_id, platform = excluded.platform, lang = excluded.lang, updated_at = now()
$$;

-- Removes the phone only if it belongs to the caller, so a stale token can't sign someone else out of push.
create or replace function public.unregister_push_token(p_token text)
returns void language sql security definer set search_path = '' as $$
  delete from public.push_tokens where token = p_token and user_id = auth.uid()
$$;

revoke execute on function public.register_push_token(text, text, text) from public, anon;
revoke execute on function public.unregister_push_token(text) from public, anon;
grant execute on function public.register_push_token(text, text, text) to authenticated;
grant execute on function public.unregister_push_token(text) to authenticated;
