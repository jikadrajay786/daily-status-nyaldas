import { getIndividualUserHistory } from '@daily-status/core/adminService'
import type { Holiday } from '@daily-status/core/database.types'
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
import { ChevronLeft, ChevronRight } from 'lucide-react-native'
import { useState } from 'react'
import { RefreshControl } from 'react-native'
import { withUniwind } from 'uniwind'
import { HStack } from '@/components/gs/hstack'
import { Pressable } from '@/components/gs/pressable'
import { Text } from '@/components/gs/text'
import { VStack } from '@/components/gs/vstack'
import { DateField } from '@/components/DateField'
import { SubmissionCalendar } from '@/components/SubmissionCalendar'
import {
  Button,
  Card,
  Field,
  Link,
  Loading,
  Notice,
  Screen,
  Skeleton,
  Title
} from '@/components/ui'
import { useProfile } from '@/lib/profile'
import { usePullToRefresh } from '@/lib/refresh'

const PrevIcon = withUniwind(ChevronLeft)
const NextIcon = withUniwind(ChevronRight)

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
    <VStack className="gap-2 py-2.5">
      <HStack className="items-center gap-3">
        <VStack className="flex-1">
          <Text className="text-[16px] font-medium text-fg">{h.name}</Text>
          <Text className="text-[14px] text-fg-2">{fmtDate(h.day, locale)}</Text>
        </VStack>
        {admin && !confirming && (
          <Button variant="ghost" onPress={() => setConfirming(true)}>
            {t('delete')}
          </Button>
        )}
      </HStack>
      {confirming && (
        <VStack className="gap-2 rounded-[10px] border border-line p-3">
          <Text className="text-[15px] text-fg">{t('confirmRemoveHoliday', { name: h.name })}</Text>
          <HStack className="flex-wrap gap-2">
            <Button variant="danger" busy={busy} onPress={() => void remove()}>
              {t('yesDelete')}
            </Button>
            <Button variant="ghost" onPress={() => setConfirming(false)}>
              {t('cancel')}
            </Button>
          </HStack>
        </VStack>
      )}
      {error && <Notice tone="bad">{t(error)}</Notice>}
    </VStack>
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
    <VStack>
      {list.map((h, i) => (
        <VStack key={h.day} className={i ? 'border-t border-line' : ''}>
          <HolidayRow h={h} admin={admin} />
        </VStack>
      ))}
    </VStack>
  ) : (
    <Text className="text-[15px] text-fg-2">{t(empty)}</Text>
  )
}

const AddHoliday = (): React.JSX.Element => {
  const { t } = useT()
  const [day, setDay] = useState(today())
  const [name, setName] = useState('')
  const [error, setError] = useState<Key>()
  const [added, setAdded] = useState(false)
  const [busy, run] = useBusy()
  const add = (): Promise<void> =>
    run(async () => {
      try {
        await addHoliday(day, name)
        setName('')
        setError(undefined)
        setAdded(true)
        bumpLive()
      } catch (err) {
        setAdded(false)
        setError(errMsg(err))
      }
    })
  return (
    <Card>
      <Text accessibilityRole="header" className="text-[17px] font-semibold text-fg">
        {t('holidayAdd')}
      </Text>
      <DateField value={day} onChange={setDay} max={addDays(today(), 730)} />
      <Field
        label={t('holidayName')}
        placeholder={t('holidayNamePlaceholder')}
        value={name}
        onChangeText={setName}
        maxLength={100}
      />
      {error && <Notice tone="bad">{t(error)}</Notice>}
      {added && <Notice tone="ok">{t('holidayAdded')}</Notice>}
      <Button busy={busy} onPress={() => void add()}>
        {t('holidayAddBtn')}
      </Button>
    </Card>
  )
}

export default function Calendar(): React.JSX.Element {
  const { t, locale } = useT()
  const me = useProfile()
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
  const pull = usePullToRefresh(inMonth.state === 'loading', bumpLive)
  const off = new Map(inMonth.state === 'ok' ? inMonth.data.map((h) => [h.day, h.name]) : [])
  const done = new Set(mine.state === 'ok' ? mine.data.map((st) => st.date) : [])
  const joined = localDay(me.created_at)
  // Missed marks wait for both lists, or holidays and unloaded days would show as missed.
  const known = !admin && inMonth.state === 'ok' && mine.state === 'ok'
  const quiet = (d: string): DayState | null => (isWorkday(d, off) ? null : 'off')
  const days = daysBetween(start, end).map((d): [string, DayState | null] => [
    d,
    known ? dayState(d, done, joined, now, off) : done.has(d) ? 'done' : quiet(d)
  ])
  const label = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
    new Date(`${start}T00:00`)
  )
  const ready = inMonth.state === 'ok' && mine.state === 'ok'

  return (
    <Screen refreshControl={<RefreshControl {...pull} />}>
      <Title sub={t(admin ? 'calendarSubtitleAdmin' : 'calendarSubtitle')}>
        {t('navCalendar')}
      </Title>
      <Card>
        <HStack className="items-center justify-between">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('prevMonth')}
            onPress={() => setMonth(shift(month, -1))}
            className="h-12 w-12 items-center justify-center rounded-full data-[active=true]:bg-selected"
          >
            <PrevIcon colorClassName="accent-fg-2" size={24} />
          </Pressable>
          <Text
            accessibilityRole="header"
            accessibilityLiveRegion="polite"
            className="text-[17px] font-semibold text-fg"
          >
            {label}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('nextMonth')}
            onPress={() => setMonth(shift(month, 1))}
            className="h-12 w-12 items-center justify-center rounded-full data-[active=true]:bg-selected"
          >
            <NextIcon colorClassName="accent-fg-2" size={24} />
          </Pressable>
        </HStack>
        {ready ? (
          // The grid's own month heading would repeat the one above.
          <SubmissionCalendar days={days} holidays={off} hideMonth />
        ) : inMonth.state === 'error' ? (
          <Notice tone="bad">{t(inMonth.message)}</Notice>
        ) : (
          <Loading>
            <Skeleton width="100%" height={260} />
          </Loading>
        )}
        {month !== now.slice(0, 7) && (
          <Link onPress={() => setMonth(now.slice(0, 7))}>{t('backToToday')}</Link>
        )}
      </Card>
      <Card>
        <Text accessibilityRole="header" className="text-[17px] font-semibold text-fg">
          {t('holidaysIn', { month: label })}
        </Text>
        {inMonth.state === 'ok' && (
          <HolidayList list={inMonth.data} admin={admin} empty="noHolidaysIn" />
        )}
      </Card>
      {admin && <AddHoliday />}
      <Card>
        <Text accessibilityRole="header" className="text-[17px] font-semibold text-fg">
          {t('upcomingHolidays')}
        </Text>
        {upcoming.state === 'ok' ? (
          <HolidayList list={upcoming.data.slice(0, 6)} admin={false} empty="noUpcoming" />
        ) : upcoming.state === 'error' ? (
          <Notice tone="bad">{t(upcoming.message)}</Notice>
        ) : (
          <Loading>
            <Skeleton width="70%" />
          </Loading>
        )}
      </Card>
    </Screen>
  )
}
