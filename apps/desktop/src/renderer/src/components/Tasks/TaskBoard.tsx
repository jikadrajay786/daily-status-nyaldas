import { ClipboardList } from 'lucide-react'
import { useCommentCounts } from '@daily-status/core/commentService'
import { useState } from 'react'
import type { TaskStatus } from '@daily-status/core/database.types'
import type { Tone } from '@daily-status/core/format'
import { initials, nameOf } from '@daily-status/core/format'
import { useT } from '@daily-status/core/i18n'
import {
  STATUS_KEY,
  STATUS_TONE,
  TASK_STATUSES,
  type Assignee,
  type BoardTask
} from '@daily-status/core/taskService'
import { useAdminTasks, useUpdateTaskStatus } from '@daily-status/core/useTasks'
import { CardsSkeleton } from '../Skeletons'
import { Avatar, Button, Notice, PageHeader, Empty } from '../ui'
import { CommentsButton } from '../CommentsButton'
import { StatusPicker } from './StatusPicker'
import { TaskForm } from './TaskForm'
import { TaskMeta } from './TaskMeta'

const DOT: Record<Tone, string> = {
  idle: 'bg-fg-3',
  info: 'bg-info',
  ok: 'bg-ok',
  warn: 'bg-warn',
  bad: 'bg-bad'
}
const PILE = 4

// Overlapping avatars keep a card short however many people share it; the names stay readable underneath.
export const People = ({ people }: { people: Assignee[] }): React.JSX.Element => {
  const { t } = useT()
  const names = people.map(nameOf).join(', ')
  return (
    <div title={names}>
      <p className="mb-1.5 text-xs font-medium text-fg-3">{t('taskAssignedTo')}</p>
      <div className="flex items-center gap-2">
        <div className="flex shrink-0 -space-x-2">
          {people.slice(0, PILE).map((p) => (
            <span key={p.id} className="rounded-full ring-2 ring-card">
              <Avatar text={initials(p)} />
            </span>
          ))}
          {people.length > PILE && (
            <span className="grid size-9 place-items-center rounded-full bg-selected text-xs font-semibold text-fg-2 ring-2 ring-card">
              +{people.length - PILE}
            </span>
          )}
        </div>
        <span className="min-w-0 truncate text-sm text-fg-2">{names}</span>
      </div>
    </div>
  )
}

const Progress = ({ done, total }: { done: number; total: number }): React.JSX.Element => {
  const { t } = useT()
  return (
    <div className="flex items-center gap-3">
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-label={t('taskProgress', { done, total })}
        className="h-2 flex-1 overflow-hidden rounded-full bg-selected"
      >
        <div
          className="h-full rounded-full bg-ok transition-[width] duration-500 ease-enter"
          style={{ width: `${(done / total) * 100}%` }}
        />
      </div>
      <span className="text-sm text-fg-2 tabular-nums">{t('taskProgress', { done, total })}</span>
    </div>
  )
}

// Native drag and drop (no library). The card moves at once and snaps back if the save fails; the status pills
// on each card stay the keyboard and screen-reader way to do the same thing.
const DRAG_TYPE = 'application/x-daily-status-task'

