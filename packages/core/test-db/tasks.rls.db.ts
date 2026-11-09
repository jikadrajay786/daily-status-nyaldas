import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database, Task } from '../src/database.types'
import { initSupabase } from '../src/supabase'
import {
  createTask,
  getTask,
  listDoneBoardTasks,
  listDoneMyTasks,
  listOpenBoardTasks,
  listOpenMyTasks,
  listPeople,
  TASK_STATUSES,
  updateTaskStatus
} from '../src/taskService'
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

const root = createClient<Database>(url, service, { auth: { persistSession: false } })
const run = Date.now().toString(36)
const password = `pw-${run}-${Math.random().toString(36).slice(2)}`
const people = { admin: '', boss: '', asha: '', ravi: '', meena: '' }
type Who = keyof typeof people

const memory = (): {
  getItem: (k: string) => string | null
  setItem: (k: string, v: string) => void
  removeItem: (k: string) => void
} => {
  const m = new Map<string, string>()
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k)
  }
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
    // Sign-ups wait for an admin (approve_signup); these accounts skip the queue.
    const made = await root
      .from('profiles')
      .upsert({ id: data.user.id, email: data.user.email, full_name: who } as never)
    if (made.error) throw made.error
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
})

afterAll(async () => {
  await Promise.all(
    Object.values(people)
      .filter(Boolean)
      .map((id) => root.auth.admin.deleteUser(id))
  )
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
    const row = (await listOpenBoardTasks({ id: people.admin, role: 'admin' })).find(
      (t) => t.id === task.id
    )
    expect(row?.assignees.map((a) => a.id).sort()).toEqual([people.asha, people.ravi].sort())
  })

  it("can move one person through every status, and the task follows everyone's", async () => {
    await as('admin')
    const whole = {
      pending: 'pending',
      in_progress: 'in_progress',
      completed: 'in_progress',
      blocked: 'blocked'
    }
    for (const status of TASK_STATUSES) {
      expect(
        (await updateTaskStatus({ taskId: task.id, userId: people.asha, status })).status
      ).toBe(status)
      expect(
        (await root.from('tasks').select('status').eq('id', task.id).single()).data?.status
      ).toBe(whole[status])
    }
    await updateTaskStatus({ taskId: task.id, userId: people.asha, status: 'pending' })
  })
})

