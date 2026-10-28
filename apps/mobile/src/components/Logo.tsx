import Svg, { Path, Rect } from 'react-native-svg'
import { tint, useTheme } from '@/lib/theme'

// The app mark (brand/logo.svg) in the active theme's accent; SVG fills take colour values, not classes.
export const Logo = ({ size = 72 }: { size?: number }): React.JSX.Element => {
  const { colors: c } = useTheme()
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Rect width={512} height={512} rx={116} fill={c.accent} />
      <Rect x={128} y={146} width={256} height={238} rx={40} fill={c.onAccent} />
      <Path
        d="M128 186a40 40 0 0 1 40-40h176a40 40 0 0 1 40 40v30H128z"
        fill={tint(c.accent, 0.3)}
      />
      {[181, 301].map((x) => (
        <Rect
          key={x}
          x={x}
          y={112}
          width={30}
          height={70}
          rx={15}
          fill={c.onAccent}
          stroke={c.accent}
          strokeWidth={12}
        />
      ))}
      <Path
        d="M196 296l42 42 80-86"
        fill="none"
        stroke={c.accent}
        strokeWidth={32}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}
