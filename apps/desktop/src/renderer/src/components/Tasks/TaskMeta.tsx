import type { Task } from '@daily-status/core/database.types'
import { fmtShort, fmtStamp } from '@daily-status/core/format'
import { useT } from '@daily-status/core/i18n'
import {
  dueDay,
  isOverdue,
  lateDays,
  STATUS_KEY,
  STATUS_TONE
} from '@daily-status/core/taskService'
import { Badge } from '../ui'

export const TaskMeta = ({ task }: { task: Task }): React.JSX.Element => {
  const { t, locale } = useT()
  const late = isOverdue(task) ? lateDays(task.due_date) : -1
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-fg-2">
      <Badge label={t(STATUS_KEY[task.status])} tone={STATUS_TONE[task.status]} />
      <span>{t('taskDueOn', { date: fmtShort(dueDay(task.due_date), locale) })}</span>
      {late >= 0 && (
        <Badge
          label={
            late === 0
              ? t('taskOverdue')
              : late === 1
                ? t('taskLateOne')
                : t('taskLate', { n: late })
          }
          tone="warn"
        />
      )}
      <span>{t('taskAssignedAt', { when: fmtStamp(task.created_at, locale) })}</span>
    </div>
  )
}