describe('finished tasks', () => {
  const none = { search: '', person: '', limit: 25 }
  let done: Task
  let other: Task

  beforeAll(async () => {
    await as('admin')
    const due = new Date(Date.now() + 864e5).toISOString()
    done = await createTask({
      title: `Shared ${run}`,
      dueDate: due,
      userIds: [people.asha, people.ravi]
    })
    other = await createTask({ title: `Solo ${run}`, dueDate: due, userIds: [people.ravi] })
    for (const userId of [people.asha, people.ravi])
      await updateTaskStatus({ taskId: done.id, userId, status: 'completed' })
    await updateTaskStatus({ taskId: other.id, userId: people.ravi, status: 'completed' })
  })

  it('leave the unfinished list and arrive newest first on the board', async () => {
    const me = { id: people.admin, role: 'admin' } as const
    expect((await listOpenBoardTasks(me)).map((t) => t.id)).not.toContain(done.id)
    const { rows, total } = await listDoneBoardTasks(me, none)
    expect(rows.map((t) => t.id).slice(0, 2)).toEqual([other.id, done.id])
    expect(total).toBeGreaterThanOrEqual(2)
  })

  it('narrow by person without losing the other names on the card', async () => {
    const me = { id: people.admin, role: 'admin' } as const
    const { rows, total } = await listDoneBoardTasks(me, { ...none, person: people.asha })
    expect(rows.map((t) => t.id)).toEqual([done.id])
    expect(total).toBe(1)
    expect(rows[0]?.assignees.map((a) => a.id).sort()).toEqual([people.asha, people.ravi].sort())
  })

  it('narrow by title and report when more are left', async () => {
    const me = { id: people.admin, role: 'admin' } as const
    const found = await listDoneBoardTasks(me, { ...none, search: `solo ${run}` })
    expect(found.rows.map((t) => t.id)).toEqual([other.id])
    const first = await listDoneBoardTasks(me, { ...none, limit: 1 })
    expect(first.rows).toHaveLength(1)
    expect(first.more).toBe(true)
  })

  it('show a person only their own', async () => {
    await as('asha')
    const { rows, total } = await listDoneMyTasks(people.asha, none)
    expect(rows.map((t) => t.id)).toEqual([done.id])
    expect(total).toBe(1)
    await as('meena')
    expect(await listDoneMyTasks(people.asha, none)).toMatchObject({ rows: [], total: 0 })
  })

  it("stay out of another manager's board", async () => {
    await as('boss')
    const { rows } = await listDoneBoardTasks({ id: people.boss, role: 'manager' }, none)
    expect(rows.map((t) => t.id)).not.toContain(done.id)
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
    expect((await listOpenMyTasks(people.asha)).map((t) => t.id)).toContain(task.id)
    const meena = await as('meena')
    expect(await listOpenMyTasks(people.meena)).toEqual([])
    expect((await meena.from('tasks').select('id').eq('id', task.id)).data).toEqual([])
    expect((await meena.from('task_assignments').select('id').eq('task_id', task.id)).data).toEqual(
      []
    )
  })

  it('moves their own part pending → in_progress → completed', async () => {
    await as('asha')
    const mine = { taskId: task.id, userId: people.asha }
    expect((await updateTaskStatus({ ...mine, status: 'in_progress' })).status).toBe('in_progress')
    expect((await updateTaskStatus({ ...mine, status: 'completed' })).status).toBe('completed')
    expect((await listOpenMyTasks(people.asha)).map((t) => t.id)).not.toContain(task.id)
    // Ravi hasn't finished, so the task is still open for him and for the board.
    await as('ravi')
    expect((await listOpenMyTasks(people.ravi)).find((t) => t.id === task.id)?.status).toBe(
      'pending'
    )
    expect(
      (await root.from('tasks').select('status').eq('id', task.id).single()).data?.status
    ).toBe('in_progress')
  })

  it("sees everyone's progress on their task, but changes only their own", async () => {
    await as('ravi')
    const seen = await getTask(task.id)
    expect(
      seen?.assignees.map(({ id, status, editable }) => [id, status, editable]).sort()
    ).toEqual(
      [
        [people.asha, 'completed', false],
        [people.ravi, 'pending', true]
      ].sort()
    )
    expect(seen?.assignees.every((a) => a.full_name && a.email === null)).toBe(true)
    await rejectsWith(
      updateTaskStatus({ taskId: task.id, userId: people.asha, status: 'blocked' }),
      'errDenied'
    )
  })

  it("cannot change the status of someone else's task", async () => {
    await as('meena')
    await rejectsWith(
      updateTaskStatus({ taskId: task.id, userId: people.meena, status: 'blocked' }),
      'errDenied'
    )
    expect(await getTask(task.id)).toBeNull()
  })

  it('cannot write the whole task status, title, description or due date', async () => {
    const asha = await as('asha')
    for (const patch of [
      { title: 'Renamed' },
      { description: 'Changed' },
      { due_date: new Date().toISOString() },
      { status: 'completed' }
    ] as const) {
      const r = await asha
        .from('tasks')
        .update(patch as never)
        .eq('id', task.id)
        .select()
      expect(r.error ?? r.data).toSatisfy((x) => !Array.isArray(x) || x.length === 0)
    }
    const { data } = await root
      .from('tasks')
      .select('title, description')
      .eq('id', task.id)
      .single()
    expect(data).toEqual({ title: 'Restock shelf B', description: 'Count first, then order.' })
  })

  it('cannot change who the task is given to', async () => {
    const asha = await as('asha')
    expect(
      (await asha.from('task_assignments').insert({ task_id: task.id, user_id: people.meena }))
        .error
    ).not.toBeNull()
    expect(
      (await asha.from('task_assignments').delete().eq('task_id', task.id).select()).data
    ).toEqual([])
    expect((await asha.from('tasks').delete().eq('id', task.id).select()).data).toEqual([])
    const { count } = await root
      .from('task_assignments')
      .select('*', { count: 'exact', head: true })
      .eq('task_id', task.id)
    expect(count).toBe(2)
  })
})

describe('manager', () => {
  let own: Task

  it('picks from staff only and creates tasks for them', async () => {
    await as('boss')
    expect((await listPeople('manager')).map((p) => p.id).sort()).toEqual(
      expect.arrayContaining([people.asha, people.ravi, people.meena])
    )
    expect((await listPeople('manager')).map((p) => p.id)).not.toContain(people.admin)
    own = await createTask({
      title: 'Check the till',
      dueDate: new Date(Date.now() + 864e5).toISOString(),
      userIds: [people.meena]
    })
    expect(own.created_by).toBe(people.boss)
  })

  it('cannot task an admin', async () => {
    await as('boss')
    await rejectsWith(
      createTask({ title: 'Nope', dueDate: new Date().toISOString(), userIds: [people.admin] }),
      'errTaskStaffOnly'
    )
  })

  it('sees only the tasks they created on the board', async () => {
    const boss = await as('boss')
    expect(
      (await listOpenBoardTasks({ id: people.boss, role: 'manager' })).map((t) => t.id)
    ).toEqual([own.id])
    expect((await boss.from('tasks').select('id').eq('id', task.id)).data).toEqual([])
    await rejectsWith(
      updateTaskStatus({ taskId: task.id, userId: people.ravi, status: 'blocked' }),
      'errDenied'
    )
  })

  it('never reads staff daily updates', async () => {
    const boss = await as('boss')
    expect(
      (await boss.from('daily_statuses').select('id').neq('user_id', people.boss)).data
    ).toEqual([])
  })

  it('is seen by the admin and the assignee', async () => {
    await as('admin')
    expect(
      (await listOpenBoardTasks({ id: people.admin, role: 'admin' })).map((t) => t.id)
    ).toContain(own.id)
    await as('meena')
    expect(
      (await updateTaskStatus({ taskId: own.id, userId: people.meena, status: 'in_progress' }))
        .status
    ).toBe('in_progress')
  })

  it("updates a person's status on a task they created", async () => {
    await as('boss')
    expect(
      (await updateTaskStatus({ taskId: own.id, userId: people.meena, status: 'blocked' })).status
    ).toBe('blocked')
    expect((await getTask(own.id))?.assignees[0]).toMatchObject({
      status: 'blocked',
      editable: true
    })
  })
})

