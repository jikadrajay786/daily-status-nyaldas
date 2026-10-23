import type { DailyStatus, Profile } from './database.types'
import { db, searchTerm, today, unwrap } from './supabase'
import { daysBetween, dayState, isWorkday, localDay, streakOf, type DayState } from './workdays'

export type TeamStatus = DailyStatus & { profile: Pick<Profile, 'full_name' | 'email'> | null }
export type TeamFilters = Partial<{ date: string; userId: string; search: string }>
export type TeamMetrics = {
  members: Profile[]
  missing: Profile[]
  submitted: number
  hours: number
}

// Empty filter values mean "any"; RLS already limits non-admins to their own rows.
export const getAllTeamStatuses = async ({ date, userId, search = '' }: TeamFilters = {}): Promise<
  TeamStatus[]
> => {
  const q = searchTerm(search)
  const ids = q
    ? unwrap(
        await db().from('profiles').select('id').or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
      ).map((p) => p.id)
    : []
  let req = db().from('daily_statuses').select('*, profile:profiles(full_name, email)')
  if (date) req = req.eq('date', date)
  if (userId) req = req.eq('user_id', userId)
  if (q)
    req = req.or(
      [
        `description_text.ilike.%${q}%`,
        ...(ids.length ? [`user_id.in.(${ids.join(',')})`] : [])
      ].join(',')
    )
  return unwrap(
    await req
      .order('date', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(500)
  )
}

const teamDay = async (
  date: string
): Promise<{ members: Profile[]; rows: Pick<DailyStatus, 'user_id' | 'hours_logged'>[] }> => {
  const [members, rows] = await Promise.all([
    db().from('profiles').select().order('full_name').then(unwrap),
    db().from('daily_statuses').select('user_id, hours_logged').eq('date', date).then(unwrap)
  ])
  return { members, rows }
}

const missingFrom = (members: Profile[], rows: Pick<DailyStatus, 'user_id'>[]): Profile[] => {
  const done = new Set(rows.map((r) => r.user_id))
  return members.filter((m) => !done.has(m.id))
}

export const getTeamMissingSubmissions = async (targetDate: string): Promise<Profile[]> => {
  const { members, rows } = await teamDay(targetDate)
  return missingFrom(members, rows)
}

export const getTeamSummaryMetrics = async (targetDate: string): Promise<TeamMetrics> => {
  const { members, rows } = await teamDay(targetDate)
  return {
    members,
    missing: missingFrom(members, rows),
    submitted: rows.length,
    hours: rows.reduce((sum, r) => sum + r.hours_logged, 0)
  }
}

export type DirectoryEntry = Profile & {
  submissions: number
  lastDate: string | null
  totalHours: number
}

// Two small queries merged here: PostgREST can't embed a view without a foreign key.
export const getUserDirectoryWithStats = async (): Promise<DirectoryEntry[]> => {
  const [people, stats] = await Promise.all([
    db().from('profiles').select().order('full_name').then(unwrap),
    db().from('daily_status_user_stats').select().then(unwrap)
  ])
  const by = new Map(stats.map((s) => [s.user_id, s]))
  return people.map((p) => {
    const s = by.get(p.id)
    return {
      ...p,
      submissions: s?.submissions ?? 0,
      lastDate: s?.last_date ?? null,
      totalHours: s?.total_hours ?? 0
    }
  })
}

export const getIndividualUserHistory = async (
  userId: string,
  startDate?: string,
  endDate?: string,
  search = ''
): Promise<DailyStatus[]> => {
  const q = searchTerm(search)
  let req = db().from('daily_statuses').select().eq('user_id', userId)
  if (startDate) req = req.gte('date', startDate)
  if (endDate) req = req.lte('date', endDate)
  if (q) req = req.ilike('description_text', `%${q}%`)
  return unwrap(await req.order('date', { ascending: false }).limit(500))
}

export type UserMetrics = {
  hours: number
  // Working days with an update vs working days the person could have submitted on, so it never passes 100%.
  submitted: number
  workdays: number
  missing: string[]
  days: [string, DayState][]
}

export const getIndividualUserMetrics = async (
  userId: string,
  startDate: string,
  endDate: string
): Promise<UserMetrics> => {
  const [rows, profile] = await Promise.all([
    db()
      .from('daily_statuses')
      .select('date, hours_logged')
      .eq('user_id', userId)
      .gte('date', startDate)
      .lte('date', endDate)
      .limit(1000)
      .then(unwrap),
    db().from('profiles').select('created_at').eq('id', userId).single().then(unwrap)
  ])
  const done = new Set(rows.map((r) => r.date))
  const now = today()
  const days = daysBetween(startDate, endDate).map((d): [string, DayState] => [
    d,
    dayState(d, done, localDay(profile.created_at), now)
  ])
  const counted = days.filter(([d, s]) => isWorkday(d) && (s === 'done' || s === 'missed'))
  return {
    hours: rows.reduce((sum, r) => sum + r.hours_logged, 0),
    submitted: counted.filter(([, s]) => s === 'done').length,
    workdays: counted.length,
    missing: days.filter(([, s]) => s === 'missed').map(([d]) => d),
    days
  }
}

// Only recent dates are needed: a streak can't reach further back than an unbroken run of them.
export const getUserStreak = async (userId: string): Promise<number> => {
  const rows = unwrap(
    await db()
      .from('daily_statuses')
      .select('date')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(400)
  )
  return streakOf(new Set(rows.map((r) => r.date)), today())
}
