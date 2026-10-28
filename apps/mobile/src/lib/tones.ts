import type { Tone } from '@daily-status/core/format'

// Whole class names, so Tailwind's scanner sees each one. Tints mirror desktop's bg-*/15 and border-*/30.
export const TONE_BOX: Record<Tone, string> = {
  ok: 'border-ok/30 bg-ok/15',
  info: 'border-info/30 bg-info/15',
  warn: 'border-warn/30 bg-warn/15',
  bad: 'border-bad/30 bg-bad/15',
  idle: 'border-fg-3/30 bg-fg-3/15'
}
export const TONE_TEXT: Record<Tone, string> = {
  ok: 'text-ok-fg',
  info: 'text-info-fg',
  warn: 'text-warn-fg',
  bad: 'text-bad-fg',
  idle: 'text-fg-2'
}
// The same colours for native colour props (spinners, icons) through *ColorClassName.
export const TONE_ACCENT: Record<Tone, string> = {
  ok: 'accent-ok-fg',
  info: 'accent-info-fg',
  warn: 'accent-warn-fg',
  bad: 'accent-bad-fg',
  idle: 'accent-fg-2'
}
