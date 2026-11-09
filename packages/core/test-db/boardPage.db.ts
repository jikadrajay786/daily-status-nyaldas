import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getUserDirectoryWithStats } from '../src/adminService'
import type { Database } from '../src/database.types'
import { db, initSupabase } from '../src/supabase'
import { countBoardTasks, listBoardPage, listPeople } from '../src/taskService'
import { ymd } from '../src/workdays'

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

const root = createClient<Database>(url, service, { auth: { persistSession: false } })
const run = `bp${Date.now().toString(36)}`
const password = `pw-${run}`
const ids: Record<'admin' | 'manager' | 'staff' | 'other', string> = {
  admin: '',
  manager: '',
  staff: '',
  other: ''
}
const signIn = (who: keyof typeof ids): Promise<unknown> =>
  db().auth.signInWithPassword({ email: `${who}-${run}@load.test`, password })
const day = (offset: number): string => new Date(Date.now() + offset * 864e5).toISOString()
const q = { view: 'all', search: run, person: '' } as const

beforeAll(async () => {
  initSupabase(url, anon)
  for (const who of Object.keys(ids) as (keyof typeof ids)[]) {
    const { data, error } = await root.auth.admin.createUser({
      email: `${who}-${run}@load.test`,
      password,
      email_confirm: true
    })
    if (error) throw error
    ids[who] = data.user.id
    await root
      .from('profiles')
      .upsert({
        id: data.user.id,
        email: `${who}-${run}@load.test`,
        full_name: who,
        role: who === 'admin' ? 'admin' : who === 'manager' ? 'manager' : 'user'
      })
      .throwOnError()
  }
  const rows = [
    { title: `${run} later`, due_date: day(5), status: 'pending', created_by: ids.admin },
    { title: `${run} late`, due_date: day(-3), status: 'blocked', created_by: ids.admin },
    { title: `${run} soon`, due_date: day(2), status: 'in_progress', created_by: ids.manager },
    { title: `${run} done`, due_date: day(-9), status: 'completed', created_by: ids.admin }
  ] as const
  const { data } = await root.from('tasks').insert(rows).select('id, title, status').throwOnError()
  // The task's status follows its people's, so each person starts where the task should be.
  await root
    .from('task_assignments')
    .insert(
      data.map((t) => ({
        task_id: t.id,
        user_id: t.title.endsWith('late') ? ids.other : ids.staff,
        status: t.status
      }))
    )
    .throwOnError()
})

afterAll(async () => {
  await db().auth.signOut({ scope: 'local' })
  await root.from('tasks').delete().ilike('title', `${run}%`)
  for (const id of Object.values(ids)) if (id) await root.auth.admin.deleteUser(id)
})

describe('the phone board', () => {
  it('lists unfinished soonest first, then finished, a page at a time', async () => {
    await signIn('admin')
    const first = await listBoardPage(q, 2, 0)
    expect(first.rows.map((t) => t.title)).toEqual([`${run} late`, `${run} soon`])
    expect(first.more).toBe(true)
    const second = await listBoardPage(q, 2, 2)
    expect(second.rows.map((t) => t.title)).toEqual([`${run} later`, `${run} done`])
    expect((await listBoardPage(q, 2, 4)).rows).toEqual([])
    expect(first.rows[0]?.assignees[0]?.id).toBe(ids.other)
  })

  it("puts today's tasks first, then late ones", async () => {
    await signIn('admin')
    const { data } = await root
      .from('tasks')
      .insert({
        title: `${run} today`,
        due_date: new Date(`${ymd(new Date())}T23:59:59`).toISOString(),
        status: 'pending',
        created_by: ids.admin
      })
      .select('id')
      .single()
      .throwOnError()
    await root
      .from('task_assignments')
      .insert({ task_id: data.id, user_id: ids.staff })
      .throwOnError()
    try {
      expect((await listBoardPage(q, 20, 0)).rows.map((t) => t.title)).toEqual(
        ['today', 'late', 'soon', 'later', 'done'].map((x) => `${run} ${x}`)
      )
      expect((await listBoardPage(q, 1, 1)).rows.map((t) => t.title)).toEqual([`${run} late`])
    } finally {
      await root.from('tasks').delete().eq('id', data.id)
    }
  })

  it('filters by view on the server, and the counts agree', async () => {
    await signIn('admin')
    const titles = async (view: 'overdue' | 'week' | 'completed' | 'blocked'): Promise<string[]> =>
      (await listBoardPage({ ...q, view }, 20, 0)).rows.map((t) => t.title)
    expect(await titles('overdue')).toEqual([`${run} late`])
    expect(await titles('week')).toEqual([`${run} soon`, `${run} later`])
    expect(await titles('completed')).toEqual([`${run} done`])
    expect(await titles('blocked')).toEqual([`${run} late`])
    expect(await countBoardTasks(q)).toMatchObject({
      pending: 1,
      in_progress: 1,
      blocked: 1,
      completed: 1,
      overdue: 1,
      week: 2
    })
  })

  it('filters by person', async () => {
    await signIn('admin')
    const res = await listBoardPage({ ...q, person: ids.other }, 20, 0)
    expect(res.rows.map((t) => t.title)).toEqual([`${run} late`])
  })

  it('shows a manager only the tasks they created', async () => {
    await signIn('manager')
    const res = await listBoardPage(q, 20, 0)
    expect(res.rows.map((t) => t.title)).toEqual([`${run} soon`])
    expect(await countBoardTasks(q)).toMatchObject({ in_progress: 1, pending: 0, blocked: 0 })
  })

  it('never shows staff anything beyond their own tasks', async () => {
    await signIn('other')
    expect((await listBoardPage(q, 20, 0)).rows.map((t) => t.title)).toEqual([`${run} late`])
    expect(await countBoardTasks(q)).toMatchObject({ blocked: 1, pending: 0, completed: 0 })
  })
})

describe('lists past the 1000-row response limit', () => {
  it('returns everyone, not just the first batch', async () => {
    await signIn('admin')
    const { count } = await root
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .neq('role', 'admin')
    expect((await listPeople('admin')).length).toBe(count)
    const { count: all } = await root.from('profiles').select('*', { count: 'exact', head: true })
    expect((await getUserDirectoryWithStats()).length).toBe(all)
  })
})
