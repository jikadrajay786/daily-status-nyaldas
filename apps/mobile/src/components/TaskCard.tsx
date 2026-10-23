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
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
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
import { Badge, Card, Notice } from '@/components/ui'
import { toneColors, useTheme } from '@/lib/theme'

// One spring and one fade for the whole screen, so every movement feels like the same material.
const SPRING = { damping: 20, stiffness: 300 }
const FADE = { duration: 200 }
const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

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
    <Animated.View style={[s.badge, box]}>
      <Animated.Text style={[s.badgeText, label]}>{t(STATUS_KEY[status])}</Animated.Text>
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
  const tone = toneColors(c, STATUS_TONE[status])
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
      style={[s.option, style]}
    >
      <View style={s.optionInner}>
        {saving && <ActivityIndicator size="small" color={tone.fg} />}
        <Text style={[s.optionText, { color: picked ? tone.fg : c.fg2 }]}>
          {t(STATUS_KEY[status])}
        </Text>
      </View>
    </AnimatedPressable>
  )
}

// Revealed behind the card while swiping left; the tick grows as the swipe nears the point where it counts.
const DoneAction = ({ progress }: { progress: SharedValue<number> }): React.JSX.Element => {
  const { t } = useT()
  const { colors: c } = useTheme()
  const icon = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(progress.value, [0, 1], [0.6, 1.1], 'clamp') }],
    opacity: interpolate(progress.value, [0, 0.5, 1], [0, 0.6, 1], 'clamp')
  }))
  return (
    <View style={[s.action, { backgroundColor: c.ok }]}>
      <Animated.View style={[s.actionInner, icon]}>
        <Check color={c.onAccent} size={26} strokeWidth={3} />
        <Text style={[s.actionText, { color: c.onAccent }]}>{t('tsCompleted')}</Text>
      </Animated.View>
    </View>
  )
}

export const TaskCard = ({ task, index }: { task: Task; index: number }): React.JSX.Element => {
  const { t, locale } = useT()
  const { colors } = useTheme()
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
        containerStyle={s.swipe}
        renderRightActions={(progress) => <DoneAction progress={progress} />}
        onSwipeableOpen={() => {
          swipe.current?.close()
          void pick('completed')
        }}
      >
        {/* Swiping is a shortcut only: the status buttons below do the same for screen readers and switches. */}
        <View>
          <Card>
            <View style={s.gap}>
              <Text accessibilityRole="header" style={[s.title, { color: colors.fg }]}>
                {task.title}
              </Text>
              <View style={s.meta}>
                <StatusBadge status={shown} />
                {isOverdue({ ...task, status: shown }) && (
                  <Badge label={t('taskOverdue')} tone="warn" />
                )}
                <Text style={[s.due, { color: colors.fg2 }]}>
                  {t('taskDueOn', { date: fmtShort(dueDay(task.due_date), locale) })}
                </Text>
              </View>
              {task.description && (
                <Text style={[s.body, { color: colors.fg2 }]}>{task.description}</Text>
              )}
              <View
                accessibilityRole="radiogroup"
                accessibilityLabel={t('taskStatus')}
                style={s.row}
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
              </View>
              {error && <Notice tone="bad">{t(error)}</Notice>}
            </View>
          </Card>
        </View>
      </ReanimatedSwipeable>
    </Animated.View>
  )
}

const s = StyleSheet.create({
  swipe: { borderRadius: 14 },
  gap: { gap: 12 },
  title: { fontSize: 18, fontWeight: '600', letterSpacing: -0.2 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  due: { fontSize: 14 },
  body: { fontSize: 15, lineHeight: 22 },
  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontSize: 13, fontWeight: '600' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: {
    flexGrow: 1,
    flexBasis: '45%',
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center'
  },
  optionText: { fontSize: 15, fontWeight: '600', textAlign: 'center' },
  optionInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  action: {
    flex: 1,
    borderRadius: 14,
    marginLeft: 12,
    justifyContent: 'center',
    alignItems: 'flex-end'
  },
  actionInner: { alignItems: 'center', gap: 4, paddingHorizontal: 24 },
  actionText: { fontSize: 14, fontWeight: '700' }
})
