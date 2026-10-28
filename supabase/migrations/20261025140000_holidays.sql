-- Office holidays, managed by admins. A holiday counts like Sunday: an update is optional and never "missed".
-- One row per day; two occasions on one day share a name. Idempotent: safe to re-run.

create table if not exists public.holidays (
  day date primary key,
  name text not null check (length(trim(name)) between 1 and 100),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists holidays_created_by_idx on public.holidays (created_by);

alter table public.holidays enable row level security;

do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'holidays' loop
    execute format('drop policy %I on public.holidays', p.policyname);
  end loop;
end $$;

create policy "holidays: everyone reads" on public.holidays for select to authenticated using (true);
create policy "holidays: admin writes" on public.holidays for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

revoke all on public.holidays from anon;
grant select, insert, update, delete on public.holidays to authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'holidays') then
    alter publication supabase_realtime add table public.holidays;
  end if;
end $$;

-- Gazetted holidays for Central Government offices (DoPT O.M. F.No. 12/2/2023-JCA, 2026 and 2027 lists).
-- Moon-dependent Id dates are provisional; admins can move them. A re-run brings back seeded days an admin
-- deleted (renamed or added ones are kept).
insert into public.holidays (day, name, created_by) values
  ('2026-01-26', 'Republic Day', null),
  ('2026-03-04', 'Holi', null),
  ('2026-03-21', 'Id-ul-Fitr', null),
  ('2026-03-26', 'Ram Navami', null),
  ('2026-03-31', 'Mahavir Jayanti', null),
  ('2026-04-03', 'Good Friday', null),
  ('2026-05-01', 'Buddha Purnima', null),
  ('2026-05-27', 'Id-ul-Zuha (Bakrid)', null),
  ('2026-06-26', 'Muharram', null),
  ('2026-08-15', 'Independence Day', null),
  ('2026-08-26', 'Milad-un-Nabi', null),
  ('2026-09-04', 'Janmashtami', null),
  ('2026-10-02', 'Gandhi Jayanti', null),
  ('2026-10-20', 'Dussehra', null),
  ('2026-11-08', 'Diwali', null),
  ('2026-11-24', 'Guru Nanak Jayanti', null),
  ('2026-12-25', 'Christmas', null),
  ('2027-01-26', 'Republic Day', null),
  ('2027-03-10', 'Id-ul-Fitr', null),
  ('2027-03-23', 'Holi', null),
  ('2027-03-26', 'Good Friday', null),
  ('2027-04-15', 'Ram Navami', null),
  ('2027-04-19', 'Mahavir Jayanti', null),
  ('2027-05-17', 'Id-ul-Zuha (Bakrid)', null),
  ('2027-05-20', 'Buddha Purnima', null),
  ('2027-06-16', 'Muharram', null),
  ('2027-08-15', 'Independence Day / Milad-un-Nabi', null),
  ('2027-08-25', 'Janmashtami', null),
  ('2027-10-02', 'Gandhi Jayanti', null),
  ('2027-10-09', 'Dussehra', null),
  ('2027-10-29', 'Diwali', null),
  ('2027-11-14', 'Guru Nanak Jayanti', null),
  ('2027-12-25', 'Christmas', null)
on conflict (day) do nothing;
