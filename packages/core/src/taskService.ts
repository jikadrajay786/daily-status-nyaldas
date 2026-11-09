import { z } from 'zod'
import type {
  Database,
  Profile,
  Role,
  Task,
  TaskAssignment,
  TaskMember,
  TaskStatus
} from './database.types'
import { isLead, type Tone } from './format'
import type { Key } from './i18n'
import { changed } from './statusService'
import { collect, db, pageOf, searchTerm, unwrap, type Page } from './supabase'
import { addDays, daysBetween, ymd } from './workdays'

export const TASK_STATUSES = [
  'pending',
  'in_progress',
  'completed',
  'blocked'
] as const satisfies readonly TaskStatus[]

export const STATUS_KEY: Record<TaskStatus, Key> = {
  pending: 'tsPending',
  in_progress: 'tsInProgress',
  completed: 'tsCompleted',
  blocked: 'tsBlocked'
}

export const STATUS_TONE: Record<TaskStatus, Tone> = {
  pending: 'idle',
  in_progress: 'info',
  completed: 'ok',
  blocked: 'bad'
}

export const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((d) => d || null),
  dueDate: z.iso.datetime({ offset: true }),
  userIds: z
    .array(z.uuid())
    .min(1)
    .transform((ids) => [...new Set(ids)])
})

export const updateTaskStatusSchema = z.object({
  taskId: z.uuid(),
  userId: z.uuid(),
  status: z.enum(TASK_STATUSES)
})

export type CreateTaskInput = z.input<typeof createTaskSchema>
export type UpdateTaskStatusInput = z.input<typeof updateTaskStatusSchema>
export type Assignee = Pick<Profile, 'id' | 'full_name' | 'email'>
export type Member = Assignee & Pick<TaskMember, 'status' | 'updated_at' | 'editable'>
export type SharedTask = Task & { assignees: Assignee[] }
export type BoardTask = Task & { assignees: Member[] }

// The whole task's status from everyone's own; task_rollup() in SQL decides the same way.
export const taskRollup = (statuses: readonly TaskStatus[]): TaskStatus =>
  statuses.includes('blocked')
    ? 'blocked'
    : statuses.length && statuses.every((s) => s === 'completed')
      ? 'completed'
      : statuses.some((s) => s !== 'pending')
        ? 'in_progress'
        : 'pending'
export const doneCount = (t: Pick<BoardTask, 'assignees'>): number =>
  t.assignees.filter((a) => a.status === 'completed').length

// errMsg looks up `code`, so a bad field surfaces as a translated message rather than Zod's JSON.
const parse = <S extends z.ZodType>(schema: S, input: unknown): z.output<S> => {
  const res = schema.safeParse(input)
  if (res.success) return res.data
  throw Object.assign(new Error('invalid task input'), {
    code: `task_${String(res.error.issues[0]?.path[0])}`
  })
}

// A picked calendar day is due by the end of that day, in the admin's timezone.
export const dueFromDay = (day: string): string => new Date(`${day}T23:59:59`).toISOString()
export const dueDay = (due: string): string => ymd(new Date(due))
export const isOverdue = (t: Pick<Task, 'due_date' | 'status'>, now = new Date()): boolean =>
  t.status !== 'completed' && new Date(t.due_date) < now

// Whole days past the due date; 0 when it was due earlier today.
export const lateDays = (due: string, now = new Date()): number =>
  daysBetween(dueDay(due), ymd(now)).length - 1

// The likely next steps a short card offers; every status stays available in the task's details.
export const NEXT_STEPS: Record<TaskStatus, readonly (readonly [TaskStatus, Key])[]> = {
  pending: [
    ['in_progress', 'taskStart'],
    ['completed', 'tsCompleted']
  ],
  in_progress: [
    ['completed', 'tsCompleted'],
    ['blocked', 'tsBlocked']
  ],
  blocked: [
    ['in_progress', 'taskContinue'],
    ['completed', 'tsCompleted']
  ],
  completed: [['in_progress', 'taskReopen']]
}

// Today's work leads: a long tail of old late tasks would otherwise push it out of sight.
export const TASK_GROUPS = ['today', 'overdue', 'later', 'completed'] as const
export type TaskGroup = (typeof TASK_GROUPS)[number]
export const GROUP_KEY: Record<Exclude<TaskGroup, 'completed'>, Key> = {
  overdue: 'taskOverdue',
  today: 'viewToday',
  later: 'taskLater'
}
export const taskGroup = (t: Pick<Task, 'due_date' | 'status'>, now = new Date()): TaskGroup =>
  t.status === 'completed'
    ? 'completed'
    : isOverdue(t, now)
      ? 'overdue'
      : dueDay(t.due_date) === ymd(now)
        ? 'today'
        : 'later'

