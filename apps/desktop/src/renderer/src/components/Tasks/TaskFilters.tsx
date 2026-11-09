import { nameOf } from '@daily-status/core/format'
import { useT } from '@daily-status/core/i18n'
import {
  VIEW_KEY,
  type Assignee,
  type TaskFilter,
  type TaskView
} from '@daily-status/core/taskService'
import { Button, Input, Select } from '../ui'

type Props = {
  views: readonly TaskView[]
  count: (view: TaskView) => number
  f: TaskFilter
  set: (patch: Partial<TaskFilter>) => void
  active: boolean
  clear: () => void
  // Left out where a person only sees their own tasks.
  people?: readonly Assignee[]
}

export const TaskFilters = ({
  views,
  count,
  f,
  set,
  active,
  clear,
  people
}: Props): React.JSX.Element => {
  const { t } = useT()
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <div role="group" aria-label={t('taskViews')} className="flex flex-wrap gap-1.5">
        {views.map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={f.view === v}
            onClick={() => set({ view: v })}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition-[background-color,color] duration-150 ease-enter ${
              f.view === v
                ? 'bg-selected text-fg ring-accent-fg'
                : 'text-fg-2 ring-line hover:bg-hover'
            }`}
          >
            {t(VIEW_KEY[v])} <span className="tabular-nums">{count(v)}</span>
          </button>
        ))}
      </div>
      <div className="flex min-w-0 flex-[1_1_24rem] flex-wrap items-center gap-3">
        <div className="min-w-40 flex-1">
          <Input
            type="search"
            aria-label={t('search')}
            value={f.search}
            onChange={(e) => set({ search: e.target.value })}
            placeholder={t('searchTasks')}
          />
        </div>
        {people && (
          <div className="min-w-40 flex-1">
            <Select
              aria-label={t('roleStaff')}
              value={f.person}
              onChange={(e) => set({ person: e.target.value })}
            >
              <option value="">{t('allMembers')}</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {nameOf(p)}
                </option>
              ))}
            </Select>
          </div>
        )}
        {active && (
          <Button variant="ghost" onClick={clear}>
            {t('clearFilters')}
          </Button>
        )}
      </div>
    </div>
  )
}
