import type { LeaveSpan } from '../src/leave'

// Shared with test-db/leave.db.ts, so the app's preview and `leave_day_count` are held to the same answers.
// 2026-11-01 and 2026-11-08 are Sundays; the 4th stands in for a holiday.
export const LEAVE_HOLIDAYS = ['2026-11-04']

const c = (
  name: string,
  start: string,
  end: string,
  startHalf: LeaveSpan['startHalf'],
  endHalf: LeaveSpan['endHalf'],
  days: number,
  sandwich = false
): { name: string; span: LeaveSpan; sandwich: boolean; days: number } => ({
  name,
  span: { start, end, startHalf, endHalf },
  sandwich,
  days
})

export const LEAVE_DAY_CASES = [
  c('one full day', '2026-11-02', '2026-11-02', 'full', 'full', 1),
  c('a morning off', '2026-11-02', '2026-11-02', 'first', 'first', 0.5),
  c('an afternoon off', '2026-11-02', '2026-11-02', 'second', 'second', 0.5),
  c('a Sunday alone', '2026-11-01', '2026-11-01', 'full', 'full', 0),
  c('a holiday alone', '2026-11-04', '2026-11-04', 'full', 'full', 0),
  c('half a Sunday', '2026-11-01', '2026-11-01', 'first', 'first', 0),
  c('skips the holiday', '2026-11-03', '2026-11-05', 'full', 'full', 2),
  c('skips Sunday', '2026-11-07', '2026-11-09', 'full', 'full', 2),
  c('half days at both ends', '2026-11-02', '2026-11-03', 'second', 'first', 1),
  c('half at the start only', '2026-11-02', '2026-11-05', 'second', 'full', 2.5),
  c('half on a Sunday edge costs nothing', '2026-11-01', '2026-11-03', 'second', 'full', 2),
  c('half on a holiday edge costs nothing', '2026-11-03', '2026-11-04', 'full', 'first', 1),
  c('sandwich counts days between', '2026-11-07', '2026-11-09', 'full', 'full', 3, true),
  c('sandwich counts a holiday between', '2026-11-03', '2026-11-05', 'full', 'full', 3, true),
  c('sandwich leaves outer days off', '2026-11-01', '2026-11-03', 'full', 'full', 2, true),
  c('sandwich with halves', '2026-11-07', '2026-11-09', 'second', 'first', 2, true),
  c('sandwich with no working day', '2026-11-01', '2026-11-01', 'full', 'full', 0, true),
  c('a whole fortnight', '2026-11-02', '2026-11-15', 'full', 'full', 11)
]
