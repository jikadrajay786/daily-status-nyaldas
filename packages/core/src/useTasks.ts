import { useState } from 'react'
import type { Task } from './database.types'
import type { Key } from './i18n'
import { useLiveQuery } from './live'
import {
  createTask,
  listAllTasks,
  listMyTasks,
  updateTaskStatus,
  type BoardTask,
  type CreateTaskInput,
  type UpdateTaskStatusInput
} from './taskService'
import { errMsg, type Query } from './useQuery'

export const useAdminTasks = (): [Query<BoardTask[]>, () => void, boolean] =>
  useLiveQuery('tasks:all', listAllTasks)

export const useUserTasks = (userId: string): [Query<Task[]>, () => void, boolean] =>
  useLiveQuery(`tasks:${userId}`, () => listMyTasks(userId))

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
