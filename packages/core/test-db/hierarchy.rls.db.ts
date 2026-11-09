import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  getAllTeamStatuses,
  getTeamSummaryMetrics,
  getUserDirectoryWithStats,
  setUserManager,
  setUserRole
} from '../src/adminService'
import type { Database, Role } from '../src/database.types'
import { decideLeave, listPendingLeave, listTeamBalances } from '../src/leaveService'
import { initSupabase, today } from '../src/supabase'
import { listOpenBoardTasks, listPeople } from '../src/taskService'
import { errMsg } from '../src/useQuery'

// Runs against a local stack only (`supabase start`): it creates and deletes real accounts.
const {
  SUPABASE_URL: url = '',
  SUPABASE_ANON_KEY: anon = '',
  SUPABASE_SERVICE_ROLE_KEY: service = ''
} = process.env
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url) || !anon || !service)
  throw new Error(
    'test:db needs SUPABASE_URL (local), SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY'
  )

type Client = SupabaseClient<Database>
// Some of what this suite calls isn't part of the app's typed API, on purpose.
type Loose = {
  rpc: (fn: string, args?: object) => Promise<{ data: unknown; error: { message: string } | null }>
  from: (t: string) => any // eslint-disable-line @typescript-eslint/no-explicit-any
}
const loose = (c: Client): Loose => c as unknown as Loose

const root = createClient<Database>(url, service, { auth: { persistSession: false } })
const run = Date.now().toString(36)
const password = `pw-${run}-${Math.random().toString(36).slice(2)}`
const START = {
  ana: 'admin',
  mira: 'manager',
  sam: 'store_manager',
  ajay: 'agency_manager',
  sita: 'user', // reports to sam
  ali: 'user', // reports to ajay
  neel: 'user' // reports to nobody
} as const satisfies Record<string, Role>
type Who = keyof typeof START
const people = Object.fromEntries(Object.keys(START).map((k) => [k, ''])) as Record<Who, string>
const memory = (): Storage =>
  ({
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined
  }) as unknown as Storage

const signedIn = async (who: Who): Promise<Client> => {
  const c = createClient<Database>(url, anon, { auth: { persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email: `${who}-${run}@e2e.test`, password })
  if (error) throw error
  return c
}
// Points core's shared client at this person, so the services run exactly as the apps do.
const as = async (who: Who): Promise<void> => {
  const m = new Map<string, string>()
  const { error } = await initSupabase(url, anon, {
    ...memory(),
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k)
  } as never).auth.signInWithPassword({ email: `${who}-${run}@e2e.test`, password })
  if (error) throw error
}

