import { CalendarHeart, PartyPopper } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { Profile } from '@daily-status/core/database.types'
import {
  rateOf,
  useDashboard,
  useOverdueTasks,
  useTaskCounts,
  type Ranked,
  type TrendDay
} from '@daily-status/core/dashboard'
import { fmtDate, fmtHours, fmtShort, initials, nameOf } from '@daily-status/core/format'
import { useT } from '@daily-status/core/i18n'
import { LEAVE_HALF_KEY } from '@daily-status/core/leave'
import { useSignupRequests } from '@daily-status/core/signupService'
import { lateDays, STATUS_KEY, TASK_STATUSES, type TaskView } from '@daily-status/core/taskService'
import { usePendingLeave } from '@daily-status/core/useLeave'
import { addDays } from '@daily-status/core/workdays'
import { useOpenDetails } from '../lib/details'
import type { View } from '../lib/nav'
import { Avatar, Button, Card, Empty, Notice, PageHeader, Skeleton, Stat } from './ui'

export type Focus = { person?: string; taskView?: TaskView }
export type Go = (view: View, focus?: Focus) => void

const Person = ({
  person,
  note,
  onOpen
}: {
  person: Profile
  note: string
  onOpen: () => void
}): React.JSX.Element => (
  <li>
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-hover"
    >
      <Avatar text={initials(person)} />
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{nameOf(person)}</span>
      <span className="shrink-0 text-xs text-fg-2">{note}</span>
    </button>
  </li>
)

const People = ({
  rows,
  none,
  children
}: {
  rows: unknown[]
  none: string
  children: ReactNode
}): React.JSX.Element =>
  rows.length ? (
    <ul className="-m-2 flex flex-col">{children}</ul>
  ) : (
    <p className="text-sm text-fg-2">{none}</p>
  )

// One bar per working day; the hidden list is the chart's table view.
const Trend = ({ days }: { days: TrendDay[] }): React.JSX.Element => {
  const { t, locale } = useT()
  const [hover, setHover] = useState<TrendDay>()
  const label = (d: TrendDay): string =>
    t('homeTrendDay', { day: fmtShort(d.day, locale), done: d.submitted, n: d.expected })
  return (
    <div>
      <p className="mb-2 h-[1lh] text-xs text-fg-2" aria-hidden>
        {hover && label(hover)}
      </p>
      <ol
        className="flex h-32 items-end gap-0.5 border-b border-line"
        onMouseLeave={() => setHover(undefined)}
      >
        {days.map((d) => (
          <li
            key={d.day}
            onMouseEnter={() => setHover(d)}
            className="flex h-full min-w-0 flex-1 items-end"
          >
            <span className="sr-only">{label(d)}</span>
            <span
              aria-hidden
              className={`w-full rounded-t-[4px] ${hover?.day === d.day ? 'bg-accent-fg' : 'bg-accent'}`}
              style={{
                height: `${d.expected ? (100 * d.submitted) / d.expected : 0}%`,
                minHeight: 2
              }}
            />
          </li>
        ))}
      </ol>
      <div className="mt-1 flex justify-between text-xs text-fg-3" aria-hidden>
        <span>{days[0] && fmtShort(days[0].day, locale)}</span>
        <span>{t('today')}</span>
      </div>
    </div>
  )
}

const Signups = ({ onOpen }: { onOpen: () => void }): React.JSX.Element => {
  const { t } = useT()
  const q = useSignupRequests()
  const n = q.state === 'ok' ? q.data.length : 0
  return (
    <Stat
      label={t('homeSignupsWaiting')}
      value={n}
      tone={n ? 'warn' : 'idle'}
      loading={q.state === 'loading'}
      onClick={q.state === 'ok' ? onOpen : undefined}
    />
  )
}

