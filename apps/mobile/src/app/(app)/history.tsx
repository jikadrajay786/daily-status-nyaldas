import { bumpLive, useLiveQuery } from '@daily-status/core/live'
import type { DailyStatus } from '@daily-status/core/database.types'
import { useT, type Key } from '@daily-status/core/i18n'
import { canChange, deleteStatus, listMyStatuses } from '@daily-status/core/statusService'
import { today } from '@daily-status/core/supabase'
import { useDebounced } from '@daily-status/core/useDebounced'
import { errMsg } from '@daily-status/core/useQuery'
import { router } from 'expo-router'
import { useState } from 'react'
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { CardsSkeleton, StatusCard } from '@/components/StatusCard'
import { Button, Field, Notice, Title } from '@/components/ui'
import { useProfile } from '@/lib/profile'
import { markToday } from '@/lib/reminder'
import { useTheme } from '@/lib/theme'

export default function History(): React.JSX.Element {
  const { t } = useT()
  const { colors } = useTheme()
  const profile = useProfile()
  const [search, setSearch] = useState('')
  const q = useDebounced(search)
  const [list, , refreshing] = useLiveQuery(`history:${profile.id}:${q}`, () =>
    listMyStatuses(profile.id, q)
  )
  const [confirming, setConfirming] = useState<string>()
  const [error, setError] = useState<Key>()
  const [pulling, setPulling] = useState(false)
  if (pulling && list.state !== 'loading' && !refreshing) setPulling(false)

  const remove = async (st: DailyStatus): Promise<void> => {
    try {
      await deleteStatus(st.id)
      if (st.date === today()) markToday(st.user_id, false)
      setError(undefined)
      bumpLive()
    } catch (err) {
      setError(errMsg(err))
    }
  }

  return (
    // A FlatList rather than the shared ScrollView screen: a year of updates is too many cards to render at once.
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={[s.fill, { backgroundColor: colors.canvas }]}
    >
      <FlatList
        data={list.state === 'ok' ? list.data : []}
        keyExtractor={(st) => st.id}
        contentContainerStyle={s.list}
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
          <View style={s.header}>
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
          </View>
        }
        ListEmptyComponent={
          list.state === 'loading' ? (
            <CardsSkeleton />
          ) : list.state === 'error' ? (
            <Notice tone="bad">{t(list.message)}</Notice>
          ) : (
            <Notice>{q ? t('noMatch', { q }) : t('noHistory')}</Notice>
          )
        }
        renderItem={({ item: st }) => (
          <StatusCard
            status={st}
            actions={
              // In-app confirm: the system Alert's buttons would follow the phone's language, not the app's.
              !canChange(st.date, profile.role) ? (
                <Text style={[s.locked, { color: colors.fg3 }]}>{t('statusLocked')}</Text>
              ) : confirming === st.id ? (
                <>
                  <Text style={[s.confirm, { color: colors.badFg }]}>{t('confirmDelete')}</Text>
                  <Button variant="ghost" onPress={() => setConfirming(undefined)}>
                    {t('cancel')}
                  </Button>
                  <Button variant="danger" onPress={() => void remove(st)}>
                    {t('yesDelete')}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    onPress={() => router.navigate({ pathname: '/', params: { date: st.date } })}
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
        )}
      />
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  list: { padding: 24, gap: 16 },
  header: { gap: 16 },
  confirm: { flexBasis: '100%', fontSize: 15, textAlign: 'right' },
  locked: { flexBasis: '100%', fontSize: 13, textAlign: 'right' }
})
