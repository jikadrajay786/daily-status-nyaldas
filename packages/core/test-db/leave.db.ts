import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database, LeaveRequest, LeaveType } from '../src/database.types'
import {
  adjustLeaveBalance,
  applyLeave,
  cancelLeave,
  decideLeave,
  listApprovedLeave,
  listLeaveBalances,
  listLeaveLedger,
  listLeaveRequests,
  listLeaveTypes,
  listPendingLeave,
  type ApplyLeaveInput
} from '../src/leaveService'
import { initSupabase } from '../src/supabase'
import { errMsg } from '../src/useQuery'
import { addDays, ymd } from '../src/workdays'
import { LEAVE_DAY_CASES, LEAVE_HOLIDAYS } from '../test/leaveCases'

// Local stack only (`supabase start`): it creates and deletes real accounts.
const {
  SUPABASE_URL: url = '',
  SUPABASE_ANON_KEY: anon = '',
  SUPABASE_SERVICE_ROLE_KEY: service = ''
} = process.env
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url) || !anon || !service)
  throw new Error(
    'test:db needs SUPABASE_URL (local), SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY'
  )

const root = createClient<Database>(url, service, { auth: { persistSession: false } })
const run = Date.now().toString(36)
const password = `pw-${run}-${Math.random().toString(36).slice(2)}`
const people = { admin: '', boss: '', asha: '', ravi: '', meena: '' }
type Who = keyof typeof people

const memory = (): Parameters<typeof initSupabase>[2] => {
  const m = new Map<string, string>()
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k)
  }
}

const as = async (who: Who): Promise<SupabaseClient<Database>> => {
  const c = initSupabase(url, anon, memory())
  const { error } = await c.auth.signInWithPassword({ email: `${who}-${run}@e2e.test`, password })
  if (error) throw error
  return c
}

const rejectsWith = async (p: Promise<unknown>, key: string): Promise<void> => {
  const err = await p.then(
    () => null,
    (e: unknown) => e
  )
  expect(err, `expected ${key}`).not.toBeNull()
  expect(errMsg(err)).toBe(key)
}

// Far enough ahead that no seeded holiday lands on it. 7 Jan 2030 is a Monday.
const MON = '2030-01-07'
const later = (weeks: number, plus = 0): string => addDays(MON, weeks * 7 + plus)
const LIMITED = ['casual', 'sick', 'earned']
let T: Record<string, LeaveType>
let onlyUnpaid: string[]
const type = (code: string): string => T[code]!.id
const ask = (o: Partial<ApplyLeaveInput> & { typeId: string; start: string }): ApplyLeaveInput => ({
  end: o.start,
  startHalf: 'full',
  endHalf: 'full',
  reason: 'Family function',
  ...o
})
const available = async (who: Who, code: string): Promise<number> => {
  const { data } = await root
    .from('leave_balances')
    .select('available')
    .eq('user_id', people[who])
    .eq('type_id', type(code))
    .maybeSingle()
  return Number(data?.available ?? 0)
}
const give = async (who: Who, code: string, days: number): Promise<void> => {
  await as('admin')
  await adjustLeaveBalance({ userId: people[who], typeId: type(code), days, note: 'opening' })
}

beforeAll(async () => {
  const { data: types } = await root.from('leave_types').select('code').eq('active', true)
  onlyUnpaid = (types ?? []).map((x) => x.code)
  // The balance rules stay in place for when a company uses them, so most of this suite turns the types back on.
  await root.from('leave_types').update({ active: true }).in('code', LIMITED)
  for (const who of Object.keys(people) as Who[]) {
    const { data, error } = await root.auth.admin.createUser({
      email: `${who}-${run}@e2e.test`,
      password,
      email_confirm: true,
      user_metadata: { full_name: `${who} E2E` }
    })
    if (error) throw error
    people[who] = data.user.id
  }
  for (const [id, role] of [
    [people.admin, 'admin'],
    [people.boss, 'manager']
  ] as const) {
    const { error } = await root
      .from('profiles')
      .update({ role } as never)
      .eq('id', id)
    if (error) throw error
  }
  await as('asha')
  T = Object.fromEntries((await listLeaveTypes()).map((x) => [x.code, x]))
  const { error } = await root
    .from('holidays')
    .upsert(LEAVE_HOLIDAYS.map((day) => ({ day, name: 'Leave test' })))
  if (error) throw error
})

