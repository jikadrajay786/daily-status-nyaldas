import { Flame } from 'lucide-react'
import { useBusy } from '@daily-status/core/useBusy'
import { useId, useState } from 'react'
import {
  getIndividualUserHistory,
  getIndividualUserMetrics,
  getUserStreak,
  type DirectoryEntry
} from '@daily-status/core/adminService'
import { fmtHours, fmtShort, initials, nameOf } from '@daily-status/core/format'
import { useT, type Key } from '@daily-status/core/i18n'
import { deleteStatus } from '@daily-status/core/statusService'
import { today } from '@daily-status/core/supabase'
import { useDebounced } from '@daily-status/core/useDebounced'
import { useLiveQuery } from '@daily-status/core/live'
import { errMsg } from '@daily-status/core/useQuery'
import {
  addDays,
  clampRange,
  localDay,
  MAX_RANGE_DAYS,
  presetRange,
  type Preset
} from '@daily-status/core/workdays'
import { CalendarSkeleton, CardsSkeleton } from '../Skeletons'
import { StatusCard } from '../StatusCard'
import { Avatar, Badge, Button, Card, Field, Input, Notice, Skeleton, Stat } from '../ui'
import { StatusEditForm } from './StatusEditForm'
import { SubmissionCalendar } from './SubmissionCalendar'

const PRESETS: readonly [Preset, Key][] = [
  ['week', 'thisWeek'],
  ['month', 'thisMonth'],
  ['custom', 'customRange']
]

type Props = { person: DirectoryEntry; version: string; onChanged: () => void }

