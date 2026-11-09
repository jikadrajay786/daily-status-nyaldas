import { fmtShort, fmtStamp, nameOf } from '@daily-status/core/format'
import { useT } from '@daily-status/core/i18n'
import {
  doneCount,
  dueDay,
  isOverdue,
  lateDays,
  STATUS_KEY,
  STATUS_TONE,
  type BoardTask
} from '@daily-status/core/taskService'
import { ChevronRight } from 'lucide-react-native'
import type { ReactNode } from 'react'
import { withUniwind } from 'uniwind'
import { HStack } from './gs/hstack'
import { Text } from './gs/text'
import { TaskMembers } from './TaskMembers'
import { Badge, Card } from './ui'

const MoreIcon = withUniwind(ChevronRight)
// Enough names for a list; the details list everyone with their progress.
const SHORT_NAMES = 2

// The admin's view of a task: the whole task's status, due date and who it is given to; details add everyone's
// own progress.
export const BoardCard = ({
  task,
  full = false,
  footer
}: {
  task: BoardTask
  // Details show the whole description; lists clip it.
  full?: boolean
  footer?: ReactNode
}): React.JSX.Element => {
  const { t, locale } = useT()
  const overdue = isOverdue(task)
  const late = overdue ? lateDays(task.due_date) : 0
  const names = task.assignees.map(nameOf)
  const given = names.slice(0, SHORT_NAMES)
  const rest = names.length - given.length
  return (
    <Card>
      <Text accessibilityRole="header" className="text-[17px] font-semibold text-fg">
        {task.title}
      </Text>
      <HStack className="flex-wrap items-center gap-2">
        <Badge label={t(STATUS_KEY[task.status])} tone={STATUS_TONE[task.status]} />
        {overdue && (
          <Badge
            label={
              full || !late
                ? t('taskOverdue')
                : late === 1
                  ? t('taskLateOne')
                  : t('taskLate', { n: late })
            }
            tone="warn"
          />
        )}
        {(full || !overdue) && (
          <Text className="text-[14px] text-fg-2">
            {t('taskDueOn', { date: fmtShort(dueDay(task.due_date), locale) })}
          </Text>
        )}
      </HStack>
      {task.description && (
        <Text numberOfLines={full ? undefined : 2} className="text-[15px] leading-[22px] text-fg-2">
          {task.description}
        </Text>
      )}
      {full ? (
        <TaskMembers task={task} />
      ) : (
        <HStack className="flex-wrap items-center gap-x-3 gap-y-1">
          <Text className="shrink text-[14px] text-fg-3">
            {t('taskAssignedTo')}: {given.join(', ') || '—'}
            {rest > 0 && ` +${rest}`}
          </Text>
          {task.assignees.length > 1 && (
            <Text className="text-[14px] text-fg-3">
              {t('taskProgress', { done: doneCount(task), total: task.assignees.length })}
            </Text>
          )}
          {footer}
        </HStack>
      )}
      {full ? (
        <>
          <Text className="text-[13px] text-fg-3">
            {t('taskAssignedAt', { when: fmtStamp(task.created_at, locale) })}
          </Text>
          {footer}
        </>
      ) : (
        <HStack className="items-center gap-0.5">
          <Text className="text-[14px] font-medium text-accent-fg">{t('seeDetails')}</Text>
          <MoreIcon colorClassName="accent-accent-fg" size={16} />
        </HStack>
      )}
    </Card>
  )
}
