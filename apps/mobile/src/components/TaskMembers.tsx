import { initials, nameOf } from '@daily-status/core/format'
import { useT } from '@daily-status/core/i18n'
import {
  doneCount,
  STATUS_KEY,
  STATUS_TONE,
  type BoardTask,
  type Member
} from '@daily-status/core/taskService'
import { HStack } from './gs/hstack'
import { Text } from './gs/text'
import { VStack } from './gs/vstack'
import { StatusOptions } from './TaskCard'
import { Avatar, Badge } from './ui'
import { useProfile } from '@/lib/profile'

// Everyone's own progress on a task. People the viewer may update get the four statuses; the viewer's own row is
// read-only here, since their task card above already changes it.
export const TaskMembers = ({ task }: { task: BoardTask }): React.JSX.Element => {
  const { t } = useT()
  const me = useProfile().id
  const { assignees } = task
  const name = (a: Member): string => (a.id === me ? t('you') : nameOf(a))
  return (
    <VStack className="gap-3">
      <HStack className="flex-wrap justify-between gap-x-3">
        <Text className="text-[14px] font-medium text-fg-3">{t('taskAssignedTo')}</Text>
        {assignees.length > 1 && (
          <Text className="text-[14px] text-fg-3">
            {t('taskProgress', { done: doneCount(task), total: assignees.length })}
          </Text>
        )}
      </HStack>
      {assignees.map((a) => (
        <VStack key={a.id} className="gap-2">
          <HStack className="flex-wrap items-center gap-x-3 gap-y-1">
            <Avatar text={initials(a)} />
            <Text className="mr-auto shrink text-[16px] text-fg">{name(a)}</Text>
            <Badge label={t(STATUS_KEY[a.status])} tone={STATUS_TONE[a.status]} />
          </HStack>
          {a.editable && a.id !== me && (
            <StatusOptions
              taskId={task.id}
              userId={a.id}
              status={a.status}
              label={t('statusFor', { name: name(a) })}
            />
          )}
        </VStack>
      ))}
    </VStack>
  )
}
