// The one source of theme colours. Desktop's main.css must agree (test/palettes.test.ts checks it), and mobile's
// Uniwind themes are generated from here (apps/mobile/src/theme.gen.css).
export const THEMES = ['system', 'light', 'dark', 'midnight'] as const
export type Theme = (typeof THEMES)[number]
export type Palette = Exclude<Theme, 'system'>
export const isTheme = (v: unknown): v is Theme => THEMES.some((t) => t === v)

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

export const PALETTES: Record<Palette, Colors> = {
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
  }
}

// Accents swap only the brand colour, per light/dark scheme. Indigo is the palettes' own.
export const ACCENTS = ['indigo', 'emerald', 'blue', 'purple', 'amber', 'cyan'] as const
export type Accent = (typeof ACCENTS)[number]
export const isAccent = (v: unknown): v is Accent => ACCENTS.some((a) => a === v)

type AccentColors = Pick<Colors, 'accent' | 'accentPressed' | 'onAccent' | 'accentFg'>
const pick = (c: Colors): AccentColors => ({
  accent: c.accent,
  accentPressed: c.accentPressed,
  onAccent: c.onAccent,
  accentFg: c.accentFg
})
const ac = (
  accent: string,
  accentPressed: string,
  onAccent: string,
  accentFg: string
): AccentColors => ({
  accent,
  accentPressed,
  onAccent,
  accentFg
})
// Bright accents carry dark text in dark mode; white on them would fail 4.5:1.
export const ACCENT_COLORS: Record<Accent, Record<Colors['scheme'], AccentColors>> = {
  indigo: { light: pick(light), dark: pick(dark) },
  emerald: {
    light: ac('#047857', '#065f46', '#ffffff', '#047857'),
    dark: ac('#10b981', '#34d399', '#022c22', '#6ee7b7')
  },
  blue: {
    light: ac('#2563eb', '#1d4ed8', '#ffffff', '#1d4ed8'),
    dark: ac('#2563eb', '#1d4ed8', '#ffffff', '#93c5fd')
  },
  purple: {
    light: ac('#7c3aed', '#6d28d9', '#ffffff', '#6d28d9'),
    dark: ac('#7c3aed', '#6d28d9', '#ffffff', '#c4b5fd')
  },
  amber: {
    light: ac('#b45309', '#92400e', '#ffffff', '#a1480a'),
    dark: ac('#f59e0b', '#fbbf24', '#1c1917', '#fcd34d')
  },
  cyan: {
    light: ac('#0e7490', '#155e75', '#ffffff', '#155e75'),
    dark: ac('#22d3ee', '#67e8f9', '#083344', '#67e8f9')
  }
}

export const withAccent = (c: Colors, a: Accent): Colors => ({
  ...c,
  ...ACCENT_COLORS[a][c.scheme]
})

// Mobile overrides only these variables at runtime (Uniwind.updateCSSVariables).
export const accentVars = (c: Colors, a: Accent): Record<string, string> =>
  Object.fromEntries(Object.entries(ACCENT_COLORS[a][c.scheme]).map(([k, v]) => [cssVarName(k), v]))

// The CSS variable names main.css uses: fg2 → --fg-2, accentPressed → --accent-hover.
export const cssVarName = (key: string): string =>
  `--${{ accentPressed: 'accent-hover' }[key] ?? key.replace(/([a-z])([A-Z0-9])/g, '$1-$2').toLowerCase()}`

const entries = (c: Colors): [string, string][] =>
  Object.entries(c)
    .filter(([k]) => k !== 'scheme')
    .map(([k, v]) => [cssVarName(k), v])

// Resolved values, no light-dark(): iOS WebViews before 17.5 don't support it.
export const cssVars = (c: Colors): Record<string, string> => ({
  'color-scheme': c.scheme,
  ...Object.fromEntries(entries(c))
})

// Uniwind theme variants for mobile's global.css; "system" is Uniwind's adaptive light/dark, not a palette.
export const uniwindThemeCss = (): string =>
  [
    '/* Generated from packages/core/src/palettes.ts. Run `npx vitest -u` in packages/core to update. */',
    '@layer theme {',
    '  :root {',
    ...Object.entries(PALETTES).flatMap(([name, c]) => [
      `    @variant ${name} {`,
      ...entries(c).map(([k, v]) => `      ${k}: ${v};`),
      '    }'
    ]),
    '  }',
    '}',
    ''
  ].join('\n')
