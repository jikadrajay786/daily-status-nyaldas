import { describe, expect, it } from 'vitest'
import type { LeaveRequest, Profile } from '../src/database.types'
import { buildDashboard, halfOn, type Dashboard } from '../src/dashboard'

// 2026-10-24 is a Saturday, 2026-10-25 a Sunday.
const NOW = '2026-10-24'

const person = (id: string, joined = '2026-09-01T09:00:00Z'): Profile => ({
  id,
  full_name: id.toUpperCase(),
  email: `${id}@x.in`,
  role: 'user',
  created_at: joined,
  updated_at: joined,
  reports_since: null,
  reports_to: null
})

const leave = (
  user_id: string,
  start_day: string,
  end_day = start_day,
  half = 'full'
): LeaveRequest =>
  ({
    id: `${user_id}-${start_day}`,
    user_id,
    start_day,
    end_day,
    start_half: half,
    end_half: half,
    status: 'approved'
  }) as LeaveRequest

type Input = Parameters<typeof buildDashboard>[0]

const row = (user_id: string, date: string, hours_logged = 8): Input['rows'][number] => ({
  user_id,
  date,
  hours_logged
})

const build = (p: Partial<Input>): Dashboard =>
  buildDashboard({ now: NOW, members: [], rows: [], off: new Map(), leave: [], ...p })

describe('dashboard', () => {
  const [a, b, c] = ['a', 'b', 'c'].map((id) => person(id))

  it("counts today's updates once per person and adds up hours", () => {
    const d = build({
      members: [a, b, c],
      rows: [row('a', NOW, 3), row('a', NOW, 2), row('b', NOW)]
    })
    expect(d.submitted).toBe(2)
    expect(d.hours).toBe(13)
    expect(d.missing.map((m) => m.id)).toEqual(['c'])
  })

  it('leaves full-day leave out of missing, but not half-day leave', () => {
    const d = build({ members: [a, b, c], leave: [leave('b', NOW), leave('c', NOW, NOW, 'first')] })
    expect(d.missing.map((m) => m.id)).toEqual(['a', 'c'])
    expect(d.away.map((x) => [x.person.id, x.half])).toEqual([
      ['b', 'full'],
      ['c', 'first']
    ])
  })

  it('nobody is missing on a holiday', () => {
    const d = build({ members: [a], off: new Map([[NOW, 'Diwali']]) })
    expect(d).toMatchObject({ off: true, holiday: 'Diwali', missing: [] })
  })

  it("ignores other people's leave and rows", () => {
    const d = build({ members: [a], rows: [row('z', NOW)], leave: [leave('z', NOW)] })
    expect(d).toMatchObject({ submitted: 0, away: [], soon: [] })
  })

  it('charts working days only and skips people before they joined', () => {
    const late = person('late', '2026-10-23T09:00:00Z')
    const d = build({
      members: [a, late],
      rows: [row('a', '2026-10-23'), row('late', '2026-10-23')]
    })
    expect(d.trend.some((t) => t.day === '2026-10-18')).toBe(false)
    expect(d.trend.find((t) => t.day === '2026-10-22')).toEqual({
      day: '2026-10-22',
      expected: 1,
      submitted: 0
    })
    expect(d.trend.find((t) => t.day === '2026-10-23')).toEqual({
      day: '2026-10-23',
      expected: 2,
      submitted: 2
    })
  })

  it('ranks missed days without counting today or leave', () => {
    const d = build({
      members: [a, b],
      rows: [row('a', '2026-10-22'), row('a', '2026-10-23')],
      leave: [leave('a', '2026-10-01', '2026-10-21')]
    })
    // b missed every working day since 2026-09-25 except today; a only missed before the leave began.
    const [first, second] = d.missedMost
    expect(first.person.id).toBe('b')
    expect(second.person.id).toBe('a')
    expect(first.n).toBe(d.trend.filter((t) => t.day < NOW).length)
    expect(d.streaks).toEqual([{ person: a, n: 2 }])
  })

  it('lists leave starting within a week and the next holiday', () => {
    const d = build({
      members: [a],
      leave: [leave('a', '2026-10-27'), leave('a', '2026-11-05')],
      off: new Map([
        ['2026-11-08', 'Later'],
        ['2026-11-01', 'Next']
      ])
    })
    expect(d.soon.map((l) => l.start_day)).toEqual(['2026-10-27'])
    expect(d.nextHoliday).toEqual({ day: '2026-11-01', name: 'Next' })
  })

  it('reads the half that falls on a given day', () => {
    const l = {
      ...leave('a', '2026-10-20', '2026-10-22'),
      start_half: 'second',
      end_half: 'first'
    } as LeaveRequest
    expect(['2026-10-20', '2026-10-21', '2026-10-22'].map((d) => halfOn(l, d))).toEqual([
      'second',
      'full',
      'first'
    ])
  })
})
