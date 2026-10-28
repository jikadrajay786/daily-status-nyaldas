// Shared by main (native frame) and renderer (CSS). Keep it free of runtime imports.
export const THEMES = ['system', 'light', 'dark', 'midnight'] as const
export type Theme = (typeof THEMES)[number]

export const isTheme = (v: unknown): v is Theme => THEMES.some((t) => t === v)

// Native chrome (title bar, menus, scrollbars) only knows light or dark, so each theme maps to one of them.
export const NATIVE_SCHEME: Record<Theme, 'system' | 'light' | 'dark'> = {
  system: 'system',
  light: 'light',
  dark: 'dark',
  midnight: 'dark'
}

// Must match --canvas in main.css: the window background shows before the page paints and on resize.
export const CANVAS: Record<Exclude<Theme, 'system'>, string> = {
  light: '#f8fafc',
  dark: '#0f172a',
  midnight: '#000000'
}
