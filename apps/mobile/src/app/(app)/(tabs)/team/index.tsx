import { usePaged } from '@daily-status/core/usePaged'
import { useCommentCounts } from '@daily-status/core/commentService'
import { ChevronDown, ChevronRight, ChevronUp, Inbox, Search } from 'lucide-react-native'
import { bumpLive, useLiveQuery } from '@daily-status/core/live'
import {
  getAllTeamStatuses,
  getTeamSummaryMetrics,
  getUserDirectoryWithStats,
  type DirectoryEntry
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
import { usePendingLeave } from '@daily-status/core/useLeave'
import { router } from 'expo-router'
import { useState, type ReactNode } from 'react'
import { RefreshControl } from 'react-native'
import { withUniwind } from 'uniwind'
import { Box } from '@/components/gs/box'
import { HStack } from '@/components/gs/hstack'
import { Pressable } from '@/components/gs/pressable'
import { Text } from '@/components/gs/text'
import { VStack } from '@/components/gs/vstack'
import { DateField } from '@/components/DateField'
import { MemberPicker } from '@/components/MemberPicker'
import { Openable } from '@/components/Openable'
import { SignupRequests } from '@/components/SignupRequests'
import { CardsSkeleton, TeamUpdateCard } from '@/components/StatusCard'
import {
  ListScreen,
  LoadMore,
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
  Title
} from '@/components/ui'
import { useProfile } from '@/lib/profile'
import { usePullToRefresh } from '@/lib/refresh'

const NextIcon = withUniwind(ChevronRight)
const InboxIcon = withUniwind(Inbox)
const SearchIcon = withUniwind(Search)
const OpenIcon = withUniwind(ChevronDown)
const CloseIcon = withUniwind(ChevronUp)

type Tab = 'feed' | 'people'
type Filters = { date: string; userId: string; search: string }

const openPerson = (id: string): void => router.push({ pathname: '/team/[id]', params: { id } })

// Desktop shows the feed and directory side by side; a phone switches between them, keeping each one's filters.
export default function Team(): React.JSX.Element {
  const { t } = useT()
  const [tab, setTab] = useState<Tab>('feed')
  const [f, setF] = useState<Filters>({ date: today(), userId: '', search: '' })
  const [find, setFind] = useState('')
  const me = useProfile()
  const [waiting] = usePendingLeave(me.id)
  const waitingCount = waiting.state === 'ok' ? waiting.data.length : 0
  const waitingLabel = t('leaveWaitingCount', { n: waitingCount })
  const tabs = (
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
  // The tab bar has no room for another tab, and deciding leave belongs with the team.
  const link = (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={waitingLabel}
      onPress={() => router.push('/leave/requests')}
      className="min-h-12 flex-row items-center justify-between gap-3 rounded-[14px] border border-line bg-card p-4 data-[active=true]:bg-selected"
    >
      <Text className="shrink font-semibold text-fg">{waitingLabel}</Text>
      <NextIcon colorClassName="accent-fg-2" size={20} />
    </Pressable>
  )
  // On both tabs: Team opens on the feed, and new people shouldn't wait on a tab switch.
  const top = (
    <>
      {me.role === 'admin' && <SignupRequests />}
      {waitingCount > 0 && link}
    </>
  )
  return tab === 'feed' ? (
    <Feed f={f} onFilter={(p) => setF((prev) => ({ ...prev, ...p }))} tabs={tabs} waiting={top} />
  ) : (
    <People find={find} onFind={setFind} tabs={tabs} waiting={top} />
  )
}

const Feed = ({
  f,
  onFilter,
  tabs,
  waiting
}: {
  f: Filters
  onFilter: (p: Partial<Filters>) => void
  tabs: ReactNode
  waiting: ReactNode
}): React.JSX.Element => {
  const { t, locale } = useT()
  const filters = { ...f, search: useDebounced(f.search) }
  // Metrics need a single day; with "All dates" they fall back to today.
  const day = f.date || today()
  const dayLabel = day === today() ? t('today') : fmtDate(day, locale)
  const [missingShown, setMissingShown] = useState(10)
  const [metrics, , metricsRefreshing] = useLiveQuery(`metrics:${day}`, () =>
    getTeamSummaryMetrics(day)
  )
  const [feed, , feedRefreshing] = usePaged(`feed:${JSON.stringify(filters)}`, (limit, offset) =>
    getAllTeamStatuses(filters, limit, offset)
  )
  const page = feed.state === 'ok' ? feed.data : null
  const { off: dayOff, holiday } = useDayOff(day)
  // Name and search stay tucked away until wanted, or while one of them is in use.
  const [more, setMore] = useState(false)
  const narrowed = !!f.userId || !!f.search
  const filtering = more || narrowed
  const [listOpen, setListOpen] = useState(false)
  const counts = useCommentCounts('status', page ? page.rows.map((st) => st.id) : [])
  const pull = usePullToRefresh(
    metrics.state === 'loading' || feed.state === 'loading' || metricsRefreshing || feedRefreshing,
    bumpLive
  )
  const m = metrics.state === 'ok' ? metrics.data : null

  return (
    <ListScreen
      data={page?.rows ?? []}
      onEndReached={page?.older}
      onEndReachedThreshold={0.5}
      ListFooterComponent={page ? <LoadMore page={page} /> : undefined}
      keyExtractor={(st) => st.id}
      contentContainerClassName="gap-3 p-6"
      refreshControl={<RefreshControl {...pull} />}
      header={
        <>
          <Title
            action={
              <HStack className="items-center">
                <DateField value={f.date} onChange={(date) => onFilter({ date })} hideLabel pill />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('search')}
                  accessibilityState={{ expanded: filtering }}
                  onPress={() => {
                    if (filtering) onFilter({ userId: '', search: '' })
                    setMore(!filtering)
                  }}
                  className="h-12 w-11 items-center justify-center rounded-full data-[active=true]:bg-selected"
                >
                  <SearchIcon
                    colorClassName={filtering ? 'accent-accent-fg' : 'accent-fg-2'}
                    size={20}
                  />
                </Pressable>
              </HStack>
            }
          >
            {t('navTeam')}
          </Title>
          {tabs}
          {filtering && (
            <VStack className="gap-3">
              <MemberPicker
                members={m?.members ?? []}
                value={f.userId}
                onChange={(userId) => onFilter({ userId })}
              />
              <Field
                label={t('search')}
                hideLabel
                value={f.search}
                onChangeText={(search) => onFilter({ search })}
                placeholder={t('adminSearch')}
                autoCorrect={false}
              />
              {!!f.date && (
                <Box className="self-start">
                  <Link onPress={() => onFilter({ date: '' })}>{t('allDates')}</Link>
                </Box>
              )}
            </VStack>
          )}
        </>
      }
      ListHeaderComponent={
        <VStack className="mb-1 gap-3">
          {waiting}
          {metrics.state === 'error' && <Notice tone="bad">{t(metrics.message)}</Notice>}
          {metrics.state === 'loading' && !m ? (
            <Loading>
              <Skeleton width="100%" height={52} />
            </Loading>
          ) : (
            m &&
            (dayOff ? (
              // With all dates showing, the day's numbers are the summary, but today's holiday isn't news about them.
              !!f.date && (
                <Notice>{holiday ? t('teamHoliday', { name: holiday }) : t('teamDayOff')}</Notice>
              )
            ) : (
              <Card className="gap-0 py-0">
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !m.missing.length, expanded: listOpen }}
                  disabled={!m.missing.length}
                  onPress={() => setListOpen(!listOpen)}
                  className="min-h-14 flex-row items-center gap-2 py-3"
                >
                  <Text className="flex-1 text-[15px] text-fg">
                    {!f.date && `${dayLabel}: `}
                    <Text className="font-semibold android:font-bold">
                      {t('teamSummary', { done: m.submitted, total: m.members.length })}
                    </Text>
                    {` · ${fmtHours(m.hours, t)}`}
                  </Text>
                  {m.missing.length ? (
                    <HStack className="items-center gap-1">
                      <Badge label={t('pendingCount', { n: m.missing.length })} tone="warn" />
                      {listOpen ? (
                        <CloseIcon colorClassName="accent-fg-2" size={18} />
                      ) : (
                        <OpenIcon colorClassName="accent-fg-2" size={18} />
                      )}
                    </HStack>
                  ) : (
                    <Badge label={t('everyoneDone')} tone="ok" />
                  )}
                </Pressable>
                {listOpen &&
                  m.missing.slice(0, missingShown).map((p) => (
                    <Pressable
                      key={p.id}
                      accessibilityRole="button"
                      accessibilityLabel={t('openHistory', { name: nameOf(p) })}
                      onPress={() => openPerson(p.id)}
                      className="min-h-[52px] flex-row items-center gap-3 border-t-[length:hairlineWidth()] border-line py-2 data-[active=true]:bg-selected"
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
                  ))}
                {listOpen && m.missing.length > missingShown && (
                  <Box className="py-2">
                    <Link onPress={() => setMissingShown((n) => n + 50)}>
                      {t('showMoreTasks', { n: Math.min(50, m.missing.length - missingShown) })}
                    </Link>
                  </Box>
                )}
              </Card>
            ))
          )}
        </VStack>
      }
      ListEmptyComponent={
        feed.state === 'loading' ? (
          <CardsSkeleton />
        ) : feed.state === 'error' ? (
          <Notice tone="bad">{t(feed.message)}</Notice>
        ) : dayOff && f.date && !narrowed ? undefined : (
          <Empty
            icon={<InboxIcon colorClassName="accent-accent-fg" size={28} />}
            title={t('noFeed')}
            hint={t(narrowed || (f.date && f.date !== today()) ? 'noFeedHint' : 'noFeedHintNone')}
          />
        )
      }
      renderItem={({ item: st }) => (
        <Openable
          target={{ kind: 'status', id: st.id }}
          title={`${nameOf(st.profile)} · ${fmtDate(st.date, locale)}`}
        >
          <TeamUpdateCard status={st} author={st.profile} comments={counts[st.id]} />
        </Openable>
      )}
    />
  )
}

