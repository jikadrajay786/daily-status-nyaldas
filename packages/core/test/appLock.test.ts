import { describe, expect, it } from 'vitest'
import { lockDue, unlockMessage } from '../src/appLock'

describe('when the app locks', () => {
  const left = Date.parse('2026-10-24T10:00:00Z')
  it('stays open for quick trips away', () => {
    expect(lockDue(left, left + 5_000)).toBe(false)
    expect(lockDue(left, left + 29_999)).toBe(false)
  })
  it('locks after 30 seconds away', () => {
    expect(lockDue(left, left + 30_000)).toBe(true)
    expect(lockDue(left, left + 3_600_000)).toBe(true)
  })
  it("doesn't lock when the app never went to the background", () => {
    expect(lockDue(null, left)).toBe(false)
  })
})

describe('unlock failures', () => {
  it('stays quiet when the prompt was closed', () => {
    for (const e of ['user_cancel', 'system_cancel', 'app_cancel', 'user_fallback'])
      expect(unlockMessage(e)).toBeNull()
  })
  it('explains a lockout and a removed Face ID or fingerprint', () => {
    expect(unlockMessage('lockout')).toBe('lockLockout')
    expect(unlockMessage('not_enrolled')).toBe('lockGone')
    expect(unlockMessage('passcode_not_set')).toBe('lockGone')
  })
  it('falls back to a plain "try again"', () => {
    expect(unlockMessage('authentication_failed')).toBe('lockFailed')
    expect(unlockMessage('something_new')).toBe('lockFailed')
  })
})
