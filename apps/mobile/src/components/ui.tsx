import type { Tone } from '@daily-status/core/format'
import { useT } from '@daily-status/core/i18n'
import { useEffect, useState, type ReactNode, type Ref } from 'react'
import {
  Animated,
  KeyboardAvoidingView,
  ScrollView,
  type ScrollViewInstance,
  type ScrollViewProps,
  type TextInputInstance,
  type TextInputProps
} from 'react-native'
import { Eye, EyeOff } from 'lucide-react-native'
import { SafeAreaView as RNSafeAreaView } from 'react-native-safe-area-context'
import { withUniwind } from 'uniwind'
import { Avatar as GsAvatar } from '@/components/gs/avatar'
import { Badge as GsBadge, BadgeText } from '@/components/gs/badge'
import { Box } from '@/components/gs/box'
import { Button as GsButton, ButtonSpinner, ButtonText } from '@/components/gs/button'
import { Card as GsCard } from '@/components/gs/card'
import { Heading } from '@/components/gs/heading'
import { HStack } from '@/components/gs/hstack'
import { Input, InputField } from '@/components/gs/input'
import { Pressable } from '@/components/gs/pressable'
import { Spinner } from '@/components/gs/spinner'
import { Text } from '@/components/gs/text'
import { VStack } from '@/components/gs/vstack'
import { useTabBarInset } from '@/lib/tabBar'
import { useAnnounce } from '@/lib/announce'
import { TONE_BOX, TONE_TEXT } from '@/lib/tones'

const SafeAreaView = withUniwind(RNSafeAreaView)
const EyeIcon = withUniwind(Eye)
const EyeOffIcon = withUniwind(EyeOff)

export const Screen = ({
  children,
  center,
  scrollRef,
  refreshControl,
  underHeader = false
}: {
  children: ReactNode
  center?: boolean
  // A stack header already clears the status bar.
  underHeader?: boolean
  scrollRef?: Ref<ScrollViewInstance>
  refreshControl?: ScrollViewProps['refreshControl']
}): React.JSX.Element => {
  const inset = useTabBarInset()
  return (
    // Bottom is left out: inside the tabs the content pads to clear the floating bar instead.
    <SafeAreaView
      edges={underHeader ? ['left', 'right'] : ['top', 'left', 'right']}
      className="flex-1 bg-canvas"
    >
      {/* Android draws edge to edge, so the window no longer resizes for the keyboard: pad on both platforms. */}
      <KeyboardAvoidingView className="flex-1" behavior="padding">
        <ScrollView
          ref={scrollRef}
          refreshControl={refreshControl}
          contentContainerClassName={`grow gap-4 p-6 ${center ? 'w-full max-w-[440px] self-center justify-center' : ''}`}
          contentContainerStyle={{ paddingBottom: inset || undefined }}
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
}): React.JSX.Element => (
  <VStack className="gap-1">
    <Heading
      accessibilityRole="header"
      className={`text-[22px] font-semibold text-fg ${center ? 'text-center' : ''}`}
    >
      {children}
    </Heading>
    {sub && <Text className={`text-[15px] text-fg-2 ${center ? 'text-center' : ''}`}>{sub}</Text>}
  </VStack>
)

const BUTTON = {
  primary: ['default', 'accent-on-accent'],
  ghost: ['ghost', 'accent-fg-2'],
  danger: ['destructive', 'accent-bad-fg']
} as const

// `busy` keeps the label (so the button never changes size) and puts a spinner in front of it.
export const Button = ({
  children,
  onPress,
  variant = 'primary',
  disabled,
  busy = false
}: {
  children: string
  onPress: () => void
  variant?: 'primary' | 'ghost' | 'danger'
  disabled?: boolean
  busy?: boolean
}): React.JSX.Element => {
  const [gsVariant, spinner] = BUTTON[variant]
  return (
    <GsButton
      variant={gsVariant}
      accessibilityRole="button"
      // Explicit, or Android announces a busy button only as "busy": RN fills the description from the state.
      accessibilityLabel={children}
      accessibilityState={{ disabled: !!disabled || busy, busy }}
      isDisabled={disabled || busy}
      onPress={onPress}
      // Busy also blocks presses, but fades less than disabled.
      className={busy ? 'data-[disabled=true]:opacity-85' : undefined}
    >
      {busy && <ButtonSpinner size="small" colorClassName={spinner} />}
      <ButtonText className="text-center">{children}</ButtonText>
    </GsButton>
  )
}

