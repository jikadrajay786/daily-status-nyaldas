import { ClipboardList, Columns3, List, SearchX } from 'lucide-react'
import { useCommentCounts } from '@daily-status/core/commentService'
import { useState, type ComponentProps } from 'react'
import type { Profile, TaskStatus } from '@daily-status/core/database.types'
import type { Tone } from '@daily-status/core/format'
import { initials, nameOf } from '@daily-status/core/format'
import { useT } from '@daily-status/core/i18n'
import { useLiveQuery } from '@daily-status/core/live'
import {
  byUrgency,
  inView,
  listPeople,
  QUICK_VIEWS,
  STATUS_KEY,
  STATUS_TONE,
  TASK_STATUSES,
  VIEW_KEY,
  type Assignee,
  type BoardTask,
  type TaskFilter,
  type TaskView
} from '@daily-status/core/taskService'
import {
  useBoardTasks,
  useTaskFilter,
  useUpdateTaskStatus,
  type TaskList
} from '@daily-status/core/useTasks'
import { useOpenDetails } from '../../lib/details'
import { CardsSkeleton } from '../Skeletons'
import { LoadMore, Avatar, Button, Notice, PageHeader, Empty } from '../ui'
import { CommentsButton } from '../CommentsButton'
import { Members } from './Members'
import { ShareButton } from './ShareButton'
import { StatusPicker } from './StatusPicker'
import { TaskFilters } from './TaskFilters'
import { TaskForm } from './TaskForm'
import { TaskGroups } from './TaskGroups'
import { TaskMeta } from './TaskMeta'

const DOT: Record<Tone, string> = {
  idle: 'bg-fg-3',
  info: 'bg-info',
  ok: 'bg-ok',
  warn: 'bg-warn',
  bad: 'bg-bad'
}
const PILE = 4
const COLUMN = 20
const SUMMARY = [
  ['today', 'text-info-fg'],
  ['overdue', 'text-warn-fg'],
  ['blocked', 'text-bad-fg']
] as const satisfies readonly (readonly [TaskView, string])[]
const LAYOUTS = [
  ['list', 'layoutList', List],
  ['board', 'layoutBoard', Columns3]
] as const
type Layout = (typeof LAYOUTS)[number][0]
const LAYOUT_KEY = 'taskLayout'

// Overlapping avatars keep a card short however many people share it; the names stay readable underneath.
export const People = ({ people }: { people: Assignee[] }): React.JSX.Element => {
  const { t } = useT()
  const names = people.map(nameOf).join(', ')
  return (
    <div title={names}>
      <p className="mb-1.5 text-xs font-medium text-fg-3">{t('taskAssignedTo')}</p>
      <div className="flex items-center gap-2">
        <div className="flex shrink-0 -space-x-2">
          {people.slice(0, PILE).map((p) => (
            <span key={p.id} className="rounded-full ring-2 ring-card">
              <Avatar text={initials(p)} />
            </span>
          ))}
          {people.length > PILE && (
            <span className="grid size-9 place-items-center rounded-full bg-selected text-xs font-semibold text-fg-2 ring-2 ring-card">
              +{people.length - PILE}
            </span>
          )}
        </div>
        <span className="min-w-0 truncate text-sm text-fg-2">{names}</span>
      </div>
    </div>
  )
}

const Progress = ({ done, total }: { done: number; total: number }): React.JSX.Element => {
  const { t } = useT()
  return (
    <div className="flex items-center gap-3">
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-label={t('taskProgress', { done, total })}
        className="h-2 flex-1 overflow-hidden rounded-full bg-selected"
      >
        <div
          className="h-full rounded-full bg-ok transition-[width] duration-500 ease-enter"
          style={{ width: `${(done / total) * 100}%` }}
        />
      </div>
      <span className="text-sm text-fg-2 tabular-nums">{t('taskProgress', { done, total })}</span>
    </div>
  )
}