afterAll(async () => {
  await root.from('leave_types').update({ active: false }).in('code', LIMITED)
  await root.from('holidays').delete().in('day', LEAVE_HOLIDAYS).eq('name', 'Leave test')
  await Promise.all(
    Object.values(people)
      .filter(Boolean)
      .map((id) => root.auth.admin.deleteUser(id))
  )
})

describe('leave_day_count', () => {
  it.each(LEAVE_DAY_CASES)('$name', async ({ span, sandwich, days }) => {
    const { data, error } = await root.rpc('leave_day_count', {
      p_start: span.start,
      p_end: span.end,
      p_start_half: span.startHalf,
      p_end_half: span.endHalf,
      p_sandwich: sandwich
    })
    expect(error).toBeNull()
    expect(Number(data)).toBe(days)
  })
})

describe('credits', () => {
  it('gives a joiner the yearly types for the months left', async () => {
    const month = Number(ymd(new Date()).slice(5, 7))
    expect(await available('asha', 'casual')).toBe(13 - month)
  })

  it('does not credit twice when the job runs twice', async () => {
    const before = await available('ravi', 'earned')
    for (let i = 0; i < 2; i++)
      expect(
        (await root.rpc('credit_leave' as never, { p_on: '2031-03-01' } as never)).error
      ).toBeNull()
    expect(await available('ravi', 'earned')).toBe(before + 1.25)
  })

  it('lapses over the cap once at year end and keeps the new credit', async () => {
    await give('meena', 'earned', 40)
    for (let i = 0; i < 2; i++)
      await root.rpc('credit_leave' as never, { p_on: '2032-01-01' } as never)
    expect(await available('meena', 'earned')).toBe(31.25)
    expect(await available('meena', 'sick')).toBe(6)
    expect(await available('meena', 'unpaid')).toBe(0)
  })
})

describe('a staff member', () => {
  let req: LeaveRequest

  it('asks for leave, and the days are held back while it waits', async () => {
    await give('asha', 'casual', 5)
    const before = await available('asha', 'casual')
    await as('asha')
    req = await applyLeave(ask({ typeId: type('casual'), start: later(0), end: later(0, 2) }))
    expect([req.status, Number(req.days), req.user_id]).toEqual(['pending', 3, people.asha])
    expect(await available('asha', 'casual')).toBe(before - 3)
  })

  it('is refused overlapping days, but can take the other half of a half day', async () => {
    await as('asha')
    await rejectsWith(
      applyLeave(ask({ typeId: type('unpaid'), start: later(0, 1) })),
      'errLeaveOverlap'
    )
    const half = { typeId: type('unpaid'), start: later(1) }
    await applyLeave(ask({ ...half, startHalf: 'first', endHalf: 'first' }))
    await rejectsWith(
      applyLeave(ask({ ...half, startHalf: 'first', endHalf: 'first' })),
      'errLeaveOverlap'
    )
    await applyLeave(ask({ ...half, startHalf: 'second', endHalf: 'second' }))
  })

  it.each([
    ['all Sunday', { start: '2030-01-06' }, 'errLeaveNoWorkdays'],
    ['too long', { start: later(5), end: addDays(later(5), 366) }, 'errLeaveDates'],
    ['a blank reason', { start: later(6), reason: '   ' }, 'errLeaveReason'],
    ['a very long reason', { start: later(6), reason: 'x'.repeat(501) }, 'errLeaveReason'],
    ['a backwards range', { start: later(6), end: later(5) }, 'errLeaveDates'],
    ['a made-up date', { start: '2030-02-30' }, 'errLeaveDates'],
    [
      'morning start over days',
      { start: later(6), end: later(7), startHalf: 'first' },
      'errLeaveDates'
    ],
    ['eight days back', { start: addDays(ymd(new Date()), -8) }, 'errLeaveTooOld']
  ] as const)('is refused %s', async (_, patch, key) => {
    await as('asha')
    await rejectsWith(applyLeave(ask({ typeId: type('unpaid'), ...patch })), key)
  })

  it('is refused more than the balance, including what is already waiting', async () => {
    await as('asha')
    await rejectsWith(
      applyLeave(ask({ typeId: type('earned'), start: later(8), end: later(8, 2) })),
      'errLeaveBalance'
    )
    const left = await available('asha', 'casual')
    await rejectsWith(
      applyLeave(
        ask({ typeId: type('casual'), start: later(9), end: addDays(later(9), left * 2) })
      ),
      'errLeaveBalance'
    )
  })

  it('keeps any text as plain text', async () => {
    await as('asha')
    const reason = `<script>alert(1)</script> '; drop table leave_ledger; -- શ્રી क्ष 🎉`
    const r = await applyLeave(ask({ typeId: type('unpaid'), start: later(10), reason }))
    expect(r.reason).toBe(reason)
    expect((await listLeaveRequests(people.asha)).some((x) => x.id === r.id)).toBe(true)
  })

  it('takes back a pending request, and the days return', async () => {
    const before = await available('asha', 'casual')
    await as('asha')
    expect((await cancelLeave({ id: req.id })).status).toBe('withdrawn')
    expect(await available('asha', 'casual')).toBe(before + 3)
    await rejectsWith(cancelLeave({ id: req.id }), 'errLeaveClosed')
  })

  it('cancels approved future leave and gets the days back, once', async () => {
    await as('asha')
    const r = await applyLeave(ask({ typeId: type('casual'), start: later(11) }))
    const before = await available('asha', 'casual')
    await as('admin')
    expect((await decideLeave({ id: r.id, approve: true, note: ' ok ' })).decision_note).toBe('ok')
    expect(await available('asha', 'casual')).toBe(before)
    await as('asha')
    expect((await cancelLeave({ id: r.id })).status).toBe('cancelled')
    expect(await available('asha', 'casual')).toBe(before + 1)
    const lines = (await listLeaveLedger(people.asha)).filter((l) => l.request_id === r.id)
    expect(lines.map((l) => [l.kind, Number(l.days)]).sort()).toEqual([
      ['debit', -1],
      ['reversal', 1]
    ])
  })

  it('cannot cancel approved leave once it has started, but an admin can', async () => {
    await as('asha')
    const day = ymd(new Date())
    const r = await applyLeave(ask({ typeId: type('unpaid'), start: addDays(day, -7), end: day }))
    await as('admin')
    await decideLeave({ id: r.id, approve: true })
    await as('asha')
    await rejectsWith(cancelLeave({ id: r.id }), 'errLeaveStarted')
    await as('admin')
    expect((await cancelLeave({ id: r.id })).status).toBe('cancelled')
  })

  it('needs enough balance when the admin approves, not only when asking', async () => {
    await give('ravi', 'earned', 2)
    await as('ravi')
    const r = await applyLeave(ask({ typeId: type('earned'), start: later(12) }))
    const left = await available('ravi', 'earned')
    await give('ravi', 'earned', -(left + 1))
    await as('admin')
    await rejectsWith(decideLeave({ id: r.id, approve: true }), 'errLeaveBalance')
    expect((await decideLeave({ id: r.id, approve: false })).status).toBe('rejected')
  })
})

