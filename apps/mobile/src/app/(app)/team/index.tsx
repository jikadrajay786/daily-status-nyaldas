import { bumpLive, useLiveQuery } from '@daily-status/core/live'
import {
  getAllTeamStatuses,
  getTeamSummaryMetrics,
  getUserDirectoryWithStats
} from '@daily-status/core/adminService'
import { fmtDate, fmtHours, fmtShort, initials, nameOf } from '@daily-status/core/format'
import { useT } from '@daily-status/core/i18n'
import { today } from '@daily-status/core/supabase'
import { useDebounced } from '@daily-status/core/useDebounced'
import { router } from 'expo-router'
import { useState, type ReactNode } from 'react'
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { DateField } from '@/components/DateField'
import { MemberPicker } from '@/components/MemberPicker'
import { CardsSkeleton, StatusCard } from '@/components/StatusCard'
import {
  Avatar,
  Badge,
  Card,
  Field,
  Loading,
  Notice,
  Segmented,
  Skeleton,
  Stat,
  Title
} from '@/components/ui'
import { usePullToRefresh } from '@/lib/refresh'
import { useTheme } from '@/lib/theme'

type Tab = 'feed' | 'people'
type Filters = { date: string; userId: string; search: string }

const openPerson = (id: string): void => router.push({ pathname: '/team/[id]', params: { id } })

// Desktop shows the feed and directory side by side; a phone switches between them, keeping each one's filters.
export default function Team(): React.JSX.Element {
  const { t } = useT()
  const { colors } = useTheme()
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
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={[s.fill, { backgroundColor: colors.canvas }]}
    >
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
  const { colors: c } = useTheme()
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
  const pull = usePullToRefresh(
    metrics.state === 'loading' || feed.state === 'loading' || metricsRefreshing || feedRefreshing,
    bumpLive
  )
  const m = metrics.state === 'ok' ? metrics.data : null

  return (
    <FlatList
      data={feed.state === 'ok' ? feed.data : []}
      keyExtractor={(st) => st.id}
      contentContainerStyle={s.list}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl {...pull} />}
      ListHeaderComponent={
        <View style={s.header}>
          <Title sub={t('teamSubtitle', { day: dayLabel })}>{t('navTeam')}</Title>
          {tabs}
          {metrics.state === 'error' && <Notice tone="bad">{t(metrics.message)}</Notice>}
          <View style={s.stats}>
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
          </View>
          <Card>
            <DateField value={f.date} onChange={(date) => onFilter({ date })} clearable />
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
          </Card>
          <Card>
            <Text accessibilityRole="header" style={[s.cardTitle, { color: c.fg2 }]}>
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
                  style={({ pressed }) => [s.missing, pressed && { backgroundColor: c.selected }]}
                >
                  <View style={[s.pendingDot, { backgroundColor: c.warn }]} />
                  <View style={s.grow}>
                    <Text numberOfLines={1} style={[s.name, { color: c.fg }]}>
                      {nameOf(p)}
                    </Text>
                    <Text numberOfLines={1} style={[s.small, { color: c.fg3 }]}>
                      {p.email}
                    </Text>
                  </View>
                </Pressable>
              ))
            ) : (
              <Notice tone="ok">{t('everyoneDone')}</Notice>
            )}
          </Card>
        </View>
      }
      ListEmptyComponent={
        feed.state === 'loading' ? (
          <CardsSkeleton />
        ) : feed.state === 'error' ? (
          <Notice tone="bad">{t(feed.message)}</Notice>
        ) : (
          <Notice>{t('noFeed')}</Notice>
        )
      }
      renderItem={({ item: st }) => <StatusCard status={st} author={st.profile} />}
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
  const { colors: c } = useTheme()
  const [dir, , refreshing] = useLiveQuery('directory', getUserDirectoryWithStats)
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
      contentContainerStyle={s.list}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl {...pull} />}
      ListHeaderComponent={
        <View style={s.header}>
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
        </View>
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
          style={({ pressed }) => [
            s.person,
            { backgroundColor: pressed ? c.selected : c.card, borderColor: c.line }
          ]}
        >
          <Avatar text={initials(p)} />
          <View style={s.grow}>
            <View style={s.nameRow}>
              <Text numberOfLines={1} style={[s.name, s.shrink, { color: c.fg }]}>
                {nameOf(p)}
              </Text>
              <Badge
                label={t(p.role === 'admin' ? 'roleAdmin' : 'roleMember')}
                tone={p.role === 'admin' ? 'warn' : 'idle'}
              />
            </View>
            <Text numberOfLines={1} style={[s.small, { color: c.fg3 }]}>
              {p.email}
            </Text>
            <Text style={[s.small, { color: c.fg2 }]}>
              {p.lastDate
                ? `${t('updatesCount', { n: p.submissions })} · ${t('lastUpdate', { date: fmtShort(p.lastDate, locale) })}`
                : t('noUpdatesYet')}
            </Text>
          </View>
        </Pressable>
      )}
    />
  )
}

const PeopleSkeleton = ({ count = 5 }: { count?: number }): React.JSX.Element => (
  <Loading>
    {Array.from({ length: count }, (_, i) => (
      <View key={i} style={s.skelRow}>
        <Skeleton width={40} height={40} />
        <View style={s.grow}>
          <Skeleton width="60%" />
          <Skeleton width="40%" height={12} />
        </View>
      </View>
    ))}
  </Loading>
)

const s = StyleSheet.create({
  fill: { flex: 1 },
  list: { padding: 24, gap: 12 },
  header: { gap: 16, marginBottom: 4 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  cardTitle: { fontSize: 13, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase' },
  missing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    borderRadius: 10,
    paddingHorizontal: 8
  },
  pendingDot: { width: 8, height: 8, borderRadius: 4 },
  grow: { flex: 1, gap: 2 },
  shrink: { flexShrink: 1 },
  name: { fontSize: 16, fontWeight: '500' },
  small: { fontSize: 13 },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  skelRow: { flexDirection: 'row', alignItems: 'center', gap: 12 }
})
