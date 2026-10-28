import { getIndividualUserHistory } from '@daily-status/core/adminService'
import type { Holiday, Profile } from '@daily-status/core/database.types'
import { fmtDate } from '@daily-status/core/format'
import { addHoliday, deleteHoliday, useHolidays } from '@daily-status/core/holidayService'
import { useT, type Key } from '@daily-status/core/i18n'
import { bumpLive, useLiveQuery } from '@daily-status/core/live'
import { today } from '@daily-status/core/supabase'
import { useBusy } from '@daily-status/core/useBusy'
import { errMsg } from '@daily-status/core/useQuery'
import {
  addDays,
  daysBetween,
  dayState,
  isWorkday,
  localDay,
  type DayState
} from '@daily-status/core/workdays'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { SubmissionCalendar } from './Admin/SubmissionCalendar'
import { Button, Card, Field, Input, Loading, Notice, PageHeader, Skeleton } from './ui'

const monthEnd = (m: string): string => addDays(`${addDays(`${m}-01`, 32).slice(0, 7)}-01`, -1)
const shift = (m: string, by: 1 | -1): string =>
  (by === 1 ? addDays(`${m}-01`, 32) : addDays(`${m}-01`, -1)).slice(0, 7)

const HolidayRow = ({ h, admin }: { h: Holiday; admin: boolean }): React.JSX.Element => {
  const { t, locale } = useT()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<Key>()
  const [busy, run] = useBusy()
  const remove = (): Promise<void> =>
    run(async () => {
      try {
        await deleteHoliday(h.day)
        bumpLive()
      } catch (err) {
        setError(errMsg(err))
      }
    })
  return (
    <li className="flex flex-col gap-2 py-2.5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto min-w-0">
          <p className="font-medium text-fg">{h.name}</p>
          <p className="text-sm text-fg-2">{fmtDate(h.day, locale)}</p>
        </div>
        {admin &&
          (confirming ? (
            <>
              <span className="text-sm text-bad-fg">
                {t('confirmRemoveHoliday', { name: h.name })}
              </span>
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                {t('cancel')}
              </Button>
              <Button variant="danger" busy={busy} onClick={() => void remove()}>
                {t('yesDelete')}
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              aria-label={t('holidayRemove', { name: h.name })}
              onClick={() => setConfirming(true)}
            >
              {t('delete')}
            </Button>
          ))}
      </div>
      {error && <Notice tone="bad">{t(error)}</Notice>}
    </li>
  )
}

const HolidayList = ({
  list,
  admin,
  empty
}: {
  list: readonly Holiday[]
  admin: boolean
  empty: Key
}): React.JSX.Element => {
  const { t } = useT()
  return list.length ? (
    <ul className="divide-y divide-line">
      {list.map((h) => (
        <HolidayRow key={h.day} h={h} admin={admin} />
      ))}
    </ul>
  ) : (
    <p className="text-sm text-fg-2">{t(empty)}</p>
  )
}

const AddHoliday = (): React.JSX.Element => {
  const { t } = useT()
  const [form, setForm] = useState({ day: today(), name: '' })
  const [error, setError] = useState<Key>()
  const [added, setAdded] = useState(false)
  const [busy, run] = useBusy()
  const submit = (e: FormEvent): Promise<void> => {
    e.preventDefault()
    return run(async () => {
      try {
        await addHoliday(form.day, form.name)
        setForm({ ...form, name: '' })
        setError(undefined)
        setAdded(true)
        bumpLive()
      } catch (err) {
        setAdded(false)
        setError(errMsg(err))
      }
    })
  }
  return (
    <Card title={t('holidayAdd')}>
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] gap-4">
          <Field label={t('date')}>
            <Input
              type="date"
              required
              max={addDays(today(), 730)}
              value={form.day}
              onChange={(e) => setForm({ ...form, day: e.currentTarget.value })}
            />
          </Field>
          <Field label={t('holidayName')}>
            <Input
              required
              maxLength={100}
              placeholder={t('holidayNamePlaceholder')}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.currentTarget.value })}
            />
          </Field>
        </div>
        {error && <Notice tone="bad">{t(error)}</Notice>}
        {added && <Notice tone="ok">{t('holidayAdded')}</Notice>}
        <div>
          <Button type="submit" busy={busy}>
            {t('holidayAddBtn')}
          </Button>
        </div>
      </form>
    </Card>
  )
}

