import type { Profile } from '@daily-status/core/database.types'
import {
  rateOf,
  useDashboard,
  useOverdueTasks,
  useTaskCounts,
  type Ranked,
  type TrendDay
} from '@daily-status/core/dashboard'
import { fmtDate, fmtHours, fmtShort, initials, isLead, nameOf } from '@daily-status/core/format'
import { useT } from '@daily-status/core/i18n'
import { LEAVE_HALF_KEY } from '@daily-status/core/leave'
import { useSignupRequests } from '@daily-status/core/signupService'
import { lateDays, STATUS_KEY, TASK_STATUSES, type TaskView } from '@daily-status/core/taskService'
import { usePendingLeave } from '@daily-status/core/useLeave'
import { addDays } from '@daily-status/core/workdays'
import { Redirect, router } from 'expo-router'
import { CalendarHeart, PartyPopper } from 'lucide-react-native'
import { useState, type ReactNode } from 'react'
import { RefreshControl } from 'react-native'
import { withUniwind } from 'uniwind'
import { Box } from '@/components/gs/box'
import { HStack } from '@/components/gs/hstack'
import { Pressable } from '@/components/gs/pressable'
import { Text } from '@/components/gs/text'
import { VStack } from '@/components/gs/vstack'
import {
  Avatar,
  Card,
  Empty,
  Notice,
  Screen,
  Segmented,
  Skeleton,
  Stat,
  Title
} from '@/components/ui'
import { useProfile } from '@/lib/profile'
import { usePullToRefresh } from '@/lib/refresh'

const HolidayIcon = withUniwind(PartyPopper)
const NothingIcon = withUniwind(CalendarHeart)
const SECTION = 'text-[13px] font-semibold uppercase tracking-[0.8px] text-fg-2'

const openPerson = (id: string): void =>
  router.push({ pathname: '/team/[id]', params: { id } }, { withAnchor: true })
const openBoard = (view: TaskView = 'all'): void =>
  router.navigate({ pathname: '/board', params: { view } })

const Section = ({
  title,
  children
}: {
  title: string
  children: ReactNode
}): React.JSX.Element => (
  <Card>
    <Text accessibilityRole="header" className={SECTION}>
      {title}
    </Text>
    {children}
  </Card>
)

