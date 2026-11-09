import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getDashboard } from '../src/dashboard'
import type { Database, Role } from '../src/database.types'
import { initSupabase, today } from '../src/supabase'
import { countBoardTasks, listBoardPage } from '../src/taskService'
import { addDays } from '../src/workdays'

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

type Loose = {
  rpc: (fn: string, args?: object) => Promise<{ data: unknown; error: { message: string } | null }>
  from: (t: string) => any // eslint-disable-line @typescript-eslint/no-explicit-any
}
const loose = (c: SupabaseClient<Database>): Loose => c as unknown as Loose
const root = createClient<Database>(url, service, { auth: { persistSession: false } })
const run = Date.now().toString(36)
const password = `pw-${run}-${Math.random().toString(36).slice(2)}`
const START = {
  ana: 'admin',
  sam: 'store_manager',
  mira: 'manager',
  sita: 'user', // reports to sam
  neel: 'user' // reports to nobody, on leave today
} as const satisfies Record<string, Role>
type Who = keyof typeof START
const ids = Object.fromEntries(Object.keys(START).map((k) => [k, ''])) as Record<Who, string>
const email = (who: Who): string => `${who}-${run}@e2e.test`

const as = async (who: Who): Promise<void> => {
  const m = new Map<string, string>()
  const { error } = await initSupabase(url, anon, {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k)
  } as never).auth.signInWithPassword({ email: email(who), password })
  if (error) throw error
}
const signedIn = async (who: Who): Promise<SupabaseClient<Database>> => {
  const c = createClient<Database>(url, anon, { auth: { persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email: email(who), password })
  if (error) throw error
  return c
}
const ok = <T>({ data, error }: { data: T; error: { message: string } | null }): T => {
  if (error) throw new Error(error.message)
  return data
}
const now = today()
const joined = `${addDays(now, -40)}T09:00:00+05:30`

beforeAll(async () => {
  for (const who of Object.keys(START) as Who[]) {
    const { data, error } = await root.auth.admin.createUser({
      email: email(who),
      password,
      email_confirm: true,
      user_metadata: { full_name: `${who} E2E` }
    })
    if (error) throw error
    ids[who] = data.user.id
  }
  // No profile exists until an admin approves the sign-up; tests skip the queue.
  ok(
    await loose(root)
      .from('profiles')
      .upsert(
        (Object.keys(START) as Who[]).map((who) => ({
          id: ids[who],
          email: email(who),
          full_name: `${who} E2E`,
          role: START[who],
          created_at: joined
        }))
      )
  )
  ok(await loose(root).from('profiles').update({ reports_to: ids.sam }).eq('id', ids.sita))
  // Sita sent today and the three working days before; Mira sent today only; Neel nothing.
  const sent = [0, 1, 2, 3, 4, 5]
    .map((n) => addDays(now, -n))
    .filter((d) => new Date(`${d}T00:00:00Z`).getUTCDay() !== 0)
    .slice(0, 4)
  ok(
    await loose(root)
      .from('daily_statuses')
      .insert([
        ...sent.map((date) => ({
          user_id: ids.sita,
          date,
          description: '<p>x</p>',
          hours_logged: 6
        })),
        { user_id: ids.mira, date: now, description: '<p>x</p>', hours_logged: 2.5 }
      ])
  )
  const unpaid = ok(
    await loose(root).from('leave_types').select('id').eq('code', 'unpaid').single()
  ).id
  const req = ok(
    await loose(await signedIn('neel')).rpc('apply_leave', {
      p_type: unpaid,
      p_start: now,
      p_end: now,
      p_start_half: 'full',
      p_end_half: 'full',
      p_reason: 'test'
    })
  ) as { id: string }
  ok(
    await loose(await signedIn('ana')).rpc('decide_leave', {
      p_id: req.id,
      p_approve: true,
      p_note: null
    })
  )
  const due = new Date(Date.now() - 3 * 864e5).toISOString()
  for (const [from, to] of [
    ['ana', 'sita'],
    ['ana', 'neel']
  ] as const)
    ok(
      await (
        await signedIn(from)
      ).rpc('create_task', {
        p_title: `Late ${from}->${to} ${run}`,
        p_description: null,
        p_due_date: due,
        p_user_ids: [ids[to]]
      })
    )
})

afterAll(async () => {
  const all = Object.values(ids).filter(Boolean)
  await loose(root).from('tasks').delete().in('created_by', all)
  await loose(root).from('leave_requests').delete().in('user_id', all)
  await loose(root).from('leave_ledger').delete().in('user_id', all)
  await loose(root).from('daily_statuses').delete().in('user_id', all)
  await Promise.all(all.map((id) => root.auth.admin.deleteUser(id)))
})

const mine = (rows: { id: string }[]): string[] =>
  rows.map((r) => r.id).filter((id) => Object.values(ids).includes(id))

describe('dashboard data per role', () => {
  it('admin sees staff and managers, not admins; full-day leave is away, not missing', async () => {
    await as('ana')
    const d = await getDashboard()
    expect(d.day).toBe(now)
    expect(mine(d.missing)).toEqual(d.off ? [] : [ids.sam])
    expect(d.away.map((a) => [a.person.id, a.half])).toContainEqual([ids.neel, 'full'])
    const trendToday = d.trend.find((x) => x.day === now)
    if (!d.off) expect(trendToday?.submitted).toBeGreaterThanOrEqual(2)
    expect(mine(d.streaks.map((s) => s.person))).toContain(ids.sita)
    expect(d.missedMost.every((r) => r.person.id !== ids.ana)).toBe(true)
  })

  it('a store manager sees only their own staff', async () => {
    await as('sam')
    const d = await getDashboard()
    expect(mine(d.missing)).toEqual([])
    expect(d.away).toEqual([])
    expect(d.expected).toBe(d.off ? 0 : 1)
    expect(d.submitted).toBe(d.off ? 0 : 1)
    expect(d.hours).toBe(d.off ? 0 : 6)
    expect([...d.missedMost, ...d.streaks].every((r) => r.person.id === ids.sita)).toBe(true)
  })

  it('staff get nothing about anyone else', async () => {
    await as('sita')
    const d = await getDashboard()
    expect({ expected: d.expected, missing: d.missing, away: d.away }).toEqual({
      expected: 0,
      missing: [],
      away: []
    })
  })

  it('task numbers follow what each person may manage', async () => {
    await as('ana')
    const all = { view: 'all', search: '', person: '' } as const
    expect((await countBoardTasks(all)).overdue).toBeGreaterThanOrEqual(2)
    const late = (await listBoardPage({ ...all, view: 'overdue' }, 3, 0)).rows
    expect(late.length).toBeGreaterThan(0)
    expect(late.map((t) => t.due_date)).toEqual([...late.map((t) => t.due_date)].sort())
    await as('sam')
    const own = (await listBoardPage({ ...all, view: 'overdue' }, 50, 0)).rows
    expect(own.every((t) => t.assignees.every((a) => a.id === ids.sita))).toBe(true)
    await as('mira')
    expect((await countBoardTasks(all)).overdue).toBe(0)
  })
})