describe('shared progress', () => {
  let shared: Task
  const events = async (): Promise<string[]> =>
    (
      (await root
        .from('notifications')
        .select('event')
        .eq('target_id', shared.id)
        .eq('user_id', people.admin)
        .order('id')
        .then((r) => r.data)) as { event: string }[]
    ).map((n) => n.event)

  beforeAll(async () => {
    await as('admin')
    shared = await createTask({
      title: `Together ${run}`,
      dueDate: new Date(Date.now() + 864e5).toISOString(),
      userIds: [people.asha, people.ravi, people.meena]
    })
  })

  it('tells the admin about each change, then once that everyone has finished', async () => {
    await as('asha')
    await updateTaskStatus({ taskId: shared.id, userId: people.asha, status: 'completed' })
    expect(await events()).toEqual(['taskStatus'])
    await as('ravi')
    await updateTaskStatus({ taskId: shared.id, userId: people.ravi, status: 'blocked' })
    expect(
      (await root.from('tasks').select('status').eq('id', shared.id).single()).data?.status
    ).toBe('blocked')
    await updateTaskStatus({ taskId: shared.id, userId: people.ravi, status: 'completed' })
    // The last two finish at the same moment: whichever commits second still completes the task.
    const meena = await as('meena')
    const ravi = await as('ravi')
    await updateTaskStatus({ taskId: shared.id, userId: people.ravi, status: 'in_progress' })
    const res = await Promise.all([
      meena
        .from('task_assignments')
        .update({ status: 'completed' })
        .eq('task_id', shared.id)
        .eq('user_id', people.meena)
        .select(),
      ravi
        .from('task_assignments')
        .update({ status: 'completed' })
        .eq('task_id', shared.id)
        .eq('user_id', people.ravi)
        .select()
    ])
    expect(res.map((r) => r.error)).toEqual([null, null])
    expect(
      (await root.from('tasks').select('status').eq('id', shared.id).single()).data?.status
    ).toBe('completed')
    expect((await events()).at(-1)).toBe('taskDone')
    expect((await events()).filter((e) => e === 'taskDone')).toHaveLength(1)
  })

  it('reminds only the people who have not started', async () => {
    const late = await createTaskAs('admin', [people.asha, people.ravi])
    await root
      .from('task_assignments')
      .update({ assigned_at: new Date(Date.now() - 36e5).toISOString() } as never)
      .eq('task_id', late)
    await as('asha')
    await updateTaskStatus({ taskId: late, userId: people.asha, status: 'in_progress' })
    const noon = new Date('2026-11-04T06:30:00Z').toISOString()
    expect(
      (await root.rpc('remind_pending_tasks' as never, { p_at: noon } as never)).error
    ).toBeNull()
    const { data } = await root
      .from('notifications')
      .select('user_id')
      .eq('target_id', late)
      .eq('event', 'taskReminder')
    expect((data as { user_id: string }[]).map((n) => n.user_id)).toEqual([people.ravi])
  })
})

const createTaskAs = async (who: Who, userIds: string[]): Promise<string> => {
  await as(who)
  return (
    await createTask({
      title: `Remind ${run}`,
      dueDate: new Date(Date.now() + 864e5).toISOString(),
      userIds
    })
  ).id
}

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
          // Only this task: Realtime can still deliver the listener's own task from the test before.
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tasks' }, (p) => {
            if ((p.new as Task).id === task.id) got.push((p.new as Task).status)
          })
          .subscribe((s) =>
            s === 'SUBSCRIBED'
              ? ok()
              : s === 'CHANNEL_ERROR' || s === 'TIMED_OUT'
                ? bad(new Error(s))
                : undefined
          )
      )
      return got
    }
    const ravi = await listen('ravi')
    const meena = await listen('meena')
    await as('admin')
    await updateTaskStatus({ taskId: task.id, userId: people.ravi, status: 'blocked' })
    await expect.poll(() => ravi, { timeout: 10_000 }).toContain('blocked')
    // Give a leaked event time to arrive before asserting it never did.
    await new Promise((r) => setTimeout(r, 1500))
    expect(meena).toEqual([])
    await Promise.all(clients.map((c) => c.removeAllChannels()))
  })
})
