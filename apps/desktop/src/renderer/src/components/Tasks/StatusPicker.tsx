import { useState } from 'react'
import type { Task, TaskStatus } from '@daily-status/core/database.types'
import { useT } from '@daily-status/core/i18n'
import { STATUS_KEY, TASK_STATUSES } from '@daily-status/core/taskService'
import { useUpdateTaskStatus } from '@daily-status/core/useTasks'
import { Notice } from '../ui'

export const StatusPicker = ({
  task
}: {
  task: Pick<Task, 'id' | 'status'>
}): React.JSX.Element => {
  const { t } = useT()
  const { run, busy, error } = useUpdateTaskStatus()
  // Shows the choice straight away; the realtime refetch then confirms it.
  const [want, setWant] = useState<TaskStatus | null>(null)
  if (want === task.status) setWant(null)
  const shown = want ?? task.status

  const pick = async (status: TaskStatus): Promise<void> => {
    setWant(status)
    if (!(await run({ taskId: task.id, status }))) setWant(null)
  }

  return (
    <div className="flex flex-col gap-2">
      <div role="group" aria-label={t('taskStatus')} className="flex flex-wrap gap-1.5">
        {TASK_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={shown === s}
            disabled={busy}
            onClick={() => shown !== s && pick(s)}
            className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition-colors disabled:cursor-wait ${
              shown === s
                ? 'bg-selected text-fg ring-accent-fg'
                : 'text-fg-2 ring-line hover:bg-hover'
            }`}
          >
            {t(STATUS_KEY[s])}
          </button>
        ))}
      </div>
      {error && <Notice tone="bad">{t(error)}</Notice>}
    </div>
  )
}
