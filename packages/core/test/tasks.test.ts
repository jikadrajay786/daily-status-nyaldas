import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Task, TaskStatus } from '../src/database.types'
import {
  byUrgency,
  canAssign,
  createTask,
  createTaskSchema,
  inView,
  isOverdue,
  lateDays,
  latestById,
  listDoneBoardTasks,
  listDoneMyTasks,
  listOpenBoardTasks,
  listOpenMyTasks,
  listPeople,
  managesTask,
  matchesFilter,
  updateTaskStatus,
  NEXT_STEPS,
  TASK_STATUSES,
  taskGroup,
  taskRollup
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

// One of a person's assignments, as read for their own list: their status, with the task inside.
const mine = (o: object = {}, status = 'pending'): object => ({
  status,
  updated_at: '2026-10-24T05:00:00Z',
  task: row(o)
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
  it("updates only that person's own status on the task", async () => {
    next = { data: [{ task_id: TASK, user_id: RAVI, status: 'in_progress' }], error: null }
    await updateTaskStatus({ taskId: TASK, userId: RAVI, status: 'in_progress' })
    expect(calls).toEqual([
      ['from', ['task_assignments']],
      ['update', [{ status: 'in_progress' }]],
      ['eq', ['task_id', TASK]],
      ['eq', ['user_id', RAVI]],
      ['select', []]
    ])
  })

  it('treats zero updated rows (RLS hid the person from the caller) as refused', async () => {
    next = { data: [], error: null }
    await expect(
      updateTaskStatus({ taskId: TASK, userId: RAVI, status: 'completed' })
    ).rejects.toSatisfy((e) => errMsg(e) === 'errDenied')
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
      updateTaskStatus({ taskId: TASK, userId: RAVI, status: 'done' as 'completed' })
    ).rejects.toThrow()
    expect(calls).toEqual([])
  })
})

describe('whole-task status', () => {
  it('is blocked if anyone is, completed once everyone is, started once anyone has', () => {
    expect(taskRollup(['completed', 'blocked', 'pending'])).toBe('blocked')
    expect(taskRollup(['completed', 'completed'])).toBe('completed')
    expect(taskRollup(['completed', 'pending'])).toBe('in_progress')
    expect(taskRollup(['pending', 'in_progress'])).toBe('in_progress')
    expect(taskRollup(['pending', 'pending'])).toBe('pending')
    expect(taskRollup([])).toBe('pending')
  })
})

