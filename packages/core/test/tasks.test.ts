import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  canAssign,
  createTask,
  createTaskSchema,
  isOverdue,
  listBoardTasks,
  listMyTasks,
  listPeople,
  managesTask,
  updateTaskStatus
} from '../src/taskService'
import { errMsg } from '../src/useQuery'

type Res = { data: unknown; error: unknown }
const calls: [string, unknown[]][] = []
let next: Res = { data: null, error: null }

// A PostgREST builder stand-in: every method records itself and chains; awaiting it yields `next`.
const chain: object = new Proxy(
  {},
  {
    get: (_, k) =>
      k === 'then'
        ? (ok: (r: Res) => unknown, bad: (e: unknown) => unknown) =>
            Promise.resolve(next).then(ok, bad)
        : (...args: unknown[]) => (calls.push([String(k), args]), chain)
  }
)

vi.mock('../src/supabase', async (orig) => ({
  ...(await orig<typeof import('../src/supabase')>()),
  db: () => ({
    from: (t: string) => (calls.push(['from', [t]]), chain),
    rpc: (...args: unknown[]) => (calls.push(['rpc', args]), chain)
  })
}))

const ASHA = '4f1c2a9e-8b3d-4c5e-9f6a-1b2c3d4e5f60'
const RAVI = '7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d'
const TASK = '0b1c2d3e-4f5a-4b6c-9d7e-8f9a0b1c2d3e'
const row = (o: object = {}): object => ({
  id: TASK,
  title: 'Count stock',
  description: null,
  due_date: '2026-10-30T18:29:59.000Z',
  status: 'pending',
  created_by: ASHA,
  created_at: '2026-10-23T05:00:00Z',
  updated_at: '2026-10-23T05:00:00Z',
  ...o
})

beforeEach(() => {
  calls.length = 0
  next = { data: null, error: null }
})

describe('creating tasks', () => {
  it('assigns one task to several people in a single create_task call', async () => {
    next = { data: row(), error: null }
    const task = await createTask({
      title: '  Count stock ',
      description: '',
      dueDate: '2026-10-30T18:29:59.000Z',
      userIds: [ASHA, RAVI, ASHA]
    })
    expect(task).toMatchObject({ id: TASK })
    expect(calls.filter(([m]) => m === 'rpc')).toEqual([
      [
        'rpc',
        [
          'create_task',
          {
            p_title: 'Count stock',
            p_description: null,
            p_due_date: '2026-10-30T18:29:59.000Z',
            p_user_ids: [ASHA, RAVI]
          }
        ]
      ]
    ])
  })

  it('rejects a task with nobody, no name or no due date before calling the server', async () => {
    const base = { title: 'X', dueDate: '2026-10-30T18:29:59Z', userIds: [ASHA] }
    await expect(createTask({ ...base, userIds: [] })).rejects.toSatisfy(
      (e) => errMsg(e) === 'errTaskPeople'
    )
    await expect(createTask({ ...base, title: '   ' })).rejects.toSatisfy(
      (e) => errMsg(e) === 'errTaskTitle'
    )
    await expect(createTask({ ...base, dueDate: '' })).rejects.toSatisfy(
      (e) => errMsg(e) === 'errTaskDue'
    )
    expect(calls).toEqual([])
  })

  it('surfaces a non-admin create as a permission error', async () => {
    next = {
      data: null,
      error: {
        code: '42501',
        message: 'new row violates row-level security policy for table "tasks"'
      }
    }
    await expect(
      createTask({ title: 'X', dueDate: '2026-10-30T18:29:59Z', userIds: [ASHA] })
    ).rejects.toSatisfy((e) => errMsg(e) === 'errDenied')
  })

  it('accepts dates with an offset and trims the description', () => {
    const res = createTaskSchema.parse({
      title: 'X',
      description: '  ok ',
      dueDate: '2026-10-30T23:59:59+05:30',
      userIds: [ASHA]
    })
    expect(res.description).toBe('ok')
  })
})

