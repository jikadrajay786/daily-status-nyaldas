import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database, Task } from '../src/database.types'
import { initSupabase } from '../src/supabase'
import {
  createTask,
  listAllTasks,
  listMyTasks,
  TASK_STATUSES,
  updateTaskStatus
} from '../src/taskService'
import { errMsg } from '../src/useQuery'

// Runs against a local stack only (`supabase start`): it creates and deletes real accounts.
const { SUPABASE_URL: url = '', SUPABASE_ANON_KEY: anon = '', SUPABASE_SERVICE_ROLE_KEY: service = '' } =
  process.env
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url) || !anon || !service)
  throw new Error('test:db needs SUPABASE_URL (local), SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY')

const root = createClient<Database>(url, service, { auth: { persistSession: false } })
const run = Date.now().toString(36)
const password = `pw-${run}-${Math.random().toString(36).slice(2)}`
const people = { admin: '', asha: '', ravi: '', meena: '' }
type Who = keyof typeof people

const memory = (): { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void; removeItem: (k: string) => void } => {
  const m = new Map<string, string>()
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) }
}

// Points core's shared client at a fresh signed-in session, so the services run exactly as the apps do.
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

let task: Task

beforeAll(async () => {
  for (const who of Object.keys(people) as Who[]) {
    const { data, error } = await root.auth.admin.createUser({
      email: `${who}-${run}@e2e.test`,
      password,
      email_confirm: true,
      user_metadata: { full_name: `${who[0]?.toUpperCase()}${who.slice(1)} E2E` }
    })
    if (error) throw error
    people[who] = data.user.id
  }
  const { error } = await root.from('profiles').update({ role: 'admin' } as never).eq('id', people.admin)
  if (error) throw error
})

afterAll(async () => {
  await Promise.all(Object.values(people).filter(Boolean).map((id) => root.auth.admin.deleteUser(id)))
})

describe('admin', () => {
  it('creates one task for two people in a single call', async () => {
    await as('admin')
    task = await createTask({
      title: 'Restock shelf B',
      description: 'Count first, then order.',
      dueDate: new Date(Date.now() + 864e5).toISOString(),
      userIds: [people.asha, people.ravi]
    })
    expect(task.status).toBe('pending')
    const { data } = await root.from('task_assignments').select('user_id').eq('task_id', task.id)
    expect(data?.map((a) => a.user_id).sort()).toEqual([people.asha, people.ravi].sort())
  })

  it('sees the task with both assignees on the board', async () => {
    await as('admin')
    const row = (await listAllTasks()).find((t) => t.id === task.id)
    expect(row?.assignees.map((a) => a.id).sort()).toEqual([people.asha, people.ravi].sort())
  })

  it('can move the task through every status', async () => {
    await as('admin')
    for (const status of TASK_STATUSES)
      expect((await updateTaskStatus({ taskId: task.id, status })).status).toBe(status)
    await updateTaskStatus({ taskId: task.id, status: 'pending' })
  })
})

describe('user', () => {
  it('cannot create tasks', async () => {
    await as('asha')
    await rejectsWith(
      createTask({ title: 'Sneaky', dueDate: new Date().toISOString(), userIds: [people.asha] }),
      'errDenied'
    )
  })

  it('sees only tasks given to them', async () => {
    await as('asha')
    expect((await listMyTasks(people.asha)).map((t) => t.id)).toContain(task.id)
    const meena = await as('meena')
    expect(await listMyTasks(people.meena)).toEqual([])
    expect((await meena.from('tasks').select('id').eq('id', task.id)).data).toEqual([])
    expect((await meena.from('task_assignments').select('id').eq('task_id', task.id)).data).toEqual([])
  })

  it('moves their task pending → in_progress → completed', async () => {
    await as('asha')
    expect((await updateTaskStatus({ taskId: task.id, status: 'in_progress' })).status).toBe('in_progress')
    expect((await updateTaskStatus({ taskId: task.id, status: 'completed' })).status).toBe('completed')
  })

  it("cannot change the status of someone else's task", async () => {
    await as('meena')
    await rejectsWith(updateTaskStatus({ taskId: task.id, status: 'blocked' }), 'errDenied')
  })

  it('cannot edit title, description or due date', async () => {
    const asha = await as('asha')
    for (const patch of [{ title: 'Renamed' }, { description: 'Changed' }, { due_date: new Date().toISOString() }])
      await rejectsWith(Promise.resolve(asha.from('tasks').update(patch).eq('id', task.id).select()).then((r) => {
        if (r.error) throw r.error
        return r
      }), 'errDenied')
    const { data } = await root.from('tasks').select('title, description').eq('id', task.id).single()
    expect(data).toEqual({ title: 'Restock shelf B', description: 'Count first, then order.' })
  })

  it('cannot change who the task is given to', async () => {
    const asha = await as('asha')
    expect((await asha.from('task_assignments').insert({ task_id: task.id, user_id: people.meena })).error).not.toBeNull()
    expect((await asha.from('task_assignments').delete().eq('task_id', task.id).select()).data).toEqual([])
    expect((await asha.from('tasks').delete().eq('id', task.id).select()).data).toEqual([])
    const { count } = await root.from('task_assignments').select('*', { count: 'exact', head: true }).eq('task_id', task.id)
    expect(count).toBe(2)
  })
})

describe('realtime', () => {
  it('tells assignees about status changes and keeps others out', async () => {
    const clients: SupabaseClient<Database>[] = []
    const listen = async (who: Who): Promise<string[]> => {
      const c = await as(who)
      const got: string[] = []
      clients.push(c)
      await new Promise<void>((ok, bad) =>
        c
          .channel(`rt-${who}-${run}`)
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tasks' }, (p) =>
            got.push((p.new as Task).status)
          )
          .subscribe((s) =>
            s === 'SUBSCRIBED' ? ok() : s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' ? bad(new Error(s)) : undefined
          )
      )
      return got
    }
    const ravi = await listen('ravi')
    const meena = await listen('meena')
    await as('admin')
    await updateTaskStatus({ taskId: task.id, status: 'blocked' })
    await expect.poll(() => ravi, { timeout: 10_000 }).toContain('blocked')
    // Give a leaked event time to arrive before asserting it never did.
    await new Promise((r) => setTimeout(r, 1500))
    expect(meena).toEqual([])
    await Promise.all(clients.map((c) => c.removeAllChannels()))
  })
})
