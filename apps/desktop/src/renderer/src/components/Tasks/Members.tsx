import { initials, nameOf } from '@daily-status/core/format'
import { useT } from '@daily-status/core/i18n'
import {
  doneCount,
  STATUS_KEY,
  STATUS_TONE,
  type BoardTask,
  type Member
} from '@daily-status/core/taskService'
import { Avatar, Badge } from '../ui'
import { StatusPicker } from './StatusPicker'

const SHORT = 4

// Everyone's own progress on a task. In details, each person the viewer may update gets a picker; a board card shows
// a short read-only summary.
export const Members = ({
  task,
  me,
  short = false
}: {
  task: BoardTask
  me: string
  short?: boolean
}): React.JSX.Element => {
  const { t } = useT()
  const { assignees } = task
  const name = (a: Member): string => (a.id === me ? t('you') : nameOf(a))
  const more = short ? assignees.length - SHORT : 0
  return (
    <div>
      <p className="mb-2 flex flex-wrap justify-between gap-x-3 text-xs font-medium text-fg-3">
        <span>{t('taskAssignedTo')}</span>
        {assignees.length > 1 && (
          <span className="tabular-nums">
            {t('taskProgress', { done: doneCount(task), total: assignees.length })}
          </span>
        )}
      </p>
      <ul className="flex flex-col gap-2.5">
        {(more > 0 ? assignees.slice(0, SHORT) : assignees).map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="mr-auto flex min-w-0 items-center gap-2">
              <Avatar text={initials(a)} />
              <span className="truncate text-sm text-fg">{name(a)}</span>
            </span>
            {!short && a.editable ? (
              <StatusPicker
                taskId={task.id}
                userId={a.id}
                status={a.status}
                label={t('statusFor', { name: name(a) })}
              />
            ) : (
              <Badge label={t(STATUS_KEY[a.status])} tone={STATUS_TONE[a.status]} />
            )}
          </li>
        ))}
      </ul>
      {more > 0 && <p className="mt-2 text-xs text-fg-3">{t('taskMorePeople', { n: more })}</p>}
    </div>
  )
}