describe('updating task status', () => {
  it('updates only the status column of that task', async () => {
    next = { data: [row({ status: 'in_progress' })], error: null }
    await updateTaskStatus({ taskId: TASK, status: 'in_progress' })
    expect(calls).toEqual([
      ['from', ['tasks']],
      ['update', [{ status: 'in_progress' }]],
      ['eq', ['id', TASK]],
      ['select', []]
    ])
  })

  it('treats zero updated rows (RLS hid the task from a non-assignee) as refused', async () => {
    next = { data: [], error: null }
    await expect(updateTaskStatus({ taskId: TASK, status: 'completed' })).rejects.toSatisfy(
      (e) => errMsg(e) === 'errDenied'
    )
  })

  it('maps the guard trigger rejecting a non-status edit to a permission error', () => {
    expect(errMsg({ code: '42501', message: 'only the task status can change' })).toBe('errDenied')
  })

  it('explains when a task is given to an admin', () => {
    expect(errMsg({ code: '23514', message: 'tasks can only be given to staff' })).toBe(
      'errTaskStaffOnly'
    )
  })

  it('rejects unknown statuses before calling the server', async () => {
    await expect(
      updateTaskStatus({ taskId: TASK, status: 'done' as 'completed' })
    ).rejects.toThrow()
    expect(calls).toEqual([])
  })
})

describe('reading tasks', () => {
  it("lists the user's own assignments, soonest due first", async () => {
    next = {
      data: [
        { task: row({ id: 'b', due_date: '2026-11-05T00:00:00Z' }) },
        { task: null },
        { task: row({ id: 'a', due_date: '2026-10-25T00:00:00Z' }) }
      ],
      error: null
    }
    expect((await listMyTasks(ASHA)).map((t) => t.id)).toEqual(['a', 'b'])
    expect(calls).toContainEqual(['eq', ['user_id', ASHA]])
  })

  it('flags unfinished tasks past their due time as overdue', () => {
    const now = new Date('2026-10-31T00:00:00Z')
    expect(isOverdue({ due_date: '2026-10-30T18:29:59Z', status: 'in_progress' }, now)).toBe(true)
    expect(isOverdue({ due_date: '2026-10-30T18:29:59Z', status: 'completed' }, now)).toBe(false)
    expect(isOverdue({ due_date: '2026-11-01T00:00:00Z', status: 'pending' }, now)).toBe(false)
  })
})

describe('roles', () => {
  it('lets admins and managers hand out tasks, not staff', () => {
    expect([canAssign('admin'), canAssign('manager'), canAssign('user')]).toEqual([
      true,
      true,
      false
    ])
  })

  it('gives managers only the tasks they created', () => {
    expect(managesTask({ created_by: ASHA }, { id: RAVI, role: 'admin' })).toBe(true)
    expect(managesTask({ created_by: ASHA }, { id: ASHA, role: 'manager' })).toBe(true)
    expect(managesTask({ created_by: ASHA }, { id: RAVI, role: 'manager' })).toBe(false)
    expect(managesTask({ created_by: ASHA }, { id: ASHA, role: 'user' })).toBe(false)
  })

  it('offers managers staff only, admins staff and managers', async () => {
    next = { data: [], error: null }
    await listPeople('manager')
    expect(calls).toContainEqual(['in', ['role', ['user']]])
    calls.length = 0
    await listPeople('admin')
    expect(calls).toContainEqual(['in', ['role', ['user', 'manager']]])
  })

  it("filters a manager's board to their own tasks, never an admin's", async () => {
    next = { data: [], error: null }
    await listBoardTasks({ id: ASHA, role: 'manager' })
    expect(calls).toContainEqual(['eq', ['created_by', ASHA]])
    calls.length = 0
    await listBoardTasks({ id: RAVI, role: 'admin' })
    expect(calls.some(([k]) => k === 'eq')).toBe(false)
  })
})
