import { useBusy } from '@daily-status/core/useBusy'
import { bumpLive, useLiveQuery } from '@daily-status/core/live'
import {
  getIndividualUserHistory,
  getIndividualUserMetrics,
  getUserDirectoryWithStats,
  getUserStreak
} from '@daily-status/core/adminService'
import { fmtHours, fmtShort, initials, nameOf } from '@daily-status/core/format'
import { useT, type Key } from '@daily-status/core/i18n'
import { deleteStatus } from '@daily-status/core/statusService'
import { today } from '@daily-status/core/supabase'
import { useDebounced } from '@daily-status/core/useDebounced'
import { errMsg } from '@daily-status/core/useQuery'
import {
  addDays,
  clampRange,
  localDay,
  MAX_RANGE_DAYS,
  presetRange,
  type Preset
} from '@daily-status/core/workdays'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { Flame } from 'lucide-react-native'
import { useState } from 'react'
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { DateField } from '@/components/DateField'
import { CardsSkeleton, StatusCard } from '@/components/StatusCard'
import { SubmissionCalendar } from '@/components/SubmissionCalendar'
import {
  Avatar,
  Badge,
  Button,
  Card,
  Field,
  Loading,
  Notice,
  Segmented,
  Skeleton,
  Stat
} from '@/components/ui'
import { usePullToRefresh } from '@/lib/refresh'
import { uuidParam } from '@/lib/route'
import { useTheme } from '@/lib/theme'

const PRESETS: readonly [Preset, Key][] = [
  ['week', 'thisWeek'],
  ['month', 'thisMonth'],
  ['custom', 'customRange']
]