describe('who can do what', () => {
  let ashas: LeaveRequest

  beforeAll(async () => {
    await as('asha')
    ashas = await applyLeave(ask({ typeId: type('unpaid'), start: later(14) }))
  })

  it('an admin cannot ask for leave', async () => {
    await as('admin')
    await rejectsWith(applyLeave(ask({ typeId: type('unpaid'), start: later(14) })), 'errDenied')
  })

  it('a manager asks for their own leave but cannot see or touch staff leave', async () => {
    await as('boss')
    const mine = await applyLeave(ask({ typeId: type('unpaid'), start: later(14) }))
    expect(mine.user_id).toBe(people.boss)
    expect(await listPendingLeave()).toEqual(
      [mine].map((x) => expect.objectContaining({ id: x.id }))
    )
    expect(await listApprovedLeave(later(0), later(99))).toEqual([])
    expect(await listLeaveBalances(people.asha)).toEqual([])
    await rejectsWith(decideLeave({ id: ashas.id, approve: true }), 'errDenied')
    await rejectsWith(decideLeave({ id: mine.id, approve: true }), 'errDenied')
    await rejectsWith(cancelLeave({ id: ashas.id }), 'errDenied')
    await rejectsWith(
      adjustLeaveBalance({ userId: people.boss, typeId: type('casual'), days: 9, note: 'x' }),
      'errDenied'
    )
  })

  it('staff cannot see, decide or cancel each other, or approve themselves', async () => {
    await as('ravi')
    expect(await listLeaveRequests(people.asha)).toEqual([])
    expect(await listLeaveLedger(people.asha)).toEqual([])
    expect(await listLeaveBalances(people.asha)).toEqual([])
    await rejectsWith(cancelLeave({ id: ashas.id }), 'errDenied')
    await as('asha')
    await rejectsWith(decideLeave({ id: ashas.id, approve: true }), 'errDenied')
  })

  it('direct writes are refused and change nothing', async () => {
    const c = await as('asha')
    const before = await available('asha', 'casual')
    const writes = [
      c.from('leave_ledger').insert({
        user_id: people.asha,
        type_id: type('casual'),
        days: 99,
        kind: 'adjust'
      } as never),
      c
        .from('leave_requests')
        .update({ status: 'approved' } as never)
        .eq('id', ashas.id),
      c.from('leave_requests').delete().eq('id', ashas.id),
      c.from('leave_requests').insert({
        user_id: people.ravi,
        type_id: type('casual'),
        start_day: later(20),
        end_day: later(20),
        days: 1,
        reason: 'x'
      } as never),
      c.from('leave_types').update({ yearly_quota: 99 }).eq('id', type('casual')).select(),
      c.from('leave_types').delete().eq('id', type('sick')).select()
    ]
    for (const res of await Promise.all(writes))
      expect(res.error !== null || !(res.data as unknown[] | null)?.length).toBe(true)
    const rpcs = ['credit_leave', 'credit_new_joiner', 'leave_day_count'] as never[]
    for (const fn of rpcs) expect((await c.rpc(fn, {} as never)).error).not.toBeNull()
    expect(await available('asha', 'casual')).toBe(before)
    const { data } = await root.from('leave_requests').select('status').eq('id', ashas.id).single()
    expect(data?.status).toBe('pending')
    expect(Number(T.casual!.yearly_quota)).toBe(12)
  })

  it('signed out, nothing is readable or callable', async () => {
    const c = createClient<Database>(url, anon, { auth: { persistSession: false } })
    for (const table of [
      'leave_requests',
      'leave_ledger',
      'leave_types',
      'leave_balances'
    ] as const)
      expect((await c.from(table).select()).error).not.toBeNull()
    expect((await c.rpc('cancel_leave', { p_id: ashas.id })).error).not.toBeNull()
    expect((await c.rpc('decide_leave', { p_id: ashas.id, p_approve: true })).error).not.toBeNull()
  })

  it('a bad id gets a friendly refusal', async () => {
    await as('admin')
    await rejectsWith(decideLeave({ id: 'nope', approve: true }), 'errGeneric')
    await rejectsWith(
      decideLeave({ id: '00000000-0000-4000-8000-000000000000', approve: true }),
      'errLeaveClosed'
    )
  })
})

