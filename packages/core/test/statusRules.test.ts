import { describe, expect, it } from 'vitest'
import { translator } from '../src/i18n'
import { canChange, fmtStatusTimes, wasEdited } from '../src/statusService'

describe('edit window', () => {
  const wed = '2026-10-21'
  it('lets staff change an update until 2 days after its date', () => {
    expect(canChange('2026-10-21', 'user', wed)).toBe(true)
    expect(canChange('2026-10-19', 'user', wed)).toBe(true)
    expect(canChange('2026-10-18', 'user', wed)).toBe(false)
  })
  it('never locks admins out', () => {
    expect(canChange('2026-01-01', 'admin', wed)).toBe(true)
  })
})

describe('edited tag', () => {
  const at = (created: string, updated: string): boolean =>
    wasEdited({ created_at: created, updated_at: updated })
  it('ignores re-saves within the first minute', () => {
    expect(at('2026-10-21T10:00:00Z', '2026-10-21T10:00:00Z')).toBe(false)
    expect(at('2026-10-21T10:00:00Z', '2026-10-21T10:00:45Z')).toBe(false)
  })
  it('marks later changes as edited', () => {
    expect(at('2026-10-21T10:00:00Z', '2026-10-21T10:05:00Z')).toBe(true)
    expect(at('2026-10-21T10:00:00Z', '2026-10-22T09:00:00Z')).toBe(true)
  })
})

describe('update times', () => {
  const t = translator('en')
  const created_at = '2026-10-21T04:00:00Z'
  it('shows only the submit time until it is edited', () =>
    expect(fmtStatusTimes({ created_at, updated_at: created_at }, t, 'en-IN')).toMatch(
      /^Submitted 21 Oct 2026, 9:30\s?am$/i
    ))
  it('adds the edit time', () =>
    expect(fmtStatusTimes({ created_at, updated_at: '2026-10-22T05:30:00Z' }, t, 'en-IN')).toMatch(
      /· Edited 22 Oct 2026, 11:00\s?am$/i
    ))
})
