import { describe, expect, it } from 'vitest'
import {
  leaveRoom,
  canCancelLeave,
  fixLeaveHalves,
  fmtLeaveDays,
  fmtLeaveSpan,
  fmtLeaveTimes,
  leaveBalance,
  leaveNotSetUp,
  leaveStat,
  earliestLeaveDay,
  leaveDays,
  leaveOverlaps,
  leaveTypeName,
  type LeaveSpan
} from '../src/leave'
import { applyLeaveSchema } from '../src/leaveService'
import { translator } from '../src/i18n'
import { errMsg } from '../src/useQuery'
import { LEAVE_DAY_CASES, LEAVE_HOLIDAYS } from './leaveCases'

const span = (start: string, end = start, startHalf = 'full', endHalf = startHalf): LeaveSpan =>
  ({ start, end, startHalf, endHalf }) as LeaveSpan

describe('leaveDays', () => {
  it.each(LEAVE_DAY_CASES)('$name', ({ span: s, sandwich, days }) =>
    expect(leaveDays(s, new Set(LEAVE_HOLIDAYS), sandwich)).toBe(days)
  )
})

describe('leaveOverlaps', () => {
  it('lets two different halves share a day', () => {
    expect(
      leaveOverlaps(
        span('2026-11-02', '2026-11-02', 'first'),
        span('2026-11-02', '2026-11-02', 'second')
      )
    ).toBe(false)
    expect(
      leaveOverlaps(
        span('2026-11-02', '2026-11-02', 'second'),
        span('2026-11-02', '2026-11-02', 'first')
      )
    ).toBe(false)
  })
  it('catches the same half, a full day and ranges that cross', () => {
    expect(
      leaveOverlaps(
        span('2026-11-02', '2026-11-02', 'first'),
        span('2026-11-02', '2026-11-02', 'first')
      )
    ).toBe(true)
    expect(leaveOverlaps(span('2026-11-02'), span('2026-11-02', '2026-11-02', 'second'))).toBe(true)
    expect(leaveOverlaps(span('2026-11-02', '2026-11-05'), span('2026-11-05', '2026-11-06'))).toBe(
      true
    )
  })
  it('allows a range ending at lunch and one starting after it', () => {
    expect(
      leaveOverlaps(
        span('2026-11-02', '2026-11-04', 'full', 'first'),
        span('2026-11-04', '2026-11-06', 'second', 'full')
      )
    ).toBe(false)
  })
  it('leaves separate days alone', () => {
    expect(leaveOverlaps(span('2026-11-02'), span('2026-11-03'))).toBe(false)
  })
})

describe('leaveRoom', () => {
  const type = { id: 'casual', needs_balance: true, allow_negative: false }
  const rows = [
    { user_id: 'asha', type_id: 'casual', balance: 3, pending: 2, available: 1, used: 0 },
    { user_id: 'ravi', type_id: 'casual', balance: 9, pending: 0, available: 9, used: 0 }
  ]
  it('counts what the person has, ignoring other waiting requests', () =>
    expect(leaveRoom({ user_id: 'asha' }, type, rows)).toBe(3))
  it('is zero for someone with no leave entered yet', () =>
    expect(leaveRoom({ user_id: 'neel' }, type, rows)).toBe(0))
  it('has no limit for unpaid or overdraft types', () => {
    expect(leaveRoom({ user_id: 'asha' }, { ...type, needs_balance: false }, rows)).toBeNull()
    expect(leaveRoom({ user_id: 'asha' }, { ...type, allow_negative: true }, rows)).toBeNull()
    expect(leaveRoom({ user_id: 'asha' }, undefined, rows)).toBeNull()
  })
})

describe('canCancelLeave', () => {
  const today = '2026-11-10'
  it('lets anyone take back a pending request, even a past one', () =>
    expect(canCancelLeave({ status: 'pending', start_day: '2026-11-01' }, today)).toBe(true))
  it('stops staff on the day approved leave starts, but not admins', () => {
    expect(canCancelLeave({ status: 'approved', start_day: '2026-11-11' }, today)).toBe(true)
    expect(canCancelLeave({ status: 'approved', start_day: today }, today)).toBe(false)
    expect(canCancelLeave({ status: 'approved', start_day: today }, today, true)).toBe(true)
  })
  it('never reopens a closed request', () => {
    for (const status of ['rejected', 'withdrawn', 'cancelled'] as const)
      expect(canCancelLeave({ status, start_day: '2026-12-01' }, today, true)).toBe(false)
  })
})

it('allows requests up to a week back', () =>
  expect(earliestLeaveDay('2026-11-10')).toBe('2026-11-03'))

it('falls back to English when a type has no translation', () => {
  const t = { name: 'Sick leave', name_hi: 'सिक लीव', name_gu: null }
  expect(leaveTypeName(t, 'hi')).toBe('सिक लीव')
  expect(leaveTypeName(t, 'gu')).toBe('Sick leave')
})

