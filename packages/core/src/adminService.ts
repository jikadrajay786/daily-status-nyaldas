import type { DailyStatus, Profile, Role } from './database.types'
import { collect, PAGE, pageOf, type Page, db, searchTerm, today, unwrap } from './supabase'
import { holidayMap } from './holidayService'
import {
  addDays,
  daysBetween,
  dayState,
  isWorkday,
  reportsFrom,
  streakOf,
  type DayState
} from './workdays'

export type TeamStatus = DailyStatus & { profile: Pick<Profile, 'full_name' | 'email'> | null }
export type TeamFilters = Partial<{ date: string; userId: string; search: string }>
export type TeamMetrics = {
  members: Profile[]
  missing: Profile[]
  submitted: number
  hours: number
}

const myId = async (): Promise<string> => (await db().auth.getSession()).data.session?.user.id ?? ''

// Empty filter values mean "any"; RLS limits store and agency managers to their staff plus themselves, and their own
// updates aren't part of the team they look after. Admins don't report, so their rows stay out.
export const getAllTeamStatuses = async (
  { date, userId, search = '' }: TeamFilters = {},
  limit = PAGE,
  offset = 0
): Promise<Page<TeamStatus>> => {
  const q = searchTerm(search)
  const ids = q
    ? unwrap(
        await db().from('profiles').select('id').or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
      ).map((p) => p.id)
    : []
  const me = await myId()
  return pageOf(
    (from, to) => {
      let req = db()
        .from('daily_statuses')
        .select('*, profile:profiles!inner(full_name, email, role)')
        .neq('profile.role', 'admin')
        .neq('user_id', me)
      if (date) req = req.eq('date', date)
      if (userId) req = req.eq('user_id', userId)
      if (q)
        req = req.or(
          [
            `description_text.ilike.%${q}%`,
            ...(ids.length ? [`user_id.in.(${ids.join(',')})`] : [])
          ].join(',')
        )
      return req
        .order('date', { ascending: false })
        .order('updated_at', { ascending: false })
        .order('id')
        .range(from, to)
    },
    limit,
    offset
  )
}

// Admins manage the team rather than belong to it: no counts, no missing list. Managers report like staff.
export const listTeamMembers = async (): Promise<Profile[]> => {
  const me = await myId()
  return (
    await collect((from, to) =>
      db()
        .from('profiles')
        .select()
        .neq('role', 'admin')
        .neq('id', me)
        .order('full_name')
        .order('id')
        .range(from, to)
    )
  ).rows
}

const teamDay = async (
  date: string
): Promise<{ members: Profile[]; rows: Pick<DailyStatus, 'user_id' | 'hours_logged'>[] }> => {
  const [members, rows] = await Promise.all([
    listTeamMembers(),
    collect((from, to) =>
      db()
        .from('daily_statuses')
        .select('user_id, hours_logged')
        .eq('date', date)
        .order('user_id')
        .range(from, to)
    ).then((r) => r.rows)
  ])
  const ids = new Set(members.map((m) => m.id))
  return { members, rows: rows.filter((r) => ids.has(r.user_id)) }
}

const dayOff = async (d: string): Promise<boolean> => !isWorkday(d, await holidayMap(d, d))

// Nobody is missing on a day off.
const missingFrom = (
  off: boolean,
  members: Profile[],
  rows: Pick<DailyStatus, 'user_id'>[]
): Profile[] => {
  if (off) return []
  const done = new Set(rows.map((r) => r.user_id))
  return members.filter((m) => !done.has(m.id))
}

export const getTeamMissingSubmissions = async (targetDate: string): Promise<Profile[]> => {
  const [{ members, rows }, off] = await Promise.all([teamDay(targetDate), dayOff(targetDate)])
  return missingFrom(off, members, rows)
}

export const getTeamSummaryMetrics = async (targetDate: string): Promise<TeamMetrics> => {
  const [{ members, rows }, off] = await Promise.all([teamDay(targetDate), dayOff(targetDate)])
  return {
    members,
    missing: missingFrom(off, members, rows),
    submitted: new Set(rows.map((r) => r.user_id)).size,
    hours: rows.reduce((sum, r) => sum + r.hours_logged, 0)
  }
}

