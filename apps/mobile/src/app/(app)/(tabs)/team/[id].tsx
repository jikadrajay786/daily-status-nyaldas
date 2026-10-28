import { useCommentCounts } from '@daily-status/core/commentService'
import { CalendarX, SearchX } from 'lucide-react-native'
import { useBusy } from '@daily-status/core/useBusy'
import { bumpLive, useLiveQuery } from '@daily-status/core/live'
import {
  getIndividualUserHistory,
  getIndividualUserMetrics,
  getUserDirectoryWithStats,
  getUserStreak
} from '@daily-status/core/adminService'
import { fmtDate, fmtHours, fmtShort, initials, nameOf } from '@daily-status/core/format'
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
import { FlatList, RefreshControl } from 'react-native'
import { withUniwind } from 'uniwind'
import { Box } from '@/components/gs/box'
import { HStack } from '@/components/gs/hstack'
import { Text } from '@/components/gs/text'
import { VStack } from '@/components/gs/vstack'
import { DateField } from '@/components/DateField'
import { Openable } from '@/components/Openable'
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
  Stat,
  Empty
} from '@/components/ui'
import { useTabBarInset } from '@/lib/tabBar'
import { usePullToRefresh } from '@/lib/refresh'
import { uuidParam } from '@/lib/route'

const SearchIcon = withUniwind(SearchX)
const CalendarXIcon = withUniwind(CalendarX)

const FlameIcon = withUniwind(Flame)
// Uppercase section labels inside and between cards.
const SECTION = 'text-[13px] font-semibold uppercase tracking-[0.8px] text-fg-2'

const PRESETS: readonly [Preset, Key][] = [
  ['week', 'thisWeek'],
  ['month', 'thisMonth'],
  ['custom', 'customRange']
]

export default function Person(): React.JSX.Element {
  const { t, locale } = useT()
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
  const counts = useCommentCounts(
    'status',
    history.state === 'ok' ? history.data.map((st) => st.id) : []
  )
  const [streak, , r4] = useLiveQuery(`streak:${id}`, () =>
    id ? getUserStreak(id) : Promise.resolve(0)
  )
  const loading =
    [dir, metrics, history, streak].some((x) => x.state === 'loading') || r1 || r2 || r3 || r4
  const inset = useTabBarInset()
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
      <Box className="flex-1 bg-canvas p-6">
        <Notice>{t('notFound')}</Notice>
      </Box>
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
    <Box className="flex-1 bg-canvas">
      {/* Set only once known, so a refresh doesn't blank the title. */}
      {person && <Stack.Screen options={{ title: name }} />}
      <FlatList
        data={history.state === 'ok' ? history.data : []}
        keyExtractor={(st) => st.id}
        contentContainerClassName="gap-3 p-4"
        contentContainerStyle={{ paddingBottom: inset }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl {...pull} />}
        ListHeaderComponent={
          <VStack className="mb-1 gap-4">
            {dir.state === 'error' && <Notice tone="bad">{t(dir.message)}</Notice>}
            <Card>
              {person ? (
                <HStack className="items-center gap-3.5">
                  <Avatar large text={initials(person)} />
                  <VStack className="flex-1 gap-0.5">
                    <Text accessibilityRole="header" className="text-[19px] font-semibold text-fg">
                      {name}
                    </Text>
                    <Text numberOfLines={1} className="text-[13px] text-fg-2">
                      {person.email}
                    </Text>
                    <HStack className="mt-1 flex-wrap items-center gap-2">
                      <Badge
                        label={t(person.role === 'admin' ? 'roleAdmin' : 'roleMember')}
                        tone={person.role === 'admin' ? 'warn' : 'idle'}
                      />
                      <Text className="text-[13px] text-fg-3">
                        {t('joinedOn', { date: fmtShort(localDay(person.created_at), locale) })}
                      </Text>
                    </HStack>
                  </VStack>
                </HStack>
              ) : (
                <Loading>
                  <Skeleton width={180} height={20} />
                  <Skeleton width={140} />
                </Loading>
              )}
              <HStack className="flex-wrap gap-3">
                <Stat
                  label={t('totalDays')}
                  value={person?.submissions ?? '–'}
                  sub={t('totalDaysSub')}
                  loading={!person}
                />
                <Stat
                  label={t('streak')}
                  value={streak.state === 'ok' ? streak.data : '–'}
                  icon={<FlameIcon size={20} colorClassName="accent-warn-fg" />}
                  sub={t('streakDays')}
                  loading={streak.state === 'loading'}
                />
              </HStack>
            </Card>

            <Card>
              <Text className="text-[14px] font-medium text-fg-2">{t('period')}</Text>
              <Segmented
                label={t('period')}
                options={PRESETS.map(([p, k]) => [p, t(k)] as const)}
                value={preset}
                onChange={pick}
              />
              {preset === 'custom' && (
                <VStack className="gap-3">
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
                  <Text className="text-[13px] text-fg-3">{t('rangeHint')}</Text>
                </VStack>
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
            <HStack className="flex-wrap gap-3">
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
            </HStack>

            <Card>
              <Text accessibilityRole="header" className={SECTION}>
                {t('calendar')}
              </Text>
              {m ? (
                <SubmissionCalendar days={m.days} holidays={m.holidays} />
              ) : (
                <Loading>
                  <Skeleton width="100%" height={220} />
                </Loading>
              )}
            </Card>

            <Text accessibilityRole="header" className={SECTION}>
              {t('updatesInPeriod')}
            </Text>
            {error && <Notice tone="bad">{t(error)}</Notice>}
          </VStack>
        }
        ListEmptyComponent={
          history.state === 'loading' ? (
            <CardsSkeleton />
          ) : history.state === 'error' ? (
            <Notice tone="bad">{t(history.message)}</Notice>
          ) : (
            <Empty
              icon={
                q ? (
                  <SearchIcon colorClassName="accent-accent-fg" size={28} />
                ) : (
                  <CalendarXIcon colorClassName="accent-accent-fg" size={28} />
                )
              }
              title={q ? t('noMatch', { q }) : t('noUpdatesInPeriod')}
              hint={t(q ? 'noMatchHint' : 'noUpdatesInPeriodHint')}
            />
          )
        }
        renderItem={({ item: st }) => (
          // A timeline: a rule down the left with a dot per update.
          <Box className="ml-1.5 border-l-2 border-line pl-4">
            <Box className="absolute top-5 -left-[7px] h-3 w-3 rounded-full border-2 border-canvas bg-accent" />
            <Openable target={{ kind: 'status', id: st.id }} title={fmtDate(st.date, locale)}>
              <StatusCard
                status={st}
                comments={counts[st.id]}
                actions={
                  // In-app confirm: the system Alert's buttons would follow the phone's language, not the app's.
                  confirming === st.id ? (
                    <>
                      <Text className="basis-full text-right text-[15px] text-bad-fg">
                        {t('confirmDelete')}
                      </Text>
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
            </Openable>
          </Box>
        )}
      />
    </Box>
  )
}
