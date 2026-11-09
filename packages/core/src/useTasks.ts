import { useState } from 'react'
import type { Profile, Task, TaskAssignment } from './database.types'
import type { Key } from './i18n'
import { bumpLive, useLiveQuery } from './live'
import {
  countBoardTasks,
  createTask,
  deleteTask,
  inView,
  latestById,
  listDoneBoardTasks,
  listBoardPage,
  listDoneMyTasks,
  listOpenBoardTasks,
  listOpenMyTasks,
  matchesFilter,
  updateTaskStatus,
  type Assignee,
  type BoardTask,
  type CreateTaskInput,
  type DoneQuery,
  type TaskFilter,
  type TaskView,
  type UpdateTaskStatusInput
} from './taskService'
import type { Page } from './supabase'
import { useDebounced } from './useDebounced'
import { usePaged, type Paged } from './usePaged'
import { errMsg, type Query } from './useQuery'

const NO_FILTER: TaskFilter = { view: 'all', search: '', person: '' }

export const useTaskFilter = (
  view: TaskView = 'all'
): {
  f: TaskFilter
  set: (patch: Partial<TaskFilter>) => void
  clear: () => void
  active: boolean
} => {
  const [f, setF] = useState<TaskFilter>(() => ({ ...NO_FILTER, view }))
  return {
    f,
    set: (patch) => setF((x) => ({ ...x, ...patch })),
    clear: () => setF(NO_FILTER),
    active: f.view !== 'all' || !!f.search.trim() || !!f.person
  }
}

// `rows` is everything loaded that matches the search and person; each screen applies the view itself.
export type TaskList<T> = Omit<Paged<T>, 'total'> & {
  count: (view: TaskView) => number
  done: number
}

// Unfinished tasks live in memory and filter instantly; finished ones can run to thousands, so the server filters and
// pages them. While a new search loads, the last page stays up, narrowed by the same rules, so the list doesn't flash.
const useTaskList = <T extends Task & { assignees?: Assignee[] }>(
  key: string,
  f: TaskFilter,
  loadOpen: () => Promise<T[]>,
  loadDone: (q: DoneQuery) => Promise<Page<T>>
): [Query<TaskList<T>>, () => void] => {
  const search = useDebounced(f.search)
  const [open, reloadOpen] = useLiveQuery(`${key}:open`, loadOpen)
  const [done, reloadDone] = usePaged(
    `${key}:done:${JSON.stringify([search, f.person])}`,
    (limit, offset) => loadDone({ search, person: f.person, limit, offset }),
    true
  )
  const reload = (): void => {
    reloadOpen()
    reloadDone()
  }
  if (open.state === 'error') return [open, reload]
  if (done.state === 'error') return [done, reload]
  if (open.state === 'loading' || done.state === 'loading') return [{ state: 'loading' }, reload]
  const { rows: finished, total, ...paging } = done.data
  const rows = latestById([...open.data, ...finished]).filter((t) => matchesFilter(t, f))
  const active = rows.filter((t) => t.status !== 'completed')
  return [
    {
      state: 'ok',
      data: {
        ...paging,
        rows,
        done: total,
        count: (view) =>
          view === 'completed'
            ? total
            : view === 'all'
              ? active.length + total
              : active.filter((t) => inView(t, view)).length
      }
    },
    reload
  ]
}

// The phone's board. Unlike desktop's columns, which need every open task on screen, it shows one view at a time, so the
// server filters and pages it and only the counts look across everything.
export const useBoardPage = (
  me: Pick<Profile, 'id' | 'role'>,
  f: TaskFilter
): [Query<TaskList<BoardTask>>, () => void] => {
  const search = useDebounced(f.search)
  const q = { view: f.view, search, person: f.person }
  const [page, reloadPage] = usePaged(
    `board:page:${me.id}:${JSON.stringify(q)}`,
    (limit, offset) => listBoardPage(q, limit, offset),
    true
  )
  const [counts, reloadCounts] = useLiveQuery(
    `board:counts:${me.id}:${JSON.stringify([search, f.person])}`,
    () => countBoardTasks(q)
  )
  const reload = (): void => {
    reloadPage()
    reloadCounts()
  }
  if (page.state === 'error') return [page, reload]
  if (counts.state === 'error') return [counts, reload]
  if (page.state === 'loading' || counts.state === 'loading') return [{ state: 'loading' }, reload]
  const n = counts.data
  const { rows, more, older, busy, failed } = page.data
  return [
    {
      state: 'ok',
      data: {
        rows,
        more,
        older,
        busy,
        failed,
        done: n.completed,
        count: (view) =>
          view === 'all' ? n.pending + n.in_progress + n.completed + n.blocked : n[view]
      }
    },
    reload
  ]
}

export const useBoardTasks = (
  me: Pick<Profile, 'id' | 'role'>,
  f: TaskFilter
): [Query<TaskList<BoardTask>>, () => void] =>
  useTaskList(
    `tasks:board:${me.role}:${me.id}`,
    f,
    () => listOpenBoardTasks(me),
    (q) => listDoneBoardTasks(me, q)
  )

export const useUserTasks = (userId: string, f: TaskFilter): [Query<TaskList<Task>>, () => void] =>
  useTaskList(
    `tasks:${userId}`,
    f,
    () => listOpenMyTasks(userId),
    (q) => listDoneMyTasks(userId, q)
  )

export type Mutation<A, R> = {
  run: (arg: A) => Promise<R | null>
  busy: boolean
  error: Key | null
}

// Resolves to null on failure, with the translated reason in `error`.
export const useMutation = <A, R>(fn: (arg: A) => Promise<R>): Mutation<A, R> => {
  const [state, setState] = useState<{ busy: boolean; error: Key | null }>({
    busy: false,
    error: null
  })
  const run = async (arg: A): Promise<R | null> => {
    setState({ busy: true, error: null })
    try {
      const res = await fn(arg)
      setState({ busy: false, error: null })
      return res
    } catch (err) {
      setState({ busy: false, error: errMsg(err) })
      return null
    }
  }
  return { run, ...state }
}

export const useCreateTask = (): Mutation<CreateTaskInput, Task> => useMutation(createTask)
export const useUpdateTaskStatus = (): Mutation<UpdateTaskStatusInput, TaskAssignment> =>
  useMutation(updateTaskStatus)
// Bumps right away so the board drops the card without waiting for realtime.
export const useDeleteTask = (): Mutation<string, Pick<Task, 'id'>> =>
  useMutation((id: string) => deleteTask(id).finally(bumpLive))
