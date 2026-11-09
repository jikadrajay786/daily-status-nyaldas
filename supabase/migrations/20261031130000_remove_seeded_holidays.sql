-- Admins enter the company's own holidays, so the gazetted list seeded in 20261025140000 goes. Seeded rows have no
-- created_by, which keeps a re-run from touching anything an admin has entered since.
delete from public.holidays where created_by is null;
