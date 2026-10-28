import { useCommentCounts } from '@daily-status/core/commentService'
import { ListTodo } from 'lucide-react-native'
import { useT } from '@daily-status/core/i18n'
import { useUserTasks } from '@daily-status/core/useTasks'
import { FlatList, RefreshControl } from 'react-native'
import { GestureHandlerRootView as RNGestureHandlerRootView } from 'react-native-gesture-handler'
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated'
import { SafeAreaView as RNSafeAreaView } from 'react-native-safe-area-context'
import { withUniwind } from 'uniwind'
import { Box } from '@/components/gs/box'
import { HStack } from '@/components/gs/hstack'
import { Text } from '@/components/gs/text'
import { VStack } from '@/components/gs/vstack'
import { CardsSkeleton } from '@/components/StatusCard'
import { Openable } from '@/components/Openable'
import { TaskCard } from '@/components/TaskCard'
import { Button, Notice, Title, Empty } from '@/components/ui'
import { useProfile } from '@/lib/profile'
import { useTabBarInset } from '@/lib/tabBar'
import { usePullToRefresh } from '@/lib/refresh'

const TasksIcon = withUniwind(ListTodo)

const GestureHandlerRootView = withUniwind(RNGestureHandlerRootView)
const SafeAreaView = withUniwind(RNSafeAreaView)

const Progress = ({ done, total }: { done: number; total: number }): React.JSX.Element => {
  const { t } = useT()
  const grow = useAnimatedStyle(() => ({
    width: withTiming(`${total ? (done / total) * 100 : 0}%`, { duration: 400 })
  }))
  const label = t('taskProgress', { done, total })
  return (
    <HStack
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: total, now: done }}
      className="items-center gap-3"
    >
      <Box className="h-2 flex-1 overflow-hidden rounded-full bg-selected">
        <Animated.View className="h-full rounded-full bg-ok" style={grow} />
      </Box>
      <Text className="text-[14px] tabular-nums text-fg-2">{label}</Text>
    </HStack>
  )
}

export default function Tasks(): React.JSX.Element {
  const { t } = useT()
  const { id } = useProfile()
  const [tasks, reload] = useUserTasks(id)
  const inset = useTabBarInset()
  const pull = usePullToRefresh(tasks.state === 'loading', reload)
  const list = tasks.state === 'ok' ? tasks.data : []
  const counts = useCommentCounts(
    'task',
    list.map((task) => task.id)
  )
  const done = list.filter((task) => task.status === 'completed').length

  return (
    // Swipe-to-finish needs a gesture root; scoped to this screen so other tabs are untouched.
    <GestureHandlerRootView className="flex-1">
      <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-canvas">
        <FlatList
          data={list}
          keyExtractor={(task) => task.id}
          contentContainerClassName="gap-4 p-6"
          contentContainerStyle={{ paddingBottom: inset }}
          refreshControl={<RefreshControl {...pull} tintColorClassName="accent-accent" />}
          ListHeaderComponent={
            <VStack className="gap-3">
              <Title sub={t('tasksSubtitle')}>{t('navTasks')}</Title>
              {list.length > 0 && <Progress done={done} total={list.length} />}
              {done < list.length && (
                <Text className="text-[13px] text-fg-3">{t('swipeHint')}</Text>
              )}
            </VStack>
          }
          ListEmptyComponent={
            tasks.state === 'loading' ? (
              <CardsSkeleton />
            ) : tasks.state === 'error' ? (
              <VStack className="gap-3">
                <Notice tone="bad">{t(tasks.message)}</Notice>
                <Button variant="ghost" onPress={reload}>
                  {t('tryAgain')}
                </Button>
              </VStack>
            ) : (
              <Empty
                icon={<TasksIcon colorClassName="accent-accent-fg" size={28} />}
                title={t('tasksEmpty')}
                hint={t('tasksEmptyHint')}
              />
            )
          }
          renderItem={({ item, index }) => (
            <Openable target={{ kind: 'task', id: item.id }} title={item.title}>
              <TaskCard task={item} index={index} comments={counts[item.id]} />
            </Openable>
          )}
        />
      </SafeAreaView>
    </GestureHandlerRootView>
  )
}