const profile = async (id: string): Promise<{ role: Role; reports_to: string | null }> => {
  const { data } = await loose(root)
    .from('profiles')
    .select('role, reports_to')
    .eq('id', id)
    .single()
  return data
}
const giveTask = async (from: Who, to: Who): Promise<{ id?: string; error?: string }> => {
  const { data, error } = await (
    await signedIn(from)
  ).rpc('create_task', {
    p_title: `Task ${Math.random()}`,
    p_description: null,
    p_due_date: new Date(Date.now() + 864e5).toISOString(),
    p_user_ids: [people[to]]
  })
  return error ? { error: error.message } : { id: (data as unknown as { id: string }).id }
}
const addUpdate = async (who: Who): Promise<string> => {
  const { data, error } = await loose(root)
    .from('daily_statuses')
    .insert({ user_id: people[who], date: today(), description: '<p>Worked</p>', hours_logged: 8 })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id
}
const askLeave = async (who: Who): Promise<string> => {
  const type = (await loose(root).from('leave_types').select('id').eq('code', 'casual').single())
    .data.id
  await loose(root)
    .from('leave_ledger')
    .insert({ user_id: people[who], type_id: type, days: 5, kind: 'adjust', note: 'test' })
  const d = new Date(`${today()}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7 || 7) + 14)
  const day = d.toISOString().slice(0, 10)
  const res = await loose(await signedIn(who)).rpc('apply_leave', {
    p_type: type,
    p_start: day,
    p_end: day,
    p_start_half: 'full',
    p_end_half: 'full',
    p_reason: 'test'
  })
  if (res.error) throw new Error(res.error.message)
  return (res.data as { id: string }).id
}
const leaveStatus = async (id: string): Promise<string> =>
  (await loose(root).from('leave_requests').select('status').eq('id', id).single()).data.status

beforeAll(async () => {
  // These tests ask for leave with a balance, which is off for this company: switch one type on.
  await loose(root).from('leave_types').update({ active: true }).eq('code', 'casual')
  for (const who of Object.keys(START) as Who[]) {
    const { data, error } = await root.auth.admin.createUser({
      email: `${who}-${run}@e2e.test`,
      password,
      email_confirm: true,
      user_metadata: { full_name: `${who} E2E` }
    })
    if (error) throw error
    people[who] = data.user.id
    // Sign-ups wait for an admin (approve_signup); these accounts skip the queue.
    await root
      .from('profiles')
      .upsert({ id: data.user.id, email: data.user.email, full_name: `${who} E2E` } as never)
      .throwOnError()
  }
})

beforeEach(async () => {
  const ids = Object.values(people)
  await loose(root).from('leave_requests').delete().in('user_id', ids)
  await loose(root).from('leave_ledger').delete().in('user_id', ids)
  await loose(root).from('tasks').delete().in('created_by', ids)
  await loose(root).from('daily_statuses').delete().in('user_id', ids)
  await loose(root).from('profiles').update({ reports_to: null }).in('id', ids)
  for (const who of Object.keys(START) as Who[])
    await loose(root).from('profiles').update({ role: START[who] }).eq('id', people[who])
  await loose(root).from('profiles').update({ reports_to: people.sam }).eq('id', people.sita)
  await loose(root).from('profiles').update({ reports_to: people.ajay }).eq('id', people.ali)
})

afterAll(async () => {
  await loose(root).from('leave_types').update({ active: false }).eq('code', 'casual')
  await Promise.all(
    Object.values(people)
      .filter(Boolean)
      .map((id) => root.auth.admin.deleteUser(id))
  )
})

describe('who sets the hierarchy', () => {
  it('lets an admin link and unlink staff', async () => {
    await as('ana')
    await setUserManager(people.neel, people.sam)
    expect((await profile(people.neel)).reports_to).toBe(people.sam)
    await setUserManager(people.neel, null)
    expect((await profile(people.neel)).reports_to).toBeNull()
  })

  it.each(['sam', 'mira', 'sita'] as const)('refuses %s', async (who) => {
    await as(who)
    await expect(setUserManager(people.neel, people.sam)).rejects.toMatchObject({
      message: expect.stringMatching(/permission denied/)
    })
    expect((await profile(people.neel)).reports_to).toBeNull()
  })

  it.each(['sam', 'sita', 'ana'] as const)('%s cannot write the link directly', async (who) => {
    const c = loose(await signedIn(who))
    const { error } = await c
      .from('profiles')
      .update({ reports_to: people.sam })
      .eq('id', people.neel)
    expect(error?.message).toMatch(/permission denied/)
    expect((await profile(people.neel)).reports_to).toBeNull()
  })

  it('staff cannot move themselves under another manager', async () => {
    const c = loose(await signedIn('sita'))
    const { error } = await c
      .from('profiles')
      .update({ reports_to: people.ajay })
      .eq('id', people.sita)
    expect(error?.message).toMatch(/permission denied/)
    expect((await profile(people.sita)).reports_to).toBe(people.sam)
  })

  it.each([
    ['a plain manager', 'neel', 'mira'],
    ['an admin', 'neel', 'ana'],
    ['another staff member', 'neel', 'sita']
  ] as const)('refuses reporting to %s', async (_, who, boss) => {
    await as('ana')
    const err = await setUserManager(people[who], people[boss]).catch((e: unknown) => e)
    expect(errMsg(err)).toBe('errReportsInvalid')
    expect((await profile(people[who])).reports_to).toBeNull()
  })

  it('refuses a link for anyone but staff', async () => {
    await as('ana')
    const err = await setUserManager(people.mira, people.sam).catch((e: unknown) => e)
    expect(errMsg(err)).toBe('errReportsInvalid')
  })

  it('accepts both new roles through the role change', async () => {
    await as('ana')
    await setUserRole(people.neel, 'store_manager')
    expect((await profile(people.neel)).role).toBe('store_manager')
    await setUserRole(people.neel, 'agency_manager')
    expect((await profile(people.neel)).role).toBe('agency_manager')
  })
})

describe('when roles change', () => {
  it('a link ends when staff stop being staff', async () => {
    await as('ana')
    await setUserRole(people.sita, 'manager')
    expect(await profile(people.sita)).toEqual({ role: 'manager', reports_to: null })
  })

  it('staff are released when their manager changes role', async () => {
    await as('ana')
    await setUserRole(people.sam, 'manager')
    expect((await profile(people.sita)).reports_to).toBeNull()
  })

  it('a former manager loses access at once', async () => {
    const sam = await signedIn('sam')
    const id = await addUpdate('sita')
    expect((await sam.from('daily_statuses').select('id').eq('id', id)).data).toHaveLength(1)
    await as('ana')
    await setUserRole(people.sam, 'user')
    expect((await sam.from('daily_statuses').select('id').eq('id', id)).data).toEqual([])
    expect((await sam.from('profiles').select('id').eq('id', people.sita)).data).toEqual([])
  })

  it('staff moved to another manager move their access with them', async () => {
    const id = await addUpdate('sita')
    await as('ana')
    await setUserManager(people.sita, people.ajay)
    const [sam, ajay] = [await signedIn('sam'), await signedIn('ajay')]
    expect((await sam.from('daily_statuses').select('id').eq('id', id)).data).toEqual([])
    expect((await ajay.from('daily_statuses').select('id').eq('id', id)).data).toHaveLength(1)
  })
})

describe('who sees whom', () => {
  it('a store manager reads only their own staff', async () => {
    const sam = await signedIn('sam')
    const { data } = await sam.from('profiles').select('id')
    expect(data?.map((p) => p.id).sort()).toEqual([people.sam, people.sita].sort())
  })

  it('updates stay within the hierarchy', async () => {
    const [sita, ali, neel] = [
      await addUpdate('sita'),
      await addUpdate('ali'),
      await addUpdate('neel')
    ]
    const see = async (who: Who, id: string): Promise<number> =>
      (await (await signedIn(who)).from('daily_statuses').select('id').eq('id', id)).data?.length ??
      0
    expect(await see('sam', sita)).toBe(1)
    expect(await see('sam', ali)).toBe(0)
    expect(await see('sam', neel)).toBe(0)
    expect(await see('ajay', ali)).toBe(1)
    expect(await see('ajay', sita)).toBe(0)
    expect(await see('mira', sita)).toBe(0)
    expect(await see('sita', ali)).toBe(0)
    expect(await see('ana', sita)).toBe(1)
  })

  it('a store manager cannot edit or delete staff updates', async () => {
    const id = await addUpdate('sita')
    const sam = loose(await signedIn('sam'))
    await sam.from('daily_statuses').update({ hours_logged: 1 }).eq('id', id)
    await sam.from('daily_statuses').delete().eq('id', id)
    const row = await loose(root)
      .from('daily_statuses')
      .select('hours_logged')
      .eq('id', id)
      .single()
    expect(row.data.hours_logged).toBe(8)
  })

  it('the team pages show a store manager their staff but not themselves', async () => {
    await addUpdate('sita')
    await addUpdate('sam')
    await as('sam')
    expect((await getUserDirectoryWithStats()).map((p) => p.id)).toEqual([people.sita])
    expect((await getTeamSummaryMetrics(today())).members.map((p) => p.id)).toEqual([people.sita])
    expect((await getAllTeamStatuses()).rows.map((s) => s.user_id)).toEqual([people.sita])
  })

  it('admins still see everyone', async () => {
    await as('ana')
    const ids = (await getUserDirectoryWithStats()).map((p) => p.id)
    expect(ids).toEqual(expect.arrayContaining(Object.values(people)))
  })
})

describe('tasks', () => {
  it('a store manager gives tasks only to their own staff', async () => {
    expect((await giveTask('sam', 'sita')).id).toBeTruthy()
    expect((await giveTask('sam', 'ali')).error).toMatch(/only be given to staff/)
    expect((await giveTask('sam', 'neel')).error).toMatch(/only be given to staff/)
    expect((await giveTask('sam', 'mira')).error).toMatch(/only be given to staff/)
  })

  it('the assignment picker lists only their own staff', async () => {
    await as('sam')
    expect((await listPeople('store_manager')).map((p) => p.id)).toEqual([people.sita])
  })

  it('a manager still gives tasks to all staff, as before', async () => {
    expect((await giveTask('mira', 'sita')).id).toBeTruthy()
    expect((await giveTask('mira', 'neel')).id).toBeTruthy()
    expect((await giveTask('mira', 'sam')).error).toMatch(/only be given to staff/)
    await as('mira')
    expect((await listPeople('manager')).map((p) => p.id)).toEqual(
      expect.arrayContaining([people.sita, people.ali, people.neel])
    )
  })

  it('admins can give tasks to the new managers but not to admins', async () => {
    expect((await giveTask('ana', 'sam')).id).toBeTruthy()
    expect((await giveTask('ana', 'ana')).error).toMatch(/only be given to staff/)
  })

  it('a store manager sees and moves their staff’s progress, but cannot rewrite the task', async () => {
    const { id } = await giveTask('ana', 'sita')
    const sam = loose(await signedIn('sam'))
    await as('sam')
    expect(
      (await listOpenBoardTasks({ id: people.sam, role: 'store_manager' })).map((t) => t.id)
    ).toContain(id)
    const moved = await sam
      .from('task_assignments')
      .update({ status: 'in_progress' })
      .eq('task_id', id)
      .eq('user_id', people.sita)
      .select()
    expect(moved.data).toHaveLength(1)
    const rewritten = await sam.from('tasks').update({ title: 'Changed' }).eq('id', id).select()
    expect(rewritten.data ?? []).toEqual([])
    expect((await sam.from('tasks').delete().eq('id', id).select()).data ?? []).toEqual([])
  })

  it('other people’s staff stay out of reach', async () => {
    const { id } = await giveTask('ana', 'ali')
    const sam = loose(await signedIn('sam'))
    expect((await sam.from('tasks').select('id').eq('id', id)).data).toEqual([])
    expect(
      (await sam.from('task_assignments').update({ status: 'blocked' }).eq('task_id', id).select())
        .data
    ).toEqual([])
    expect((await sam.from('task_assignments').select('id').eq('task_id', id)).data).toEqual([])
  })

  it('a task given to the store manager themselves is not on their board', async () => {
    const { id } = await giveTask('ana', 'sam')
    await as('sam')
    expect(
      (await listOpenBoardTasks({ id: people.sam, role: 'store_manager' })).map((t) => t.id)
    ).not.toContain(id)
  })

  it('tell the staff member’s manager when the status changes', async () => {
    const { id } = await giveTask('ana', 'sita')
    await (
      await signedIn('sita')
    )
      .from('task_assignments')
      .update({ status: 'in_progress' })
      .eq('task_id', id ?? '')
    const { data } = await loose(root)
      .from('notifications')
      .select('user_id')
      .eq('target_id', id)
      .eq('event', 'taskStatus')
    expect((data as { user_id: string }[]).map((n) => n.user_id)).toContain(people.sam)
  })
})

describe('leave', () => {
  it('a store manager approves their own staff’s leave', async () => {
    const id = await askLeave('sita')
    const res = await loose(await signedIn('sam')).rpc('decide_leave', {
      p_id: id,
      p_approve: true
    })
    expect(res.error).toBeNull()
    expect(await leaveStatus(id)).toBe('approved')
  })

  it('an admin still can too', async () => {
    const id = await askLeave('sita')
    const res = await loose(await signedIn('ana')).rpc('decide_leave', {
      p_id: id,
      p_approve: false
    })
    expect(res.error).toBeNull()
    expect(await leaveStatus(id)).toBe('rejected')
  })

  it.each(['ajay', 'mira', 'neel', 'sita'] as const)('%s cannot decide it', async (who) => {
    const id = await askLeave('sita')
    const res = await loose(await signedIn(who)).rpc('decide_leave', { p_id: id, p_approve: true })
    expect(res.error?.message).toMatch(/permission denied/)
    expect(await leaveStatus(id)).toBe('pending')
  })

  it('a store manager cannot approve their own leave', async () => {
    const id = await askLeave('sam')
    const res = await loose(await signedIn('sam')).rpc('decide_leave', {
      p_id: id,
      p_approve: true
    })
    expect(res.error?.message).toMatch(/permission denied/)
    expect(await leaveStatus(id)).toBe('pending')
  })

  it('a store manager sees their staff’s requests and balances, not others’', async () => {
    const [mine, other] = [await askLeave('sita'), await askLeave('ali')]
    const sam = loose(await signedIn('sam'))
    expect((await sam.from('leave_requests').select('id').eq('id', mine)).data).toHaveLength(1)
    expect((await sam.from('leave_requests').select('id').eq('id', other)).data).toEqual([])
    expect(
      (await sam.from('leave_ledger').select('id').eq('user_id', people.sita)).data.length
    ).toBeGreaterThan(0)
    expect((await sam.from('leave_ledger').select('id').eq('user_id', people.ali)).data).toEqual([])
  })

  it('a store manager can cancel their staff’s leave but not adjust balances', async () => {
    const id = await askLeave('sita')
    const sam = loose(await signedIn('sam'))
    expect((await sam.rpc('decide_leave', { p_id: id, p_approve: true })).error).toBeNull()
    expect((await sam.rpc('cancel_leave', { p_id: id })).error).toBeNull()
    expect(await leaveStatus(id)).toBe('cancelled')
    const type = (await loose(root).from('leave_types').select('id').eq('code', 'casual').single())
      .data.id
    const adj = await sam.rpc('adjust_leave_balance', {
      p_user: people.sita,
      p_type: type,
      p_days: 5,
      p_note: 'no'
    })
    expect(adj.error?.message).toMatch(/permission denied/)
  })

  it('other people cannot cancel it', async () => {
    const id = await askLeave('sita')
    const res = await loose(await signedIn('ajay')).rpc('cancel_leave', { p_id: id })
    expect(res.error?.message).toMatch(/permission denied/)
    expect(await leaveStatus(id)).toBe('pending')
  })
})

describe('leave requests page', () => {
  it('lists a store manager’s staff with their names, and nobody else’s', async () => {
    const [mine, other] = [await askLeave('sita'), await askLeave('ali')]
    await as('sam')
    const rows = await listPendingLeave()
    expect(rows.map((r) => r.id)).toEqual([mine])
    expect(rows[0]?.person?.full_name).toBe('sita E2E')
    expect(rows.map((r) => r.id)).not.toContain(other)
  })

  it('shows an admin everyone', async () => {
    const [a, b] = [await askLeave('sita'), await askLeave('ali')]
    await as('ana')
    expect((await listPendingLeave()).map((r) => r.id)).toEqual(expect.arrayContaining([a, b]))
  })

  it('gives a plain manager and staff nothing of anyone else’s', async () => {
    await askLeave('sita')
    for (const who of ['mira', 'neel'] as const) {
      await as(who)
      expect(await listPendingLeave()).toEqual([])
    }
  })

  it('limits balances to their own staff', async () => {
    await askLeave('sita')
    await askLeave('ali')
    await as('sam')
    const ids = new Set((await listTeamBalances()).map((b) => b.user_id))
    expect(ids.has(people.sita)).toBe(true)
    expect(ids.has(people.ali)).toBe(false)
  })

  it('refuses approval past the balance, even if the screen is out of date', async () => {
    const id = await askLeave('sita')
    const type = (await loose(root).from('leave_types').select('id').eq('code', 'casual').single())
      .data.id
    await loose(root)
      .from('leave_ledger')
      .insert({ user_id: people.sita, type_id: type, days: -5, kind: 'adjust', note: 'used' })
    await as('sam')
    const err = await decideLeave({ id, approve: true }).catch((e: unknown) => e)
    expect(errMsg(err)).toBe('errLeaveBalance')
    expect(await leaveStatus(id)).toBe('pending')
  })

  it('a decision already made cannot be made again', async () => {
    const id = await askLeave('sita')
    await as('sam')
    await decideLeave({ id, approve: false, note: 'Busy week' })
    const err = await decideLeave({ id, approve: true }).catch((e: unknown) => e)
    expect(errMsg(err)).toBe('errLeaveClosed')
    expect(await leaveStatus(id)).toBe('rejected')
  })

  it('approving twice at once takes the days only once', async () => {
    const id = await askLeave('sita')
    const [sam, ana] = [loose(await signedIn('sam')), loose(await signedIn('ana'))]
    await Promise.all([
      sam.rpc('decide_leave', { p_id: id, p_approve: true }),
      ana.rpc('decide_leave', { p_id: id, p_approve: true })
    ])
    const { data } = await loose(root)
      .from('leave_ledger')
      .select('id')
      .eq('request_id', id)
      .eq('kind', 'debit')
    expect(data).toHaveLength(1)
  })
})

describe('leave notifications', () => {
  const told = async (id: string, event: string): Promise<string[]> =>
    (
      await loose(root)
        .from('notifications')
        .select('user_id')
        .eq('target_id', id)
        .eq('event', event)
    ).data.map((n: { user_id: string }) => n.user_id)
  const said = async (id: string, event: string): Promise<{ name?: string; text?: string }> =>
    (
      await loose(root)
        .from('notifications')
        .select('vars')
        .eq('target_id', id)
        .eq('event', event)
        .limit(1)
        .single()
    ).data.vars

  it('a new request reaches the admins and the person’s manager, nobody else', async () => {
    const id = await askLeave('sita')
    const to = await told(id, 'leaveRequested')
    expect(to).toContain(people.ana)
    expect(to).toContain(people.sam)
    for (const who of ['sita', 'ajay', 'mira', 'ali', 'neel'] as const)
      expect(to).not.toContain(people[who])
    expect((await said(id, 'leaveRequested')).text).toMatch(/^\d\d\/\d\d: test$/)
  })

  it('a manager’s own request reaches the admins only', async () => {
    const to = await told(await askLeave('sam'), 'leaveRequested')
    expect(to).toContain(people.ana)
    expect(to).not.toContain(people.sam)
  })

  it('a request from staff with no manager still reaches the admins', async () => {
    const to = await told(await askLeave('neel'), 'leaveRequested')
    expect(to).toContain(people.ana)
    expect(to).not.toContain(people.sam)
  })

  it.each([
    [true, 'leaveApproved'],
    [false, 'leaveRejected']
  ] as const)('deciding tells only the person (approve: %s)', async (approve, event) => {
    const id = await askLeave('sita')
    await loose(await signedIn('sam')).rpc('decide_leave', {
      p_id: id,
      p_approve: approve,
      p_note: 'Noted'
    })
    expect(await told(id, event)).toEqual([people.sita])
    expect((await said(id, event)).text).toMatch(/: Noted$/)
  })

  it('a manager cancelling approved leave tells the person', async () => {
    const id = await askLeave('sita')
    const sam = loose(await signedIn('sam'))
    await sam.rpc('decide_leave', { p_id: id, p_approve: true })
    await sam.rpc('cancel_leave', { p_id: id })
    expect(await told(id, 'leaveCancelled')).toEqual([people.sita])
    expect(await told(id, 'leaveTakenBack')).toEqual([])
  })

  it('the person cancelling approved leave tells the admins and their manager', async () => {
    const id = await askLeave('sita')
    await loose(await signedIn('sam')).rpc('decide_leave', { p_id: id, p_approve: true })
    await loose(await signedIn('sita')).rpc('cancel_leave', { p_id: id })
    const to = await told(id, 'leaveTakenBack')
    expect(to).toContain(people.ana)
    expect(to).toContain(people.sam)
    expect(to).not.toContain(people.sita)
    expect(await told(id, 'leaveCancelled')).toEqual([])
  })

  it('withdrawing an undecided request bothers nobody', async () => {
    const id = await askLeave('sita')
    await loose(await signedIn('sita')).rpc('cancel_leave', { p_id: id })
    expect(await told(id, 'leaveTakenBack')).toEqual([])
    expect(await told(id, 'leaveCancelled')).toEqual([])
  })

  it('people read only their own notifications', async () => {
    const id = await askLeave('sita')
    const mira = await signedIn('mira')
    expect((await mira.from('notifications').select('id').eq('target_id', id)).data).toEqual([])
    const ana = await signedIn('ana')
    expect((await ana.from('notifications').select('id').eq('target_id', id)).data).toHaveLength(1)
  })

  it('a note can’t break the request or the decision', async () => {
    const id = await askLeave('sita')
    const note = `'; drop table public.profiles; -- ${'x'.repeat(250)}`
    const res = await loose(await signedIn('sam')).rpc('decide_leave', {
      p_id: id,
      p_approve: false,
      p_note: note
    })
    expect(res.error).toBeNull()
    expect(await leaveStatus(id)).toBe('rejected')
    expect(await told(id, 'leaveRejected')).toEqual([people.sita])
  })
})

