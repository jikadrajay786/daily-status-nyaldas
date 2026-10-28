import { CODE_LENGTH } from '@daily-status/core/useVerifyCode'
import { useEffect, useRef, useState } from 'react'
import { TextInput, type TextInputInstance } from 'react-native'
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming
} from 'react-native-reanimated'
import { Box } from './gs/box'
import { HStack } from './gs/hstack'
import { Text } from './gs/text'

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

const Caret = (): React.JSX.Element => {
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
  // Reanimated views carry only the animated values; the drawn parts are Uniwind-styled boxes.
  return (
    <Animated.View style={style}>
      <Box className="h-[26px] w-0.5 rounded-[1px] bg-fg" />
    </Animated.View>
  )
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
    <Box className="self-center">
      <Animated.View style={shake} importantForAccessibility="no-hide-descendants">
        <HStack className="items-center gap-2">
          {BOXES.map((i) => {
            const here = focused && !disabled && i === active
            const border = invalid
              ? 'border-bad'
              : here
                ? 'border-accent'
                : value[i]
                  ? 'border-fg-3'
                  : 'border-line'
            return (
              <Box
                key={i}
                className={`h-14 w-[46px] items-center justify-center rounded-xl border-2 ${border} ${here ? 'bg-accent/6' : 'bg-field'} ${disabled ? 'opacity-60' : ''} ${i === CODE_LENGTH / 2 ? 'ml-2.5' : ''}`}
              >
                {value[i] ? (
                  <Text
                    maxFontSizeMultiplier={1.4}
                    className="text-[24px] font-semibold tabular-nums text-fg"
                  >
                    {value[i]}
                  </Text>
                ) : (
                  here && <Caret />
                )}
              </Box>
            )
          })}
        </HStack>
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
        // Invisible but still on screen and tappable: an off-screen or zero-size field loses focus and autofill.
        className="absolute inset-0 text-transparent opacity-[0.02]"
      />
    </Box>
  )
}
