import type { Tone } from '@daily-status/core/format'
import { useT } from '@daily-status/core/i18n'
import { useEffect, useState, type ReactNode, type Ref } from 'react'
import {
  Animated,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ScrollViewInstance,
  type ScrollViewProps,
  type TextInputProps,
  type TextInputInstance
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAnnounce } from '@/lib/announce'
import { tint, toneColors, useTheme } from '@/lib/theme'

export const Screen = ({
  children,
  center,
  scrollRef,
  refreshControl
}: {
  children: ReactNode
  center?: boolean
  scrollRef?: Ref<ScrollViewInstance>
  refreshControl?: ScrollViewProps['refreshControl']
}): React.JSX.Element => {
  const { colors } = useTheme()
  return (
    // The tab bar already clears the bottom inset.
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={[s.fill, { backgroundColor: colors.canvas }]}
    >
      {/* Android draws edge to edge, so the window no longer resizes for the keyboard: pad on both platforms. */}
      <KeyboardAvoidingView style={s.fill} behavior="padding">
        <ScrollView
          ref={scrollRef}
          refreshControl={refreshControl}
          contentContainerStyle={[s.screen, center && s.center]}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

export const Title = ({
  children,
  sub,
  center
}: {
  children: string
  sub?: string
  center?: boolean
}): React.JSX.Element => {
  const { colors } = useTheme()
  return (
    <View style={s.titleBox}>
      <Text
        accessibilityRole="header"
        style={[s.title, center && s.centerText, { color: colors.fg }]}
      >
        {children}
      </Text>
      {sub && <Text style={[s.sub, center && s.centerText, { color: colors.fg2 }]}>{sub}</Text>}
    </View>
  )
}

const BUTTON_HEIGHT = 48

export const Button = ({
  children,
  onPress,
  variant = 'primary',
  disabled
}: {
  children: string
  onPress: () => void
  variant?: 'primary' | 'ghost' | 'danger'
  disabled?: boolean
}): React.JSX.Element => {
  const { colors: c } = useTheme()
  const [bg, pressed, fg, line] = {
    primary: [c.accent, c.accentPressed, c.onAccent, c.accent],
    ghost: ['transparent', c.selected, c.fg2, c.line],
    danger: ['transparent', toneColors(c, 'bad').bg, c.badFg, toneColors(c, 'bad').line]
  }[variant]
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed: p }) => [
        s.button,
        { backgroundColor: p ? pressed : bg, borderColor: line, opacity: disabled ? 0.4 : 1 }
      ]}
    >
      <Text style={[s.buttonText, { color: fg }]}>{children}</Text>
    </Pressable>
  )
}

export const Field = ({
  label,
  hint,
  error,
  hideLabel = false,
  ...props
}: TextInputProps & {
  label: string
  hint?: string
  error?: string
  // Still read by screen readers; for fields whose placeholder says it all, like search.
  hideLabel?: boolean
  ref?: React.Ref<TextInputInstance>
}): React.JSX.Element => {
  const { colors: c } = useTheme()
  useAnnounce(error)
  return (
    <View style={s.field}>
      {!hideLabel && <Text style={[s.label, { color: c.fg2 }]}>{label}</Text>}
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={error ?? hint}
        placeholderTextColor={c.placeholder}
        selectionColor={c.accentFg}
        {...props}
        style={[
          s.input,
          { backgroundColor: c.field, borderColor: error ? c.bad : c.line, color: c.fg }
        ]}
      />
      {error ? (
        <Text accessibilityLiveRegion="polite" style={[s.hint, { color: c.badFg }]}>
          {error}
        </Text>
      ) : (
        hint && <Text style={[s.hint, { color: c.fg3 }]}>{hint}</Text>
      )}
    </View>
  )
}

// `bad` interrupts like desktop's role="alert"; `ok` is announced politely; the rest stay silent.
export const Notice = ({
  tone = 'idle',
  children
}: {
  tone?: Tone
  children: string
}): React.JSX.Element => {
  const { colors } = useTheme()
  const t = toneColors(colors, tone)
  useAnnounce(tone === 'bad' || tone === 'ok' ? children : undefined)
  return (
    <View
      accessibilityRole={tone === 'bad' ? 'alert' : undefined}
      accessibilityLiveRegion={tone === 'bad' ? 'assertive' : tone === 'ok' ? 'polite' : 'none'}
      style={[s.notice, { backgroundColor: t.bg, borderColor: t.line }]}
    >
      <Text style={[s.noticeText, { color: t.fg }]}>{children}</Text>
    </View>
  )
}

export const Link = ({
  children,
  onPress
}: {
  children: string
  onPress: () => void
}): React.JSX.Element => {
  const { colors } = useTheme()
  return (
    <Pressable accessibilityRole="link" onPress={onPress} hitSlop={12}>
      <Text style={[s.link, { color: colors.accentFg }]}>{children}</Text>
    </Pressable>
  )
}

export const Badge = ({ label, tone }: { label: string; tone: Tone }): React.JSX.Element => {
  const { colors } = useTheme()
  const t = toneColors(colors, tone)
  return (
    <View style={[s.badge, { backgroundColor: t.bg, borderColor: t.line }]}>
      <Text style={[s.badgeText, { color: t.fg }]}>{label}</Text>
    </View>
  )
}

