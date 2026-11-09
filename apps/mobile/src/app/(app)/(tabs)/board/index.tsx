import { useCommentCounts } from '@daily-status/core/commentService'
import { ChevronDown, ChevronUp, ClipboardList, Plus, Search, SearchX } from 'lucide-react-native'
import { useT } from '@daily-status/core/i18n'
import { useLiveQuery } from '@daily-status/core/live'
import {
  getTask,
  GROUP_KEY,
  inView,
  listPeople,
  taskGroup,
  TASK_VIEWS,
  VIEW_KEY,
  type TaskView
} from '@daily-status/core/taskService'
import type { Tone } from '@daily-status/core/format'
import { useBoardPage, useTaskFilter } from '@daily-status/core/useTasks'
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { RefreshControl } from 'react-native'
import { withUniwind } from 'uniwind'
import { BoardCard } from '@/components/BoardCard'
import { CommentCount } from '@/components/CommentThread'
import { HStack } from '@/components/gs/hstack'
import { Pressable } from '@/components/gs/pressable'
import { Text } from '@/components/gs/text'
import { VStack } from '@/components/gs/vstack'
import { MemberPicker } from '@/components/MemberPicker'
import { Openable } from '@/components/Openable'
import { CardsSkeleton } from '@/components/StatusCard'
import {
  ListScreen,
  LoadMore,
  Button,
  Field,
  Notice,
  Segmented,
  Stat,
  Title,
  Empty
} from '@/components/ui'
import { usePullToRefresh } from '@/lib/refresh'
import { useProfile } from '@/lib/profile'
import { useShareTask } from '@/lib/share'

const BoardIcon = withUniwind(ClipboardList)
const NoMatchIcon = withUniwind(SearchX)
const AddIcon = withUniwind(Plus)
const SearchIcon = withUniwind(Search)
const OpenIcon = withUniwind(ChevronDown)
const CloseIcon = withUniwind(ChevronUp)
const SUMMARY = [
  ['today', 'info'],
  ['overdue', 'warn'],
  ['blocked', 'bad']
] as const satisfies readonly (readonly [TaskView, Tone])[]