// Due today, then late, then the rest, soonest due first within a group; finished tasks keep their newest-first order.
export const byUrgency = <T extends Pick<Task, 'due_date' | 'status'>>(
  rows: T[],
  now = new Date()
): T[] =>
  rows
    .map((t) => [t, TASK_GROUPS.indexOf(taskGroup(t, now))] as const)
    .sort(
      ([a, g], [b, h]) =>
        g - h || (a.status === 'completed' ? 0 : a.due_date.localeCompare(b.due_date))
    )
    .map(([t]) => t)

export const QUICK_VIEWS = ['all', 'today', 'overdue', 'week'] as const
export const TASK_VIEWS = [...QUICK_VIEWS, ...TASK_STATUSES] as const
export type TaskView = (typeof TASK_VIEWS)[number]
export type TaskFilter = { view: TaskView; search: string; person: string }

export const VIEW_KEY: Record<TaskView, Key> = {
  ...STATUS_KEY,
  all: 'allTasks',
  overdue: 'taskOverdue',
  today: 'viewToday',
  week: 'viewWeek'
}

// Overdue, today and the next 7 days are about work still to do, so finished tasks stay out of them.
export const inView = (
  t: Pick<Task, 'due_date' | 'status'>,
  view: TaskView,
  now = new Date()
): boolean => {
  if (view === 'all' || view === t.status) return true
  if (t.status === 'completed' || !(QUICK_VIEWS as readonly string[]).includes(view)) return false
  const [day, start] = [dueDay(t.due_date), ymd(now)]
  return view === 'overdue'
    ? isOverdue(t, now)
    : view === 'today'
      ? day === start
      : day >= start && day <= addDays(start, 6)
}

export const matchesFilter = (
  t: Pick<Task, 'title'> & { assignees?: Pick<Assignee, 'id'>[] },
  { search, person }: Pick<TaskFilter, 'search' | 'person'>
): boolean =>
  t.title.toLowerCase().includes(searchTerm(search).toLowerCase()) &&
  (!person || !!t.assignees?.some((a) => a.id === person))

// Two lists refetch separately, so a task that just changed status can briefly be in both.
export const latestById = <T extends Pick<Task, 'id' | 'updated_at'>>(rows: T[]): T[] => [
  ...rows
    .reduce((m, r) => {
      const seen = m.get(r.id)
      return seen && seen.updated_at > r.updated_at ? m : m.set(r.id, r)
    }, new Map<string, T>())
    .values()
]

type Me = Pick<Profile, 'id' | 'role'>

// Admins and managers hand out tasks; a manager manages only the ones they created.
export const canAssign = (role: Role): boolean => role !== 'user'
export const managesTask = (task: Pick<Task, 'created_by'>, me: Me): boolean =>
  me.role === 'admin' || (me.role !== 'user' && task.created_by === me.id)

// Admins give tasks to anyone but admins; managers to all staff; store and agency managers to their own staff.
export const listPeople = async (role: Role): Promise<Assignee[]> =>
  role === 'admin'
    ? (
        await collect((from, to) =>
          db()
            .from('profiles')
            .select('id, full_name, email')
            .neq('role', 'admin')
            .order('full_name')
            .order('id')
            .range(from, to)
        )
      ).rows
    : staffNames()

// Managers can't read staff profiles, which hold emails; they get names only.
const staffNames = async (): Promise<Assignee[]> =>
  (
    await collect((from, to) =>
      db().rpc('staff_names').order('full_name').order('id').range(from, to)
    )
  ).rows.map((p) => ({ ...p, email: null }))

// `who` is only for filtering by person: everyone on a task comes from task_members, which names them for any viewer.
const BOARD = '*, who:task_assignments(user_id)'
const MINE = 'status, updated_at, task:tasks!inner(*)'
export type DoneQuery = { search: string; person: string; limit: number; offset: number }

const withAssignees = async <T extends Task>(
  rows: T[]
): Promise<(T & { assignees: Member[] })[]> => {
  const members = rows.length
    ? unwrap(await db().rpc('task_members', { p_tasks: rows.map((r) => r.id) }))
    : []
  return rows.map((t) => ({
    ...t,
    assignees: members
      .filter((m) => m.task_id === t.id)
      .map(({ user_id, full_name, email, status, updated_at, editable }) => ({
        id: user_id,
        full_name,
        email,
        status,
        updated_at,
        editable
      }))
  }))
}

// RLS shows a store or agency manager their staff's tasks, which belong on the board too, and any given to them, which don't.
const onBoard = <T extends Pick<BoardTask, 'created_by' | 'assignees'>>(me: Me, rows: T[]): T[] =>
  isLead(me.role)
    ? rows.filter((t) => t.created_by === me.id || t.assignees.some((a) => a.id !== me.id))
    : rows

// Unfinished work always loads in full, so nothing active can fall off the end of the board.
// A manager can also read tasks given to them, so their board filters to the ones they created.
export const listOpenBoardTasks = async (me: Me): Promise<BoardTask[]> =>
  onBoard(
    me,
    await withAssignees(
      (
        await collect((from, to) => {
          const req = db().from('tasks').select('*').neq('status', 'completed')
          return (me.role === 'manager' ? req.eq('created_by', me.id) : req)
            .order('due_date')
            .order('id')
            .range(from, to)
        })
      ).rows
    )
  )

