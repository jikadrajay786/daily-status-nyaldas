import { createContext, use } from 'react'
import type { Tone } from '@daily-status/core/format'

export const THEMES = ['system', 'light', 'dark', 'midnight', 'cyberpunk', 'sepia'] as const
export type Theme = (typeof THEMES)[number]
export const isTheme = (v: unknown): v is Theme => THEMES.some((t) => t === v)

// Mirrors the [data-theme] blocks in apps/desktop/src/renderer/src/assets/main.css; keep the hex values in sync.
const light = {
  scheme: 'light' as 'light' | 'dark',
  canvas: '#f8fafc',
  panel: '#f1f5f9',
  card: '#ffffff',
  field: '#ffffff',
  line: '#dbe2ea',
  hover: 'rgba(15, 23, 42, 0.05)',
  selected: 'rgba(15, 23, 42, 0.08)',
  fg: '#0f172a',
  fg2: '#334155',
  fg3: '#5b6b80',
  placeholder: '#5b6b80',
  accent: '#4f46e5',
  accentPressed: '#4338ca',
  onAccent: '#ffffff',
  accentFg: '#4338ca',
  ok: '#059669',
  okFg: '#047857',
  warn: '#d97706',
  warnFg: '#a1480a',
  bad: '#e11d48',
  badFg: '#be123c',
  info: '#0284c7',
  infoFg: '#0369a1',
  rcRed: '#be123c',
  rcOrange: '#b23d0a',
  rcGreen: '#047857',
  rcBlue: '#0369a1',
  rcPurple: '#6d28d9',
  hlYellow: '#fde68a',
  hlGreen: '#a7f3d0',
  hlBlue: '#bae6fd',
  hlPink: '#fbcfe8'
}
export type Colors = typeof light

const dark: Colors = {
  scheme: 'dark',
  canvas: '#0f172a',
  panel: '#0b1222',
  card: '#162036',
  field: '#0b1222',
  line: '#273449',
  hover: 'rgba(255, 255, 255, 0.06)',
  selected: 'rgba(255, 255, 255, 0.1)',
  fg: '#f1f5f9',
  fg2: '#cbd5e1',
  fg3: '#94a3b8',
  placeholder: '#94a3b8',
  accent: '#4f46e5',
  accentPressed: '#6366f1',
  onAccent: '#ffffff',
  accentFg: '#a5b4fc',
  ok: '#10b981',
  okFg: '#6ee7b7',
  warn: '#f59e0b',
  warnFg: '#fcd34d',
  bad: '#f43f5e',
  badFg: '#fda4af',
  info: '#0ea5e9',
  infoFg: '#7dd3fc',
  rcRed: '#fda4af',
  rcOrange: '#fdba74',
  rcGreen: '#6ee7b7',
  rcBlue: '#7dd3fc',
  rcPurple: '#c4b5fd',
  hlYellow: 'rgba(250, 204, 21, 0.3)',
  hlGreen: 'rgba(52, 211, 153, 0.3)',
  hlBlue: 'rgba(56, 189, 248, 0.3)',
  hlPink: 'rgba(244, 114, 182, 0.3)'
}

export const PALETTES: Record<Exclude<Theme, 'system'>, Colors> = {
  light,
  dark,
  midnight: {
    ...dark,
    canvas: '#000000',
    panel: '#050505',
    card: '#0d0d0d',
    field: '#000000',
    line: '#262626',
    hover: 'rgba(255, 255, 255, 0.07)',
    selected: 'rgba(255, 255, 255, 0.12)',
    fg: '#fafafa',
    fg2: '#d4d4d4',
    fg3: '#a3a3a3',
    placeholder: '#a3a3a3'
  },
  cyberpunk: {
    ...dark,
    canvas: '#0a0614',
    panel: '#100a1f',
    card: '#170d2b',
    field: '#0d0820',
    line: '#3d2066',
    hover: 'rgba(255, 43, 214, 0.1)',
    selected: 'rgba(255, 43, 214, 0.18)',
    fg: '#f5f3ff',
    fg2: '#cdc6f2',
    fg3: '#a59bd4',
    placeholder: '#a59bd4',
    accent: '#ff2bd6',
    accentPressed: '#ff66e3',
    onAccent: '#14061f',
    accentFg: '#5ef2ff',
    ok: '#39ff88',
    okFg: '#39ff88',
    warn: '#ffe14d',
    warnFg: '#ffe14d',
    bad: '#ff4d6d',
    badFg: '#ff8099',
    info: '#00e5ff',
    infoFg: '#5ef2ff'
  },
  sepia: {
    ...light,
    canvas: '#f4ecd8',
    panel: '#ebe0c4',
    card: '#fbf5e6',
    field: '#fffaf0',
    line: '#d6c49b',
    hover: 'rgba(59, 47, 30, 0.06)',
    selected: 'rgba(59, 47, 30, 0.1)',
    fg: '#3b2f1e',
    fg2: '#574630',
    fg3: '#6e5a3c',
    placeholder: '#6e5a3c',
    accent: '#9a4a1c',
    accentPressed: '#7f3c16',
    onAccent: '#fff8ec',
    accentFg: '#84380f',
    okFg: '#03614a'
  }
}

// The editor page's CSS variables (the names main.css uses), already resolved: no light-dark(), which iOS
// WebViews before 17.5 don't support.
export const cssVars = (c: Colors): Record<string, string> => ({
  'color-scheme': c.scheme,
  ...Object.fromEntries(
    Object.entries(c)
      .filter(([k]) => k !== 'scheme')
      .map(([k, v]) => [
        `--${{ accentPressed: 'accent-hover' }[k] ?? k.replace(/([a-z])([A-Z0-9])/g, '$1-$2').toLowerCase()}`,
        v
      ])
  )
})

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

export type ThemeCtx = { theme: Theme; colors: Colors; setTheme: (t: Theme) => void }
export const ThemeContext = createContext<ThemeCtx | null>(null)

export const useTheme = (): ThemeCtx => {
  const ctx = use(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside ThemeContext')
  return ctx
}
