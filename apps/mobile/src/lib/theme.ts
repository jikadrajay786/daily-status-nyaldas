import { createContext, use } from 'react'
import type { Tone } from '@daily-status/core/format'
import type { Accent, Colors, Theme } from '@daily-status/core/palettes'

export {
  ACCENT_COLORS,
  ACCENTS,
  accentVars,
  cssVars,
  isAccent,
  isTheme,
  PALETTES,
  THEMES,
  withAccent,
  type Accent,
  type Palette,
  type Theme
} from '@daily-status/core/palettes'

// Desktop's `bg-ok/15` style tints: appends an alpha byte to a 6-digit hex colour.
export const tint = (hex: string, a: number): string =>
  hex +
  Math.round(a * 255)
    .toString(16)
    .padStart(2, '0')

export const toneColors = (c: Colors, tone: Tone): { bg: string; fg: string; line: string } => {
  const [base, fg] = (
    {
      ok: [c.ok, c.okFg],
      info: [c.info, c.infoFg],
      warn: [c.warn, c.warnFg],
      bad: [c.bad, c.badFg],
      idle: [c.fg3, c.fg2]
    } as const
  )[tone]
  return { bg: tint(base, 0.15), fg, line: tint(base, 0.3) }
}

export type ThemeCtx = {
  theme: Theme
  accent: Accent
  colors: Colors
  setTheme: (t: Theme) => void
  setAccent: (a: Accent) => void
}
export const ThemeContext = createContext<ThemeCtx | null>(null)

export const useTheme = (): ThemeCtx => {
  const ctx = use(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside ThemeContext')
  return ctx
}
