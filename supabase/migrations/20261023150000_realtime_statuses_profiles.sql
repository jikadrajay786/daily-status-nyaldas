-- Live updates for daily statuses and profiles (tasks are already published). Realtime applies each subscriber's
-- RLS, so staff hear about their own rows and admins about everyone's.
do $$ declare t text; begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['daily_statuses', 'profiles'] loop
      if not exists (select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