const Board = ({ tasks }: { tasks: BoardTask[] }): React.JSX.Element => {
  const { t } = useT()
  const { run, error } = useUpdateTaskStatus()
  const [moved, setMoved] = useState<Readonly<Record<string, TaskStatus>>>({})
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<TaskStatus | null>(null)
  const counts = useCommentCounts(
    'task',
    tasks.map((x) => x.id)
  )
  const statusOf = (task: BoardTask): TaskStatus => moved[task.id] ?? task.status
  const without = (id: string) => (m: Readonly<Record<string, TaskStatus>>) =>
    Object.fromEntries(Object.entries(m).filter(([k]) => k !== id))
  // Once the refetch agrees with a drop, the server copy takes over again.
  const settled = tasks.find((task) => moved[task.id] === task.status)
  if (settled) setMoved(without(settled.id))

  const drop = async (status: TaskStatus): Promise<void> => {
    const task = tasks.find((x) => x.id === dragging)
    setDragging(null)
    setOver(null)
    if (!task || statusOf(task) === status) return
    setMoved((m) => ({ ...m, [task.id]: status }))
    if (!(await run({ taskId: task.id, status }))) setMoved(without(task.id))
  }

  return (
    <>
      <Progress
        done={tasks.filter((task) => statusOf(task) === 'completed').length}
        total={tasks.length}
      />
      <p className="-mt-3 text-xs text-fg-3">{t('boardDragHint')}</p>
      {error && <Notice tone="bad">{t(error)}</Notice>}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] gap-4">
        {TASK_STATUSES.map((s) => {
          const group = tasks.filter((task) => statusOf(task) === s)
          return (
            <section
              key={s}
              aria-label={t(STATUS_KEY[s])}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes(DRAG_TYPE)) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                if (over !== s) setOver(s)
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null)
              }}
              onDrop={(e) => {
                e.preventDefault()
                void drop(s)
              }}
              className={`-m-2 flex min-h-48 flex-col gap-3 rounded-2xl p-2 outline-2 -outline-offset-2 transition-[background-color,outline-color] duration-150 ease-enter ${
                over === s ? 'bg-selected outline-accent-fg outline-dashed' : 'outline-transparent'
              }`}
            >
              <h2 className="flex items-center gap-2 text-xs font-semibold tracking-wider text-fg-2 uppercase">
                <span aria-hidden className={`size-2 rounded-full ${DOT[STATUS_TONE[s]]}`} />
                {t(STATUS_KEY[s])}
                <span className="ml-auto tabular-nums">{group.length}</span>
              </h2>
              {group.map((task, i) => {
                const shown = { ...task, status: s }
                return (
                  // Keyed by status too, so a card that moves column rises into its new place.
                  <article
                    key={`${task.id}:${s}`}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(DRAG_TYPE, task.id)
                      e.dataTransfer.effectAllowed = 'move'
                      setDragging(task.id)
                    }}
                    onDragEnd={() => {
                      setDragging(null)
                      setOver(null)
                    }}
                    style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
                    className={`flex animate-rise cursor-grab flex-col gap-3 rounded-xl border border-line bg-card p-4 transition-[box-shadow,translate,opacity] duration-200 ease-enter hover:-translate-y-0.5 hover:shadow-raised active:cursor-grabbing ${
                      dragging === task.id ? 'opacity-40' : ''
                    }`}
                  >
                    <h3 className="font-semibold tracking-tight text-fg">{task.title}</h3>
                    <TaskMeta task={shown} />
                    {task.description && (
                      <p className="text-sm/relaxed whitespace-pre-line text-fg-2">
                        {task.description}
                      </p>
                    )}
                    <People people={task.assignees} />
                    <StatusPicker task={shown} />
                    <span className="self-start">
                      <CommentsButton
                        target={{ kind: 'task', id: task.id }}
                        count={counts[task.id]}
                      />
                    </span>
                  </article>
                )
              })}
            </section>
          )
        })}
      </div>
    </>
  )
}

export const TaskBoard = (): React.JSX.Element => {
  const { t } = useT()
  const [tasks, reload] = useAdminTasks()
  return (
    <>
      <PageHeader title={t('navTaskBoard')} subtitle={t('taskBoardSubtitle')} />
      <div className="flex flex-col gap-6">
        <TaskForm onCreated={reload} />
        {tasks.state === 'loading' ? (
          <CardsSkeleton />
        ) : tasks.state === 'error' ? (
          <div className="flex flex-col items-start gap-3">
            <Notice tone="bad">{t(tasks.message)}</Notice>
            <Button variant="ghost" onClick={reload}>
              {t('tryAgain')}
            </Button>
          </div>
        ) : !tasks.data.length ? (
          <Empty
            icon={<ClipboardList className="size-7" />}
            title={t('taskBoardEmpty')}
            hint={t('taskBoardEmptyHint')}
          />
        ) : (
          <Board tasks={tasks.data} />
        )}
      </div>
    </>
  )
}
