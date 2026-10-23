-- Collapse status/summary/blockers into a single rich-text description (sanitized HTML from the TipTap editor).
-- Idempotent: every step checks the current shape, so re-running after success is a no-op.

create or replace function pg_temp.esc(t text) returns text language sql immutable as $$
  select replace(replace(replace(t, '&', '&amp;'), '<', '&lt;'), '>', '&gt;')
$$;

do $$
declare
  has_col constant text := 'select exists (select 1 from information_schema.columns where table_schema = ''public'' and table_name = ''daily_statuses'' and column_name = $1)';
  found boolean;
begin
  execute has_col into found using 'description';
  if not found then
    alter table public.daily_statuses add column description text;
    -- Legacy rows are plain text, so escape before wrapping; blockers become the editor's "Blockers / Issues" preset.
    execute $q$
      update public.daily_statuses set description = '<p>' || pg_temp.esc(summary) || '</p>' || coalesce(
        '<p><strong>• Blockers / Issues:</strong></p><ul><li><p>' || pg_temp.esc(blockers) || '</p></li></ul>', '')
    $q$;
    alter table public.daily_statuses drop column summary, drop column blockers, drop column status;
  end if;

  execute has_col into found using 'status_date';
  if found then alter table public.daily_statuses rename column status_date to date; end if;
  execute has_col into found using 'hours';
  if found then alter table public.daily_statuses rename column hours to hours_logged; end if;
end $$;

alter table public.daily_statuses
  alter column description set not null,
  -- The client always sends the user's local date; this default only covers direct inserts.
  alter column date set default current_date,
  alter column hours_logged set default 8;

alter table public.daily_statuses drop constraint if exists daily_statuses_description_check;
alter table public.daily_statuses add constraint daily_statuses_description_check
  check (length(trim(description)) > 0 and length(description) <= 20000);

-- Plain-text shadow of the HTML so keyword search doesn't match tag names or entities. &amp; must decode last.
alter table public.daily_statuses add column if not exists description_text text generated always as (
  replace(replace(replace(replace(regexp_replace(description, '<[^>]+>', ' ', 'g'),
    '&nbsp;', ' '), '&lt;', '<'), '&gt;', '>'), '&amp;', '&')
) stored;
