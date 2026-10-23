import type { BottomTabBarProps } from 'expo-router/js-tabs'
import { useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  FadeIn,
  LinearTransition,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming
} from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'
import { tint, useTheme } from '@/lib/theme'

const AnimatedPath = Animated.createAnimatedComponent(Path)

// Capsule and tap target height (48pt minimum), and the bar's padding around it.
const H = 48
const PAD = 6

// The edge in front springs stiffly and the edge behind loosely, so a move stretches the drop before it settles.
const LEAD = { damping: 15, stiffness: 320, mass: 0.7 }
const TRAIL = { damping: 13, stiffness: 130, mass: 0.9 }
// The tabs resize alongside the capsule, close to its lead spring so the label lands with it.
const RESIZE = LinearTransition.springify().damping(18).stiffness(260)

// A pill from l to r. Stretched past its resting width it thins and its top and bottom pinch toward the middle,
// the viscous neck of a drop being pulled; the neck closes as the trailing edge catches up. The bar's inner edges
// act as walls, so an overshoot squashes against them instead of spilling out.
const drop = (l: number, r: number, rest: number, wall: number): string => {
  'worklet'
  if (!rest) return 'M0 0'
  const w = Math.max(Math.min(r, wall - PAD) - Math.max(l, PAD), H)
  const x = Math.min(Math.max(l, PAD), wall - PAD - w)
  const pinch = Math.min(Math.max((w - rest) / (H * 2.5), 0), 1)
  const h = H * (1 - 0.12 * pinch)
  const [top, bottom, rad] = [(H - h) / 2, (H + h) / 2, h / 2]
  const [a, b] = [x + rad, x + w - rad]
  const [m, q, dip] = [(a + b) / 2, (b - a) / 4, pinch * h * 0.36]
  return (
    `M${a} ${top}C${a + q} ${top} ${m - q} ${top + dip} ${m} ${top + dip}` +
    `C${m + q} ${top + dip} ${b - q} ${top} ${b} ${top}A${rad} ${rad} 0 0 1 ${b} ${bottom}` +
    `C${b - q} ${bottom} ${m + q} ${bottom - dip} ${m} ${bottom - dip}` +
    `C${m - q} ${bottom - dip} ${a + q} ${bottom} ${a} ${bottom}A${rad} ${rad} 0 0 1 ${a} ${top}Z`
  )
}

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
  const right = useSharedValue(0)
  const rest = useSharedValue(0)
  const wall = useSharedValue(0)
  const placed = useRef(false)
  const active = state.routes[state.index]?.key ?? ''
  const { x = 0, width = 0 } = slots[active] ?? {}

  useEffect(() => {
    if (!width) return
    rest.value = width
    // The first placement and reduced motion jump straight there; nothing to pour.
    if (!placed.current || reduce) {
      placed.current = true
      left.value = withTiming(x, { duration: 0 })
      right.value = withTiming(x + width, { duration: 0 })
      return
    }
    const forward = x > left.value
    left.value = withSpring(x, forward ? TRAIL : LEAD)
    right.value = withSpring(x + width, forward ? LEAD : TRAIL)
  }, [x, width, reduce, left, right, rest])

  const capsule = useAnimatedProps(() => ({
    d: drop(left.value, right.value, rest.value, wall.value)
  }))

  return (
    <View
      style={[
        s.outer,
        { backgroundColor: c.canvas, paddingBottom: Math.max(insets.bottom, 12) + 4 }
      ]}
    >
      <View
        accessibilityRole="tablist"
        onLayout={(e) => wall.set(e.nativeEvent.layout.width)}
        style={[s.bar, { backgroundColor: c.card, borderColor: c.line }]}
      >
        <Svg pointerEvents="none" style={s.liquid}>
          <AnimatedPath animatedProps={capsule} fill={tint(c.accent, 0.16)} />
        </Svg>
        {state.routes.map((route) => {
          const options = descriptors[route.key]?.options
          const focused = route.key === active
          const label = options?.title ?? route.name
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
              style={focused ? s.wide : s.narrow}
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
                style={s.tab}
              >
                {options?.tabBarIcon?.({ focused, color, size: 22 })}
                {focused && (
                  <Animated.View
                    entering={reduce ? undefined : FadeIn.duration(160).delay(90)}
                    style={s.shrink}
                  >
                    <Text
                      numberOfLines={1}
                      maxFontSizeMultiplier={1.3}
                      style={[s.label, { color }]}
                    >
                      {label}
                    </Text>
                  </Animated.View>
                )}
              </Pressable>
            </Animated.View>
          )
        })}
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  outer: { paddingHorizontal: 16, paddingTop: 8 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: PAD,
    borderRadius: (H + PAD * 2) / 2,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8
  },
  liquid: { position: 'absolute', left: 0, right: 0, top: PAD, height: H },
  // Clipped, so a label growing in with the tab never draws outside it.
  narrow: { width: H, overflow: 'hidden' },
  wide: { flexShrink: 1, minWidth: H, overflow: 'hidden' },
  tab: {
    height: H,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 13
  },
  shrink: { flexShrink: 1 },
  label: { fontSize: 14, fontWeight: '600' }
})