describe('at the same moment', () => {
  it('fifty requests for one day leave one row', async () => {
    const c = await as('meena')
    const res = await Promise.all(
      Array.from({ length: 50 }, () =>
        c.rpc('apply_leave', {
          p_type: type('unpaid'),
          p_start: later(30),
          p_end: later(30),
          p_start_half: 'full',
          p_end_half: 'full',
          p_reason: 'race'
        })
      )
    )
    expect(res.filter((r) => !r.error)).toHaveLength(1)
    const { count } = await root
      .from('leave_requests')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', people.meena)
      .eq('start_day', later(30))
    expect(count).toBe(1)
  })

  it('fifty requests on different days cannot overspend', async () => {
    const left = await available('meena', 'sick')
    const c = await as('meena')
    const res = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        c.rpc('apply_leave', {
          p_type: type('sick'),
          p_start: later(40 + i),
          p_end: later(40 + i),
          p_start_half: 'full',
          p_end_half: 'full',
          p_reason: 'race'
        })
      )
    )
    expect(res.filter((r) => !r.error)).toHaveLength(left)
    expect(await available('meena', 'sick')).toBe(0)
  })

  it('fifty approvals of one request debit once', async () => {
    await give('ravi', 'casual', 3)
    await as('ravi')
    const r = await applyLeave(ask({ typeId: type('casual'), start: later(100) }))
    const c = await as('admin')
    const res = await Promise.all(
      Array.from({ length: 50 }, () => c.rpc('decide_leave', { p_id: r.id, p_approve: true }))
    )
    expect(res.filter((x) => !x.error)).toHaveLength(1)
    const { data } = await root.from('leave_ledger').select('kind').eq('request_id', r.id)
    expect(data).toEqual([{ kind: 'debit' }])
  })

  it('approving while the person cancels leaves a consistent balance', async () => {
    await as('ravi')
    const r = await applyLeave(ask({ typeId: type('casual'), start: later(101) }))
    const before = await available('ravi', 'casual')
    const admin = await as('admin')
    const ravi = createClient<Database>(url, anon, { auth: { persistSession: false } })
    await ravi.auth.signInWithPassword({ email: `ravi-${run}@e2e.test`, password })
    await Promise.all([
      admin.rpc('decide_leave', { p_id: r.id, p_approve: true }),
      ravi.rpc('cancel_leave', { p_id: r.id })
    ])
    const { data } = await root.from('leave_requests').select('status').eq('id', r.id).single()
    expect(['withdrawn', 'cancelled']).toContain(data?.status)
    expect(await available('ravi', 'casual')).toBe(before + 1)
  })
})

