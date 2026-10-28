import { z } from 'zod'
import type { Profile, Task, TaskStatus } from './database.types'
import type { Tone } from './format'
import type { Key } from './i18n'
import { changed } from './statusService'
import { db, unwrap } from './supabase'
import { ymd } from './workdays'

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
  status: z.enum(TASK_STATUSES)
})

export type CreateTaskInput = z.input<typeof createTaskSchema>
export type UpdateTaskStatusInput = z.input<typeof updateTaskStatusSchema>
export type Assignee = Pick<Profile, 'id' | 'full_name' | 'email'>
export type BoardTask = Task & { assignees: Assignee[] }

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

const byDue = (a: Task, b: Task): number => a.due_date.localeCompare(b.due_date)

// Tasks go to staff only; admins hand them out.
export const listPeople = async (): Promise<Assignee[]> =>
  unwrap(
    await db().from('profiles').select('id, full_name, email').eq('role', 'user').order('full_name')
  )

export const listAllTasks = async (): Promise<BoardTask[]> =>
  unwrap(
    await db()
      .from('tasks')
      .select('*, task_assignments(profile:profiles(id, full_name, email))')
      .order('due_date')
      .limit(500)
  ).map(({ task_assignments, ...t }) => ({
    ...t,
    assignees: task_assignments.flatMap((a) => (a.profile ? [a.profile] : []))
  }))

// Staff only see themselves among the assignees (RLS); admins see everyone.
export const getTask = async (id: string): Promise<BoardTask | null> => {
  const row = unwrap(
    await db()
      .from('tasks')
      .select('*, task_assignments(profile:profiles(id, full_name, email))')
      .eq('id', id)
      .maybeSingle()
  )
  if (!row) return null
  const { task_assignments, ...t } = row
  return { ...t, assignees: task_assignments.flatMap((a) => (a.profile ? [a.profile] : [])) }
}

// Through the user's own assignments: admins can read every task, but this list is only theirs.
export const listMyTasks = async (userId: string): Promise<Task[]> =>
  unwrap(
    await db().from('task_assignments').select('task:tasks(*)').eq('user_id', userId).limit(500)
  )
    .flatMap((a) => (a.task ? [a.task] : []))
    .sort(byDue)

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

export const updateTaskStatus = async (input: UpdateTaskStatusInput): Promise<Task> => {
  const { taskId, status } = parse(updateTaskStatusSchema, input)
  return changed(unwrap(await db().from('tasks').update({ status }).eq('id', taskId).select()))
}
