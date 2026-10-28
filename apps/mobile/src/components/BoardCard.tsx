import { fmtShort, nameOf } from '@daily-status/core/format'
import { useT } from '@daily-status/core/i18n'
import {
  dueDay,
  isOverdue,
  STATUS_KEY,
  STATUS_TONE,
  type BoardTask
} from '@daily-status/core/taskService'
import type { ReactNode } from 'react'
import { HStack } from './gs/hstack'
import { Text } from './gs/text'
import { Badge, Card } from './ui'

// The admin's read-only view of a task: status, due date and who it is given to.
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
  return (
    <Card>
      <Text accessibilityRole="header" className="text-[17px] font-semibold text-fg">
        {task.title}
      </Text>
      <HStack className="flex-wrap items-center gap-2">
        <Badge label={t(STATUS_KEY[task.status])} tone={STATUS_TONE[task.status]} />
        {isOverdue(task) && <Badge label={t('taskOverdue')} tone="warn" />}
        <Text className="text-[14px] text-fg-2">
          {t('taskDueOn', { date: fmtShort(dueDay(task.due_date), locale) })}
        </Text>
      </HStack>
      {task.description && (
        <Text numberOfLines={full ? undefined : 3} className="text-[15px] leading-[22px] text-fg-2">
          {task.description}
        </Text>
      )}
      <Text className="text-[14px] text-fg-3">
        {t('taskAssignedTo')}: {task.assignees.map(nameOf).join(', ') || '—'}
      </Text>
      {footer}
    </Card>
  )
}