const Row = ({
  lead,
  title,
  note,
  noteClass = 'text-fg-2',
  onPress
}: {
  lead: ReactNode
  title: string
  note: string
  noteClass?: string
  onPress?: () => void
}): React.JSX.Element => {
  const body = (
    <HStack className="min-h-12 items-center gap-3">
      {lead}
      <Text numberOfLines={1} className="flex-1 text-[15px] font-medium text-fg">
        {title}
      </Text>
      <Text className={`shrink-0 text-[13px] ${noteClass}`}>{note}</Text>
    </HStack>
  )
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${note}`}
      onPress={onPress}
      className="rounded-[10px] data-[active=true]:bg-selected"
    >
      {body}
    </Pressable>
  ) : (
    body
  )
}

const PersonRow = ({ person, note }: { person: Profile; note: string }): React.JSX.Element => (
  <Row
    lead={<Avatar text={initials(person)} />}
    title={nameOf(person)}
    note={note}
    onPress={() => openPerson(person.id)}
  />
)

const Hint = ({ children }: { children: string }): React.JSX.Element => (
  <Text className="text-[15px] text-fg-2">{children}</Text>
)

// Bars follow the theme's accent; tapping one names its day, and each bar reads out its own numbers.
const Trend = ({ days }: { days: TrendDay[] }): React.JSX.Element => {
  const { t, locale } = useT()
  const [picked, setPicked] = useState<string>()
  const label = (d: TrendDay): string =>
    t('homeTrendDay', { day: fmtShort(d.day, locale), done: d.submitted, n: d.expected })
  const shown = days.find((d) => d.day === picked)
  return (
    <VStack className="gap-2">
      <Text className="min-h-[18px] text-[13px] text-fg-2" accessibilityElementsHidden>
        {shown ? label(shown) : ''}
      </Text>
      <HStack className="h-28 items-end gap-0.5 border-b border-line">
        {days.map((d) => (
          <Pressable
            key={d.day}
            accessibilityLabel={label(d)}
            onPress={() => setPicked(d.day)}
            className="h-full flex-1 justify-end"
          >
            <Box
              className={`rounded-t-[4px] ${picked === d.day ? 'bg-accent-fg' : 'bg-accent'}`}
              style={{
                height: `${d.expected ? (100 * d.submitted) / d.expected : 0}%`,
                minHeight: 2
              }}
            />
          </Pressable>
        ))}
      </HStack>
      <HStack className="justify-between" accessibilityElementsHidden>
        <Text className="text-[12px] text-fg-3">
          {days[0] ? fmtShort(days[0].day, locale) : ''}
        </Text>
        <Text className="text-[12px] text-fg-3">{t('today')}</Text>
      </HStack>
    </VStack>
  )
}

const Ranking = ({
  title,
  sub,
  rows,
  none,
  note
}: {
  title: string
  sub: string
  rows: Ranked[] | undefined
  none: string
  note: (n: number) => string
}): React.JSX.Element => (
  <Section title={title}>
    <Text className="text-[13px] text-fg-3">{sub}</Text>
    {!rows ? (
      <Skeleton width="100%" height={40} />
    ) : rows.length ? (
      rows.map((r) => <PersonRow key={r.person.id} person={r.person} note={note(r.n)} />)
    ) : (
      <Hint>{none}</Hint>
    )}
  </Section>
)

const Signups = (): React.JSX.Element => {
  const { t } = useT()
  const q = useSignupRequests()
  const n = q.state === 'ok' ? q.data.length : 0
  return (
    <Stat
      label={t('homeSignupsWaiting')}
      value={n}
      tone={n ? 'warn' : 'idle'}
      loading={q.state === 'loading'}
      onPress={() => router.navigate('/team')}
    />
  )
}

export default function Home(): React.JSX.Element {
  const { t, locale } = useT()
  const me = useProfile()
  const [dash, reload] = useDashboard(me.id)
  const [counts, reloadCounts] = useTaskCounts(me.id)
  const [late, reloadLate] = useOverdueTasks(me.id)
  const [leave] = usePendingLeave(me.id)
  const [range, setRange] = useState<'7' | '30'>('7')
  const pull = usePullToRefresh(dash.state === 'loading', () => {
    reload()
    reloadCounts()
    reloadLate()
  })
  if (me.role !== 'admin' && !isLead(me.role)) return <Redirect href="/" />
  const d = dash.state === 'ok' ? dash.data : null
  const n = counts.state === 'ok' ? counts.data : null
  const waiting = leave.state === 'ok' ? leave.data.length : 0
  const trend = d?.trend.filter((x) => x.day > addDays(d.day, -Number(range))) ?? []

  return (
    <Screen
      refreshControl={<RefreshControl {...pull} />}
      header={
        <Title sub={t('homeSubtitle', { day: d ? fmtDate(d.day, locale) : t('today') })}>
          {t('navHome')}
        </Title>
      }
    >
      {dash.state === 'error' && <Notice tone="bad">{t(dash.message)}</Notice>}
      {d?.off && (
        <Notice>{d.holiday ? t('homeHoliday', { name: d.holiday }) : t('homeDayOff')}</Notice>
      )}
      <HStack className="flex-wrap gap-3">
        <Stat
          label={t('homeSent')}
          value={d ? `${d.submitted}/${d.expected}` : ''}
          sub={t('homeSentSub')}
          loading={!d}
          onPress={() => router.navigate('/team')}
        />
        <Stat
          label={t('homeMissing')}
          value={d?.missing.length ?? ''}
          {...(d?.missing.length && { sub: t('homeMissingSub') })}
          tone={d?.missing.length ? 'warn' : 'idle'}
          loading={!d}
          onPress={() => router.navigate('/team')}
        />
        <Stat
          label={t('homeHours')}
          value={d ? fmtHours(d.hours, t) : ''}
          sub={t('statHoursSub')}
          loading={!d}
        />
      </HStack>

      <Section title={t('homeDecide')}>
        <HStack className="flex-wrap gap-3">
          <Stat
            label={t('homeLeaveWaiting')}
            value={waiting}
            tone={waiting ? 'warn' : 'idle'}
            loading={leave.state === 'loading'}
            onPress={() => router.push('/leave/requests')}
          />
          {me.role === 'admin' && <Signups />}
        </HStack>
      </Section>

      <Section title={t('homeAway')}>
        {!d ? (
          <Skeleton width="100%" height={40} />
        ) : d.away.length ? (
          d.away.map((a) => (
            <PersonRow key={a.person.id} person={a.person} note={t(LEAVE_HALF_KEY[a.half])} />
          ))
        ) : (
          <Hint>{t('homeAwayNone')}</Hint>
        )}
      </Section>

      <Section title={t('homeTasks')}>
        <HStack className="flex-wrap gap-3">
          <Stat
            compact
            label={t('taskOverdue')}
            value={n?.overdue ?? ''}
            tone={n?.overdue ? 'bad' : 'idle'}
            loading={!n}
            onPress={() => openBoard('overdue')}
          />
          {TASK_STATUSES.map((s) => (
            <Stat
              compact
              key={s}
              label={t(STATUS_KEY[s])}
              value={n?.[s] ?? ''}
              loading={!n}
              onPress={() => openBoard(s)}
            />
          ))}
        </HStack>
        {late.state === 'ok' && late.data.length > 0 && (
          <VStack>
            <Text className="pt-2 text-[13px] font-medium text-fg-2">{t('homeLateTasks')}</Text>
            {late.data.map((task) => {
              const days = lateDays(task.due_date)
              return (
                <Row
                  key={task.id}
                  lead={null}
                  title={task.title}
                  note={days === 1 ? t('taskLateOne') : t('taskLate', { n: days })}
                  noteClass="text-bad-fg"
                  onPress={() =>
                    router.push({
                      pathname: '/details/[kind]/[id]',
                      params: { kind: 'task', id: task.id }
                    })
                  }
                />
              )
            })}
          </VStack>
        )}
      </Section>

      <Section title={t('homeTrend')}>
        <Segmented
          label={t('homeTrend')}
          options={[
            ['7', t('homeLast7')],
            ['30', t('homeLast30')]
          ]}
          value={range}
          onChange={setRange}
        />
        {d ? (
          <>
            <Hint>{t('homeTrendSub', { n: rateOf(trend) })}</Hint>
            <Trend days={trend} />
          </>
        ) : (
          <Skeleton width="100%" height={140} />
        )}
      </Section>

      <Ranking
        title={t('homeMissedMost')}
        sub={t('homeMissedSub')}
        rows={d?.missedMost}
        none={t('homeNoMisses')}
        note={(n) => (n === 1 ? t('homeMissedOne') : t('homeMissedN', { n }))}
      />
      <Ranking
        title={t('homeStreaks')}
        sub={t('homeStreaksSub')}
        rows={d?.streaks}
        none={t('homeNoStreaks')}
        note={(n) => (n === 1 ? t('homeStreakOne') : t('homeStreakN', { n }))}
      />

      <Section title={t('homeComing')}>
        {!d ? (
          <Skeleton width="100%" height={40} />
        ) : d.soon.length || d.nextHoliday ? (
          <>
            {d.nextHoliday && (
              <Row
                lead={
                  <Box className="h-10 w-10 items-center justify-center rounded-full bg-accent/15">
                    <HolidayIcon colorClassName="accent-accent-fg" size={18} />
                  </Box>
                }
                title={d.nextHoliday.name}
                note={fmtShort(d.nextHoliday.day, locale)}
              />
            )}
            {d.soon.map((l) => (
              <PersonRow
                key={l.id}
                person={l.person}
                note={t('homeComingLeave', { day: fmtShort(l.start_day, locale) })}
              />
            ))}
          </>
        ) : (
          <Empty
            icon={<NothingIcon colorClassName="accent-accent-fg" size={28} />}
            title={t('homeNoComing')}
          />
        )}
      </Section>
    </Screen>
  )
}
