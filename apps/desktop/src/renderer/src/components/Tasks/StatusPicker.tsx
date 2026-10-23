import { LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import type { Task, TaskStatus } from '@daily-status/core/database.types'
import { useT } from '@daily-status/core/i18n'
import type { Tone } from '@daily-status/core/format'
import { STATUS_KEY, STATUS_TONE, TASK_STATUSES } from '@daily-status/core/taskService'
import { useUpdateTaskStatus } from '@daily-status/core/useTasks'
import { Notice } from '../ui'

// The picked pill wears its status colour, so the colour change itself shows the update landed.
const PICKED: Record<Tone, string> = {
  idle: 'bg-selected text-fg ring-fg-3',
  info: 'bg-info/15 text-info-fg ring-info/50',
  ok: 'bg-ok/15 text-ok-fg ring-ok/50',
  warn: 'bg-warn/15 text-warn-fg ring-warn/50',
  bad: 'bg-bad/15 text-bad-fg ring-bad/50'
}

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
            className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition-[background-color,color,box-shadow,transform] duration-200 ease-enter enabled:active:scale-95 disabled:cursor-wait ${
              shown === s ? PICKED[STATUS_TONE[s]] : 'text-fg-2 ring-line hover:bg-hover'
            }`}
          >
            {busy && shown === s && (
              <LoaderCircle aria-hidden className="mr-1 inline size-3 animate-spin align-[-2px]" />
            )}
            {t(STATUS_KEY[s])}
          </button>
        ))}
      </div>
      {error && <Notice tone="bad">{t(error)}</Notice>}
    </div>
  )
}