// updated_at is when it was finished: the last person to finish completes the task.
export const listDoneBoardTasks = async (
  me: Me,
  { search, person, limit, offset }: DoneQuery
): Promise<Page<BoardTask>> => {
  const q = searchTerm(search)
  const { rows, total, more } = await pageOf(
    (from, to) => {
      let req = db().from('tasks').select(BOARD, { count: 'exact' }).eq('status', 'completed')
      if (me.role === 'manager') req = req.eq('created_by', me.id)
      if (q) req = req.ilike('title', `%${q}%`)
      if (person) req = req.eq('who.user_id', person).not('who', 'is', null)
      return req.order('updated_at', { ascending: false }).order('id').range(from, to)
    },
    limit,
    offset
  )
  const kept = onBoard(me, await withAssignees(rows))
  return { rows: kept, total: total - (rows.length - kept.length), more }
}

// Everyone on the task with their own progress, for anyone who can see it.
export const getTask = async (id: string): Promise<BoardTask | null> => {
  const row = unwrap(await db().from('tasks').select('*').eq('id', id).maybeSingle())
  return row ? ((await withAssignees([row]))[0] ?? null) : null
}

// A person's tasks carry their own progress, not the whole task's.
const mine = ({
  status,
  updated_at,
  task
}: {
  status: Task['status']
  updated_at: string
  task: Task
}): Task => ({ ...task, status, updated_at })

// Through the user's own assignments: admins and managers read more tasks, but this list is only theirs.
export const listOpenMyTasks = async (userId: string): Promise<Task[]> =>
  (
    await collect((from, to) =>
      db()
        .from('task_assignments')
        .select(MINE)
        .eq('user_id', userId)
        .neq('status', 'completed')
        .order('task_id')
        .range(from, to)
    )
  ).rows
    .map(mine)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))

export const listDoneMyTasks = async (
  userId: string,
  { search, limit, offset }: DoneQuery
): Promise<Page<Task>> => {
  const q = searchTerm(search)
  const page = await pageOf(
    (from, to) => {
      const req = db()
        .from('task_assignments')
        .select(MINE, { count: 'exact' })
        .eq('user_id', userId)
        .eq('status', 'completed')
      return (q ? req.ilike('task.title', `%${q}%`) : req)
        .order('updated_at', { ascending: false })
        .order('task_id')
        .range(from, to)
    },
    limit,
    offset
  )
  return { ...page, rows: page.rows.map(mine) }
}

// The phone's board: the server filters and pages, however many tasks are open. Days are the phone's local ones.
export type BoardQuery = { view: TaskView; search: string; person: string }
const boardArgs = ({
  search,
  person
}: BoardQuery): {
  p_search: string
  p_person: string | null
  p_now: string
  p_day_start: string
} => ({
  p_search: searchTerm(search),
  p_person: person || null,
  p_now: new Date().toISOString(),
  p_day_start: new Date(`${ymd(new Date())}T00:00`).toISOString()
})

export const listBoardPage = async (
  q: BoardQuery,
  limit: number,
  offset: number
): Promise<Page<BoardTask>> => {
  const rows = unwrap(
    await db().rpc('board_tasks', {
      ...boardArgs(q),
      p_view: q.view,
      p_limit: limit,
      p_offset: offset
    })
  )
  return {
    rows: await withAssignees(rows),
    total: offset + rows.length,
    more: rows.length >= limit
  }
}

export const countBoardTasks = async (
  q: BoardQuery
): Promise<Database['public']['Functions']['board_task_counts']['Returns'][number]> => {
  const [row] = unwrap(await db().rpc('board_task_counts', boardArgs(q)))
  if (!row) throw new Error('board_task_counts returned nothing')
  return row
}

export const createTask = async (input: CreateTaskInput): Promise<Task> => {
  const { title, description, dueDate, userIds } = parse(createTaskSchema, input)
  return unwrap(
    await db()
      .rpc('create_task', {
        p_title: title,
        p_description: description,
        p_due_date: dueDate,
        p_user_ids: userIds
      })
      .single()
  )
}

// One person's own progress; RLS lets them change theirs, and whoever manages the task or the person anyone's.
export const updateTaskStatus = async (input: UpdateTaskStatusInput): Promise<TaskAssignment> => {
  const { taskId, userId, status } = parse(updateTaskStatusSchema, input)
  return changed(
    unwrap(
      await db()
        .from('task_assignments')
        .update({ status })
        .eq('task_id', taskId)
        .eq('user_id', userId)
        .select()
    )
  )
}

// Assignments and comments go with it (on delete cascade); RLS limits this to admins and the managing manager.
export const deleteTask = async (id: string): Promise<Pick<Task, 'id'>> =>
  changed(unwrap(await db().from('tasks').delete().eq('id', id).select('id')))