// The one person a task is given to can be updated on the card (or by dragging it); a shared task changes person by
// person in its details.
const solo = (task: BoardTask): BoardTask['assignees'][number] | undefined =>
  task.assignees.length === 1 && task.assignees[0]?.editable ? task.assignees[0] : undefined

const TaskCard = ({
  task,
  me,
  comments,
  className = '',
  ...props
}: {
  task: BoardTask
  me: string
  comments?: number | undefined
} & ComponentProps<'article'>): React.JSX.Element => {
  const { t } = useT()
  const open = useOpenDetails()
  const one = solo(task)
  return (
    <article
      {...props}
      className={`flex w-full flex-col gap-3 rounded-xl border border-line bg-card p-4 transition-[box-shadow,translate,opacity] duration-200 ease-enter hover:-translate-y-0.5 hover:shadow-raised ${className}`}
    >
      <h3 className="font-semibold tracking-tight text-fg">{task.title}</h3>
      <TaskMeta task={task} />
      {task.description && (
        <p className="text-sm/relaxed whitespace-pre-line text-fg-2">{task.description}</p>
      )}
      {task.assignees.length > 1 ? (
        <>
          <Members task={task} me={me} short />
          <Button
            variant="ghost"
            className="self-start"
            onClick={() => open({ kind: 'task', id: task.id })}
          >
            {t('taskUpdateProgress')}
          </Button>
        </>
      ) : (
        <>
          <People people={task.assignees} />
          {one && <StatusPicker taskId={task.id} userId={one.id} status={one.status} />}
        </>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <CommentsButton target={{ kind: 'task', id: task.id }} count={comments} />
        <ShareButton task={task} />
      </div>
    </article>
  )
}

// Tapping a tile shows just those tasks; tapping it again shows everything.
const Summary = ({
  count,
  view,
  set
}: {
  count: (view: TaskView) => number
  view: TaskView
  set: (patch: Partial<TaskFilter>) => void
}): React.JSX.Element => {
  const { t } = useT()
  return (
    <div
      role="group"
      aria-label={t('taskSummary')}
      className="grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-3"
    >
      {SUMMARY.map(([v, tone]) => (
        <button
          key={v}
          type="button"
          aria-pressed={view === v}
          onClick={() => set({ view: view === v ? 'all' : v })}
          className={`rounded-xl border p-4 text-left shadow-soft transition-[background-color,border-color] duration-150 ease-enter ${
            view === v ? 'border-accent-fg bg-selected' : 'border-line bg-card hover:bg-hover'
          }`}
        >
          <span className="block text-sm font-medium text-fg-2">{t(VIEW_KEY[v])}</span>
          <span
            className={`mt-1 block text-3xl font-semibold tracking-tight tabular-nums ${count(v) ? tone : 'text-fg-3'}`}
          >
            {count(v)}
          </span>
        </button>
      ))}
    </div>
  )
}

const LayoutPicker = ({
  value,
  onChange
}: {
  value: Layout
  onChange: (layout: Layout) => void
}): React.JSX.Element => {
  const { t } = useT()
  return (
    <div
      role="group"
      aria-label={t('taskLayout')}
      className="flex rounded-lg p-0.5 ring-1 ring-line"
    >
      {LAYOUTS.map(([id, key, Icon]) => (
        <button
          key={id}
          type="button"
          aria-pressed={value === id}
          onClick={() => onChange(id)}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-[background-color,color] duration-150 ease-enter ${
            value === id ? 'bg-selected text-fg' : 'text-fg-2 hover:bg-hover'
          }`}
        >
          <Icon aria-hidden className="size-4" />
          {t(key)}
        </button>
      ))}
    </div>
  )
}

// Native drag and drop (no library). The card moves at once and snaps back if the save fails; the status pills
// on each card stay the keyboard and screen-reader way to do the same thing.
const DRAG_TYPE = 'application/x-daily-status-task'

const Board = ({
  list,
  view,
  counts,
  me
}: {
  list: TaskList<BoardTask>
  view: TaskView
  counts: Record<string, number>
  me: string
}): React.JSX.Element => {
  const { t } = useT()
  const tasks = list.rows
  const { run, error } = useUpdateTaskStatus()
  const [moved, setMoved] = useState<Readonly<Record<string, TaskStatus>>>({})
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<TaskStatus | null>(null)
  const [extra, setExtra] = useState<Partial<Record<TaskStatus, number>>>({})
  const statusOf = (task: BoardTask): TaskStatus => moved[task.id] ?? task.status
  const without = (id: string) => (m: Readonly<Record<string, TaskStatus>>) =>
    Object.fromEntries(Object.entries(m).filter(([k]) => k !== id))
  // Once the refetch agrees with a drop, or a filter hides the card, the server copy takes over again.
  const settled = Object.keys(moved).find((id) => {
    const task = tasks.find((x) => x.id === id)
    return !task || task.status === moved[id]
  })
  if (settled) setMoved(without(settled))
  const shownDone = tasks.filter((task) => statusOf(task) === 'completed').length
  const loadedDone = tasks.filter((task) => task.status === 'completed').length
  const done = list.done + shownDone - loadedDone

  const drop = async (status: TaskStatus): Promise<void> => {
    const task = tasks.find((x) => x.id === dragging)
    const one = task && solo(task)
    setDragging(null)
    setOver(null)
    if (!task || !one || statusOf(task) === status) return
    setMoved((m) => ({ ...m, [task.id]: status }))
    if (!(await run({ taskId: task.id, userId: one.id, status }))) setMoved(without(task.id))
  }

  return (
    <>
      {view === 'all' && list.count('all') > 0 && (
        <Progress done={done} total={list.count('all')} />
      )}
      <p className="-mt-3 text-xs text-fg-3">{t('boardDragHint')}</p>
      {error && <Notice tone="bad">{t(error)}</Notice>}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] gap-4">
        {TASK_STATUSES.map((s) => {
          const group = byUrgency(
            tasks.filter((task) => {
              const status = statusOf(task)
              return status === s && inView({ ...task, status }, view)
            })
          )
          // A card just dropped here goes first, so it can't land past the cut-off. Finished tasks page on the server.
          const sorted = [...group.filter((x) => moved[x.id]), ...group.filter((x) => !moved[x.id])]
          const finished = s === 'completed'
          const limit = finished ? group.length : COLUMN + (extra[s] ?? 0)
          return (
            <section
              key={s}
              aria-label={t(STATUS_KEY[s])}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes(DRAG_TYPE)) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                if (over !== s) setOver(s)
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null)
              }}
              onDrop={(e) => {
                e.preventDefault()
                void drop(s)
              }}
              className={`-m-2 flex min-h-48 flex-col gap-3 rounded-2xl p-2 outline-2 -outline-offset-2 transition-[background-color,outline-color] duration-150 ease-enter ${
                over === s ? 'bg-selected outline-accent-fg outline-dashed' : 'outline-transparent'
              }`}
            >
              <h2 className="flex items-center gap-2 text-xs font-semibold tracking-wider text-fg-2 uppercase">
                <span aria-hidden className={`size-2 rounded-full ${DOT[STATUS_TONE[s]]}`} />
                {t(STATUS_KEY[s])}
                <span className="ml-auto tabular-nums">
                  {finished && view === 'all' ? done : group.length}
                </span>
              </h2>
              {sorted.slice(0, limit).map((task, i) => {
                const shown = { ...task, status: s }
                const draggable = !!solo(task)
                return (
                  // Keyed by status too, so a card that moves column rises into its new place.
                  <TaskCard
                    key={`${task.id}:${s}`}
                    task={shown}
                    me={me}
                    comments={counts[task.id]}
                    draggable={draggable}
                    onDragStart={(e) => {
                      e.dataTransfer.setData(DRAG_TYPE, task.id)
                      e.dataTransfer.effectAllowed = 'move'
                      setDragging(task.id)
                    }}
                    onDragEnd={() => {
                      setDragging(null)
                      setOver(null)
                    }}
                    style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
                    className={`animate-rise ${draggable ? 'cursor-grab active:cursor-grabbing' : ''} ${
                      dragging === task.id ? 'opacity-40' : ''
                    }`}
                  />
                )
              })}
              {group.length > limit && (
                <Button
                  variant="ghost"
                  onClick={() => setExtra((x) => ({ ...x, [s]: (x[s] ?? 0) + COLUMN }))}
                >
                  {t('showMoreTasks', { n: Math.min(COLUMN, group.length - limit) })}
                </Button>
              )}
              {finished && view === 'all' && <LoadMore page={list} />}
            </section>
          )
        })}
      </div>
    </>
  )
}

export const TaskBoard = ({
  profile,
  view
}: {
  profile: Profile
  view?: TaskView | undefined
}): React.JSX.Element => {
  const { t } = useT()
  const { f, set, clear, active } = useTaskFilter(view)
  const [tasks, reload] = useBoardTasks(profile, f)
  const [people] = useLiveQuery(`task-people:${profile.role}`, () => listPeople(profile.role))
  const [open, setOpen] = useState(false)
  const [layout, setLayout] = useState<Layout>(() =>
    localStorage.getItem(LAYOUT_KEY) === 'board' ? 'board' : 'list'
  )
  const counts = useCommentCounts(
    'task',
    tasks.state === 'ok' ? tasks.data.rows.map((x) => x.id) : []
  )
  const any = tasks.state === 'ok' && (tasks.data.count('all') > 0 || active)
  return (
    <>
      <PageHeader
        title={t('navTaskBoard')}
        subtitle={t('taskBoardSubtitle')}
        action={
          <div className="flex flex-wrap items-center gap-3">
            {any && (
              <LayoutPicker
                value={layout}
                onChange={(l) => {
                  setLayout(l)
                  localStorage.setItem(LAYOUT_KEY, l)
                }}
              />
            )}
            <Button
              variant={open ? 'ghost' : 'primary'}
              aria-expanded={open}
              onClick={() => setOpen(!open)}
            >
              {t(open ? 'close' : 'newTask')}
            </Button>
          </div>
        }
      >
        {tasks.state === 'ok' && any && (
          <TaskFilters
            views={QUICK_VIEWS}
            count={tasks.data.count}
            f={f}
            set={set}
            active={active}
            clear={clear}
            people={people.state === 'ok' ? people.data : []}
          />
        )}
      </PageHeader>
      <div className="flex flex-col gap-6">
        <TaskForm role={profile.role} open={open} onCreated={reload} />
        {tasks.state === 'ok' && any && (
          <Summary count={tasks.data.count} view={f.view} set={set} />
        )}
        {tasks.state === 'loading' ? (
          <CardsSkeleton />
        ) : tasks.state === 'error' ? (
          <div className="flex flex-col items-start gap-3">
            <Notice tone="bad">{t(tasks.message)}</Notice>
            <Button variant="ghost" onClick={reload}>
              {t('tryAgain')}
            </Button>
          </div>
        ) : !tasks.data.count('all') && !active ? (
          <Empty
            icon={<ClipboardList className="size-7" />}
            title={t('taskBoardEmpty')}
            hint={t('taskBoardEmptyHint')}
          />
        ) : tasks.data.count(f.view) ? (
          layout === 'board' ? (
            <Board list={tasks.data} view={f.view} counts={counts} me={profile.id} />
          ) : (
            <TaskGroups
              list={tasks.data}
              view={f.view}
              card={(task) => <TaskCard task={task} me={profile.id} comments={counts[task.id]} />}
            />
          )
        ) : (
          <Empty
            icon={<SearchX className="size-7" />}
            title={t('noTaskMatch')}
            hint={t('noTaskMatchHint')}
          />
        )}
      </div>
    </>
  )
}