describe('friendly errors', () => {
  it.each([
    ['leave balance too low', 'errLeaveBalance'],
    [
      'conflicting key value violates exclusion constraint "leave_requests_no_overlap"',
      'errLeaveOverlap'
    ],
    ['leave has no working days', 'errLeaveNoWorkdays'],
    ['leave date too far back', 'errLeaveTooOld'],
    ['leave dates invalid', 'errLeaveDates'],
    ['leave half day not allowed', 'errLeaveHalfDay'],
    ['leave type not available', 'errLeaveType'],
    ['leave request already closed', 'errLeaveClosed'],
    ['leave already started', 'errLeaveStarted'],
    ['leave adjustment invalid', 'errLeaveAdjust']
  ])('%s', (message, key) => expect(errMsg({ message })).toBe(key))

  it('turns a bad form field into its own message', () => {
    const res = applyLeaveSchema.safeParse({
      typeId: '00000000-0000-4000-8000-000000000000',
      start: '2026-11-05',
      end: '2026-11-02',
      startHalf: 'full',
      endHalf: 'full',
      reason: 'Family function'
    })
    expect(res.error?.issues[0]?.path[0]).toBe('end')
    expect(errMsg({ code: 'leave_end' })).toBe('errLeaveDates')
    expect(errMsg({ code: 'leave_reason' })).toBe('errLeaveReason')
  })
})

describe('fixLeaveHalves', () => {
  it('gives one day a single choice', () =>
    expect(fixLeaveHalves(span('2026-11-02', '2026-11-02', 'first', 'full')).endHalf).toBe('first'))
  it('drops halves that make no sense over several days', () => {
    const s = fixLeaveHalves(span('2026-11-02', '2026-11-04', 'first', 'second'))
    expect([s.startHalf, s.endHalf]).toEqual(['full', 'full'])
  })
  it('keeps an afternoon start and a morning end', () => {
    const s = fixLeaveHalves(span('2026-11-02', '2026-11-04', 'second', 'first'))
    expect([s.startHalf, s.endHalf]).toEqual(['second', 'first'])
  })
})

it('treats a type with no ledger lines as zero', () =>
  expect(leaveBalance([], 'x')).toEqual({ available: 0, pending: 0, used: 0 }))

describe('fmtLeaveDays and fmtLeaveSpan', () => {
  const t = translator('en')
  it('says days in plain words', () => {
    expect(fmtLeaveDays(1, t)).toBe('1 day')
    expect(fmtLeaveDays(0.5, t)).toBe('0.5 days')
    expect(fmtLeaveDays(2.25, t)).toBe('2.25 days')
  })
  it('names the half of a single day', () =>
    expect(
      fmtLeaveSpan(
        { start_day: '2026-11-02', end_day: '2026-11-02', start_half: 'first' },
        t,
        'en-IN'
      )
    ).toContain('Morning only'))
})

describe('fmtLeaveTimes', () => {
  const t = translator('en')
  const created_at = '2026-10-30T04:00:00Z'
  const decided_at = '2026-10-31T05:30:00Z'
  it('shows only the request while it is waiting', () => {
    const text = fmtLeaveTimes({ status: 'pending', created_at, decided_at: null }, t, 'en-IN')
    expect(text).toMatch(/^Requested 30 Oct 2026, 9:30\s?am$/i)
  })
  it('adds the decision and its time once there is one', () =>
    expect(fmtLeaveTimes({ status: 'approved', created_at, decided_at }, t, 'en-IN')).toMatch(
      /· Approved 31 Oct 2026, 11:00\s?am$/i
    ))
  it('leaves out a decision with no recorded time', () =>
    expect(
      fmtLeaveTimes({ status: 'rejected', created_at, decided_at: null }, t, 'en-IN')
    ).not.toContain('·'))
})

describe('leaveNotSetUp', () => {
  const types = [
    { id: 'casual', accrual: 'yearly', needs_balance: true },
    { id: 'earned', accrual: 'monthly', needs_balance: true },
    { id: 'unpaid', accrual: 'none', needs_balance: false }
  ] as const
  it('still asks for opening balances once monthly credits arrive', () =>
    expect(leaveNotSetUp(types, [{ type_id: 'earned' }])).toBe(true))
  it('is happy once the yearly types have a line, even a used-up one', () =>
    expect(leaveNotSetUp(types, [{ type_id: 'casual' }])).toBe(false))
})

describe('leaveStat', () => {
  const t = translator('en')
  const b = { available: 3, used: 2, pending: 1 }
  it('shows what is left when a type has a balance', () =>
    expect(leaveStat({ needs_balance: true }, b, t).value).toBe('3 days'))
  it('shows what has been taken for unpaid leave', () =>
    expect(leaveStat({ needs_balance: false }, b, t)).toEqual({
      value: '2 days',
      sub: 'taken this year, 1 waiting'
    }))
})
