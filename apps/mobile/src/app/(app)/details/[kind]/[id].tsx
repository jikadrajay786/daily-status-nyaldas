import { useComments, type CommentTarget } from '@daily-status/core/commentService'
import { useT } from '@daily-status/core/i18n'
import { useLiveQuery } from '@daily-status/core/live'
import { canChange, getProfile, getStatus } from '@daily-status/core/statusService'
import { getTask } from '@daily-status/core/taskService'
import { router, useLocalSearchParams } from 'expo-router'
import { ChevronLeft } from 'lucide-react-native'
import { useRef } from 'react'
import { KeyboardAvoidingView, ScrollView, type ScrollViewInstance } from 'react-native'
import { GestureHandlerRootView as RNGestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaView as RNSafeAreaView } from 'react-native-safe-area-context'
import { withUniwind } from 'uniwind'
import { BoardCard } from '@/components/BoardCard'
import { CommentComposer, CommentList } from '@/components/CommentThread'
import { Box } from '@/components/gs/box'
import { Heading } from '@/components/gs/heading'
import { HStack } from '@/components/gs/hstack'
import { Pressable } from '@/components/gs/pressable'
import { Text } from '@/components/gs/text'
import { CardsSkeleton, StatusCard } from '@/components/StatusCard'
import { TaskCard } from '@/components/TaskCard'
import { Button, Loading, Notice, Skeleton } from '@/components/ui'
import { useProfile } from '@/lib/profile'
import { uuidParam } from '@/lib/route'
import { useShareTask } from '@/lib/share'

const SafeAreaView = withUniwind(RNSafeAreaView)
const GestureHandlerRootView = withUniwind(RNGestureHandlerRootView)
const BackIcon = withUniwind(ChevronLeft)

const StatusDetails = ({ id }: { id: string }): React.JSX.Element => {
  const { t } = useT()
  const { role } = useProfile()
  const admin = role === 'admin'
  const [q] = useLiveQuery(`status-details:${id}`, async () => {
    const st = await getStatus(id)
    return st && { st, author: admin ? await getProfile(st.user_id) : undefined }
  })
  if (q.state === 'loading') return <CardsSkeleton count={1} />
  if (q.state === 'error') return <Notice tone="bad">{t(q.message)}</Notice>
  if (!q.data) return <Notice>{t('notFound')}</Notice>
  const { st, author } = q.data
  return (
    <StatusCard
      status={st}
      author={author}
      actions={
        canChange(st.date, role) && (
          <Button
            variant="ghost"
            onPress={() =>
              admin
                ? router.push({ pathname: '/team/edit/[statusId]', params: { statusId: st.id } })
                : router.navigate({ pathname: '/', params: { date: st.date, edit: '1' } })
            }
          >
            {t('edit')}
          </Button>
        )
      }
    />
  )
}

const TaskDetails = ({ id }: { id: string }): React.JSX.Element => {
  const { t } = useT()
  const admin = useProfile().role === 'admin'
  const share = useShareTask()
  const [q] = useLiveQuery(`task-details:${id}`, () => getTask(id))
  if (q.state === 'loading') return <CardsSkeleton count={1} />
  if (q.state === 'error') return <Notice tone="bad">{t(q.message)}</Notice>
  if (!q.data) return <Notice>{t('notFound')}</Notice>
  // Staff change the status right here; admins read who it's given to.
  const task = q.data
  return admin ? (
    <BoardCard
      task={task}
      full
      footer={
        <Button variant="ghost" onPress={() => share(task)}>
          {t('shareTask')}
        </Button>
      }
    />
  ) : (
    <TaskCard task={task} index={0} />
  )
}

const Thread = ({ target }: { target: CommentTarget }): React.JSX.Element => {
  const { t } = useT()
  const [comments] = useComments(target)
  const scroll = useRef<ScrollViewInstance>(null)
  const sent = useRef(false)
  return (
    <KeyboardAvoidingView behavior="padding" className="flex-1">
      <ScrollView
        ref={scroll}
        contentContainerClassName="gap-4 p-6"
        keyboardShouldPersistTaps="handled"
        // After sending, follow the thread down to the new comment.
        onContentSizeChange={() => {
          if (sent.current) scroll.current?.scrollToEnd()
          sent.current = false
        }}
      >
        {target.kind === 'status' ? (
          <StatusDetails id={target.id} />
        ) : (
          <TaskDetails id={target.id} />
        )}
        <Heading accessibilityRole="header" className="mt-2 text-[18px] font-semibold text-fg">
          {t('comments')}
        </Heading>
        {comments.state === 'ok' ? (
          <CommentList comments={comments.data} />
        ) : comments.state === 'error' ? (
          <Notice tone="bad">{t(comments.message)}</Notice>
        ) : (
          <Loading>
            <Skeleton width="80%" />
            <Skeleton width="60%" />
          </Loading>
        )}
      </ScrollView>
      <Box className="border-t border-line bg-card px-4 py-3">
        <CommentComposer target={target} onSent={() => (sent.current = true)} />
      </Box>
    </KeyboardAvoidingView>
  )
}

export default function Details(): React.JSX.Element {
  const { t } = useT()
  const admin = useProfile().role === 'admin'
  const params = useLocalSearchParams<{ kind: string; id: string }>()
  const id = uuidParam(params.id)
  const kind = params.kind === 'status' || params.kind === 'task' ? params.kind : null

  return (
    // Status buttons on a staff task card sit inside a swipeable, which needs a gesture root.
    <GestureHandlerRootView className="flex-1">
      <SafeAreaView className="flex-1 bg-canvas">
        <HStack className="items-center gap-1 border-b border-line px-2 py-1">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('back')}
            onPress={() =>
              router.canGoBack() ? router.back() : router.replace(admin ? '/team' : '/')
            }
            className="min-h-12 flex-row items-center pr-3"
          >
            <BackIcon colorClassName="accent-accent-fg" size={26} />
            <Text className="text-[16px] text-accent-fg">{t('back')}</Text>
          </Pressable>
          <Heading accessibilityRole="header" className="flex-1 text-[17px] font-semibold text-fg">
            {t('details')}
          </Heading>
        </HStack>
        {id && kind ? (
          <Thread target={{ kind, id }} />
        ) : (
          <Box className="p-6">
            <Notice>{t('notFound')}</Notice>
          </Box>
        )}
      </SafeAreaView>
    </GestureHandlerRootView>
  )
}
