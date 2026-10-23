import type { Tone } from '@daily-status/core/format'
import { initials, nameOf } from '@daily-status/core/format'
import { useT } from '@daily-status/core/i18n'
import {
  STATUS_KEY,
  STATUS_TONE,
  TASK_STATUSES,
  type Assignee
} from '@daily-status/core/taskService'
import { useAdminTasks } from '@daily-status/core/useTasks'
import { CardsSkeleton } from '../Skeletons'
import { Avatar, Button, Notice, PageHeader } from '../ui'
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
const People = ({ people }: { people: Assignee[] }): React.JSX.Element => {
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
          <Notice>{t('taskBoardEmpty')}</Notice>
        ) : (
          <>
            <Progress
              done={tasks.data.filter((task) => task.status === 'completed').length}
              total={tasks.data.length}
            />
            <div className="grid grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] gap-4">
              {TASK_STATUSES.map((s) => {
                const group = tasks.data.filter((task) => task.status === s)
                return (
                  <section key={s} aria-label={t(STATUS_KEY[s])} className="flex flex-col gap-3">
                    <h2 className="flex items-center gap-2 text-xs font-semibold tracking-wider text-fg-2 uppercase">
                      <span aria-hidden className={`size-2 rounded-full ${DOT[STATUS_TONE[s]]}`} />
                      {t(STATUS_KEY[s])}
                      <span className="ml-auto tabular-nums">{group.length}</span>
                    </h2>
                    {group.map((task, i) => (
                      // Keyed by status too, so a card that moves column rises into its new place.
                      <article
                        key={`${task.id}:${task.status}`}
                        style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
                        className="flex animate-rise flex-col gap-3 rounded-xl border border-line bg-card p-4 transition-[box-shadow,translate] duration-200 ease-enter hover:-translate-y-0.5 hover:shadow-raised"
                      >
                        <h3 className="font-semibold tracking-tight text-fg">{task.title}</h3>
                        <TaskMeta task={task} />
                        {task.description && (
                          <p className="text-sm/relaxed whitespace-pre-line text-fg-2">
                            {task.description}
                          </p>
                        )}
                        <People people={task.assignees} />
                        <StatusPicker task={task} />
                      </article>
                    ))}
                  </section>
                )
              })}
            </div>
          </>
        )}
      </div>
    </>
  )
}
