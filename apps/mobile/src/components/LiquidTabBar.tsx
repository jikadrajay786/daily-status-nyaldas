import type { BottomTabBarProps } from 'expo-router/js-tabs'
import { useEffect, useRef, useState } from 'react'
import { Platform, Pressable } from 'react-native'
import Animated, {
  Easing,
  FadeIn,
  LinearTransition,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { bottomPad, PILL, TabBarInset } from '@/lib/tabBar'
import { useTheme } from '@/lib/theme'
import { Box } from './gs/box'
import { Text } from './gs/text'

const LIFT = Platform.select({
  android: { elevation: 8 },
  default: {
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 }
  }
})
const SLIDE = { duration: 260, easing: Easing.out(Easing.cubic) }
const RESIZE = LinearTransition.duration(SLIDE.duration).easing(SLIDE.easing)

// pt-2 above the pill, plus 16pt so the last item never sits flush against it.
export const TabBarInsetProvider = ({
  children
}: {
  children: React.ReactNode
}): React.JSX.Element => (
  <TabBarInset value={PILL + 8 + bottomPad(useSafeAreaInsets().bottom) + 16}>
    {children}
  </TabBarInset>
)

type Slot = { x: number; width: number }

export const LiquidTabBar = ({
  state,
  descriptors,
  emitter,
  navigateToTab,
  insets
}: BottomTabBarProps): React.JSX.Element => {
  const { colors: c } = useTheme()
  const reduce = useReducedMotion()
  const [slots, setSlots] = useState<Record<string, Slot>>({})
  const left = useSharedValue(0)
  const width = useSharedValue(0)
  const placed = useRef(false)
  const active = state.routes[state.index]?.key ?? ''
  const slot = slots[active]

  useEffect(() => {
    if (!slot) return
    // The first placement and reduced motion jump straight there.
    const move = (v: number): number => (placed.current && !reduce ? withTiming(v, SLIDE) : v)
    left.value = move(slot.x)
    width.value = move(slot.width)
    placed.current = true
  }, [slot, reduce, left, width])

  const capsule = useAnimatedStyle(() => ({
    width: width.value,
    transform: [{ translateX: left.value }]
  }))

  return (
    // No background of its own: the screen shows around the pill. The bottom padding follows the safe area.
    <Box
      pointerEvents="box-none"
      className="absolute right-0 bottom-0 left-0 px-4 pt-2"
      style={{ paddingBottom: bottomPad(insets.bottom) }}
    >
      <Box
        accessibilityRole="tablist"
        className="flex-row items-center justify-between rounded-[30px] border-[length:hairlineWidth()] border-line bg-card p-1.5"
        style={LIFT}
      >
        <Animated.View
          pointerEvents="none"
          className="absolute top-1.5 left-0 h-12 rounded-full bg-accent/15"
          style={capsule}
        />
        {state.routes.map((route) => {
          const options = descriptors[route.key]?.options
          const focused = route.key === active
          const label = options?.title ?? route.name
          // React Navigation hands the icon a colour value, not a class.
          const color = focused ? c.accentFg : c.fg2
          return (
            <Animated.View
              key={route.key}
              layout={reduce ? undefined : RESIZE}
              onLayout={({ nativeEvent: { layout } }) =>
                setSlots((prev) =>
                  prev[route.key]?.x === layout.x && prev[route.key]?.width === layout.width
                    ? prev
                    : { ...prev, [route.key]: { x: layout.x, width: layout.width } }
                )
              }
              // Clipped, so a label growing in with the tab never draws outside it.
              className={focused ? 'min-w-12 shrink overflow-hidden' : 'w-12 overflow-hidden'}
            >
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: focused }}
                accessibilityLabel={label}
                onPress={() => {
                  const event = emitter.emit({
                    type: 'tabPress',
                    target: route.key,
                    canPreventDefault: true
                  })
                  if (!focused && !event.defaultPrevented) navigateToTab(route.key)
                }}
                onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })}
                className="h-12 flex-row items-center justify-center gap-2 px-[13px]"
              >
                {options?.tabBarIcon?.({ focused, color, size: 22 })}
                {focused && (
                  <Animated.View
                    entering={reduce ? undefined : FadeIn.duration(160).delay(120)}
                    className="shrink"
                  >
                    <Text
                      numberOfLines={1}
                      maxFontSizeMultiplier={1.3}
                      // Bold on Android: a content-sized weight-600 label there loses its last letter.
                      className="text-[14px] font-semibold text-accent-fg android:font-bold"
                    >
                      {label}
                    </Text>
                  </Animated.View>
                )}
              </Pressable>
            </Animated.View>
          )
        })}
      </Box>
    </Box>
  )
}
