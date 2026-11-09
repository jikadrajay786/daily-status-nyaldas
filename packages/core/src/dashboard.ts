import type { DailyStatus, LeaveHalf, LeaveRequest, Profile } from './database.types'
import { listTeamMembers } from './adminService'
import { holidayMap } from './holidayService'
import { listApprovedLeave } from './leaveService'
import { useLiveQuery } from './live'
import { collect, db, today } from './supabase'
import { countBoardTasks, listBoardPage, type BoardTask } from './taskService'
import type { Query } from './useQuery'
import { addDays, daysBetween, isWorkday, reportsFrom, streakOf } from './workdays'

// One window for the chart, "missed most" and streaks, so a single fetch covers the whole page.
export const WINDOW_DAYS = 30
const SOON_DAYS = 7
const HOLIDAY_AHEAD = 90
const TOP = 3

export type Ranked = { person: Profile; n: number }
export type TrendDay = { day: string; submitted: number; expected: number }
export type Dashboard = {
  day: string
  holiday?: string | undefined
  off: boolean
  // People expected to send one today: joined, and not on full-day leave.
  expected: number
  submitted: number
  hours: number
  missing: Profile[]
  away: { person: Profile; half: LeaveHalf }[]
  soon: (LeaveRequest & { person: Profile })[]
  nextHoliday?: { day: string; name: string } | undefined
  trend: TrendDay[]
  missedMost: Ranked[]
  streaks: Ranked[]
}

type Leave = Pick<LeaveRequest, 'user_id' | 'start_day' | 'end_day' | 'start_half' | 'end_half'>

export const halfOn = (l: Leave, d: string): LeaveHalf =>
  l.start_day === d ? l.start_half : l.end_day === d ? l.end_half : 'full'

const top = (rows: Ranked[]): Ranked[] =>
  rows
    .filter((r) => r.n > 0)
    .sort((a, b) => b.n - a.n || (a.person.full_name ?? '').localeCompare(b.person.full_name ?? ''))
    .slice(0, TOP)

// A person on full-day leave isn't expected that day: not missing, not counted against the rate.
export const buildDashboard = ({
  now,
  members,
  rows,
  off,
  leave
}: {
  now: string
  members: Profile[]
  rows: Pick<DailyStatus, 'user_id' | 'date' | 'hours_logged'>[]
  off: Map<string, string>
  leave: LeaveRequest[]
}): Dashboard => {
  const byId = new Map(members.map((m) => [m.id, m]))
  const done = new Map(members.map((m) => [m.id, new Set<string>()]))
  rows.forEach((r) => done.get(r.user_id)?.add(r.date))
  const mine = leave.filter((l) => byId.has(l.user_id))
  const awayOn = (d: string): Set<string> =>
    new Set(
      mine
        .filter((l) => l.start_day <= d && l.end_day >= d && halfOn(l, d) === 'full')
        .map((l) => l.user_id)
    )
  const expected = (d: string, away = awayOn(d)): Profile[] =>
    members.filter((m) => reportsFrom(m) <= d && !away.has(m.id))
  const days = daysBetween(addDays(now, 1 - WINDOW_DAYS), now).filter((d) => isWorkday(d, off))
  const due = new Map(days.map((d) => [d, new Set(expected(d).map((m) => m.id))]))
  const isOff = !isWorkday(now, off)
  const todayRows = rows.filter((r) => r.date === now && byId.has(r.user_id))
  return {
    day: now,
    holiday: off.get(now),
    off: isOff,
    expected: isOff ? 0 : expected(now).length,
    submitted: new Set(todayRows.map((r) => r.user_id)).size,
    hours: todayRows.reduce((sum, r) => sum + r.hours_logged, 0),
    missing: isOff ? [] : expected(now).filter((m) => !done.get(m.id)?.has(now)),
    away: mine
      .filter((l) => l.start_day <= now && l.end_day >= now)
      .flatMap((l) => {
        const person = byId.get(l.user_id)
        return person ? [{ person, half: halfOn(l, now) }] : []
      }),
    soon: mine
      .filter((l) => l.start_day > now && l.start_day <= addDays(now, SOON_DAYS))
      .flatMap((l) => {
        const person = byId.get(l.user_id)
        return person ? [{ ...l, person }] : []
      }),
    nextHoliday: [...off]
      .filter(([d]) => d > now)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, name]) => ({ day, name }))[0],
    trend: days.map((day) => ({
      day,
      expected: due.get(day)?.size ?? 0,
      submitted: [...(due.get(day) ?? [])].filter((id) => done.get(id)?.has(day)).length
    })),
    // Today is still open, so it can't count as missed yet.
    missedMost: top(
      members.map((person) => ({
        person,
        n: days.filter((d) => d < now && due.get(d)?.has(person.id) && !done.get(person.id)?.has(d))
          .length
      }))
    ),
    streaks: top(
      members.map((person) => ({
        person,
        n: streakOf(done.get(person.id) ?? new Set(), now, off, WINDOW_DAYS)
      }))
    )
  }
}

export const getDashboard = async (): Promise<Dashboard> => {
  const now = today()
  const from = addDays(now, 1 - WINDOW_DAYS)
  const [members, rows, off, leave] = await Promise.all([
    listTeamMembers(),
    collect((a, b) =>
      db()
        .from('daily_statuses')
        .select('user_id, date, hours_logged')
        .gte('date', from)
        .lte('date', now)
        .order('date')
        .order('id')
        .range(a, b)
    ).then((r) => r.rows),
    holidayMap(from, addDays(now, HOLIDAY_AHEAD)),
    listApprovedLeave(from, addDays(now, SOON_DAYS))
  ])
  return buildDashboard({ now, members, rows, off, leave })
}

type Live<T> = [Query<T>, () => void, boolean]
const ANY = { view: 'all', search: '', person: '' } as const

export const useDashboard = (me: string): Live<Dashboard> =>
  useLiveQuery(`dashboard:${me}`, getDashboard)

// Same key as the phone board's counts, so both screens share one fetch.
export const useTaskCounts = (me: string): Live<Awaited<ReturnType<typeof countBoardTasks>>> =>
  useLiveQuery(`board:counts:${me}:${JSON.stringify(['', ''])}`, () => countBoardTasks(ANY))

// Oldest due date first.
export const useOverdueTasks = (me: string): Live<BoardTask[]> =>
  useLiveQuery(`dashboard:overdue:${me}`, () =>
    listBoardPage({ ...ANY, view: 'overdue' }, TOP, 0).then((p) => p.rows)
  )

// Share of expected updates that came in across the days, as a whole percentage.
export const rateOf = (days: TrendDay[]): number => {
  const [done, due] = days.reduce(([d, e], x) => [d + x.submitted, e + x.expected], [0, 0])
  return due ? Math.round((100 * done) / due) : 0
}
