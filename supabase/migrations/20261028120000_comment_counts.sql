-- Comment counts for the cards on screen, counted in the database. Idempotent: safe to re-run.
-- A POST body carries any number of ids (a GET filter overflows the URL around 400), and one row per card stays
-- under PostgREST's row cap however long the threads get. Security invoker, so RLS still decides what counts.

create or replace function public.comment_counts(p_kind text, p_ids uuid[])
returns table (id uuid, n integer) language sql stable security invoker set search_path = '' as $$
  select c.status_id, count(*)::int from public.comments c
    where p_kind = 'status' and c.status_id = any(p_ids) group by 1
  union all
  select c.task_id, count(*)::int from public.comments c
    where p_kind = 'task' and c.task_id = any(p_ids) group by 1
$$;
revoke execute on function public.comment_counts(text, uuid[]) from public, anon;
grant execute on function public.comment_counts(text, uuid[]) to authenticated;