export const UserHistoryDetail = ({ person, version, onChanged }: Props): React.JSX.Element => {
  const { t, locale } = useT()
  const periodId = useId()
  const now = today()
  const [preset, setPreset] = useState<Preset>('month')
  const [custom, setCustom] = useState(() => presetRange('month', now))
  const [search, setSearch] = useState('')
  const q = useDebounced(search)
  const range = preset === 'custom' ? clampRange(custom, now) : presetRange(preset, now)
  const key = `${person.id}:${range.start}:${range.end}:${version}`
  const [metrics] = useLiveQuery(`umetrics:${key}`, () =>
    getIndividualUserMetrics(person.id, range.start, range.end)
  )
  const [history] = useLiveQuery(`uhistory:${key}:${q}`, () =>
    getIndividualUserHistory(person.id, range.start, range.end, q)
  )
  const [streak] = useLiveQuery(`streak:${person.id}:${version}`, () => getUserStreak(person.id))
  const [editing, setEditing] = useState<string>()
  const [confirming, setConfirming] = useState<string>()
  const [error, setError] = useState<Key>()
  const m = metrics.state === 'ok' ? metrics.data : null
  const name = nameOf(person)

  const pick = (p: Preset): void => {
    // Custom starts from whatever range was showing, so switching doesn't jump the view.
    if (p === 'custom') setCustom(range)
    setPreset(p)
  }

  const [deleting, runDelete] = useBusy()
  const remove = (id: string): Promise<void> =>
    runDelete(async () => {
      try {
        await deleteStatus(id)
        setError(undefined)
        setConfirming(undefined)
        onChanged()
      } catch (err) {
        setError(errMsg(err))
      }
    })

  return (
    <>
      <Card className="mb-6">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
          <div className="flex min-w-0 flex-[1_1_16rem] items-center gap-4">
            <Avatar size="lg" text={initials(person)} />
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold text-fg">{name}</h2>
              <p className="truncate text-sm text-fg-2">{person.email}</p>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-fg-3">
                <Badge
                  label={t(person.role === 'admin' ? 'roleAdmin' : 'roleMember')}
                  tone={person.role === 'admin' ? 'warn' : 'idle'}
                />
                {t('joinedOn', { date: fmtShort(localDay(person.created_at), locale) })}
              </p>
            </div>
          </div>
          <dl className="flex gap-8">
            <div>
              <dt className="text-xs font-medium text-fg-2">{t('totalDays')}</dt>
              <dd className="mt-1 text-2xl font-semibold text-fg tabular-nums">
                {person.submissions}
              </dd>
              <dd className="text-xs text-fg-3">{t('totalDaysSub')}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-fg-2">{t('streak')}</dt>
              <dd className="mt-1 flex items-center gap-1 text-2xl font-semibold text-fg tabular-nums">
                <Flame aria-hidden className="size-5 text-warn-fg" />
                {streak.state === 'loading' ? (
                  <Skeleton className="h-[1lh] w-8" />
                ) : streak.state === 'ok' ? (
                  streak.data
                ) : (
                  '–'
                )}
              </dd>
              <dd className="text-xs text-fg-3">{t('streakDays')}</dd>
            </div>
          </dl>
        </div>
      </Card>

      <Card className="mb-6">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex flex-col gap-1.5 text-sm">
            <span id={periodId} className="font-medium text-fg-2">
              {t('period')}
            </span>
            <div
              role="group"
              aria-labelledby={periodId}
              className="flex gap-0.5 rounded-lg p-0.5 ring-1 ring-line"
            >
              {PRESETS.map(([p, label]) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={preset === p}
                  onClick={() => pick(p)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                    preset === p ? 'bg-selected text-fg' : 'text-fg-2 hover:text-fg'
                  }`}
                >
                  {t(label)}
                </button>
              ))}
            </div>
          </div>
          {preset === 'custom' && (
            <>
              <div className="w-44">
                <Field label={t('from')}>
                  <Input
                    type="date"
                    value={custom.start}
                    min={addDays(range.end, 1 - MAX_RANGE_DAYS)}
                    max={range.end}
                    onChange={(e) => setCustom((c) => ({ ...c, start: e.target.value }))}
                  />
                </Field>
              </div>
              <div className="w-44">
                <Field label={t('to')} hint={t('rangeHint')}>
                  <Input
                    type="date"
                    value={custom.end}
                    min={range.start}
                    max={now}
                    onChange={(e) => setCustom((c) => ({ ...c, end: e.target.value }))}
                  />
                </Field>
              </div>
            </>
          )}
          <div className="min-w-48 flex-1">
            <Field label={t('search')}>
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('searchUpdates')}
              />
            </Field>
          </div>
        </div>
      </Card>

      {metrics.state === 'error' && (
        <div className="mb-4">
          <Notice tone="bad">{t(metrics.message)}</Notice>
        </div>
      )}
      <div className="mb-6 grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-3">
        <Stat
          loading={metrics.state === 'loading'}
          label={t('hoursWorked')}
          value={m ? fmtHours(m.hours, t) : '–'}
          sub={t('hoursInPeriodSub')}
        />
        <Stat
          loading={metrics.state === 'loading'}
          label={t('daysSubmitted')}
          value={m?.submitted ?? '–'}
          // Green only when there were days to submit on: "0 of 0" isn't an achievement.
          tone={m?.workdays && m.submitted === m.workdays ? 'ok' : 'idle'}
          {...(m && { sub: t('ofWorkdays', { n: m.workdays }) })}
        />
        <Stat
          loading={metrics.state === 'loading'}
          label={t('missedDays')}
          value={m?.missing.length ?? '–'}
          tone={m?.missing.length ? 'bad' : 'idle'}
          sub={t('missedDaysSub')}
        />
      </div>

      {(m || metrics.state === 'loading') && (
        <Card title={t('calendar')} className="mb-6">
          {m ? <SubmissionCalendar days={m.days} /> : <CalendarSkeleton />}
        </Card>
      )}

      <h3 className="mb-3 text-xs font-semibold tracking-wider text-fg-2 uppercase">
        {t('updatesInPeriod')}
      </h3>
      {error && (
        <div className="mb-4">
          <Notice tone="bad">{t(error)}</Notice>
        </div>
      )}
      {history.state === 'loading' ? (
        <CardsSkeleton />
      ) : history.state === 'error' ? (
        <Notice tone="bad">{t(history.message)}</Notice>
      ) : history.data.length ? (
        <ol className="ml-1 flex flex-col gap-3 border-l-2 border-line pl-5">
          {history.data.map((s) => (
            <li key={s.id} className="relative">
              <span
                aria-hidden
                className="absolute top-5 -left-[calc(1.5625rem+1px)] size-2.5 rounded-full bg-accent ring-4 ring-canvas"
              />
              {editing === s.id ? (
                <StatusEditForm
                  status={s}
                  name={name}
                  onSaved={() => {
                    setEditing(undefined)
                    onChanged()
                  }}
                  onCancel={() => setEditing(undefined)}
                />
              ) : (
                <StatusCard
                  status={s}
                  actions={
                    // In-app confirm: window.confirm's OK/Cancel buttons stay in the OS language.
                    confirming === s.id ? (
                      <>
                        <span className="mr-auto self-center text-sm text-bad-fg">
                          {t('confirmDelete')}
                        </span>
                        <Button variant="ghost" onClick={() => setConfirming(undefined)}>
                          {t('cancel')}
                        </Button>
                        <Button variant="danger" busy={deleting} onClick={() => remove(s.id)}>
                          {t('yesDelete')}
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button variant="ghost" onClick={() => setEditing(s.id)}>
                          {t('edit')}
                        </Button>
                        <Button variant="danger" onClick={() => setConfirming(s.id)}>
                          {t('delete')}
                        </Button>
                      </>
                    )
                  }
                />
              )}
            </li>
          ))}
        </ol>
      ) : (
        <Notice>{q ? t('noMatch', { q }) : t('noUpdatesInPeriod')}</Notice>
      )}
    </>
  )
}