export default function Person(): React.JSX.Element {
  const { t, locale } = useT()
  const { colors: c } = useTheme()
  const id = uuidParam(useLocalSearchParams<{ id: string }>().id)
  const now = today()
  const [preset, setPreset] = useState<Preset>('month')
  const [custom, setCustom] = useState(() => presetRange('month', now))
  const [search, setSearch] = useState('')
  const q = useDebounced(search)
  const range = preset === 'custom' ? clampRange(custom, now) : presetRange(preset, now)
  const key = `${id}:${range.start}:${range.end}`

  const [dir, , r1] = useLiveQuery('directory', getUserDirectoryWithStats)
  const [metrics, , r2] = useLiveQuery(`umetrics:${key}`, () =>
    id ? getIndividualUserMetrics(id, range.start, range.end) : Promise.resolve(null)
  )
  const [history, , r3] = useLiveQuery(`uhistory:${key}:${q}`, () =>
    id ? getIndividualUserHistory(id, range.start, range.end, q) : Promise.resolve([])
  )
  const [streak, , r4] = useLiveQuery(`streak:${id}`, () =>
    id ? getUserStreak(id) : Promise.resolve(0)
  )
  const loading =
    [dir, metrics, history, streak].some((x) => x.state === 'loading') || r1 || r2 || r3 || r4
  const pull = usePullToRefresh(loading, bumpLive)
  const [confirming, setConfirming] = useState<string>()
  const [deleting, runDelete] = useBusy()
  const [error, setError] = useState<Key>()

  const person = dir.state === 'ok' ? dir.data.find((p) => p.id === id) : undefined
  const m = metrics.state === 'ok' ? metrics.data : null
  const name = person ? nameOf(person) : ''

  // Unknown, malformed or no-longer-visible ids get a plain notice rather than an error screen.
  if (!id || (dir.state === 'ok' && !person))
    return (
      <View style={[s.fill, s.pad, { backgroundColor: c.canvas }]}>
        <Notice>{t('notFound')}</Notice>
      </View>
    )

  const pick = (p: Preset): void => {
    // Custom starts from whatever range was showing, so switching doesn't jump the view.
    if (p === 'custom') setCustom(range)
    setPreset(p)
  }

  const remove = (statusId: string): Promise<void> =>
    runDelete(async () => {
      try {
        await deleteStatus(statusId)
        setError(undefined)
        setConfirming(undefined)
        bumpLive()
      } catch (err) {
        setError(errMsg(err))
      }
    })

  return (
    <View style={[s.fill, { backgroundColor: c.canvas }]}>
      {/* Set only once known, so a refresh doesn't blank the title. */}
      {person && <Stack.Screen options={{ title: name }} />}
      <FlatList
        data={history.state === 'ok' ? history.data : []}
        keyExtractor={(st) => st.id}
        contentContainerStyle={s.list}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl {...pull} />}
        ListHeaderComponent={
          <View style={s.header}>
            {dir.state === 'error' && <Notice tone="bad">{t(dir.message)}</Notice>}
            <Card>
              {person ? (
                <View style={s.who}>
                  <Avatar large text={initials(person)} />
                  <View style={s.grow}>
                    <Text accessibilityRole="header" style={[s.name, { color: c.fg }]}>
                      {name}
                    </Text>
                    <Text numberOfLines={1} style={[s.small, { color: c.fg2 }]}>
                      {person.email}
                    </Text>
                    <View style={s.badges}>
                      <Badge
                        label={t(person.role === 'admin' ? 'roleAdmin' : 'roleMember')}
                        tone={person.role === 'admin' ? 'warn' : 'idle'}
                      />
                      <Text style={[s.small, { color: c.fg3 }]}>
                        {t('joinedOn', { date: fmtShort(localDay(person.created_at), locale) })}
                      </Text>
                    </View>
                  </View>
                </View>
              ) : (
                <Loading>
                  <Skeleton width={180} height={20} />
                  <Skeleton width={140} />
                </Loading>
              )}
              <View style={s.totals}>
                <Stat
                  label={t('totalDays')}
                  value={person?.submissions ?? '–'}
                  sub={t('totalDaysSub')}
                  loading={!person}
                />
                <Stat
                  label={t('streak')}
                  value={streak.state === 'ok' ? streak.data : '–'}
                  icon={<Flame size={20} color={c.warnFg} />}
                  sub={t('streakDays')}
                  loading={streak.state === 'loading'}
                />
              </View>
            </Card>

            <Card>
              <Text style={[s.label, { color: c.fg2 }]}>{t('period')}</Text>
              <Segmented
                label={t('period')}
                options={PRESETS.map(([p, k]) => [p, t(k)] as const)}
                value={preset}
                onChange={pick}
              />
              {preset === 'custom' && (
                <View style={s.range}>
                  <DateField
                    label={t('from')}
                    value={custom.start}
                    min={addDays(range.end, 1 - MAX_RANGE_DAYS)}
                    max={range.end}
                    onChange={(start) => setCustom((r) => ({ ...r, start }))}
                  />
                  <DateField
                    label={t('to')}
                    value={custom.end}
                    min={range.start}
                    max={now}
                    onChange={(end) => setCustom((r) => ({ ...r, end }))}
                  />
                  <Text style={[s.small, { color: c.fg3 }]}>{t('rangeHint')}</Text>
                </View>
              )}
              <Field
                label={t('search')}
                value={search}
                onChangeText={setSearch}
                placeholder={t('searchUpdates')}
                autoCorrect={false}
              />
            </Card>

            {metrics.state === 'error' && <Notice tone="bad">{t(metrics.message)}</Notice>}
            <View style={s.stats}>
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
            </View>

            <Card>
              <Text accessibilityRole="header" style={[s.cardTitle, { color: c.fg2 }]}>
                {t('calendar')}
              </Text>
              {m ? (
                <SubmissionCalendar days={m.days} />
              ) : (
                <Loading>
                  <Skeleton width="100%" height={220} />
                </Loading>
              )}
            </Card>

            <Text accessibilityRole="header" style={[s.cardTitle, { color: c.fg2 }]}>
              {t('updatesInPeriod')}
            </Text>
            {error && <Notice tone="bad">{t(error)}</Notice>}
          </View>
        }
        ListEmptyComponent={
          history.state === 'loading' ? (
            <CardsSkeleton />
          ) : history.state === 'error' ? (
            <Notice tone="bad">{t(history.message)}</Notice>
          ) : (
            <Notice>{q ? t('noMatch', { q }) : t('noUpdatesInPeriod')}</Notice>
          )
        }
        renderItem={({ item: st }) => (
          <View style={[s.entry, { borderLeftColor: c.line }]}>
            <View style={[s.node, { backgroundColor: c.accent, borderColor: c.canvas }]} />
            <StatusCard
              status={st}
              actions={
                // In-app confirm: the system Alert's buttons would follow the phone's language, not the app's.
                confirming === st.id ? (
                  <>
                    <Text style={[s.confirm, { color: c.badFg }]}>{t('confirmDelete')}</Text>
                    <Button variant="ghost" onPress={() => setConfirming(undefined)}>
                      {t('cancel')}
                    </Button>
                    <Button variant="danger" busy={deleting} onPress={() => void remove(st.id)}>
                      {t('yesDelete')}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      onPress={() =>
                        router.push({
                          pathname: '/team/edit/[statusId]',
                          params: { statusId: st.id }
                        })
                      }
                    >
                      {t('edit')}
                    </Button>
                    <Button variant="danger" onPress={() => setConfirming(st.id)}>
                      {t('delete')}
                    </Button>
                  </>
                )
              }
            />
          </View>
        )}
      />
    </View>
  )
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  pad: { padding: 24 },
  list: { padding: 16, gap: 12 },
  header: { gap: 16, marginBottom: 4 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  grow: { flex: 1, gap: 2 },
  name: { fontSize: 19, fontWeight: '600' },
  small: { fontSize: 13 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 4 },
  totals: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  label: { fontSize: 14, fontWeight: '500' },
  range: { gap: 12 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  cardTitle: { fontSize: 13, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase' },
  entry: { borderLeftWidth: 2, paddingLeft: 16, marginLeft: 6 },
  node: {
    position: 'absolute',
    left: -7,
    top: 20,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2
  },
  confirm: { flexBasis: '100%', fontSize: 15, textAlign: 'right' }
})
