import { useCommentCounts } from '@daily-status/core/commentService'
import { ChevronDown, ChevronUp, ListTodo, Search, SearchX } from 'lucide-react-native'
import { useState } from 'react'
import { useT } from '@daily-status/core/i18n'
import {
  byUrgency,
  GROUP_KEY,
  inView,
  taskGroup,
  TASK_VIEWS,
  VIEW_KEY
} from '@daily-status/core/taskService'
import { useTaskFilter, useUserTasks } from '@daily-status/core/useTasks'
import { RefreshControl } from 'react-native'
import { GestureHandlerRootView as RNGestureHandlerRootView } from 'react-native-gesture-handler'
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated'
import { withUniwind } from 'uniwind'
import { Box } from '@/components/gs/box'
import { HStack } from '@/components/gs/hstack'
import { Pressable } from '@/components/gs/pressable'
import { Text } from '@/components/gs/text'
import { VStack } from '@/components/gs/vstack'
import { CardsSkeleton } from '@/components/StatusCard'
import { Openable } from '@/components/Openable'
import { SWIPE_SEEN, TaskCard } from '@/components/TaskCard'
import {
  ListScreen,
  LoadMore,
  Button,
  Field,
  Notice,
  Segmented,
  Title,
  Empty
} from '@/components/ui'
import { useProfile } from '@/lib/profile'
import { usePullToRefresh } from '@/lib/refresh'
import { prefs } from '@/lib/storage'

const TasksIcon = withUniwind(ListTodo)
const NoMatchIcon = withUniwind(SearchX)
const SearchIcon = withUniwind(Search)
const OpenIcon = withUniwind(ChevronDown)
const CloseIcon = withUniwind(ChevronUp)

const GestureHandlerRootView = withUniwind(RNGestureHandlerRootView)

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
    >
      <Box className="h-1.5 flex-1 overflow-hidden rounded-full bg-selected">
        <Animated.View className="h-full rounded-full bg-ok" style={grow} />
      </Box>
    </HStack>
  )
}

export default function Tasks(): React.JSX.Element {
  const { t } = useT()
  const { id } = useProfile()
  const { f, set, clear, active } = useTaskFilter()
  const [searching, setSearching] = useState(false)
  const [showDone, setShowDone] = useState(false)
  const [tasks, reload] = useUserTasks(id, f)
  const pull = usePullToRefresh(tasks.state === 'loading', reload)
  const data = tasks.state === 'ok' ? tasks.data : null
  // Only these views show finished tasks, so only they page.
  const inList = data?.rows.filter((task) => inView(task, f.view)) ?? []
  const grouped = f.view === 'all'
  // Finished tasks fold away under All, unless they're all there is to show.
  const folded = grouped && !showDone && inList.some((task) => task.status !== 'completed')
  const paged = (f.view === 'all' && !folded) || f.view === 'completed' ? data : null
  const list = grouped
    ? byUrgency(folded ? inList.filter((task) => task.status !== 'completed') : inList)
    : inList
  const doneRows = data?.count('completed') ?? 0
  const counts = useCommentCounts(
    'task',
    list.map((task) => task.id)
  )
  const total = data?.count('all') ?? 0
  const done = data?.done ?? 0

  return (
    // Swipe-to-finish needs a gesture root; scoped to this screen so other tabs are untouched.
    <GestureHandlerRootView className="flex-1">
      <ListScreen
        data={list}
        keyExtractor={(task) => task.id}
        contentContainerClassName="gap-4 p-6"
        refreshControl={<RefreshControl {...pull} tintColorClassName="accent-accent" />}
        header={
          <>
            <Title
              action={
                data &&
                (total > 0 || active) && (
                  <HStack className="items-center gap-1">
                    {total > 0 && (
                      <Text
                        accessibilityElementsHidden
                        importantForAccessibility="no"
                        className="text-[14px] tabular-nums text-fg-2"
                      >
                        {t('taskProgress', { done, total })}
                      </Text>
                    )}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('search')}
                      accessibilityState={{ expanded: searching }}
                      onPress={() => {
                        if (searching) set({ search: '' })
                        setSearching(!searching)
                      }}
                      className="h-12 w-12 items-center justify-center rounded-full data-[active=true]:bg-selected"
                    >
                      <SearchIcon
                        colorClassName={searching ? 'accent-accent-fg' : 'accent-fg-2'}
                        size={20}
                      />
                    </Pressable>
                  </HStack>
                )
              }
            >
              {t('navTasks')}
            </Title>
            {data && (total > 0 || active) && (
              <>
                {total > 0 && <Progress done={done} total={total} />}
                <Segmented
                  scroll
                  label={t('taskViews')}
                  value={f.view}
                  onChange={(view) => set({ view })}
                  options={TASK_VIEWS.map(
                    (v) => [v, `${t(VIEW_KEY[v])} ${data.count(v)}`] as const
                  )}
                />
                {searching && (
                  <Field
                    label={t('search')}
                    hideLabel
                    autoFocus
                    value={f.search}
                    onChangeText={(search) => set({ search })}
                    placeholder={t('searchTasks')}
                    autoCorrect={false}
                  />
                )}
              </>
            )}
          </>
        }
        ListHeaderComponent={
          data && done < total && !active && !prefs.get(SWIPE_SEEN) ? (
            <Text className="text-[13px] text-fg-3">{t('swipeHint')}</Text>
          ) : undefined
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
          ) : active ? (
            <Empty
              icon={<NoMatchIcon colorClassName="accent-accent-fg" size={28} />}
              title={t('noTaskMatch')}
              hint={t('noTaskMatchHint')}
              action={
                <Button variant="ghost" onPress={clear}>
                  {t('clearFilters')}
                </Button>
              }
            />
          ) : (
            <Empty
              icon={<TasksIcon colorClassName="accent-accent-fg" size={28} />}
              title={t('tasksEmpty')}
              hint={t('tasksEmptyHint')}
            />
          )
        }
        onEndReached={paged?.older}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          <VStack className="gap-4">
            {grouped && doneRows > 0 && inList.some((task) => task.status !== 'completed') && (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: !folded }}
                onPress={() => setShowDone(!showDone)}
                className="min-h-12 flex-row items-center justify-between rounded-[14px] border border-line bg-card px-4 data-[active=true]:bg-selected"
              >
                <Text className="text-[15px] font-medium text-fg-2">
                  {t('taskFinished', { n: doneRows })}
                </Text>
                {folded ? (
                  <OpenIcon colorClassName="accent-fg-2" size={20} />
                ) : (
                  <CloseIcon colorClassName="accent-fg-2" size={20} />
                )}
              </Pressable>
            )}
            {paged && list.length > 0 && <LoadMore page={paged} />}
          </VStack>
        }
        renderItem={({ item, index }) => {
          const group = taskGroup(item)
          const prev = list[index - 1]
          return (
            <VStack className="gap-2">
              {grouped && group !== 'completed' && (!prev || taskGroup(prev) !== group) && (
                <Text
                  accessibilityRole="header"
                  className="text-[13px] font-semibold text-fg-2 uppercase tracking-[0.8px]"
                >
                  {t(GROUP_KEY[group])}
                </Text>
              )}
              <Openable target={{ kind: 'task', id: item.id }} title={item.title}>
                <TaskCard task={item} userId={id} index={index} comments={counts[item.id]} short />
              </Openable>
            </VStack>
          )
        }}
      />
    </GestureHandlerRootView>
  )
}