describe('used this year', () => {
  it('counts leave in the year it is taken, and never goes below zero', async () => {
    await give('boss', 'casual', 5)
    await as('boss')
    const start = addDays(`${new Date().getFullYear() + 1}-02-01`, 0)
    const r = await applyLeave(
      ask({
        typeId: type('casual'),
        start: new Date(start).getUTCDay() ? start : addDays(start, 1)
      })
    )
    await as('admin')
    await decideLeave({ id: r.id, approve: true })
    // The approval happened last year, the cancellation this year.
    await root
      .from('leave_ledger')
      .update({ created_at: `${new Date().getFullYear() - 1}-12-20T10:00:00Z` } as never)
      .eq('request_id', r.id)
    await as('boss')
    await cancelLeave({ id: r.id })
    const { data } = await root
      .from('leave_balances')
      .select('used')
      .eq('user_id', people.boss)
      .eq('type_id', type('casual'))
      .single()
    expect(Number(data?.used)).toBe(0)
  })
})

describe('live updates', () => {
  it('tell the person about their own leave and nobody else', async () => {
    const signedIn = async (who: Who): Promise<SupabaseClient<Database>> => {
      const c = createClient<Database>(url, anon, { auth: { persistSession: false } })
      await c.auth.signInWithPassword({ email: `${who}-${run}@e2e.test`, password })
      await c.realtime.setAuth()
      return c
    }
    const heard = { asha: 0, ravi: 0 }
    const listen = async (who: 'asha' | 'ravi'): Promise<void> => {
      const c = await signedIn(who)
      await new Promise<void>((ok) =>
        c
          .channel(`leave:${who}:${run}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'leave_requests' }, () => {
            heard[who]++
          })
          .subscribe((status) => status === 'SUBSCRIBED' && ok())
      )
    }
    await Promise.all([listen('asha'), listen('ravi')])
    await new Promise((ok) => setTimeout(ok, 3000))
    await as('asha')
    await applyLeave(ask({ typeId: type('unpaid'), start: later(150) }))
    await expect.poll(() => heard.asha, { timeout: 15_000 }).toBeGreaterThan(0)
    await new Promise((ok) => setTimeout(ok, 1500))
    expect(heard.ravi).toBe(0)
  }, 30_000)
})

describe('with only unpaid leave', () => {
  beforeAll(() => root.from('leave_types').update({ active: false }).in('code', LIMITED))
  afterAll(() => root.from('leave_types').update({ active: true }).in('code', LIMITED))

  it('is how the migrations leave the company', () => expect(onlyUnpaid).toEqual(['unpaid']))

  it('refuses the other types and needs no balance for unpaid', async () => {
    await as('meena')
    await rejectsWith(
      applyLeave(ask({ typeId: type('casual'), start: later(160) })),
      'errLeaveType'
    )
    const r = await applyLeave(ask({ typeId: type('unpaid'), start: later(160) }))
    expect(r.status).toBe('pending')
  })

  it('credits nobody, on the 1st or at year end', async () => {
    for (const p_on of ['2033-11-01', '2034-01-01'])
      await root.rpc('credit_leave' as never, { p_on } as never)
    const { data } = await root
      .from('leave_ledger')
      .select('id')
      .in('type_id', LIMITED.map(type))
      .in('period', ['2033-11-01', '2034-01-01'])
      .eq('kind', 'credit')
    expect(data).toEqual([])
  })

  it('credits a new joiner nothing', async () => {
    const { data } = await root.auth.admin.createUser({
      email: `new-${run}@e2e.test`,
      password,
      email_confirm: true
    })
    const { data: lines } = await root
      .from('leave_ledger')
      .select('id')
      .eq('user_id', data.user!.id)
    expect(lines).toEqual([])
    await root.auth.admin.deleteUser(data.user!.id)
  })
})
