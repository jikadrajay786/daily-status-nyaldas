// Calendar maths on YYYY-MM-DD strings, done in UTC so daylight-saving shifts never skip or repeat a day.

// Monday to Friday. Offices that also work Saturdays add 6 here, and every count follows.
export const WORKDAYS: ReadonlySet<number> = new Set([1, 2, 3, 4, 5])

const DAY = 86_400_000
const ms = (d: string): number => Date.parse(`${d}T00:00Z`)
const iso = (t: number): string => new Date(t).toISOString().slice(0, 10)

// YYYY-MM-DD in the device's timezone, built by hand: mobile JS engines may lack the locale data that
// toLocaleDateString('en-CA') relies on for that format.
export const ymd = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export const addDays = (d: string, n: number): string => iso(ms(d) + n * DAY)
export const weekday = (d: string): number => new Date(ms(d)).getUTCDay()
export const isWorkday = (d: string): boolean => WORKDAYS.has(weekday(d))
export const daysBetween = (start: string, end: string): string[] =>
  Array.from({ length: Math.max(0, (ms(end) - ms(start)) / DAY + 1) }, (_, i) => addDays(start, i))

// created_at is UTC; the local calendar day is what the person saw when they joined.
export const localDay = (timestamp: string): string => ymd(new Date(timestamp))

export type Preset = 'week' | 'month' | 'custom'
export type Range = { start: string; end: string }

// Longest custom range, which also keeps each query under Supabase's 1000-row response cap.
export const MAX_RANGE_DAYS = 366

export const presetRange = (preset: Exclude<Preset, 'custom'>, today: string): Range => ({
  start: preset === 'week' ? addDays(today, -((weekday(today) + 6) % 7)) : `${today.slice(0, 8)}01`,
  end: today
})

// Keeps a typed-in custom range valid: never past today, start before end, at most MAX_RANGE_DAYS long.
export const clampRange = ({ start, end }: Range, today: string): Range => {
  const e = !end || end > today ? today : end
  const floor = addDays(e, 1 - MAX_RANGE_DAYS)
  const s = !start || start > e ? e : start
  return { start: s < floor ? floor : s, end: e }
}

export type DayState = 'done' | 'missed' | 'pending' | 'off' | 'outside'

// Today is "pending" until submitted, so a person isn't marked missing before the day is over.
export const dayState = (
  d: string,
  done: ReadonlySet<string>,
  joined: string,
  today: string
): DayState =>
  done.has(d)
    ? 'done'
    : d > today || d < joined
      ? 'outside'
      : !isWorkday(d)
        ? 'off'
        : d === today
          ? 'pending'
          : 'missed'

// Consecutive working days with an update, counting back from today. Weekends neither break nor extend it.
export const streakOf = (done: ReadonlySet<string>, today: string, limit = 400): number => {
  let n = 0
  for (let d = today, i = 0; i < limit; d = addDays(d, -1), i++) {
    if (!isWorkday(d)) continue
    if (done.has(d)) n++
    else if (d !== today) break
  }
  return n
}
