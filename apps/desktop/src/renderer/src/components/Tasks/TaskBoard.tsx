import { initials, nameOf } from '@daily-status/core/format'
import { useT } from '@daily-status/core/i18n'
import { STATUS_KEY, TASK_STATUSES } from '@daily-status/core/taskService'
import { useAdminTasks } from '@daily-status/core/useTasks'
import { CardsSkeleton } from '../Skeletons'
import { Avatar, Button, Notice, PageHeader } from '../ui'
import { StatusPicker } from './StatusPicker'
import { TaskForm } from './TaskForm'
import { TaskMeta } from './TaskMeta'

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
          <div className="grid grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] gap-4">
            {TASK_STATUSES.map((s) => {
              const group = tasks.data.filter((task) => task.status === s)
              return (
                <section key={s} aria-label={t(STATUS_KEY[s])} className="flex flex-col gap-3">
                  <h2 className="flex items-center justify-between text-xs font-semibold tracking-wider text-fg-2 uppercase">
                    {t(STATUS_KEY[s])}
                    <span className="tabular-nums">{group.length}</span>
                  </h2>
                  {group.map((task) => (
                    <article
                      key={task.id}
                      className="flex flex-col gap-3 rounded-xl border border-line bg-card p-4"
                    >
                      <h3 className="font-semibold text-fg">{task.title}</h3>
                      <TaskMeta task={task} />
                      {task.description && (
                        <p className="text-sm whitespace-pre-line text-fg-2">{task.description}</p>
                      )}
                      <div>
                        <p className="mb-1.5 text-xs font-medium text-fg-3">
                          {t('taskAssignedTo')}
                        </p>
                        <ul className="flex flex-col gap-1.5">
                          {task.assignees.map((p) => (
                            <li key={p.id} className="flex items-center gap-2 text-sm">
                              <Avatar text={initials(p)} />
                              <span className="truncate">{nameOf(p)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <StatusPicker task={task} />
                    </article>
                  ))}
                </section>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
