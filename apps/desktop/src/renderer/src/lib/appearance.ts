import { useSyncExternalStore } from 'react'
import { THEMES, type Theme } from '../../../shared/appearance'

export const FONTS = ['sans', 'serif', 'mono', 'dyslexic'] as const
export const SIZES = ['sm', 'md', 'lg', 'xl', '2xl', '3xl'] as const
export const DENSITIES = ['comfortable', 'compact'] as const
export const CONTRASTS = ['system', 'normal', 'more'] as const

export type Appearance = {
  theme: Theme
  font: (typeof FONTS)[number]
  size: (typeof SIZES)[number]
  density: (typeof DENSITIES)[number]
  contrast: (typeof CONTRASTS)[number]
}

const OPTIONS: { [K in keyof Appearance]: readonly Appearance[K][] } = {
  theme: THEMES,
  font: FONTS,
  size: SIZES,
  density: DENSITIES,
  contrast: CONTRASTS
}

// Keep in sync with the data-* defaults on <html> in index.html.
export const DEFAULTS: Appearance = {
  theme: 'system',
  font: 'sans',
  size: 'md',
  density: 'comfortable',
  contrast: 'system'
}

// public/boot.js reads the same key to apply settings before first paint.
const KEY = 'appearance'

const pick = <K extends keyof Appearance>(k: K, v: unknown): Appearance[K] =>
  OPTIONS[k].find((o) => o === v) ?? DEFAULTS[k]

const load = (): Appearance => {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    const saved = new Map(typeof raw === 'object' && raw ? Object.entries(raw) : [])
    return {
      theme: pick('theme', saved.get('theme')),
      font: pick('font', saved.get('font')),
      size: pick('size', saved.get('size')),
      density: pick('density', saved.get('density')),
      contrast: pick('contrast', saved.get('contrast'))
    }
  } catch {
    return DEFAULTS
  }
}

let current = load()
const listeners = new Set<() => void>()

// Only <html> attributes change, so CSS re-themes everything without React re-rendering the tree.
const apply = (a: Appearance): void => {
  const root = document.documentElement
  root.dataset.switching = ''
  Object.assign(root.dataset, a)
  requestAnimationFrame(() => requestAnimationFrame(() => delete root.dataset.switching))
}

// Also reconciles main's saved copy, in case it and localStorage drifted.
export const initAppearance = (): void => {
  apply(current)
  void window.api?.setTheme(current.theme)
  // Stepping past either end leaves the size where it is.
  window.api?.onTextSize((step) =>
    setAppearance({
      size: step ? (SIZES[SIZES.indexOf(current.size) + step] ?? current.size) : DEFAULTS.size
    })
  )
}

export const setAppearance = (patch: Partial<Appearance>): void => {
  current = { ...current, ...patch }
  apply(current)
  localStorage.setItem(KEY, JSON.stringify(current))
  void window.api?.setTheme(current.theme)
  listeners.forEach((l) => l())
}

export const useAppearance = (): Appearance =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current
  )