export const CalendarPage = ({ profile: me }: { profile: Profile }): React.JSX.Element => {
  const { t, locale } = useT()
  const admin = me.role === 'admin'
  const now = today()
  const [month, setMonth] = useState(now.slice(0, 7))
  const [start, end] = [`${month}-01`, monthEnd(month)]
  const [inMonth] = useHolidays(start, end)
  const [upcoming] = useHolidays(now, addDays(now, 365))
  // Staff see their own updates on the grid; admins don't send any.
  const [mine] = useLiveQuery(`calendar:${me.id}:${month}`, () =>
    admin ? Promise.resolve([]) : getIndividualUserHistory(me.id, start, end)
  )
  const off = new Map(inMonth.state === 'ok' ? inMonth.data.map((h) => [h.day, h.name]) : [])
  const done = new Set(mine.state === 'ok' ? mine.data.map((st) => st.date) : [])
  // Missed marks wait for both lists, or holidays and unloaded days would show as missed.
  const known = !admin && inMonth.state === 'ok' && mine.state === 'ok'
  const quiet = (d: string): DayState | null => (isWorkday(d, off) ? null : 'off')
  const days = daysBetween(start, end).map((d): [string, DayState | null] => [
    d,
    known ? dayState(d, done, localDay(me.created_at), now, off) : done.has(d) ? 'done' : quiet(d)
  ])
  const label = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
    new Date(`${start}T00:00`)
  )
  const nav =
    'grid size-9 place-items-center rounded-md text-fg-2 transition-colors duration-150 ease-enter hover:bg-hover hover:text-fg'

  return (
    <>
      <PageHeader
        title={t('navCalendar')}
        subtitle={t(admin ? 'calendarSubtitleAdmin' : 'calendarSubtitle')}
      />
      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_24rem] flex-col gap-6">
          <Card>
            <div className="mb-4 flex items-center gap-2">
              <button
                type="button"
                aria-label={t('prevMonth')}
                title={t('prevMonth')}
                onClick={() => setMonth(shift(month, -1))}
                className={nav}
              >
                <ChevronLeft aria-hidden className="size-5" />
              </button>
              <h2 aria-live="polite" className="min-w-40 text-center text-lg font-semibold">
                {label}
              </h2>
              <button
                type="button"
                aria-label={t('nextMonth')}
                title={t('nextMonth')}
                onClick={() => setMonth(shift(month, 1))}
                className={nav}
              >
                <ChevronRight aria-hidden className="size-5" />
              </button>
              {month !== now.slice(0, 7) && (
                <Button
                  variant="ghost"
                  className="ml-auto"
                  onClick={() => setMonth(now.slice(0, 7))}
                >
                  {t('backToToday')}
                </Button>
              )}
            </div>
            {inMonth.state === 'ok' && mine.state === 'ok' ? (
              <SubmissionCalendar days={days} holidays={off} hideMonth />
            ) : inMonth.state === 'error' ? (
              <Notice tone="bad">{t(inMonth.message)}</Notice>
            ) : (
              <Loading>
                <Skeleton className="h-72 w-full" />
              </Loading>
            )}
          </Card>
          <Card title={t('holidaysIn', { month: label })}>
            {inMonth.state === 'ok' && (
              <HolidayList list={inMonth.data} admin={admin} empty="noHolidaysIn" />
            )}
          </Card>
        </div>
        <div className="flex min-w-0 flex-[1_1_18rem] flex-col gap-6">
          {admin && <AddHoliday />}
          <Card title={t('upcomingHolidays')}>
            {upcoming.state === 'ok' ? (
              <HolidayList list={upcoming.data.slice(0, 8)} admin={false} empty="noUpcoming" />
            ) : upcoming.state === 'error' ? (
              <Notice tone="bad">{t(upcoming.message)}</Notice>
            ) : (
              <Loading>
                <Skeleton className="h-24 w-full" />
              </Loading>
            )}
          </Card>
        </div>
      </div>
    </>
  )
}