describe('comments', () => {
  it('a store manager can comment on their own staff’s update, not others’', async () => {
    const [mine, other] = [await addUpdate('sita'), await addUpdate('ali')]
    const sam = loose(await signedIn('sam'))
    expect((await sam.from('comments').insert({ status_id: mine, body: 'Good' })).error).toBeNull()
    expect(
      (await sam.from('comments').insert({ status_id: other, body: 'No' })).error
    ).not.toBeNull()
    const { data } = await loose(root)
      .from('comments')
      .select('author_role')
      .eq('status_id', mine)
      .single()
    expect(data.author_role).toBe('store_manager')
  })
})

describe('at the same moment', () => {
  it('linking staff during their manager’s role change never leaves a bad link', async () => {
    const [ana] = [await signedIn('ana')]
    for (let i = 0; i < 20; i++) {
      await loose(root).from('profiles').update({ reports_to: null }).eq('id', people.neel)
      await loose(root).from('profiles').update({ role: 'store_manager' }).eq('id', people.sam)
      await Promise.all([
        ana.rpc('set_user_manager', { p_user: people.neel, p_manager: people.sam }),
        ana.rpc('set_user_role', { p_user: people.sam, p_role: 'manager' })
      ])
      const [neel, sam] = [await profile(people.neel), await profile(people.sam)]
      if (neel.reports_to) expect(sam.role).toBe('store_manager')
    }
  })
})
