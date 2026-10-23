import type { Profile } from './database.types'
import type { T } from './i18n'

export type Tone = 'ok' | 'info' | 'warn' | 'bad' | 'idle'

// Appending T00:00 parses the date as local midnight; a bare YYYY-MM-DD is parsed as UTC.
export const fmtDate = (d: string, locale: string): string =>
  new Date(`${d}T00:00`).toLocaleDateString(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })

export const fmtShort = (d: string, locale: string): string =>
  new Date(`${d}T00:00`).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  })

export const fmtHours = (h: number, t: T): string => t('hoursShort', { n: +h.toFixed(2) })

export const nameOf = (p: Pick<Profile, 'full_name' | 'email'> | null): string =>
  p?.full_name || p?.email || '—'

const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter() : null

// Hermes (React Native) has no Intl.Segmenter. The fallback takes a letter, its marks, and every consonant joined
// on through a virama (Devanagari ्, Gujarati ્), which is how segmenters keep a conjunct like क्ष whole.
const CLUSTER = /^\P{M}(?:\p{M}*[्્]\P{M})*\p{M}*/u

export const firstGrapheme = (w: string, seg = segmenter): string =>
  seg
    ? (seg.segment(w)[Symbol.iterator]().next().value?.segment ?? '')
    : (CLUSTER.exec(w)?.[0] ?? '')

// By grapheme, so a Devanagari or Gujarati conjunct stays whole instead of splitting mid-letter.
export const initials = (p: Pick<Profile, 'full_name' | 'email'> | null): string =>
  nameOf(p)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => firstGrapheme(w))
    .join('')
    .toUpperCase()
