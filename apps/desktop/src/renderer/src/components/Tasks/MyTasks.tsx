import { ListTodo, SearchX } from 'lucide-react'
import { useCommentCounts } from '@daily-status/core/commentService'
import type { Profile } from '@daily-status/core/database.types'
import { useT } from '@daily-status/core/i18n'
import { inView, TASK_VIEWS } from '@daily-status/core/taskService'
import { useTaskFilter, useUserTasks } from '@daily-status/core/useTasks'
import { CardsSkeleton } from '../Skeletons'
import { Button, Card, Notice, PageHeader, Empty } from '../ui'
import { CommentsButton } from '../CommentsButton'
import { StatusPicker } from './StatusPicker'
import { TaskFilters } from './TaskFilters'
import { TaskGroups } from './TaskGroups'
import { TaskMeta } from './TaskMeta'

export const MyTasks = ({ profile }: { profile: Profile }): React.JSX.Element => {
  const { t } = useT()
  const { f, set, clear, active } = useTaskFilter()
  const [tasks, reload] = useUserTasks(profile.id, f)
  const shown = tasks.state === 'ok' ? tasks.data.rows.filter((x) => inView(x, f.view)) : []
  const counts = useCommentCounts(
    'task',
    shown.map((x) => x.id)
  )
  return (
    <>
      <PageHeader title={t('navTasks')} subtitle={t('tasksSubtitle')}>
        {tasks.state === 'ok' && (tasks.data.count('all') > 0 || active) && (
          <TaskFilters
            views={TASK_VIEWS}
            count={tasks.data.count}
            f={f}
            set={set}
            active={active}
            clear={clear}
          />
        )}
      </PageHeader>
      {tasks.state === 'loading' ? (
        <CardsSkeleton />
      ) : tasks.state === 'error' ? (
        <div className="flex flex-col items-start gap-3">
          <Notice tone="bad">{t(tasks.message)}</Notice>
          <Button variant="ghost" onClick={reload}>
            {t('tryAgain')}
          </Button>
        </div>
      ) : !tasks.data.count('all') && !active ? (
        <Empty
          icon={<ListTodo className="size-7" />}
          title={t('tasksEmpty')}
          hint={t('tasksEmptyHint')}
        />
      ) : shown.length ? (
        <TaskGroups
          list={tasks.data}
          view={f.view}
          card={(task) => (
            <Card className="w-full">
              <h2 className="mb-2 font-semibold text-fg">{task.title}</h2>
              <TaskMeta task={task} />
              {task.description && (
                <p className="mt-3 text-sm whitespace-pre-line text-fg-2">{task.description}</p>
              )}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                <StatusPicker taskId={task.id} userId={profile.id} status={task.status} />
                <CommentsButton target={{ kind: 'task', id: task.id }} count={counts[task.id]} />
              </div>
            </Card>
          )}
        />
      ) : (
        <Empty
          icon={<SearchX className="size-7" />}
          title={t('noTaskMatch')}
          hint={t('noTaskMatchHint')}
        />
      )}
    </>
  )
}
