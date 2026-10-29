import { useCommentCounts } from '@daily-status/core/commentService'
import { Inbox } from 'lucide-react-native'
import { bumpLive, useLiveQuery } from '@daily-status/core/live'
import {
  getAllTeamStatuses,
  getTeamSummaryMetrics,
  getUserDirectoryWithStats
} from '@daily-status/core/adminService'
import {
  fmtDate,
  fmtHours,
  fmtShort,
  initials,
  nameOf,
  ROLE_KEY,
  ROLE_TONE
} from '@daily-status/core/format'
import { useT } from '@daily-status/core/i18n'
import { today } from '@daily-status/core/supabase'
import { useDayOff } from '@daily-status/core/holidayService'
import { useDebounced } from '@daily-status/core/useDebounced'
import { router } from 'expo-router'
import { useState, type ReactNode } from 'react'
import { FlatList, RefreshControl } from 'react-native'
import { SafeAreaView as RNSafeAreaView } from 'react-native-safe-area-context'
import { withUniwind } from 'uniwind'
import { Box } from '@/components/gs/box'
import { HStack } from '@/components/gs/hstack'
import { Pressable } from '@/components/gs/pressable'
import { Text } from '@/components/gs/text'
import { VStack } from '@/components/gs/vstack'
import { DateField } from '@/components/DateField'
import { MemberPicker } from '@/components/MemberPicker'
import { Openable } from '@/components/Openable'
import { CardsSkeleton, StatusCard } from '@/components/StatusCard'
import {
  Avatar,
  Badge,
  Card,
  Empty,
  Field,
  Link,
  Loading,
  Notice,
  Segmented,
  Skeleton,
  Stat,
  Title
} from '@/components/ui'
import { useTabBarInset } from '@/lib/tabBar'
import { usePullToRefresh } from '@/lib/refresh'

const InboxIcon = withUniwind(Inbox)

const SafeAreaView = withUniwind(RNSafeAreaView)

type Tab = 'feed' | 'people'
type Filters = { date: string; userId: string; search: string }

const openPerson = (id: string): void => router.push({ pathname: '/team/[id]', params: { id } })

// Desktop shows the feed and directory side by side; a phone switches between them, keeping each one's filters.
export default function Team(): React.JSX.Element {
  const { t } = useT()
  const [tab, setTab] = useState<Tab>('feed')
  const [f, setF] = useState<Filters>({ date: today(), userId: '', search: '' })
  const [find, setFind] = useState('')
  const header = (
    <Segmented
      label={t('navTeam')}
      options={[
        ['feed', t('tabFeed')],
        ['people', t('tabPeople')]
      ]}
      value={tab}
      onChange={setTab}
    />
  )
  return (
    <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-canvas">
      {tab === 'feed' ? (
        <Feed f={f} onFilter={(p) => setF((prev) => ({ ...prev, ...p }))} tabs={header} />
      ) : (
        <People find={find} onFind={setFind} tabs={header} />
      )}
    </SafeAreaView>
  )
}

