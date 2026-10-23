import { useT } from '@daily-status/core/i18n'
import { useUserTasks } from '@daily-status/core/useTasks'
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated'
import { SafeAreaView } from 'react-native-safe-area-context'
import { CardsSkeleton } from '@/components/StatusCard'
import { TaskCard } from '@/components/TaskCard'
import { Button, Notice, Title } from '@/components/ui'
import { useProfile } from '@/lib/profile'
import { usePullToRefresh } from '@/lib/refresh'
import { useTheme } from '@/lib/theme'

const Progress = ({ done, total }: { done: number; total: number }): React.JSX.Element => {
  const { t } = useT()
  const { colors: c } = useTheme()
  const grow = useAnimatedStyle(() => ({
    width: withTiming(`${total ? (done / total) * 100 : 0}%`, { duration: 400 })
  }))
  const label = t('taskProgress', { done, total })
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: total, now: done }}
      style={s.progress}
    >
      <View style={[s.track, { backgroundColor: c.selected }]}>
        <Animated.View style={[s.bar, { backgroundColor: c.ok }, grow]} />
      </View>
      <Text style={[s.progressText, { color: c.fg2 }]}>{label}</Text>
    </View>
  )
}

export default function Tasks(): React.JSX.Element {
  const { t } = useT()
  const { colors } = useTheme()
  const { id } = useProfile()
  const [tasks, reload] = useUserTasks(id)
  const pull = usePullToRefresh(tasks.state === 'loading', reload)
  const list = tasks.state === 'ok' ? tasks.data : []
  const done = list.filter((task) => task.status === 'completed').length

  return (
    // Swipe-to-finish needs a gesture root; scoped to this screen so other tabs are untouched.
    <GestureHandlerRootView style={s.fill}>
      <SafeAreaView
        edges={['top', 'left', 'right']}
        style={[s.fill, { backgroundColor: colors.canvas }]}
      >
        <FlatList
          data={list}
          keyExtractor={(task) => task.id}
          contentContainerStyle={s.list}
          refreshControl={<RefreshControl {...pull} tintColor={colors.accent} />}
          ListHeaderComponent={
            <View style={s.header}>
              <Title sub={t('tasksSubtitle')}>{t('navTasks')}</Title>
              {list.length > 0 && <Progress done={done} total={list.length} />}
              {done < list.length && (
                <Text style={[s.hint, { color: colors.fg3 }]}>{t('swipeHint')}</Text>
              )}
            </View>
          }
          ListEmptyComponent={
            tasks.state === 'loading' ? (
              <CardsSkeleton />
            ) : tasks.state === 'error' ? (
              <View style={s.header}>
                <Notice tone="bad">{t(tasks.message)}</Notice>
                <Button variant="ghost" onPress={reload}>
                  {t('tryAgain')}
                </Button>
              </View>
            ) : (
              <Notice>{t('tasksEmpty')}</Notice>
            )
          }
          renderItem={({ item, index }) => <TaskCard task={item} index={index} />}
        />
      </SafeAreaView>
    </GestureHandlerRootView>
  )
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  list: { padding: 24, gap: 16 },
  header: { gap: 12 },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  track: { flex: 1, height: 8, borderRadius: 999, overflow: 'hidden' },
  bar: { height: '100%', borderRadius: 999 },
  progressText: { fontSize: 14, fontVariant: ['tabular-nums'] },
  hint: { fontSize: 13 }
})
