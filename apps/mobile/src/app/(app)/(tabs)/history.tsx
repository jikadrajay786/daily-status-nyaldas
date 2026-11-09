import { usePaged } from '@daily-status/core/usePaged'
import { useCommentCounts } from '@daily-status/core/commentService'
import { History as HistoryGlyph, SearchX } from 'lucide-react-native'
import { fmtDate } from '@daily-status/core/format'
import { useBusy } from '@daily-status/core/useBusy'
import { bumpLive } from '@daily-status/core/live'
import type { DailyStatus } from '@daily-status/core/database.types'
import { useT, type Key } from '@daily-status/core/i18n'
import {
  canChange,
  deleteStatus,
  listMyDay,
  listMyStatuses
} from '@daily-status/core/statusService'
import { today } from '@daily-status/core/supabase'
import { useDebounced } from '@daily-status/core/useDebounced'
import { errMsg } from '@daily-status/core/useQuery'
import { router } from 'expo-router'
import { useState } from 'react'
import { RefreshControl } from 'react-native'
import { withUniwind } from 'uniwind'
import { Text } from '@/components/gs/text'
import { Openable } from '@/components/Openable'
import { CardsSkeleton, StatusCard } from '@/components/StatusCard'
import { ListScreen, LoadMore, Button, Field, Notice, Title, Empty } from '@/components/ui'
import { useProfile } from '@/lib/profile'
import { markToday } from '@/lib/reminder'

const SearchIcon = withUniwind(SearchX)
const HistoryIcon = withUniwind(HistoryGlyph)

export default function History(): React.JSX.Element {
  const { t, locale } = useT()
  const profile = useProfile()
  const [search, setSearch] = useState('')
  const q = useDebounced(search)
  const [list, , refreshing] = usePaged(`history:${profile.id}:${q}`, (limit, offset) =>
    listMyStatuses(profile.id, q, limit, offset)
  )
  const page = list.state === 'ok' ? list.data : null
  const counts = useCommentCounts('status', page ? page.rows.map((st) => st.id) : [])
  const [confirming, setConfirming] = useState<string>()
  const [error, setError] = useState<Key>()
  const [pulling, setPulling] = useState(false)
  if (pulling && list.state !== 'loading' && !refreshing) setPulling(false)

  const [deleting, runDelete] = useBusy()
  const remove = (st: DailyStatus): Promise<void> =>
    runDelete(async () => {
      try {
        await deleteStatus(st.id)
        if (st.date === today())
          markToday(st.user_id, (await listMyDay(st.user_id, st.date)).length > 0)
        setError(undefined)
        bumpLive()
      } catch (err) {
        setError(errMsg(err))
      }
    })

  return (
    // A FlatList rather than the shared ScrollView screen: a year of updates is too many cards to render at once.
    <ListScreen
      data={page?.rows ?? []}
      onEndReached={page?.older}
      onEndReachedThreshold={0.5}
      ListFooterComponent={page ? <LoadMore page={page} /> : undefined}
      keyExtractor={(st) => st.id}
      contentContainerClassName="gap-4 p-6"
      refreshControl={
        <RefreshControl
          refreshing={pulling}
          onRefresh={() => {
            setPulling(true)
            bumpLive()
          }}
        />
      }
      header={
        <>
          <Title
            {...(list.state === 'ok' && {
              sub: t(q ? 'matchCount' : 'totalCount', { n: list.data.total })
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
        </>
      }
      ListHeaderComponent={error ? <Notice tone="bad">{t(error)}</Notice> : undefined}
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
                      router.navigate({ pathname: '/', params: { date: st.date, edit: st.id } })
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
  )
}