const Feed = ({
  f,
  onFilter,
  tabs
}: {
  f: Filters
  onFilter: (p: Partial<Filters>) => void
  tabs: ReactNode
}): React.JSX.Element => {
  const { t, locale } = useT()
  const filters = { ...f, search: useDebounced(f.search) }
  // Metrics need a single day; with "All dates" they fall back to today.
  const day = f.date || today()
  const dayLabel = day === today() ? t('today') : fmtDate(day, locale)
  const [metrics, , metricsRefreshing] = useLiveQuery(`metrics:${day}`, () =>
    getTeamSummaryMetrics(day)
  )
  const [feed, , feedRefreshing] = useLiveQuery(`feed:${JSON.stringify(filters)}`, () =>
    getAllTeamStatuses(filters)
  )
  const { off: dayOff, holiday } = useDayOff(day)
  // Name and search stay tucked away until wanted, or while one of them is in use.
  const [more, setMore] = useState(!!(f.userId || f.search))
  const counts = useCommentCounts('status', feed.state === 'ok' ? feed.data.map((st) => st.id) : [])
  const inset = useTabBarInset()
  const pull = usePullToRefresh(
    metrics.state === 'loading' || feed.state === 'loading' || metricsRefreshing || feedRefreshing,
    bumpLive
  )
  const m = metrics.state === 'ok' ? metrics.data : null

  return (
    <FlatList
      data={feed.state === 'ok' ? feed.data : []}
      keyExtractor={(st) => st.id}
      contentContainerClassName="gap-3 p-6"
      contentContainerStyle={{ paddingBottom: inset }}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl {...pull} />}
      ListHeaderComponent={
        <VStack className="mb-1 gap-4">
          <Title sub={t('teamSubtitle', { day: dayLabel })}>{t('navTeam')}</Title>
          {tabs}
          {metrics.state === 'error' && <Notice tone="bad">{t(metrics.message)}</Notice>}
          <HStack className="flex-wrap gap-3">
            <Stat
              loading={metrics.state === 'loading'}
              label={t('statSubmitted')}
              value={m ? `${m.submitted}/${m.members.length}` : '–'}
              compact
            />
            <Stat
              loading={metrics.state === 'loading'}
              label={t('hoursWorked')}
              value={m ? fmtHours(m.hours, t) : '–'}
              compact
            />
            <Stat
              loading={metrics.state === 'loading'}
              label={t('statPending')}
              value={m?.missing.length ?? '–'}
              tone={m?.missing.length ? 'warn' : 'idle'}
              compact
            />
          </HStack>
          <Card>
            <Text
              accessibilityRole="header"
              className="text-[13px] font-semibold uppercase tracking-[0.8px] text-fg-2"
            >
              {t('notSubmittedOn', { day: dayLabel })}
            </Text>
            {!m ? (
              metrics.state === 'loading' && <PeopleSkeleton count={3} />
            ) : m.missing.length ? (
              m.missing.map((p) => (
                <Pressable
                  key={p.id}
                  accessibilityRole="button"
                  accessibilityLabel={t('openHistory', { name: nameOf(p) })}
                  onPress={() => openPerson(p.id)}
                  className="min-h-[52px] flex-row items-center gap-3 rounded-[10px] px-2 data-[active=true]:bg-selected"
                >
                  <Box className="h-2 w-2 rounded-full bg-warn" />
                  <VStack className="flex-1 gap-0.5">
                    <Text numberOfLines={1} className="text-[16px] font-medium text-fg">
                      {nameOf(p)}
                    </Text>
                    <Text numberOfLines={1} className="text-[13px] text-fg-3">
                      {p.email}
                    </Text>
                  </VStack>
                </Pressable>
              ))
            ) : (
              <Notice tone={dayOff ? 'idle' : 'ok'}>
                {holiday
                  ? t('teamHoliday', { name: holiday })
                  : t(dayOff ? 'teamDayOff' : 'everyoneDone')}
              </Notice>
            )}
          </Card>
          <VStack className="mt-2 gap-3">
            <DateField value={f.date} onChange={(date) => onFilter({ date })} clearable />
            {more ? (
              <>
                <MemberPicker
                  members={m?.members ?? []}
                  value={f.userId}
                  onChange={(userId) => onFilter({ userId })}
                />
                <Field
                  label={t('search')}
                  value={f.search}
                  onChangeText={(search) => onFilter({ search })}
                  placeholder={t('adminSearch')}
                  autoCorrect={false}
                />
              </>
            ) : (
              <Box className="self-start">
                <Link onPress={() => setMore(true)}>{t('moreFilters')}</Link>
              </Box>
            )}
          </VStack>
        </VStack>
      }
      ListEmptyComponent={
        feed.state === 'loading' ? (
          <CardsSkeleton />
        ) : feed.state === 'error' ? (
          <Notice tone="bad">{t(feed.message)}</Notice>
        ) : (
          <Empty
            icon={<InboxIcon colorClassName="accent-accent-fg" size={28} />}
            title={t('noFeed')}
            hint={t('noFeedHint')}
          />
        )
      }
      renderItem={({ item: st }) => (
        <Openable
          target={{ kind: 'status', id: st.id }}
          title={`${nameOf(st.profile)} · ${fmtDate(st.date, locale)}`}
        >
          <StatusCard status={st} author={st.profile} comments={counts[st.id]} />
        </Openable>
      )}
    />
  )
}