export type DirectoryEntry = Profile & {
  // Days with an update; `updates` counts the updates themselves.
  submissions: number
  updates: number
  lastDate: string | null
  totalHours: number
}

// Two small queries merged here: PostgREST can't embed a view without a foreign key.
// Admins are listed too, or their role could never be changed.
export const getUserDirectoryWithStats = async (): Promise<DirectoryEntry[]> => {
  const [people, stats, me] = await Promise.all([
    collect((from, to) =>
      db().from('profiles').select().order('full_name').order('id').range(from, to)
    ).then((r) => r.rows),
    collect((from, to) =>
      db().from('daily_status_user_stats').select().order('user_id').range(from, to)
    ).then((r) => r.rows),
    myId()
  ])
  const by = new Map(stats.map((s) => [s.user_id, s]))
  // A store or agency manager sees their staff, not themselves.
  return people
    .filter((p) => p.id !== me || p.role === 'admin')
    .map((p) => {
      const s = by.get(p.id)
      return {
        ...p,
        submissions: s?.submissions ?? 0,
        updates: s?.updates ?? 0,
        lastDate: s?.last_date ?? null,
        totalHours: s?.total_hours ?? 0
      }
    })
}

export const setUserRole = async (id: string, role: Role): Promise<void> =>
  unwrap(await db().rpc('set_user_role', { p_user: id, p_role: role }))

export const setUserManager = async (id: string, manager: string | null): Promise<void> =>
  unwrap(await db().rpc('set_user_manager', { p_user: id, p_manager: manager }))

export const getIndividualUserHistory = (
  userId: string,
  startDate?: string,
  endDate?: string,
  search = '',
  limit = PAGE,
  offset = 0
): Promise<Page<DailyStatus>> => {
  const q = searchTerm(search)
  return pageOf(
    (from, to) => {
      let req = db().from('daily_statuses').select('*', { count: 'exact' }).eq('user_id', userId)
      if (startDate) req = req.gte('date', startDate)
      if (endDate) req = req.lte('date', endDate)
      if (q) req = req.ilike('description_text', `%${q}%`)
      return req
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id')
        .range(from, to)
    },
    limit,
    offset
  )
}

export type UserMetrics = {
  hours: number
  // Working days with an update vs working days the person could have submitted on, so it never passes 100%.
  submitted: number
  workdays: number
  missing: string[]
  days: [string, DayState][]
  // Holidays in the range, day → name, for the calendar's marks.
  holidays: Map<string, string>
}

export const getIndividualUserMetrics = async (
  userId: string,
  startDate: string,
  endDate: string
): Promise<UserMetrics> => {
  const [rows, profile, off] = await Promise.all([
    db()
      .from('daily_statuses')
      .select('date, hours_logged')
      .eq('user_id', userId)
      .gte('date', startDate)
      .lte('date', endDate)
      .limit(1000)
      .then(unwrap),
    db()
      .from('profiles')
      .select('created_at, reports_since')
      .eq('id', userId)
      .single()
      .then(unwrap),
    holidayMap(startDate, endDate)
  ])
  const done = new Set(rows.map((r) => r.date))
  const now = today()
  const days = daysBetween(startDate, endDate).map((d): [string, DayState] => [
    d,
    dayState(d, done, reportsFrom(profile), now, off)
  ])
  const counted = days.filter(([d, s]) => isWorkday(d, off) && (s === 'done' || s === 'missed'))
  return {
    hours: rows.reduce((sum, r) => sum + r.hours_logged, 0),
    submitted: counted.filter(([, s]) => s === 'done').length,
    workdays: counted.length,
    missing: days.filter(([, s]) => s === 'missed').map(([d]) => d),
    days,
    holidays: off
  }
}

// Only recent dates are needed: a streak can't reach further back than an unbroken run of them.
export const getUserStreak = async (userId: string): Promise<number> => {
  const now = today()
  const [rows, off] = await Promise.all([
    db()
      .from('daily_statuses')
      .select('date')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(1000)
      .then(unwrap),
    holidayMap(addDays(now, -400), now)
  ])
  return streakOf(new Set(rows.map((r) => r.date)), now, off)
}