// Fades in after 150ms like desktop's .skeleton, so fast loads never flash a placeholder.
export const Skeleton = ({
  width,
  height = 14
}: {
  width: number | `${number}%`
  height?: number
}): React.JSX.Element => {
  const { colors } = useTheme()
  const [opacity] = useState(() => new Animated.Value(0))
  useEffect(() => {
    const anim = Animated.timing(opacity, {
      toValue: 1,
      duration: 200,
      delay: 150,
      useNativeDriver: true
    })
    anim.start()
    return () => anim.stop()
  }, [opacity])
  return (
    <Animated.View
      style={{ width, height, borderRadius: 6, backgroundColor: colors.selected, opacity }}
    />
  )
}

// Screen readers hear "Loading" once for the whole placeholder, not every bar.
export const Loading = ({ children }: { children: ReactNode }): React.JSX.Element => {
  const { t } = useT()
  return (
    <View
      accessible
      accessibilityLabel={t('loading')}
      accessibilityState={{ busy: true }}
      style={s.loading}
    >
      {children}
    </View>
  )
}

export const Card = ({ children }: { children: ReactNode }): React.JSX.Element => {
  const { colors } = useTheme()
  return (
    <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
      {children}
    </View>
  )
}

export const Avatar = ({
  text,
  large = false
}: {
  text: string
  large?: boolean
}): React.JSX.Element => {
  const { colors } = useTheme()
  const size = large ? 56 : 40
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[s.avatar, { width: size, height: size, backgroundColor: tint(colors.accent, 0.15) }]}
    >
      <Text style={[s.avatarText, { color: colors.accentFg, fontSize: large ? 20 : 15 }]}>
        {text}
      </Text>
    </View>
  )
}

export const Stat = ({
  label,
  value,
  sub,
  tone = 'idle',
  loading = false,
  icon
}: {
  label: string
  value: string | number
  sub?: string
  tone?: Tone
  loading?: boolean
  // Decorative, so it's hidden from screen readers.
  icon?: ReactNode
}): React.JSX.Element => {
  const { colors: c } = useTheme()
  const color = tone === 'idle' ? c.fg : toneColors(c, tone).fg
  return (
    <View style={[s.stat, { backgroundColor: c.card, borderColor: c.line }]}>
      <Text style={[s.statLabel, { color: c.fg2 }]}>{label}</Text>
      {loading ? (
        <Loading>
          <Skeleton width={56} height={26} />
        </Loading>
      ) : (
        <View style={s.statRow}>
          {icon && (
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              {icon}
            </View>
          )}
          <Text style={[s.statValue, { color }]}>{value}</Text>
        </View>
      )}
      {sub && <Text style={[s.statSub, { color: c.fg3 }]}>{sub}</Text>}
    </View>
  )
}

// A row of mutually exclusive choices (radio semantics), like desktop's pressed-button groups.
export const Segmented = <V extends string>({
  label,
  options,
  value,
  onChange
}: {
  label: string
  options: readonly (readonly [V, string])[]
  value: V
  onChange: (v: V) => void
}): React.JSX.Element => {
  const { colors: c } = useTheme()
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={[s.segments, { borderColor: c.line }]}
    >
      {options.map(([v, text]) => (
        <Pressable
          key={v}
          accessibilityRole="radio"
          accessibilityState={{ checked: value === v }}
          onPress={() => onChange(v)}
          style={[s.segment, value === v && { backgroundColor: c.selected }]}
        >
          <Text style={[s.segmentText, { color: value === v ? c.fg : c.fg2 }]}>{text}</Text>
        </Pressable>
      ))}
    </View>
  )
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  screen: { flexGrow: 1, padding: 24, gap: 16 },
  center: { justifyContent: 'center', maxWidth: 440, width: '100%', alignSelf: 'center' },
  titleBox: { gap: 4 },
  title: { fontSize: 22, fontWeight: '600' },
  sub: { fontSize: 15 },
  centerText: { textAlign: 'center' },
  button: {
    minHeight: BUTTON_HEIGHT,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center'
  },
  buttonText: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: '500' },
  input: {
    minHeight: BUTTON_HEIGHT,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 16
  },
  hint: { fontSize: 13 },
  notice: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  noticeText: { fontSize: 15 },
  link: { fontSize: 15, fontWeight: '600', textAlign: 'center' },
  badge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3
  },
  badgeText: { fontSize: 13, fontWeight: '500' },
  loading: { gap: 10 },
  card: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 12 },
  avatar: { borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontWeight: '600' },
  stat: { flexGrow: 1, flexBasis: 150, borderWidth: 1, borderRadius: 14, padding: 14, gap: 4 },
  statLabel: { fontSize: 13, fontWeight: '500' },
  statValue: { fontSize: 24, fontWeight: '600', fontVariant: ['tabular-nums'] },
  statSub: { fontSize: 12 },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  segments: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderWidth: 1,
    borderRadius: 10,
    padding: 4,
    gap: 4
  },
  segment: {
    flexGrow: 1,
    minHeight: 44,
    borderRadius: 8,
    justifyContent: 'center',
    paddingHorizontal: 12
  },
  segmentText: { fontSize: 15, fontWeight: '500', textAlign: 'center' }
})
