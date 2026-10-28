import type { Task, TaskStatus } from '@daily-status/core/database.types'
import { fmtShort } from '@daily-status/core/format'
import { useT } from '@daily-status/core/i18n'
import {
  dueDay,
  isOverdue,
  STATUS_KEY,
  STATUS_TONE,
  TASK_STATUSES
} from '@daily-status/core/taskService'
import { useUpdateTaskStatus } from '@daily-status/core/useTasks'
import * as Haptics from 'expo-haptics'
import { Check } from 'lucide-react-native'
import { useRef, useState } from 'react'
import { ActivityIndicator, Pressable } from 'react-native'
import ReanimatedSwipeable, {
  type SwipeableMethods
} from 'react-native-gesture-handler/ReanimatedSwipeable'
import Animated, {
  FadeInDown,
  interpolate,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue
} from 'react-native-reanimated'
import { withUniwind } from 'uniwind'
import { CommentCount } from './CommentThread'
import { Box } from '@/components/gs/box'
import { HStack } from '@/components/gs/hstack'
import { Text } from '@/components/gs/text'
import { VStack } from '@/components/gs/vstack'
import { Badge, Card, Notice } from '@/components/ui'
import { TONE_ACCENT, TONE_TEXT } from '@/lib/tones'
import { toneColors, useTheme } from '@/lib/theme'

// One spring and one fade for the whole screen, so every movement feels like the same material.
const SPRING = { damping: 20, stiffness: 300 }
const FADE = { duration: 200 }
const AnimatedPressable = Animated.createAnimatedComponent(Pressable)
const CheckIcon = withUniwind(Check)
// The swipeable only takes a style object: it rounds the corners the green action shows through.
const SWIPE_SHAPE = { borderRadius: 14 }
// Colours that fade between statuses are interpolated by Reanimated, so they stay palette values; everything
// static is a class. Uniwind's components back Reanimated's views too, so both sit on the same view.

// Shows the choice straight away and buzzes; the realtime refetch then confirms it, a failure snaps it back.
type StatusChange = {
  shown: TaskStatus
  pick: (status: TaskStatus) => Promise<void>
  busy: boolean
  error: ReturnType<typeof useUpdateTaskStatus>['error']
}

const useStatusChange = (task: Pick<Task, 'id' | 'status'>): StatusChange => {
  const { run, busy, error } = useUpdateTaskStatus()
  const [want, setWant] = useState<TaskStatus | null>(null)
  if (want === task.status) setWant(null)
  const shown = want ?? task.status
  const pick = async (status: TaskStatus): Promise<void> => {
    if (status === shown) return
    setWant(status)
    void Haptics.selectionAsync()
    const ok = await run({ taskId: task.id, status })
    if (!ok) setWant(null)
    if (!ok || status === 'completed')
      void Haptics.notificationAsync(
        ok ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error
      )
  }
  return { shown, pick, busy, error }
}

const StatusBadge = ({ status }: { status: TaskStatus }): React.JSX.Element => {
  const { t } = useT()
  const { colors } = useTheme()
  const tone = toneColors(colors, STATUS_TONE[status])
  const box = useAnimatedStyle(() => ({
    backgroundColor: withTiming(tone.bg, FADE),
    borderColor: withTiming(tone.line, FADE)
  }))
  const label = useAnimatedStyle(() => ({ color: withTiming(tone.fg, FADE) }))
  return (
    <Animated.View className="rounded-full border px-2.5 py-[3px]" style={box}>
      <Animated.Text className="text-[13px] font-semibold" style={label}>
        {t(STATUS_KEY[status])}
      </Animated.Text>
    </Animated.View>
  )
}

