import { useEffect, useEffectEvent, useId, useState } from 'react'
import type { Task } from './database.types'
import type { Key } from './i18n'
import { db } from './supabase'
import {
  createTask,
  listAllTasks,
  listMyTasks,
  updateTaskStatus,
  type BoardTask,
  type CreateTaskInput,
  type UpdateTaskStatusInput
} from './taskService'
import { errMsg, useQuery, type Query } from './useQuery'

// Realtime runs under the subscriber's RLS, so each person only hears about tasks they can read.
const useTaskChanges = (onChange: () => void): void => {
  const id = useId()
  const run = useEffectEvent(onChange)
  useEffect(() => {
    const ch = db()
      .channel(`tasks${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => run())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_assignments' }, () =>
        run()
      )
      .subscribe()
    return () => void db().removeChannel(ch)
  }, [id])
}

// Keeps showing the last result while a realtime-triggered refetch runs, so the board never flashes a skeleton.
const useLiveTasks = <T>(key: string, fn: () => Promise<T>): [Query<T>, () => void] => {
  const [q, reload] = useQuery(key, fn)
  const [last, setLast] = useState(q)
  if (q.state !== 'loading' && q !== last) setLast(q)
  useTaskChanges(reload)
  return [q.state === 'loading' && last.state === 'ok' ? last : q, reload]
}

export const useAdminTasks = (): [Query<BoardTask[]>, () => void] =>
  useLiveTasks('tasks:all', listAllTasks)

export const useUserTasks = (userId: string): [Query<Task[]>, () => void] =>
  useLiveTasks(`tasks:${userId}`, () => listMyTasks(userId))

export type Mutation<A, R> = {
  run: (arg: A) => Promise<R | null>
  busy: boolean
  error: Key | null
}

// Resolves to null on failure, with the translated reason in `error`.
const useMutation = <A, R>(fn: (arg: A) => Promise<R>): Mutation<A, R> => {
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
export const useUpdateTaskStatus = (): Mutation<UpdateTaskStatusInput, Task> =>
  useMutation(updateTaskStatus)
