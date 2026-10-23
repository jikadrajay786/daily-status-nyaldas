import { describe, expect, it } from 'vitest'
import {
  addDays,
  clampRange,
  daysBetween,
  dayState,
  localDay,
  presetRange,
  streakOf,
  weekday,
  ymd
} from '../src/workdays'

// 2026-10-19 is a Monday.
const MON = '2026-10-19'

describe('calendar maths', () => {
  it('handles weekdays, month ends and leap years', () => {
    expect(weekday(MON)).toBe(1)
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
  })
  it('never skips or repeats a day across daylight saving', () => {
    expect(daysBetween('2026-03-07', '2026-03-10')).toHaveLength(4)
    expect(daysBetween('2026-10-24', '2026-10-27')).toHaveLength(4)
  })
  it('uses the local calendar day for UTC timestamps', () => {
    expect(localDay('2026-10-18T20:00:00Z')).toBe('2026-10-19')
  })
})

describe('ranges', () => {
  it('starts weeks on Monday and months on the 1st', () => {
    expect(presetRange('week', MON)).toEqual({ start: MON, end: MON })
    expect(presetRange('week', '2026-10-25')).toEqual({ start: MON, end: '2026-10-25' })
    expect(presetRange('month', MON)).toEqual({ start: '2026-10-01', end: MON })
  })
  it('keeps custom ranges valid', () => {
    expect(clampRange({ start: '2026-10-10', end: '2030-01-01' }, MON)).toEqual({
      start: '2026-10-10',
      end: MON
    })
    expect(clampRange({ start: '2026-10-20', end: '2026-10-12' }, MON)).toEqual({
      start: '2026-10-12',
      end: '2026-10-12'
    })
    expect(clampRange({ start: '2020-01-01', end: MON }, MON).start).toBe(addDays(MON, -365))
  })
})

describe('day states', () => {
  const done = new Set(['2026-10-16', '2026-10-15', '2026-10-14', '2026-10-10'])
  it('marks missed, weekend, pending, outside and done days', () => {
    const states = ['2026-10-12', '2026-10-17', MON, '2026-10-20', '2026-10-01', '2026-10-16'].map(
      (d) => dayState(d, done, '2026-10-05', MON)
    )
    expect(states).toEqual(['missed', 'off', 'pending', 'outside', 'outside', 'done'])
  })
})

describe('streaks', () => {
  it('counts working days back from today; today pending does not break it', () => {
    expect(streakOf(new Set(['2026-10-16', '2026-10-15', '2026-10-14']), MON)).toBe(3)
    expect(streakOf(new Set([MON, '2026-10-16']), MON)).toBe(2)
  })
  it('ignores weekends: they neither break nor extend it', () => {
    expect(streakOf(new Set(['2026-10-17', '2026-10-16']), MON)).toBe(1)
    expect(streakOf(new Set(['2026-10-10', '2026-10-09', '2026-10-12']), '2026-10-12')).toBe(2)
  })
  it('stops at a missed working day', () => {
    expect(streakOf(new Set(['2026-10-15']), MON)).toBe(0)
  })
})

describe('ymd', () => {
  it('pads months and days without relying on locale data', () => {
    expect(ymd(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(ymd(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31')
  })
})