const People = ({
  find,
  onFind,
  tabs
}: {
  find: string
  onFind: (q: string) => void
  tabs: ReactNode
}): React.JSX.Element => {
  const { t, locale } = useT()
  const [dir, , refreshing] = useLiveQuery('directory', getUserDirectoryWithStats)
  const inset = useTabBarInset()
  const pull = usePullToRefresh(dir.state === 'loading' || refreshing, bumpLive)
  const q = find.trim().toLowerCase()
  // The team list is small and already loaded, so filtering in memory keeps typing instant.
  const people =
    dir.state === 'ok'
      ? dir.data.filter(
          (p) => !q || `${p.full_name ?? ''} ${p.email ?? ''}`.toLowerCase().includes(q)
        )
      : []

  return (
    <FlatList
      data={people}
      keyExtractor={(p) => p.id}
      contentContainerClassName="gap-3 p-6"
      contentContainerStyle={{ paddingBottom: inset }}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl {...pull} />}
      ListHeaderComponent={
        <VStack className="mb-1 gap-4">
          <Title sub={t('peopleSubtitle')}>{t('navTeam')}</Title>
          {tabs}
          <Field
            label={t('findPerson')}
            hideLabel
            value={find}
            onChangeText={onFind}
            placeholder={t('findPerson')}
            autoCorrect={false}
          />
        </VStack>
      }
      ListEmptyComponent={
        dir.state === 'loading' ? (
          <PeopleSkeleton />
        ) : dir.state === 'error' ? (
          <Notice tone="bad">{t(dir.message)}</Notice>
        ) : (
          <Notice>{t('noPeopleMatch', { q: find.trim() })}</Notice>
        )
      }
      renderItem={({ item: p }) => (
        <Pressable
          accessibilityRole="button"
          onPress={() => openPerson(p.id)}
          className="flex-row items-center gap-3 rounded-[14px] border border-line bg-card p-3.5 data-[active=true]:bg-selected"
        >
          <Avatar text={initials(p)} />
          <VStack className="flex-1 gap-0.5">
            <HStack className="items-center gap-2">
              <Text numberOfLines={1} className="shrink text-[16px] font-medium text-fg">
                {nameOf(p)}
              </Text>
              <Badge label={t(ROLE_KEY[p.role])} tone={ROLE_TONE[p.role]} />
            </HStack>
            <Text numberOfLines={1} className="text-[13px] text-fg-3">
              {p.email}
            </Text>
            <Text className="text-[13px] text-fg-2">
              {p.lastDate
                ? `${t('updatesCount', { n: p.submissions })} · ${t('lastUpdate', { date: fmtShort(p.lastDate, locale) })}`
                : t('noUpdatesYet')}
            </Text>
          </VStack>
        </Pressable>
      )}
    />
  )
}

const PeopleSkeleton = ({ count = 5 }: { count?: number }): React.JSX.Element => (
  <Loading>
    {Array.from({ length: count }, (_, i) => (
      <HStack key={i} className="items-center gap-3">
        <Skeleton width={40} height={40} />
        <VStack className="flex-1 gap-0.5">
          <Skeleton width="60%" />
          <Skeleton width="40%" height={12} />
        </VStack>
      </HStack>
    ))}
  </Loading>
)
