import { getAllTeamStatuses, getTeamSummaryMetrics } from '@daily-status/core/adminService'
import { fmtHours, nameOf } from '@daily-status/core/format'
import { useT } from '@daily-status/core/i18n'
import { today } from '@daily-status/core/supabase'
import { useDebounced } from '@daily-status/core/useDebounced'
import { useQuery } from '@daily-status/core/useQuery'
import { CardsSkeleton, PeopleSkeleton } from '../Skeletons'
import { StatusCard } from '../StatusCard'
import { Card, Field, Input, Notice, Select, Stat } from '../ui'

export type FeedFilters = { date: string; userId: string; search: string }

type Props = {
  f: FeedFilters
  onFilter: (p: Partial<FeedFilters>) => void
  dayLabel: string
  nonce: number
  onOpenPerson: (id: string) => void
}

export const TeamFeed = ({
  f,
  onFilter,
  dayLabel,
  nonce,
  onOpenPerson
}: Props): React.JSX.Element => {
  const { t } = useT()
  const filters = { ...f, search: useDebounced(f.search) }
  // Metrics need a single day; with the date filter cleared they fall back to today.
  const day = f.date || today()
  const [metrics] = useQuery(`metrics:${day}:${nonce}`, () => getTeamSummaryMetrics(day))
  const [feed] = useQuery(`feed:${JSON.stringify(filters)}:${nonce}`, () =>
    getAllTeamStatuses(filters)
  )
  const m = metrics.state === 'ok' ? metrics.data : null

  return (
    <>
      {metrics.state === 'error' && (
        <div className="mb-4">
          <Notice tone="bad">{t(metrics.message)}</Notice>
        </div>
      )}
      <div className="mb-6 grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-3">
        <Stat
          loading={metrics.state === 'loading'}
          label={t('statSubmitted')}
          value={m ? `${m.submitted}/${m.members.length}` : '–'}
          sub={t('statSubmittedSub')}
        />
        <Stat
          loading={metrics.state === 'loading'}
          label={t('hoursWorked')}
          value={m ? fmtHours(m.hours, t) : '–'}
          sub={t('statHoursSub')}
        />
        <Stat
          loading={metrics.state === 'loading'}
          label={t('statPending')}
          value={m?.missing.length ?? '–'}
          tone={m?.missing.length ? 'warn' : 'idle'}
          sub={t('statPendingSub')}
        />
      </div>

      <Card className="mb-6">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] gap-4">
          <Field label={t('date')} hint={t('dateHint')}>
            <Input
              type="date"
              value={f.date}
              max={today()}
              onChange={(e) => onFilter({ date: e.target.value })}
            />
          </Field>
          <Field label={t('roleMember')}>
            <Select value={f.userId} onChange={(e) => onFilter({ userId: e.target.value })}>
              <option value="">{t('allMembers')}</option>
              {m?.members.map((p) => (
                <option key={p.id} value={p.id}>
                  {nameOf(p)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('search')}>
            <Input
              type="search"
              value={f.search}
              onChange={(e) => onFilter({ search: e.target.value })}
              placeholder={t('adminSearch')}
            />
          </Field>
        </div>
      </Card>

      {/* Side by side while the feed gets 28rem; stacks at large text sizes, since rem grows with them. */}
      <div className="flex flex-wrap items-start gap-6">
        <section className="flex min-w-0 flex-[999_1_28rem] flex-col gap-3">
          {feed.state === 'loading' ? (
            <CardsSkeleton author />
          ) : feed.state === 'error' ? (
            <Notice tone="bad">{t(feed.message)}</Notice>
          ) : feed.data.length ? (
            feed.data.map((s) => <StatusCard key={s.id} status={s} author={s.profile} />)
          ) : (
            <Notice>{t('noFeed')}</Notice>
          )}
        </section>

        <Card title={t('notSubmittedOn', { day: dayLabel })} className="flex-[1_1_17.5rem]">
          {!m ? (
            metrics.state === 'loading' && <PeopleSkeleton count={4} avatar={false} />
          ) : m.missing.length ? (
            <ul className="-mx-2 flex flex-col gap-1">
              {m.missing.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onOpenPerson(p.id)}
                    aria-label={t('openHistory', { name: nameOf(p) })}
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-hover"
                  >
                    <span className="size-2 shrink-0 rounded-full bg-warn" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-fg">{nameOf(p)}</span>
                      <span className="block truncate text-xs text-fg-3">{p.email}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <Notice tone="ok">{t('everyoneDone')}</Notice>
          )}
        </Card>
      </div>
    </>
  )
}
