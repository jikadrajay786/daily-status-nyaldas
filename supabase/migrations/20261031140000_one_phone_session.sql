-- One phone at a time: the newest phone sign-in ends older phone sessions. Desktop sessions are never listed here, so
-- they stay signed in. Idempotent: safe to re-run.

create table if not exists public.phone_sessions (
  session_id uuid primary key references auth.sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade
);
create index if not exists phone_sessions_user_idx on public.phone_sessions (user_id);

alter table public.phone_sessions enable row level security;
revoke all on public.phone_sessions from public, anon, authenticated;

-- Ending a session also takes its phone out of push, so a replaced phone stops getting that person's notifications.
alter table public.push_tokens
  add column if not exists session_id uuid references auth.sessions (id) on delete cascade;
create index if not exists push_tokens_session_idx on public.push_tokens (session_id);

create or replace function public.register_push_token(p_token text, p_platform text, p_lang text)
returns void language sql security definer set search_path = '' as $$
  insert into public.push_tokens (token, user_id, platform, lang, session_id)
  values (p_token, auth.uid(), p_platform, p_lang, (auth.jwt() ->> 'session_id')::uuid)
  on conflict (token) do update
    set user_id = excluded.user_id, platform = excluded.platform, lang = excluded.lang,
        session_id = excluded.session_id, updated_at = now();
  delete from public.push_tokens where user_id = auth.uid() and token not in (
    select t.token from public.push_tokens t where t.user_id = auth.uid() order by t.updated_at desc limit 10);
$$;

-- Age decides, not who called last: phones call this on every launch, and an older phone must never end a newer one.
create or replace function public.claim_phone_session()
returns void language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (auth.jwt() ->> 'session_id')::uuid;
  born timestamptz;
begin
  select s.created_at into born from auth.sessions s where s.id = me and s.user_id = auth.uid();
  if not found then return; end if;
  insert into public.phone_sessions (session_id, user_id) values (me, auth.uid()) on conflict do nothing;
  delete from auth.sessions s using public.phone_sessions p
    where p.session_id = s.id and p.user_id = auth.uid() and s.id <> me and s.created_at < born;
end $$;

revoke execute on function public.claim_phone_session() from public, anon;
grant execute on function public.claim_phone_session() to authenticated;
