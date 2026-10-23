import { CODE_LENGTH } from '@daily-status/core/useVerifyCode'
import { useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, TextInput, View, type TextInputInstance } from 'react-native'
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming
} from 'react-native-reanimated'
import { tint, useTheme } from '@/lib/theme'

type Props = {
  value: string
  onChange: (raw: string) => void
  label: string
  hint: string
  invalid: boolean
  disabled: boolean
  // Changes on every rejected code: shakes the boxes and reopens the keyboard.
  rejected: number
}

const BOXES = Array.from({ length: CODE_LENGTH }, (_, i) => i)

const Caret = ({ color }: { color: string }): React.JSX.Element => {
  const opacity = useSharedValue(1)
  useEffect(() => {
    opacity.set(
      withRepeat(
        withSequence(withTiming(1, { duration: 500 }), withTiming(0, { duration: 500 })),
        -1,
        false,
        undefined,
        ReduceMotion.Never
      )
    )
  }, [opacity])
  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }))
  return <Animated.View style={[s.caret, { backgroundColor: color }, style]} />
}

// One real TextInput laid over six drawn boxes. Separate inputs per digit break paste, the keyboard's code
// suggestion (iOS reads it from Messages and Mail) and screen readers; one field gets all of them for free.
export const OtpInput = ({
  value,
  onChange,
  label,
  hint,
  invalid,
  disabled,
  rejected
}: Props): React.JSX.Element => {
  const { colors: c } = useTheme()
  const input = useRef<TextInputInstance>(null)
  const [focused, setFocused] = useState(false)
  const reduced = useReducedMotion()
  const shift = useSharedValue(0)
  const active = Math.min(value.length, CODE_LENGTH - 1)

  useEffect(() => {
    if (!rejected) return
    if (!reduced)
      shift.set(withSequence(...[-8, 8, -6, 6, 0].map((x) => withTiming(x, { duration: 60 }))))
    input.current?.focus()
  }, [rejected, reduced, shift])

  const shake = useAnimatedStyle(() => ({ transform: [{ translateX: shift.get() }] }))

  return (
    <View style={s.wrap}>
      <Animated.View style={[s.row, shake]} importantForAccessibility="no-hide-descendants">
        {BOXES.map((i) => {
          const here = focused && !disabled && i === active
          const filled = value[i] ? c.fg3 : c.line
          const border = invalid ? c.bad : here ? c.accent : filled
          return (
            <View
              key={i}
              style={[
                s.box,
                i === CODE_LENGTH / 2 && s.split,
                {
                  borderColor: border,
                  backgroundColor: here ? tint(c.accent, 0.06) : c.field,
                  opacity: disabled ? 0.6 : 1
                }
              ]}
            >
              {value[i] ? (
                <Text maxFontSizeMultiplier={1.4} style={[s.digit, { color: c.fg }]}>
                  {value[i]}
                </Text>
              ) : (
                here && <Caret color={c.fg} />
              )}
            </View>
          )
        })}
      </Animated.View>
      <TextInput
        ref={input}
        autoFocus
        value={value}
        onChangeText={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        editable={!disabled}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        autoCorrect={false}
        caretHidden
        contextMenuHidden={false}
        // Keeps the cursor at the end, so typing fills the next box and backspace clears the last one.
        selection={{ start: value.length, end: value.length }}
        accessibilityLabel={label}
        accessibilityHint={hint}
        accessibilityState={{ disabled }}
        style={[StyleSheet.absoluteFill, s.hidden]}
      />
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { alignSelf: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  box: {
    width: 46,
    height: 56,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center'
  },
  split: { marginLeft: 10 },
  digit: { fontSize: 24, fontWeight: '600', fontVariant: ['tabular-nums'] },
  caret: { width: 2, height: 26, borderRadius: 1 },
  // Invisible but still on screen and tappable: an off-screen or zero-size field loses focus and autofill.
  hidden: { opacity: 0.02, color: 'transparent' }
})
