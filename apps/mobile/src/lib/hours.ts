import type { Key, Vars } from '@daily-status/core/i18n'

// Some keyboards type a comma for the decimal point.
export const parseHours = (raw: string): number => Number(raw.replace(',', '.'))

// Quarter hours from 0 to 24, the same rules as desktop's number input.
export const hoursError = (raw: string): [Key, Vars?] | null => {
  const n = parseHours(raw)
  if (!raw.trim()) return ['vRequired']
  if (Number.isNaN(n) || n < 0 || n > 24) return ['vRange', { min: 0, max: 24 }]
  return Number.isInteger(n * 4) ? null : ['vStep']
}
