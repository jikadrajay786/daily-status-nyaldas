import { getIndividualUserHistory } from '@daily-status/core/adminService'
import type { Holiday } from '@daily-status/core/database.types'
import { fmtDate } from '@daily-status/core/format'
import {
  addHoliday,
  deleteHoliday,
  useHolidayEdit,
  useHolidays
} from '@daily-status/core/holidayService'
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
  reportsFrom,
  type DayState
} from '@daily-status/core/workdays'
import { router } from 'expo-router'
import { ChevronLeft, ChevronRight, Pencil, Trash2 } from 'lucide-react-native'
import { useState } from 'react'
import { RefreshControl } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
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
const EditIcon = withUniwind(Pencil)
const DeleteIcon = withUniwind(Trash2)

const ROUND = 'h-12 w-12 items-center justify-center rounded-full data-[active=true]:bg-selected'

const monthEnd = (m: string): string => addDays(`${addDays(`${m}-01`, 32).slice(0, 7)}-01`, -1)
const shift = (m: string, by: 1 | -1): string =>
  (by === 1 ? addDays(`${m}-01`, 32) : addDays(`${m}-01`, -1)).slice(0, 7)

const HolidayRow = ({ h, admin }: { h: Holiday; admin: boolean }): React.JSX.Element => {
  const { t, locale } = useT()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<Key>()
  const [busy, run] = useBusy()
  const edit = useHolidayEdit(h)
  const dateOf = (o: Intl.DateTimeFormatOptions): string =>
    new Intl.DateTimeFormat(locale, o).format(new Date(`${h.day}T00:00`))
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
      <HStack className="items-center">
        <HStack
          accessible
          accessibilityLabel={`${h.name}: ${fmtDate(h.day, locale)}`}
          className="flex-1 items-center gap-3"
        >
          <VStack className="w-12 items-center rounded-[10px] bg-accent/15 py-1">
            <Text className="text-[12px] text-fg-2">{dateOf({ month: 'short' })}</Text>
            <Text className="text-[18px] leading-6 font-semibold text-fg android:font-bold">
              {Number(h.day.slice(8))}
            </Text>
          </VStack>
          <VStack className="flex-1">
            <Text className="text-[16px] font-medium text-fg">{h.name}</Text>
            <Text className="text-[14px] text-fg-2">{dateOf({ weekday: 'long' })}</Text>
          </VStack>
        </HStack>
        {admin && !confirming && !edit.editing && (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('holidayEdit', { name: h.name })}
              onPress={edit.open}
              className={ROUND}
            >
              <EditIcon colorClassName="accent-fg-2" size={18} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('holidayRemove', { name: h.name })}
              onPress={() => setConfirming(true)}
              className={ROUND}
            >
              <DeleteIcon colorClassName="accent-fg-2" size={18} />
            </Pressable>
          </>
        )}
      </HStack>
      {edit.editing && (
        <VStack className="gap-3 rounded-[10px] border border-line p-3">
          <DateField value={edit.day} onChange={edit.setDay} max={addDays(today(), 730)} />
          <Field
            label={t('holidayName')}
            value={edit.name}
            onChangeText={edit.setName}
            maxLength={100}
          />
          {edit.error && <Notice tone="bad">{t(edit.error)}</Notice>}
          <HStack className="flex-wrap gap-2">
            <Button busy={edit.busy} onPress={() => void edit.save()}>
              {t('saveChanges')}
            </Button>
            <Button variant="ghost" onPress={edit.close}>
              {t('cancel')}
            </Button>
          </HStack>
        </VStack>
      )}
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
    admin
      ? Promise.resolve([])
      : getIndividualUserHistory(me.id, start, end, '', 500).then(({ rows }) => rows)
  )
  const pull = usePullToRefresh(inMonth.state === 'loading', bumpLive)
  const off = new Map(inMonth.state === 'ok' ? inMonth.data.map((h) => [h.day, h.name]) : [])
  const done = new Set(mine.state === 'ok' ? mine.data.map((st) => st.date) : [])
  const joined = reportsFrom(me)
  // Missed marks wait for both lists, or holidays and unloaded days would show as missed.
  const known = !admin && inMonth.state === 'ok' && mine.state === 'ok'
  const quiet = (d: string): DayState | null => (isWorkday(d, off) ? null : 'off')
  const days = daysBetween(start, end).map((d): [string, DayState | null] => [
    d,
    // dayState calls the future 'outside', but a coming Sunday is still a day off.
    d > now
      ? quiet(d)
      : known
        ? dayState(d, done, joined, now, off)
        : done.has(d)
          ? 'done'
          : quiet(d)
  ])
  const label = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
    new Date(`${start}T00:00`)
  )
  const ready = inMonth.state === 'ok' && mine.state === 'ok'

  return (
    <Screen
      refreshControl={<RefreshControl {...pull} />}
      header={
        <Title sub={t(admin ? 'calendarSubtitleAdmin' : 'calendarSubtitle')}>
          {t('navCalendar')}
        </Title>
      }
    >
      {/* The tab bar has no room for another tab, and leave sits naturally beside the days off. */}
      {!admin && (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={t('leaveMine')}
          accessibilityHint={t('leaveOpenHint')}
          onPress={() => router.push('/leave')}
          className="min-h-12 rounded-[14px] border border-line bg-card p-4 data-[active=true]:bg-selected"
        >
          <HStack className="items-center justify-between gap-3">
            <VStack className="shrink gap-0.5">
              <Text className="font-semibold text-fg">{t('leaveMine')}</Text>
              <Text className="text-[14px] text-fg-2">{t('leaveOpenHint')}</Text>
            </VStack>
            <NextIcon colorClassName="accent-fg-2" size={20} />
          </HStack>
        </Pressable>
      )}
      {/* Bleeds into the screen's padding: every point of width goes to the day tiles. */}
      <Card className="-mx-3 px-3">
        <HStack className="items-center">
          <Text
            accessibilityRole="header"
            accessibilityLiveRegion="polite"
            className="flex-1 px-1 text-[22px] font-semibold text-fg android:font-bold"
          >
            {label}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('prevMonth')}
            onPress={() => setMonth(shift(month, -1))}
            className={ROUND}
          >
            <PrevIcon colorClassName="accent-fg-2" size={24} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('nextMonth')}
            onPress={() => setMonth(shift(month, 1))}
            className={ROUND}
          >
            <NextIcon colorClassName="accent-fg-2" size={24} />
          </Pressable>
        </HStack>
        {ready ? (
          <Animated.View key={month} entering={FadeIn.duration(200)}>
            <SubmissionCalendar days={days} holidays={off} large />
          </Animated.View>
        ) : inMonth.state === 'error' ? (
          <Notice tone="bad">{t(inMonth.message)}</Notice>
        ) : (
          <Loading>
            <Skeleton width="100%" height={380} />
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
          <HolidayList list={upcoming.data.slice(0, 6)} admin={admin} empty="noUpcoming" />
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
