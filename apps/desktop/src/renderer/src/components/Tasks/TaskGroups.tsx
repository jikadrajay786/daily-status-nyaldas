import { ChevronDown, ChevronUp } from 'lucide-react'
import type { Task } from '@daily-status/core/database.types'
import { useT } from '@daily-status/core/i18n'
import {
  byUrgency,
  GROUP_KEY,
  inView,
  TASK_GROUPS,
  taskGroup,
  type TaskGroup,
  type TaskView
} from '@daily-status/core/taskService'
import type { TaskList } from '@daily-status/core/useTasks'
import { useState, type ReactNode } from 'react'
import { Button, LoadMore } from '../ui'

const STEP = 20
const HEAD = 'flex items-center gap-2 text-sm font-semibold tracking-wide uppercase'
const LOOK: Record<Exclude<TaskGroup, 'completed'>, [dot: string, text: string]> = {
  today: ['bg-accent', 'text-fg'],
  overdue: ['bg-warn', 'text-warn-fg'],
  later: ['bg-fg-3', 'text-fg-2']
}

const Cards = <T extends Task>({
  rows,
  card
}: {
  rows: T[]
  card: (task: T) => ReactNode
}): React.JSX.Element => (
  <ul className="grid grid-cols-[repeat(auto-fill,minmax(20rem,1fr))] gap-4">
    {rows.map((task, i) => (
      <li
        key={task.id}
        className="flex animate-rise"
        style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
      >
        {card(task)}
      </li>
    ))}
  </ul>
)

// Due today, then late, then the rest; finished tasks fold away under All while there is still work to do.
export const TaskGroups = <T extends Task>({
  list,
  view,
  card
}: {
  list: TaskList<T>
  view: TaskView
  card: (task: T) => ReactNode
}): React.JSX.Element => {
  const { t } = useT()
  const [unfolded, setUnfolded] = useState(false)
  const [extra, setExtra] = useState<Partial<Record<TaskGroup, number>>>({})
  const sorted = byUrgency(list.rows.filter((x) => inView(x, view)))
  const done = view === 'all' || view === 'completed' ? list.done : 0
  const fold = view === 'all' && sorted.some((x) => x.status !== 'completed')
  return (
    <div className="flex flex-col gap-8">
      {TASK_GROUPS.map((g) => {
        const rows = sorted.filter((x) => taskGroup(x) === g)
        if (g === 'completed') {
          if (!done) return null
          const shown = !fold || unfolded
          const label = t('taskFinished', { n: done })
          return (
            <section key={g} aria-label={label} className="flex flex-col items-start gap-4">
              {fold ? (
                <Button variant="ghost" aria-expanded={shown} onClick={() => setUnfolded(!shown)}>
                  {label}
                  {shown ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                </Button>
              ) : (
                <h2 className={`${HEAD} text-fg-2`}>{label}</h2>
              )}
              {shown && (
                <div className="flex w-full flex-col items-start gap-4">
                  <Cards rows={rows} card={card} />
                  <LoadMore page={list} />
                </div>
              )}
            </section>
          )
        }
        if (!rows.length) return null
        const [dot, text] = LOOK[g]
        const limit = STEP + (extra[g] ?? 0)
        return (
          <section key={g} aria-label={t(GROUP_KEY[g])} className="flex flex-col items-start gap-4">
            <h2 className={`${HEAD} ${text}`}>
              <span aria-hidden className={`size-2 rounded-full ${dot}`} />
              {t(GROUP_KEY[g])}
              <span className="tabular-nums">{rows.length}</span>
            </h2>
            <Cards rows={rows.slice(0, limit)} card={card} />
            {rows.length > limit && (
              <Button
                variant="ghost"
                onClick={() => setExtra((x) => ({ ...x, [g]: (x[g] ?? 0) + STEP }))}
              >
                {t('showMoreTasks', { n: Math.min(STEP, rows.length - limit) })}
              </Button>
            )}
          </section>
        )
      })}
    </div>
  )
}
