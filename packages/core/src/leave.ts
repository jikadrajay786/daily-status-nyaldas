import type {
  LeaveBalance,
  LeaveHalf,
  LeaveRequest,
  LeaveStatus,
  LeaveType
} from './database.types'
import { fmtDate, fmtShort, fmtStamp, type Tone } from './format'
import type { Key, Lang, T } from './i18n'
import { addDays, daysBetween, isWorkday, type DaysOff } from './workdays'

// How far back someone may ask for leave they've already taken. `apply_leave` holds the same number.
export const LEAVE_BACKDATE_DAYS = 7

export const LEAVE_STATUS_KEY: Record<LeaveStatus, Key> = {
  pending: 'lsPending',
  approved: 'lsApproved',
  rejected: 'lsRejected',
  withdrawn: 'lsWithdrawn',
  cancelled: 'lsCancelled'
}

export const LEAVE_STATUS_TONE: Record<LeaveStatus, Tone> = {
  pending: 'warn',
  approved: 'ok',
  rejected: 'bad',
  withdrawn: 'idle',
  cancelled: 'idle'
}

export type LeaveSpan = {
  start: string
  end: string
  startHalf: LeaveHalf
  endHalf: LeaveHalf
}

// Mirrors `leave_day_count`; the server's count is the one that's saved, this is the form's preview.
export const leaveDays = (
  { start, end, startHalf, endHalf }: LeaveSpan,
  off?: DaysOff,
  sandwich = false
): number => {
  const work = daysBetween(start, end).filter((d) => isWorkday(d, off))
  if (!work.length) return 0
  if (start === end) return startHalf === 'full' ? 1 : 0.5
  const whole = sandwich ? daysBetween(work[0]!, work[work.length - 1]!).length : work.length
  const halved = (d: string, half: LeaveHalf): number =>
    half !== 'full' && work.includes(d) ? 0.5 : 0
  return whole - halved(start, startHalf) - halved(end, endHalf)
}

// A morning off and an afternoon off on one day don't collide; the table's exclusion constraint works the same way.
export const leaveOverlaps = (a: LeaveSpan, b: LeaveSpan): boolean => {
  const from = (s: LeaveSpan): string => `${s.start}${s.startHalf === 'second' ? 'b' : 'a'}`
  const to = (s: LeaveSpan): string => `${s.end}${s.endHalf === 'first' ? 'a' : 'b'}`
  return from(a) <= to(b) && from(b) <= to(a)
}

export const earliestLeaveDay = (today: string): string => addDays(today, -LEAVE_BACKDATE_DAYS)

// Mirrors `cancel_leave`: admins can also cancel leave that has already started.
export const canCancelLeave = (
  r: Pick<LeaveRequest, 'status' | 'start_day'>,
  today: string,
  admin = false
): boolean => r.status === 'pending' || (r.status === 'approved' && (admin || r.start_day > today))

export const leaveTypeName = (
  t: Pick<LeaveType, 'name' | 'name_hi' | 'name_gu'>,
  lang: Lang
): string => (lang === 'hi' ? t.name_hi : lang === 'gu' ? t.name_gu : null) ?? t.name

export const LEAVE_HALF_KEY: Record<LeaveHalf, Key> = {
  full: 'leaveFullDay',
  first: 'leaveMorning',
  second: 'leaveAfternoon'
}

// One day takes one choice; a longer stretch can only start in the afternoon or end in the morning.
export const fixLeaveHalves = (s: LeaveSpan): LeaveSpan =>
  s.start === s.end
    ? { ...s, endHalf: s.startHalf }
    : {
        ...s,
        startHalf: s.startHalf === 'first' ? 'full' : s.startHalf,
        endHalf: s.endHalf === 'second' ? 'full' : s.endHalf
      }

// Days this request's person has to spend, or null when the type has no limit. Mirrors the check in `decide_leave`:
// it counts what's been credited and taken, not other waiting requests.
export const leaveRoom = (
  r: Pick<LeaveRequest, 'user_id'>,
  type: Pick<LeaveType, 'id' | 'needs_balance' | 'allow_negative'> | undefined,
  rows: readonly LeaveBalance[]
): number | null =>
  !type || !type.needs_balance || type.allow_negative
    ? null
    : +(rows.find((b) => b.user_id === r.user_id && b.type_id === type.id)?.balance ?? 0)

// The view has no row until a person's first ledger line.
export const leaveBalance = (
  rows: readonly LeaveBalance[],
  typeId: string
): Pick<LeaveBalance, 'available' | 'pending' | 'used'> =>
  rows.find((b) => b.type_id === typeId) ?? { available: 0, pending: 0, used: 0 }

// Yearly types get a line the moment someone joins, so a missing one means an admin hasn't entered opening balances.
// Monthly types don't count: a new joiner has none until the next 1st.
export const leaveNotSetUp = (
  types: readonly Pick<LeaveType, 'id' | 'accrual' | 'needs_balance'>[],
  rows: readonly Pick<LeaveBalance, 'type_id'>[]
): boolean =>
  types.some(
    (x) => x.needs_balance && x.accrual === 'yearly' && !rows.some((b) => b.type_id === x.id)
  )

// Types with a balance show what's left; unpaid leave has no limit, so it shows what's been taken.
export const leaveStat = (
  x: Pick<LeaveType, 'needs_balance'>,
  { available, pending, used }: Pick<LeaveBalance, 'available' | 'pending' | 'used'>,
  t: T
): { value: string; sub: string } =>
  x.needs_balance
    ? {
        value: fmtLeaveDays(+available, t),
        sub: t('leaveUsage', { used: +used, pending: +pending })
      }
    : { value: fmtLeaveDays(+used, t), sub: t('leaveTaken', { pending: +pending }) }

export const fmtLeaveDays = (n: number, t: T): string =>
  n === 1 ? t('leaveOneDay') : t('leaveManyDays', { n: +n.toFixed(2) })

export const fmtLeaveSpan = (
  r: Pick<LeaveRequest, 'start_day' | 'end_day' | 'start_half'>,
  t: T,
  locale: string
): string =>
  r.start_day !== r.end_day
    ? `${fmtShort(r.start_day, locale)} – ${fmtShort(r.end_day, locale)}`
    : r.start_half === 'full'
      ? fmtDate(r.start_day, locale)
      : `${fmtDate(r.start_day, locale)} · ${t(LEAVE_HALF_KEY[r.start_half])}`

export const fmtLeaveTimes = (
  r: Pick<LeaveRequest, 'status' | 'created_at' | 'decided_at'>,
  t: T,
  locale: string
): string =>
  [
    t('leaveRequestedAt', { when: fmtStamp(r.created_at, locale) }),
    ...(r.status !== 'pending' && r.decided_at
      ? [
          t('leaveDecidedAt', {
            status: t(LEAVE_STATUS_KEY[r.status]),
            when: fmtStamp(r.decided_at, locale)
          })
        ]
      : [])
  ].join(' · ')
