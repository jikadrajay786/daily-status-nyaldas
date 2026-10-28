import { ListTodo } from 'lucide-react'
import { useCommentCounts } from '@daily-status/core/commentService'
import type { Profile } from '@daily-status/core/database.types'
import { useT } from '@daily-status/core/i18n'
import { useUserTasks } from '@daily-status/core/useTasks'
import { CardsSkeleton } from '../Skeletons'
import { Button, Card, Notice, PageHeader, Empty } from '../ui'
import { CommentsButton } from '../CommentsButton'
import { StatusPicker } from './StatusPicker'
import { TaskMeta } from './TaskMeta'

export const MyTasks = ({ profile }: { profile: Profile }): React.JSX.Element => {
  const { t } = useT()
  const [tasks, reload] = useUserTasks(profile.id)
  const counts = useCommentCounts('task', tasks.state === 'ok' ? tasks.data.map((x) => x.id) : [])
  return (
    <>
      <PageHeader title={t('navTasks')} subtitle={t('tasksSubtitle')} />
      {tasks.state === 'loading' ? (
        <CardsSkeleton />
      ) : tasks.state === 'error' ? (
        <div className="flex flex-col items-start gap-3">
          <Notice tone="bad">{t(tasks.message)}</Notice>
          <Button variant="ghost" onClick={reload}>
            {t('tryAgain')}
          </Button>
        </div>
      ) : tasks.data.length ? (
        <ul className="flex flex-col gap-3">
          {tasks.data.map((task) => (
            <li key={task.id}>
              <Card>
                <h2 className="mb-2 font-semibold text-fg">{task.title}</h2>
                <TaskMeta task={task} />
                {task.description && (
                  <p className="mt-3 text-sm whitespace-pre-line text-fg-2">{task.description}</p>
                )}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                  <StatusPicker task={task} />
                  <CommentsButton target={{ kind: 'task', id: task.id }} count={counts[task.id]} />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <Empty
          icon={<ListTodo className="size-7" />}
          title={t('tasksEmpty')}
          hint={t('tasksEmptyHint')}
        />
      )}
    </>
  )
}