export default function Board(): React.JSX.Element {
  const { t } = useT()
  const me = useProfile()
  const { f, set, clear, active } = useTaskFilter()
  const [tasks, reload] = useBoardPage(me, f)
  const [people] = useLiveQuery(`task-people:${me.role}`, () => listPeople(me.role))
  // Name and search stay tucked away until wanted, or while one of them is in use.
  const [more, setMore] = useState(false)
  const filtering = more || !!f.search || !!f.person
  const [showDone, setShowDone] = useState(false)
  const { created, view } = useLocalSearchParams<{ created?: string; view?: string }>()
  // Home opens the board on one view; the param is cleared so a later visit keeps whatever was picked here.
  useEffect(() => {
    if (!TASK_VIEWS.includes(view as TaskView)) return
    set({ view: view as TaskView })
    router.setParams({ view: undefined })
  }, [view, set])
  const pull = usePullToRefresh(tasks.state === 'loading', reload)
  const data = tasks.state === 'ok' ? tasks.data : null
  const all = data?.rows ?? []
  const grouped = f.view === 'all'
  const open = data ? data.count('all') - data.done : 0
  // Finished tasks fold away under All, unless they're all there is to show.
  const folded = grouped && !showDone && open > 0
  const shown = all.filter(
    (task) => inView(task, f.view) && !(folded && task.status === 'completed')
  )
  // The server sends finished tasks last: once they start arriving, nothing else is left to show while folded.
  const paged = folded && all.at(-1)?.status === 'completed' ? null : data
  const counts = useCommentCounts(
    'task',
    shown.map((task) => task.id)
  )
  const share = useShareTask()
  // Shows once the live list has the new task, so the message names everyone it went to.
  const [justMade] = useLiveQuery(`task-created:${created ?? ''}`, () =>
    created ? getTask(created) : Promise.resolve(null)
  )
  const fresh = justMade.state === 'ok' ? justMade.data : null

  return (
    <ListScreen
      data={shown}
      keyExtractor={(task) => task.id}
      contentContainerClassName="gap-3 p-6"
      refreshControl={<RefreshControl {...pull} />}
      header={
        <>
          <Title
            action={
              <HStack className="items-center gap-1">
                <Pressable
                  accessibilityRole="button"
                  hitSlop={6}
                  onPress={() => router.push('/board/new')}
                  className="min-h-9 flex-row items-center gap-1 rounded-full bg-accent py-1 pr-3 pl-2 data-[active=true]:opacity-80"
                >
                  <AddIcon colorClassName="accent-on-accent" size={16} />
                  <Text className="text-[14px] font-semibold text-on-accent android:font-bold">
                    {t('newTask')}
                  </Text>
                </Pressable>
                {data && (data.count('all') > 0 || active) && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('search')}
                    accessibilityState={{ expanded: filtering }}
                    onPress={() => {
                      if (filtering) set({ search: '', person: '' })
                      setMore(!filtering)
                    }}
                    className="h-12 w-11 items-center justify-center rounded-full data-[active=true]:bg-selected"
                  >
                    <SearchIcon
                      colorClassName={filtering ? 'accent-accent-fg' : 'accent-fg-2'}
                      size={20}
                    />
                  </Pressable>
                )}
              </HStack>
            }
          >
            {t('navTaskBoard')}
          </Title>
          {data && (data.count('all') > 0 || active) && (
            <>
              <Segmented
                scroll
                label={t('taskViews')}
                value={f.view}
                onChange={(view) => set({ view })}
                options={TASK_VIEWS.map((v) => [v, `${t(VIEW_KEY[v])} ${data.count(v)}`] as const)}
              />
              {filtering && (
                <>
                  <MemberPicker
                    members={people.state === 'ok' ? people.data : []}
                    value={f.person}
                    onChange={(person) => set({ person })}
                  />
                  <Field
                    label={t('search')}
                    hideLabel
                    value={f.search}
                    onChangeText={(search) => set({ search })}
                    placeholder={t('searchTasks')}
                    autoCorrect={false}
                  />
                </>
              )}
            </>
          )}
        </>
      }
      ListHeaderComponent={
        created || (data && (data.count('all') > 0 || active)) ? (
          <VStack className="mb-1 gap-4">
            {created && <Notice tone="ok">{t('taskCreated')}</Notice>}
            {created && fresh && (
              <Button variant="ghost" onPress={() => share(fresh)}>
                {t('shareTask')}
              </Button>
            )}
            {data && (data.count('all') > 0 || active) && (
              <HStack accessibilityLabel={t('taskSummary')} className="gap-2">
                {SUMMARY.map(([v, tone]) => (
                  <Stat
                    key={v}
                    compact
                    label={t(VIEW_KEY[v])}
                    value={data.count(v)}
                    tone={data.count(v) ? tone : 'idle'}
                    selected={f.view === v}
                    onPress={() => set({ view: f.view === v ? 'all' : v })}
                  />
                ))}
              </HStack>
            )}
          </VStack>
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
            icon={<BoardIcon colorClassName="accent-accent-fg" size={28} />}
            title={t('taskBoardEmpty')}
            hint={t('taskBoardEmptyHint')}
          />
        )
      }
      onEndReached={paged?.older}
      onEndReachedThreshold={0.5}
      ListFooterComponent={
        <VStack className="gap-3">
          {paged && shown.length > 0 && <LoadMore page={paged} />}
          {grouped && !!data?.done && open > 0 && !paged?.more && (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: !folded }}
              onPress={() => setShowDone(!showDone)}
              className="min-h-12 flex-row items-center justify-between rounded-[14px] border border-line bg-card px-4 data-[active=true]:bg-selected"
            >
              <Text className="text-[15px] font-medium text-fg-2">
                {t('taskFinished', { n: data.done })}
              </Text>
              {folded ? (
                <OpenIcon colorClassName="accent-fg-2" size={20} />
              ) : (
                <CloseIcon colorClassName="accent-fg-2" size={20} />
              )}
            </Pressable>
          )}
        </VStack>
      }
      renderItem={({ item, index }) => {
        const group = taskGroup(item)
        const prev = shown[index - 1]
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
              <BoardCard task={item} footer={<CommentCount n={counts[item.id]} />} />
            </Openable>
          </VStack>
        )
      }}
    />
  )
}