export const Field = ({
  label,
  hint,
  error,
  hideLabel = false,
  icon,
  reveal = false,
  ref,
  ...props
}: TextInputProps & {
  label: string
  hint?: string
  error?: string
  // Still read by screen readers; for fields whose placeholder says it all, like search.
  hideLabel?: boolean
  // A decorative icon in front of the text.
  icon?: ReactNode
  // A password field with a show/hide button, so people can check what they typed.
  reveal?: boolean
  ref?: React.Ref<TextInputInstance>
}): React.JSX.Element => {
  const { t } = useT()
  const [shown, setShown] = useState(false)
  useAnnounce(error)
  return (
    <VStack className="gap-1.5">
      {!hideLabel && <Text className="text-[14px] font-medium text-fg-2">{label}</Text>}
      <Input isInvalid={!!error}>
        {icon && (
          <Box accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {icon}
          </Box>
        )}
        <InputField
          ref={ref}
          accessibilityLabel={label}
          accessibilityHint={error ?? hint}
          placeholderTextColorClassName="accent-placeholder"
          selectionColorClassName="accent-accent-fg"
          {...props}
          {...(reveal && { secureTextEntry: !shown })}
          style={undefined}
        />
        {reveal && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t(shown ? 'hidePassword' : 'showPassword')}
            onPress={() => setShown(!shown)}
            className="-mr-2 h-11 w-11 items-center justify-center"
          >
            {shown ? (
              <EyeOffIcon colorClassName="accent-fg-2" size={20} />
            ) : (
              <EyeIcon colorClassName="accent-fg-2" size={20} />
            )}
          </Pressable>
        )}
      </Input>
      {error ? (
        <Text accessibilityLiveRegion="polite" className="text-[13px] text-bad-fg">
          {error}
        </Text>
      ) : (
        hint && <Text className="text-[13px] text-fg-3">{hint}</Text>
      )}
    </VStack>
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
  useAnnounce(tone === 'bad' || tone === 'ok' ? children : undefined)
  return (
    <Box
      accessibilityRole={tone === 'bad' ? 'alert' : undefined}
      accessibilityLiveRegion={tone === 'bad' ? 'assertive' : tone === 'ok' ? 'polite' : 'none'}
      className={`rounded-[10px] border px-3 py-2.5 ${TONE_BOX[tone]}`}
    >
      <Text className={`text-[15px] ${TONE_TEXT[tone]}`}>{children}</Text>
    </Box>
  )
}

export const Link = ({
  children,
  onPress,
  busy = false
}: {
  children: string
  onPress: () => void
  busy?: boolean
}): React.JSX.Element => (
  <Pressable
    accessibilityRole="link"
    accessibilityLabel={children}
    accessibilityState={{ busy, disabled: busy }}
    disabled={busy}
    onPress={onPress}
    hitSlop={12}
  >
    <HStack className="items-center justify-center gap-2">
      {busy && <Spinner size="small" colorClassName="accent-accent-fg" />}
      <Text className="text-center text-[15px] font-semibold text-accent-fg">{children}</Text>
    </HStack>
  </Pressable>
)

const DOT: Record<Tone, string> = {
  ok: 'bg-ok-fg',
  info: 'bg-info-fg',
  warn: 'bg-warn-fg',
  bad: 'bg-bad-fg',
  idle: 'bg-fg-3'
}

export const Badge = ({ label, tone }: { label: string; tone: Tone }): React.JSX.Element => (
  <GsBadge variant={tone} className="gap-1.5">
    <Box className={`h-1.5 w-1.5 rounded-full ${DOT[tone]}`} />
    <BadgeText>{label}</BadgeText>
  </GsBadge>
)

// Fades in after 150ms like desktop's .skeleton, so fast loads never flash a placeholder.
export const Skeleton = ({
  width,
  height = 14
}: {
  width: number | `${number}%`
  height?: number
}): React.JSX.Element => {
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
    // Animated.View only fades; the bar is a Box so its colour comes from the theme like everything else.
    <Animated.View style={{ width, opacity }}>
      <Box className="rounded-md bg-selected" style={{ height }} />
    </Animated.View>
  )
}