export const HomePage = ({ me, onOpen }: { me: Profile; onOpen: Go }): React.JSX.Element => {
  const { t, locale } = useT()
  const [dash, reload] = useDashboard(me.id)
  const [counts] = useTaskCounts(me.id)
  const [late] = useOverdueTasks(me.id)
  const [leave] = usePendingLeave(me.id)
  const openTask = useOpenDetails()
  const [range, setRange] = useState<7 | 30>(7)
  const d = dash.state === 'ok' ? dash.data : null
  const n = counts.state === 'ok' ? counts.data : null
  const waiting = leave.state === 'ok' ? leave.data.length : 0
  const person = (id: string) => (): void => onOpen('team', { person: id })
  const trend = d?.trend.filter((x) => x.day > addDays(d.day, -range)) ?? []

  return (
    <>
      <PageHeader
        title={t('navHome')}
        subtitle={t('homeSubtitle', { day: fmtDate(d?.day ?? '', locale) || t('today') })}
        action={
          <Button variant="ghost" onClick={reload}>
            {t('refresh')}
          </Button>
        }
      />
      {dash.state === 'error' && <Notice tone="bad">{t(dash.message)}</Notice>}
      <div className="flex flex-col gap-6">
        <section aria-label={t('homeToday')} className="flex flex-col gap-3">
          {d?.off && (
            <Notice>{d.holiday ? t('homeHoliday', { name: d.holiday }) : t('homeDayOff')}</Notice>
          )}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-3">
            <Stat
              label={t('homeSent')}
              value={d ? `${d.submitted}/${d.expected}` : ''}
              sub={t('homeSentSub')}
              loading={!d}
              onClick={d ? () => onOpen('team') : undefined}
            />
            <Stat
              label={t('homeMissing')}
              value={d?.missing.length ?? ''}
              {...(d?.missing.length && { sub: t('homeMissingSub') })}
              tone={d?.missing.length ? 'warn' : 'idle'}
              loading={!d}
              onClick={d ? () => onOpen('team') : undefined}
            />
            <Stat
              label={t('homeHours')}
              value={d ? fmtHours(d.hours, t) : ''}
              sub={t('statHoursSub')}
              loading={!d}
            />
            <Stat
              label={t('homeAway')}
              value={d?.away.length ?? ''}
              loading={!d}
              onClick={d ? () => onOpen('leaveRequests') : undefined}
            />
          </div>
        </section>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(20rem,1fr))] gap-6">
          <Card title={t('homeDecide')}>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-3">
              <Stat
                label={t('homeLeaveWaiting')}
                value={waiting}
                tone={waiting ? 'warn' : 'idle'}
                loading={leave.state === 'loading'}
                onClick={leave.state === 'ok' ? () => onOpen('leaveRequests') : undefined}
              />
              {me.role === 'admin' && <Signups onOpen={() => onOpen('team')} />}
            </div>
          </Card>

          <Card title={t('homeAway')}>
            {d ? (
              <People rows={d.away} none={t('homeAwayNone')}>
                {d.away.map((a) => (
                  <Person
                    key={a.person.id}
                    person={a.person}
                    note={t(LEAVE_HALF_KEY[a.half])}
                    onOpen={person(a.person.id)}
                  />
                ))}
              </People>
            ) : (
              <Skeleton className="h-10" />
            )}
          </Card>
        </div>

        <Card title={t('homeTasks')}>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-3">
            <Stat
              label={t('taskOverdue')}
              value={n?.overdue ?? ''}
              tone={n?.overdue ? 'bad' : 'idle'}
              loading={!n}
              onClick={n ? () => onOpen('taskBoard', { taskView: 'overdue' }) : undefined}
            />
            {TASK_STATUSES.map((s) => (
              <Stat
                key={s}
                label={t(STATUS_KEY[s])}
                value={n?.[s] ?? ''}
                loading={!n}
                onClick={n ? () => onOpen('taskBoard') : undefined}
              />
            ))}
          </div>
          {late.state === 'ok' && late.data.length > 0 && (
            <>
              <h3 className="mt-5 mb-2 text-sm font-medium text-fg-2">{t('homeLateTasks')}</h3>
              <ul className="-mx-2 flex flex-col">
                {late.data.map((task) => {
                  const days = lateDays(task.due_date)
                  return (
                    <li key={task.id}>
                      <button
                        type="button"
                        onClick={() => openTask({ kind: 'task', id: task.id })}
                        className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-hover"
                      >
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">
                          {task.title}
                        </span>
                        <span className="shrink-0 text-xs text-bad-fg">
                          {days === 1 ? t('taskLateOne') : t('taskLate', { n: days })}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </Card>

        <Card
          title={t('homeTrend')}
          action={
            <div role="group" aria-label={t('homeTrend')} className="flex gap-1">
              {([7, 30] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={range === r}
                  onClick={() => setRange(r)}
                  className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition-colors ${
                    range === r
                      ? 'bg-selected text-fg ring-accent-fg'
                      : 'text-fg-2 ring-line hover:bg-hover'
                  }`}
                >
                  {t(r === 7 ? 'homeLast7' : 'homeLast30')}
                </button>
              ))}
            </div>
          }
        >
          {d ? (
            <>
              <p className="mb-3 text-sm text-fg-2">{t('homeTrendSub', { n: rateOf(trend) })}</p>
              <Trend days={trend} />
            </>
          ) : (
            <Skeleton className="h-40" />
          )}
        </Card>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(16rem,1fr))] gap-6">
          <Ranking
            title={t('homeMissedMost')}
            sub={t('homeMissedSub')}
            rows={d?.missedMost}
            none={t('homeNoMisses')}
            note={(n) => (n === 1 ? t('homeMissedOne') : t('homeMissedN', { n }))}
            onOpen={(id) => onOpen('team', { person: id })}
          />
          <Ranking
            title={t('homeStreaks')}
            sub={t('homeStreaksSub')}
            rows={d?.streaks}
            none={t('homeNoStreaks')}
            note={(n) => (n === 1 ? t('homeStreakOne') : t('homeStreakN', { n }))}
            onOpen={(id) => onOpen('team', { person: id })}
          />
          <Card title={t('homeComing')}>
            {d ? (
              d.soon.length || d.nextHoliday ? (
                <ul className="-m-2 flex flex-col">
                  {d.nextHoliday && (
                    <li className="flex items-center gap-3 p-2">
                      <span
                        aria-hidden
                        className="grid size-9 shrink-0 place-items-center rounded-full bg-accent/15 text-accent-fg"
                      >
                        <PartyPopper size={16} />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">
                        {d.nextHoliday.name}
                      </span>
                      <span className="shrink-0 text-xs text-fg-2">
                        {fmtShort(d.nextHoliday.day, locale)}
                      </span>
                    </li>
                  )}
                  {d.soon.map((l) => (
                    <Person
                      key={l.id}
                      person={l.person}
                      note={t('homeComingLeave', { day: fmtShort(l.start_day, locale) })}
                      onOpen={person(l.user_id)}
                    />
                  ))}
                </ul>
              ) : (
                <Empty icon={<CalendarHeart size={24} />} title={t('homeNoComing')} />
              )
            ) : (
              <Skeleton className="h-10" />
            )}
          </Card>
        </div>
      </div>
    </>
  )
}

const Ranking = ({
  title,
  sub,
  rows,
  none,
  note,
  onOpen
}: {
  title: string
  sub: string
  rows: Ranked[] | undefined
  none: string
  note: (n: number) => string
  onOpen: (id: string) => void
}): React.JSX.Element => (
  <Card title={title}>
    <p className="mb-3 text-xs text-fg-3">{sub}</p>
    {rows ? (
      <People rows={rows} none={none}>
        {rows.map((r) => (
          <Person
            key={r.person.id}
            person={r.person}
            note={note(r.n)}
            onOpen={() => onOpen(r.person.id)}
          />
        ))}
      </People>
    ) : (
      <Skeleton className="h-10" />
    )}
  </Card>
)