const GROUPS = ['all', 'staff', 'managers'] as const
type Group = (typeof GROUPS)[number]
// Admins show only under All: they don't report, and listing them lets their role be changed.
const inGroup = (p: DirectoryEntry, g: Group): boolean =>
  g === 'all' || (g === 'staff' ? p.role === 'user' : p.role !== 'user' && p.role !== 'admin')
// Nobody-yet first, then the oldest last update; admins send none, so they sink to the end.
const byQuiet = (a: DirectoryEntry, b: DirectoryEntry): number =>
  Number(a.role === 'admin') - Number(b.role === 'admin') ||
  (a.lastDate ?? '').localeCompare(b.lastDate ?? '')

const People = ({
  find,
  onFind,
  tabs,
  waiting
}: {
  find: string
  onFind: (q: string) => void
  tabs: ReactNode
  waiting: ReactNode
}): React.JSX.Element => {
  const { t, locale } = useT()
  const [dir, , refreshing] = useLiveQuery('directory', getUserDirectoryWithStats)
  const pull = usePullToRefresh(dir.state === 'loading' || refreshing, bumpLive)
  const [group, setGroup] = useState<Group>('all')
  const [quietFirst, setQuietFirst] = useState(false)
  const q = find.trim().toLowerCase()
  const everyone = dir.state === 'ok' ? dir.data : []
  // The team list is small and already loaded, so filtering in memory keeps typing instant.
  const matching = everyone.filter(
    (p) =>
      inGroup(p, group) && (!q || `${p.full_name ?? ''} ${p.email ?? ''}`.toLowerCase().includes(q))
  )
  const people = quietFirst ? [...matching].sort(byQuiet) : matching

  return (
    <ListScreen
      data={people}
      keyExtractor={(p) => p.id}
      contentContainerClassName="p-6"
      refreshControl={<RefreshControl {...pull} />}
      header={
        <>
          <Title>{t('navTeam')}</Title>
          {tabs}
          <Field
            label={t('findPerson')}
            hideLabel
            value={find}
            onChangeText={onFind}
            placeholder={t('findPerson')}
            autoCorrect={false}
          />
        </>
      }
      ListHeaderComponent={
        <VStack className="mb-3 gap-3">
          {waiting}
          <Segmented
            label={t('peopleRoleFilter')}
            options={GROUPS.map(
              (g) =>
                [
                  g,
                  `${g === 'all' ? t('peopleAll') : g === 'staff' ? t(ROLE_KEY.user) : t('peopleManagers')} ${everyone.filter((p) => inGroup(p, g)).length}`
                ] as const
            )}
            value={group}
            onChange={setGroup}
          />
          <Box className="self-end">
            <Link onPress={() => setQuietFirst(!quietFirst)}>
              {t(quietFirst ? 'sortByQuiet' : 'sortByName')}
            </Link>
          </Box>
        </VStack>
      }
      ListEmptyComponent={
        dir.state === 'loading' ? (
          <PeopleSkeleton />
        ) : dir.state === 'error' ? (
          <Notice tone="bad">{t(dir.message)}</Notice>
        ) : (
          <Notice>{q ? t('noPeopleMatch', { q: find.trim() }) : t('peopleNoneHere')}</Notice>
        )
      }
      renderItem={({ item: p, index }) => (
        <Pressable
          accessibilityRole="button"
          onPress={() => openPerson(p.id)}
          // One card around the list: the first and last rows draw its ends, the others a line between.
          className={`flex-row items-center gap-3 border-x border-line bg-card px-3.5 py-2.5 data-[active=true]:bg-selected ${index ? 'border-t-[length:hairlineWidth()]' : 'rounded-t-[14px] border-t'} ${index === people.length - 1 ? 'rounded-b-[14px] border-b' : ''}`}
        >
          <Avatar text={initials(p)} />
          <VStack className="flex-1 gap-0.5">
            {/* Wraps, so a long role name moves down rather than squeezing the person's name. */}
            <HStack className="flex-wrap items-center gap-x-2 gap-y-1">
              <Text numberOfLines={1} className="shrink text-[16px] font-medium text-fg">
                {nameOf(p)}
              </Text>
              <Badge label={t(ROLE_KEY[p.role])} tone={ROLE_TONE[p.role]} />
            </HStack>
            {p.role !== 'admin' && (
              <Text className={`text-[13px] ${p.lastDate ? 'text-fg-2' : 'text-warn-fg'}`}>
                {p.lastDate
                  ? `${t('lastUpdate', { date: fmtShort(p.lastDate, locale) })} · ${p.updates === 1 ? t('updatesCountOne') : t('updatesCount', { n: p.updates })}`
                  : t('noUpdatesYet')}
              </Text>
            )}
          </VStack>
          <NextIcon colorClassName="accent-fg-3" size={18} />
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
