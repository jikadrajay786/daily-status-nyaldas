import { useCommentCounts } from '@daily-status/core/commentService'
import { ClipboardList } from 'lucide-react-native'
import { useT } from '@daily-status/core/i18n'
import { STATUS_KEY, TASK_STATUSES } from '@daily-status/core/taskService'
import type { TaskStatus } from '@daily-status/core/database.types'
import { useBoardTasks } from '@daily-status/core/useTasks'
import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { FlatList, RefreshControl } from 'react-native'
import { SafeAreaView as RNSafeAreaView } from 'react-native-safe-area-context'
import { withUniwind } from 'uniwind'
import { BoardCard } from '@/components/BoardCard'
import { CommentCount } from '@/components/CommentThread'
import { VStack } from '@/components/gs/vstack'
import { useTabBarInset } from '@/lib/tabBar'
import { Openable } from '@/components/Openable'
import { CardsSkeleton } from '@/components/StatusCard'
import { Button, Notice, Segmented, Title, Empty } from '@/components/ui'
import { usePullToRefresh } from '@/lib/refresh'
import { useProfile } from '@/lib/profile'
import { useShareTask } from '@/lib/share'

const BoardIcon = withUniwind(ClipboardList)

const SafeAreaView = withUniwind(RNSafeAreaView)

export default function Board(): React.JSX.Element {
  const { t } = useT()
  const [tasks, reload] = useBoardTasks(useProfile())
  const [show, setShow] = useState<TaskStatus | 'all'>('all')
  const { created } = useLocalSearchParams<{ created?: string }>()
  const inset = useTabBarInset()
  const pull = usePullToRefresh(tasks.state === 'loading', reload)
  const all = tasks.state === 'ok' ? tasks.data : []
  const counts = useCommentCounts(
    'task',
    all.map((task) => task.id)
  )
  const share = useShareTask()
  // Shows once the live list has the new task, so the message names everyone it went to.
  const fresh = created && all.find((task) => task.id === created)
  const count = (s: TaskStatus): number => all.filter((task) => task.status === s).length

  return (
    <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-canvas">
      <FlatList
        data={show === 'all' ? all : all.filter((task) => task.status === show)}
        keyExtractor={(task) => task.id}
        contentContainerClassName="gap-3 p-6"
        contentContainerStyle={{ paddingBottom: inset }}
        refreshControl={<RefreshControl {...pull} />}
        ListHeaderComponent={
          <VStack className="mb-1 gap-4">
            <Title sub={t('taskBoardSubtitle')}>{t('navTaskBoard')}</Title>
            <Button onPress={() => router.push('/board/new')}>{t('newTask')}</Button>
            {created && <Notice tone="ok">{t('taskCreated')}</Notice>}
            {fresh && (
              <Button variant="ghost" onPress={() => share(fresh)}>
                {t('shareTask')}
              </Button>
            )}
            {all.length > 0 && (
              <Segmented
                scroll
                label={t('taskStatus')}
                value={show}
                onChange={setShow}
                options={[
                  ['all', `${t('allTasks')} ${all.length}`],
                  ...TASK_STATUSES.map((s) => [s, `${t(STATUS_KEY[s])} ${count(s)}`] as const)
                ]}
              />
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
              icon={<BoardIcon colorClassName="accent-accent-fg" size={28} />}
              title={t('taskBoardEmpty')}
              hint={t('taskBoardEmptyHint')}
            />
          )
        }
        renderItem={({ item }) => (
          <Openable target={{ kind: 'task', id: item.id }} title={item.title}>
            <BoardCard task={item} footer={<CommentCount n={counts[item.id]} />} />
          </Openable>
        )}
      />
    </SafeAreaView>
  )
}