// Screen readers hear "Loading" once for the whole placeholder, not every bar.
export const Loading = ({ children }: { children: ReactNode }): React.JSX.Element => {
  const { t } = useT()
  return (
    <VStack
      accessible
      accessibilityLabel={t('loading')}
      accessibilityState={{ busy: true }}
      className="gap-2.5"
    >
      {children}
    </VStack>
  )
}

export const Card = ({ children }: { children: ReactNode }): React.JSX.Element => (
  <GsCard className="gap-3 rounded-[14px] border-line bg-card p-4 shadow-none">{children}</GsCard>
)

// gluestack's AvatarFallbackText takes charAt(0) of each word, which splits Hindi/Gujarati conjuncts, so the
// text is plain and callers keep passing core's firstGrapheme initials.
export const Avatar = ({
  text,
  large = false
}: {
  text: string
  large?: boolean
}): React.JSX.Element => (
  <GsAvatar
    size={large ? 'lg' : 'md'}
    accessibilityElementsHidden
    importantForAccessibility="no-hide-descendants"
  >
    <Text className={`font-semibold text-accent-fg ${large ? 'text-[20px]' : 'text-[15px]'}`}>
      {text}
    </Text>
  </GsAvatar>
)

export const Stat = ({
  label,
  value,
  sub,
  tone = 'idle',
  loading = false,
  icon,
  compact = false
}: {
  label: string
  value: string | number
  sub?: string
  tone?: Tone
  loading?: boolean
  // Decorative, so it's hidden from screen readers.
  icon?: ReactNode
  // Three to a row on a phone.
  compact?: boolean
}): React.JSX.Element => (
  <VStack
    className={`grow gap-1 rounded-[14px] border border-line bg-card p-3.5 ${compact ? 'basis-[90px]' : 'basis-[150px]'}`}
  >
    <Text className="text-[13px] font-medium text-fg-2">{label}</Text>
    {loading ? (
      <Loading>
        <Skeleton width={56} height={26} />
      </Loading>
    ) : (
      <HStack className="items-center gap-1">
        {icon && (
          <Box accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {icon}
          </Box>
        )}
        <Text
          className={`text-[24px] font-semibold tabular-nums ${tone === 'idle' ? 'text-fg' : TONE_TEXT[tone]}`}
        >
          {value}
        </Text>
      </HStack>
    )}
    {sub && <Text className="text-[12px] text-fg-3">{sub}</Text>}
  </VStack>
)

// A row of mutually exclusive choices (radio semantics), like desktop's pressed-button groups. `scroll` keeps
// many choices on one line that slides sideways instead of wrapping.
export const Segmented = <V extends string>({
  label,
  options,
  value,
  onChange,
  scroll = false
}: {
  label: string
  options: readonly (readonly [V, string])[]
  value: V
  onChange: (v: V) => void
  scroll?: boolean
}): React.JSX.Element => {
  const row = (
    <HStack
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      className={`gap-1 rounded-[10px] border border-line p-1 ${scroll ? '' : 'flex-wrap'}`}
    >
      {options.map(([v, text]) => (
        <Pressable
          key={v}
          accessibilityRole="radio"
          accessibilityState={{ checked: value === v }}
          onPress={() => onChange(v)}
          className={`min-h-11 justify-center rounded-lg px-3 ${scroll ? '' : 'grow'} ${value === v ? 'bg-selected' : ''}`}
        >
          <Text
            className={`text-center text-[15px] font-medium ${value === v ? 'text-fg' : 'text-fg-2'}`}
          >
            {text}
          </Text>
        </Pressable>
      ))}
    </HStack>
  )
  return scroll ? (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="-mx-6"
      contentContainerClassName="px-6"
    >
      {row}
    </ScrollView>
  ) : (
    row
  )
}

// An empty list: a soft icon, what's missing, and what to do about it.
export const Empty = ({
  icon,
  title,
  hint,
  action
}: {
  icon: ReactNode
  title: string
  hint?: string
  action?: ReactNode
}): React.JSX.Element => (
  <VStack className="items-center gap-2 px-4 py-10">
    <Box
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="mb-2 h-16 w-16 items-center justify-center rounded-full bg-accent/10"
    >
      {icon}
    </Box>
    <Text accessibilityRole="header" className="text-center text-[17px] font-semibold text-fg">
      {title}
    </Text>
    {hint && <Text className="text-center text-[15px] text-fg-2">{hint}</Text>}
    {action && <Box className="mt-3">{action}</Box>}
  </VStack>
)