const Option = ({
  status,
  picked,
  disabled,
  saving,
  onPress
}: {
  status: TaskStatus
  picked: boolean
  disabled: boolean
  saving: boolean
  onPress: () => void
}): React.JSX.Element => {
  const { t } = useT()
  const { colors: c } = useTheme()
  const toneName = STATUS_TONE[status]
  const tone = toneColors(c, toneName)
  const scale = useSharedValue(1)
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.get() }],
    backgroundColor: withTiming(picked ? tone.bg : 'transparent', FADE),
    borderColor: withTiming(picked ? tone.fg : c.line, FADE)
  }))
  return (
    <AnimatedPressable
      accessibilityRole="radio"
      accessibilityState={{ checked: picked, disabled }}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      onPressIn={() => scale.set(withSpring(0.96, SPRING))}
      onPressOut={() => scale.set(withSpring(1, SPRING))}
      className="min-h-12 grow basis-[45%] items-center justify-center rounded-xl border px-3"
      style={style}
    >
      <HStack className="items-center gap-1.5">
        {saving && <ActivityIndicator size="small" colorClassName={TONE_ACCENT[toneName]} />}
        <Text
          className={`text-center text-[15px] font-semibold ${picked ? TONE_TEXT[toneName] : 'text-fg-2'}`}
        >
          {t(STATUS_KEY[status])}
        </Text>
      </HStack>
    </AnimatedPressable>
  )
}

// Revealed behind the card while swiping left; the tick grows as the swipe nears the point where it counts.
const DoneAction = ({ progress }: { progress: SharedValue<number> }): React.JSX.Element => {
  const { t } = useT()
  const icon = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(progress.value, [0, 1], [0.6, 1.1], 'clamp') }],
    opacity: interpolate(progress.value, [0, 0.5, 1], [0, 0.6, 1], 'clamp')
  }))
  return (
    <Box className="ml-3 flex-1 items-end justify-center rounded-[14px] bg-ok">
      <Animated.View className="items-center gap-1 px-6" style={icon}>
        <CheckIcon colorClassName="accent-on-accent" size={26} strokeWidth={3} />
        <Text className="text-[14px] font-bold text-on-accent">{t('tsCompleted')}</Text>
      </Animated.View>
    </Box>
  )
}

export const TaskCard = ({
  task,
  index,
  comments
}: {
  task: Task
  index: number
  comments?: number
}): React.JSX.Element => {
  const { t, locale } = useT()
  const { shown, pick, busy, error } = useStatusChange(task)
  const swipe = useRef<SwipeableMethods>(null)
  const finished = shown === 'completed'

  return (
    <Animated.View
      entering={FadeInDown.delay(Math.min(index, 8) * 40)
        .springify()
        .damping(SPRING.damping)
        .stiffness(SPRING.stiffness)}
      layout={LinearTransition.springify().damping(SPRING.damping).stiffness(SPRING.stiffness)}
    >
      <ReanimatedSwipeable
        ref={swipe}
        enabled={!finished && !busy}
        friction={1.5}
        rightThreshold={72}
        overshootRight={false}
        containerStyle={SWIPE_SHAPE}
        renderRightActions={(progress) => <DoneAction progress={progress} />}
        onSwipeableOpen={() => {
          swipe.current?.close()
          void pick('completed')
        }}
      >
        {/* Swiping is a shortcut only: the status buttons below do the same for screen readers and switches. */}
        <Box>
          <Card>
            <VStack className="gap-3">
              <Text
                accessibilityRole="header"
                className="text-[18px] font-semibold tracking-[-0.2px] text-fg"
              >
                {task.title}
              </Text>
              <HStack className="flex-wrap items-center gap-2">
                <StatusBadge status={shown} />
                {isOverdue({ ...task, status: shown }) && (
                  <Badge label={t('taskOverdue')} tone="warn" />
                )}
                <Text className="text-[14px] text-fg-2">
                  {t('taskDueOn', { date: fmtShort(dueDay(task.due_date), locale) })}
                </Text>
                <CommentCount n={comments} />
              </HStack>
              {task.description && (
                <Text className="text-[15px] leading-[22px] text-fg-2">{task.description}</Text>
              )}
              <HStack
                accessibilityRole="radiogroup"
                accessibilityLabel={t('taskStatus')}
                className="flex-wrap gap-2"
              >
                {TASK_STATUSES.map((st) => (
                  <Option
                    key={st}
                    status={st}
                    picked={shown === st}
                    disabled={busy}
                    saving={busy && shown === st}
                    onPress={() => void pick(st)}
                  />
                ))}
              </HStack>
              {error && <Notice tone="bad">{t(error)}</Notice>}
            </VStack>
          </Card>
        </Box>
      </ReanimatedSwipeable>
    </Animated.View>
  )
}
