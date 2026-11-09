import type { DailyStatus, Profile, Role, StatusInput } from './database.types'
import { fmtStamp } from './format'
import type { T } from './i18n'
import { PAGE, pageOf, type Page, db, searchTerm, today, unwrap } from './supabase'
import { addDays } from './workdays'

export const getProfile = async (id: string): Promise<Profile | null> =>
  unwrap(await db().from('profiles').select().eq('id', id).maybeSingle())

export const getStatus = async (id: string): Promise<DailyStatus | null> =>
  unwrap(await db().from('daily_statuses').select().eq('id', id).maybeSingle())

// Everything a person sent for one day, oldest first.
export const listMyDay = async (userId: string, date: string): Promise<DailyStatus[]> =>
  unwrap(
    await db()
      .from('daily_statuses')
      .select()
      .eq('user_id', userId)
      .eq('date', date)
      .order('created_at')
      .order('id')
  )

// A person's day holds at most this many hours across all their updates; the database enforces it too.
export const DAY_HOURS = 24
export const hoursLeft = (
  rows: readonly Pick<DailyStatus, 'id' | 'hours_logged'>[],
  exceptId?: string
): number =>
  DAY_HOURS - rows.reduce((sum, r) => (r.id === exceptId ? sum : sum + r.hours_logged), 0)

// The user_id filter matters for admins, whose RLS policy would otherwise return the whole team.
export const listMyStatuses = (
  userId: string,
  search = '',
  limit = PAGE,
  offset = 0
): Promise<Page<DailyStatus>> => {
  const q = searchTerm(search)
  return pageOf(
    (from, to) => {
      const req = db().from('daily_statuses').select('*', { count: 'exact' }).eq('user_id', userId)
      return (q ? req.ilike('description_text', `%${q}%`) : req)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id')
        .range(from, to)
    },
    limit,
    offset
  )
}

export const addStatus = async (userId: string, input: StatusInput): Promise<DailyStatus> =>
  unwrap(
    await db()
      .from('daily_statuses')
      .insert({ ...input, user_id: userId })
      .select()
      .single()
  )

// PostgREST reports a write that RLS filtered out as success with zero rows, so treat that as refused.
export const changed = <T>(rows: T[]): T => {
  const [row] = rows
  if (!row) throw new Error('permission denied: no row changed')
  return row
}

export const deleteStatus = async (id: string): Promise<void> => {
  changed(unwrap(await db().from('daily_statuses').delete().eq('id', id).select('id')))
}

// A person can have several updates on one date, so a change always names the update.
export const updateStatus = async (
  id: string,
  patch: Pick<StatusInput, 'description' | 'hours_logged'>
): Promise<DailyStatus> =>
  changed(unwrap(await db().from('daily_statuses').update(patch).eq('id', id).select()))

// Most recent earlier update, not literally yesterday, so Monday picks up Friday's plan.
export const getLastStatusBefore = async (
  userId: string,
  date: string
): Promise<DailyStatus | null> =>
  unwrap(
    await db()
      .from('daily_statuses')
      .select()
      .eq('user_id', userId)
      .lt('date', date)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
  )

// Matches the status_editable() RLS rule: staff may change an update until 2 days after its date; admins always.
export const EDIT_DAYS = 2
export const canChange = (date: string, role: Role, now = today()): boolean =>
  role === 'admin' || date >= addDays(now, -EDIT_DAYS)

// A save inside the first minute is still the original; anything later counts as an edit.
export const wasEdited = ({
  created_at,
  updated_at
}: Pick<DailyStatus, 'created_at' | 'updated_at'>): boolean =>
  Date.parse(updated_at) - Date.parse(created_at) > 60_000

export const fmtStatusTimes = (
  s: Pick<DailyStatus, 'created_at' | 'updated_at'>,
  t: T,
  locale: string
): string =>
  [
    t('submittedOn', { when: fmtStamp(s.created_at, locale) }),
    ...(wasEdited(s) ? [t('editedAt', { when: fmtStamp(s.updated_at, locale) })] : [])
  ].join(' · ')