describe('reading tasks', () => {
  it("reads a user's unfinished tasks through their own assignments, soonest due first", async () => {
    next = {
      data: [
        mine({ id: 'b', due_date: '2026-11-02T00:00:00Z' }),
        mine({ id: 'a', due_date: '2026-11-01T00:00:00Z' })
      ],
      error: null
    }
    expect((await listOpenMyTasks(ASHA)).map((t) => t.id)).toEqual(['a', 'b'])
    expect(calls).toContainEqual(['from', ['task_assignments']])
    expect(calls).toContainEqual(['eq', ['user_id', ASHA]])
    expect(calls).toContainEqual(['neq', ['status', 'completed']])
  })

  it("shows a person's own progress, not the whole task's", async () => {
    next = { data: [mine({ status: 'blocked' }, 'in_progress')], error: null }
    expect((await listOpenMyTasks(ASHA))[0]).toMatchObject({ id: TASK, status: 'in_progress' })
  })

  it('keeps asking until the unfinished tasks run out, past the 1000-row cap', async () => {
    const full = Array.from({ length: 1000 }, (_, i) => mine({ id: `t${i}` }))
    next = { data: full, error: null }
    const pending = listOpenMyTasks(ASHA)
    await vi.waitFor(() => expect(calls.filter(([m]) => m === 'range').length).toBe(1))
    next = { data: [mine({ id: 'last' })], error: null }
    expect(await pending).toHaveLength(1001)
    expect(calls).toContainEqual(['range', [1000, 1999]])
  })

  it('pages finished tasks newest first and says when more are left', async () => {
    next = { data: [mine({ id: 'a' }, 'completed')], error: null, count: 40 } as Res
    expect(await listDoneMyTasks(ASHA, { search: '', person: '', limit: 25 })).toMatchObject({
      total: 40,
      more: true
    })
    expect(calls).toContainEqual(['eq', ['status', 'completed']])
    expect(calls).toContainEqual(['order', ['updated_at', { ascending: false }]])
    expect(calls).toContainEqual(['range', [0, 24]])
  })

  it('searches and narrows finished tasks on the server without injecting filter syntax', async () => {
    next = { data: [], error: null, count: 0 } as Res
    const page = await listDoneBoardTasks(
      { id: RAVI, role: 'admin' },
      { search: 'a%,(b', person: ASHA, limit: 25 }
    )
    expect(page).toEqual({ rows: [], total: 0, more: false })
    expect(calls).toContainEqual(['ilike', ['title', '%a   b%']])
    expect(calls).toContainEqual(['eq', ['who.user_id', ASHA]])
    expect(calls).toContainEqual(['not', ['who', 'is', null]])
  })

  describe('quick views', () => {
    const now = new Date('2026-10-31T10:00:00+05:30')
    const at = (
      due_date: string,
      status: TaskStatus = 'pending'
    ): Pick<Task, 'due_date' | 'status'> => ({
      due_date,
      status
    })
    it('sorts unfinished tasks by when they are due', () => {
      const late = at('2026-10-30T23:59:59+05:30')
      const tonight = at('2026-10-31T23:59:59+05:30')
      const lastDay = at('2026-11-06T23:59:59+05:30')
      const tooFar = at('2026-11-07T00:00:00+05:30')
      expect(inView(late, 'overdue', now)).toBe(true)
      expect(inView(tonight, 'overdue', now)).toBe(false)
      expect(inView(tonight, 'today', now)).toBe(true)
      expect(inView(late, 'today', now)).toBe(false)
      expect(inView(tonight, 'week', now)).toBe(true)
      expect(inView(lastDay, 'week', now)).toBe(true)
      expect(inView(tooFar, 'week', now)).toBe(false)
      expect(inView(late, 'week', now)).toBe(false)
    })
    it('keeps finished tasks out of the due-date views', () => {
      const done = at('2026-10-31T23:59:59+05:30', 'completed')
      for (const v of ['overdue', 'today', 'week'] as const)
        expect(inView(done, v, now)).toBe(false)
      expect(inView(done, 'completed', now)).toBe(true)
      expect(inView(done, 'all', now)).toBe(true)
      expect(inView(done, 'pending', now)).toBe(false)
    })
    it('picks only the matching status', () => {
      expect(inView(at('2026-11-01T00:00:00Z', 'blocked'), 'blocked', now)).toBe(true)
      expect(inView(at('2026-11-01T00:00:00Z'), 'blocked', now)).toBe(false)
    })
  })

  it('matches search by title in any case, and person by assignee', () => {
    const task = { title: 'Send Stock Report', assignees: [{ id: ASHA }] }
    expect(matchesFilter(task, { search: 'stock', person: '' })).toBe(true)
    expect(matchesFilter(task, { search: '  ', person: ASHA })).toBe(true)
    expect(matchesFilter(task, { search: 'invoice', person: '' })).toBe(false)
    expect(matchesFilter(task, { search: '', person: RAVI })).toBe(false)
    expect(matchesFilter({ title: 'x' }, { search: '', person: RAVI })).toBe(false)
  })

  it('keeps the newest copy of a task caught in both lists, in its first place', () => {
    const rows = [
      { id: 'a', updated_at: '2026-10-31T10:00:00Z' },
      { id: 'b', updated_at: '2026-10-31T10:00:00Z' },
      { id: 'a', updated_at: '2026-10-31T11:00:00Z' }
    ]
    expect(latestById(rows)).toEqual([rows[2], rows[1]])
    expect(latestById([...rows].reverse())[0]).toEqual(rows[2])
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

  it('offers managers staff only (RLS narrows it for store and agency managers), admins all but admins', async () => {
    next = { data: [], error: null }
    for (const role of ['manager', 'store_manager', 'agency_manager'] as const) {
      await listPeople(role)
      expect(calls).toContainEqual(['rpc', ['staff_names']])
      calls.length = 0
    }
    await listPeople('admin')
    expect(calls).toContainEqual(['neq', ['role', 'admin']])
  })

  it('names everyone on a task with their own progress, in one request for the whole list', async () => {
    next = {
      // The stand-in answers the task query and the members request with the same row.
      data: [
        {
          id: TASK,
          task_id: TASK,
          user_id: ASHA,
          full_name: 'Asha',
          email: null,
          status: 'completed',
          editable: true
        }
      ],
      error: null
    }
    const [task] = await listOpenBoardTasks({ id: RAVI, role: 'manager' })
    expect(calls).toContainEqual(['rpc', ['task_members', { p_tasks: [TASK] }]])
    expect(task?.assignees).toEqual([
      expect.objectContaining({ id: ASHA, full_name: 'Asha', status: 'completed', editable: true })
    ])
    next = { data: [], error: null }
    calls.length = 0
    await listOpenBoardTasks({ id: RAVI, role: 'admin' })
    expect(calls.some(([m]) => m === 'rpc')).toBe(false)
  })

  it("filters a manager's board to their own tasks, never an admin's", async () => {
    next = { data: [], error: null }
    await listOpenBoardTasks({ id: ASHA, role: 'manager' })
    expect(calls).toContainEqual(['eq', ['created_by', ASHA]])
    calls.length = 0
    await listOpenBoardTasks({ id: RAVI, role: 'admin' })
    expect(calls.some(([k]) => k === 'eq')).toBe(false)
  })
})

describe('task urgency', () => {
  const now = new Date('2026-11-01T12:00:00+05:30')
  const task = (
    due_date: string,
    status: TaskStatus = 'pending'
  ): Pick<Task, 'due_date' | 'status'> => ({
    due_date,
    status
  })

  it('counts whole days late, and 0 for earlier today', () => {
    expect(lateDays('2026-10-29T18:00:00+05:30', now)).toBe(3)
    expect(lateDays('2026-11-01T09:00:00+05:30', now)).toBe(0)
  })

  it('groups tasks by what needs doing first', () => {
    expect(taskGroup(task('2026-10-29T18:00:00+05:30'), now)).toBe('overdue')
    expect(taskGroup(task('2026-11-01T18:00:00+05:30'), now)).toBe('today')
    expect(taskGroup(task('2026-11-02T18:00:00+05:30'), now)).toBe('later')
    expect(taskGroup(task('2026-10-29T18:00:00+05:30', 'completed'), now)).toBe('completed')
  })

  it('sorts today first, then late, then soonest due, finished last', () => {
    const rows = [
      task('2026-11-05T18:00:00+05:30'),
      task('2026-10-20T18:00:00+05:30', 'completed'),
      task('2026-11-01T18:00:00+05:30'),
      task('2026-11-03T18:00:00+05:30'),
      task('2026-10-29T18:00:00+05:30', 'blocked')
    ]
    expect(byUrgency(rows, now).map((t) => t.due_date.slice(5, 10))).toEqual([
      '11-01',
      '10-29',
      '11-03',
      '11-05',
      '10-20'
    ])
  })

  it('always offers a way forward from every status', () => {
    TASK_STATUSES.forEach((s) => {
      expect(NEXT_STEPS[s].length).toBeGreaterThan(0)
      expect(NEXT_STEPS[s].every(([to]) => to !== s)).toBe(true)
    })
  })
})
