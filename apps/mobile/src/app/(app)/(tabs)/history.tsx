import { useCommentCounts } from '@daily-status/core/commentService'
import { History as HistoryGlyph, SearchX } from 'lucide-react-native'
import { fmtDate } from '@daily-status/core/format'
import { useBusy } from '@daily-status/core/useBusy'
import { bumpLive, useLiveQuery } from '@daily-status/core/live'
import type { DailyStatus } from '@daily-status/core/database.types'
import { useT, type Key } from '@daily-status/core/i18n'
import { canChange, deleteStatus, listMyStatuses } from '@daily-status/core/statusService'
import { today } from '@daily-status/core/supabase'
import { useDebounced } from '@daily-status/core/useDebounced'
import { errMsg } from '@daily-status/core/useQuery'
import { router } from 'expo-router'
import { useState } from 'react'
import { FlatList, RefreshControl } from 'react-native'
import { SafeAreaView as RNSafeAreaView } from 'react-native-safe-area-context'
import { withUniwind } from 'uniwind'
import { Text } from '@/components/gs/text'
import { VStack } from '@/components/gs/vstack'
import { useTabBarInset } from '@/lib/tabBar'
import { Openable } from '@/components/Openable'
import { CardsSkeleton, StatusCard } from '@/components/StatusCard'
import { Button, Field, Notice, Title, Empty } from '@/components/ui'
import { useProfile } from '@/lib/profile'
import { markToday } from '@/lib/reminder'

const SearchIcon = withUniwind(SearchX)
const HistoryIcon = withUniwind(HistoryGlyph)

const SafeAreaView = withUniwind(RNSafeAreaView)

export default function History(): React.JSX.Element {
  const { t, locale } = useT()
  const profile = useProfile()
  const inset = useTabBarInset()
  const [search, setSearch] = useState('')
  const q = useDebounced(search)
  const [list, , refreshing] = useLiveQuery(`history:${profile.id}:${q}`, () =>
    listMyStatuses(profile.id, q)
  )
  const counts = useCommentCounts('status', list.state === 'ok' ? list.data.map((st) => st.id) : [])
  const [confirming, setConfirming] = useState<string>()
  const [error, setError] = useState<Key>()
  const [pulling, setPulling] = useState(false)
  if (pulling && list.state !== 'loading' && !refreshing) setPulling(false)

  const [deleting, runDelete] = useBusy()
  const remove = (st: DailyStatus): Promise<void> =>
    runDelete(async () => {
      try {
        await deleteStatus(st.id)
        if (st.date === today()) markToday(st.user_id, false)
        setError(undefined)
        bumpLive()
      } catch (err) {
        setError(errMsg(err))
      }
    })

  return (
    // A FlatList rather than the shared ScrollView screen: a year of updates is too many cards to render at once.
    <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-canvas">
      <FlatList
        data={list.state === 'ok' ? list.data : []}
        keyExtractor={(st) => st.id}
        contentContainerClassName="gap-4 p-6"
        contentContainerStyle={{ paddingBottom: inset }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={pulling}
            onRefresh={() => {
              setPulling(true)
              bumpLive()
            }}
          />
        }
        ListHeaderComponent={
          <VStack className="gap-4">
            <Title
              {...(list.state === 'ok' && {
                sub: t(q ? 'matchCount' : 'totalCount', { n: list.data.length })
              })}
            >
              {t('navHistory')}
            </Title>
            <Field
              label={t('historySearch')}
              hideLabel
              value={search}
              onChangeText={setSearch}
              placeholder={t('historySearch')}
              returnKeyType="search"
              autoCorrect={false}
            />
            {error && <Notice tone="bad">{t(error)}</Notice>}
          </VStack>
        }
        ListEmptyComponent={
          list.state === 'loading' ? (
            <CardsSkeleton />
          ) : list.state === 'error' ? (
            <Notice tone="bad">{t(list.message)}</Notice>
          ) : q ? (
            <Empty
              icon={<SearchIcon colorClassName="accent-accent-fg" size={28} />}
              title={t('noMatch', { q })}
              hint={t('noMatchHint')}
            />
          ) : (
            <Empty
              icon={<HistoryIcon colorClassName="accent-accent-fg" size={28} />}
              title={t('noHistory')}
              hint={t('noHistoryHint')}
              action={<Button onPress={() => router.navigate('/')}>{t('writeToday')}</Button>}
            />
          )
        }
        renderItem={({ item: st }) => (
          <Openable target={{ kind: 'status', id: st.id }} title={fmtDate(st.date, locale)}>
            <StatusCard
              status={st}
              comments={counts[st.id]}
              actions={
                // In-app confirm: the system Alert's buttons would follow the phone's language, not the app's.
                !canChange(st.date, profile.role) ? (
                  <Text className="basis-full text-right text-[13px] text-fg-3">
                    {t('statusLocked')}
                  </Text>
                ) : confirming === st.id ? (
                  <>
                    <Text className="basis-full text-right text-[15px] text-bad-fg">
                      {t('confirmDelete')}
                    </Text>
                    <Button variant="ghost" onPress={() => setConfirming(undefined)}>
                      {t('cancel')}
                    </Button>
                    <Button variant="danger" busy={deleting} onPress={() => void remove(st)}>
                      {t('yesDelete')}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      onPress={() =>
                        router.navigate({ pathname: '/', params: { date: st.date, edit: '1' } })
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
        )}
      />
    </SafeAreaView>
  )
}
