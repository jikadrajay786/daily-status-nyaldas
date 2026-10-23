import { describe, expect, it } from 'vitest'
import { normalizeCode, secondsLeft } from '../src/useVerifyCode'

describe('normalizeCode', () => {
  it('keeps digits only and stops at six', () => {
    expect(normalizeCode('12a3')).toBe('123')
    expect(normalizeCode('1234567')).toBe('123456')
    expect(normalizeCode('')).toBe('')
  })
  it('accepts pasted codes with spaces, dashes or line breaks', () => {
    expect(normalizeCode('482 913')).toBe('482913')
    expect(normalizeCode('482-913')).toBe('482913')
    expect(normalizeCode(' 482913\n')).toBe('482913')
  })
  it('picks the code out of a pasted sentence with other numbers in it', () => {
    expect(normalizeCode('23 Oct 2026: your code is 482913')).toBe('482913')
    expect(normalizeCode('23 Oct 2026: your code is 482 913')).toBe('482913')
    expect(normalizeCode('Sent 2026 482913')).toBe('482913')
    expect(normalizeCode('Code 482-913, valid for 1 hour')).toBe('482913')
  })
  it('turns Hindi, Gujarati and full-width digits into plain ones', () => {
    expect(normalizeCode('४८२९१३')).toBe('482913')
    expect(normalizeCode('૪૮૨૯૧૩')).toBe('482913')
    expect(normalizeCode('４８２９１３')).toBe('482913')
    expect(normalizeCode('४8२9१3')).toBe('482913')
  })
})

describe('resend cooldown', () => {
  const sent = Date.parse('2026-10-23T10:00:00Z')
  it('counts down from 60 seconds and never goes negative', () => {
    expect(secondsLeft(sent, sent)).toBe(60)
    expect(secondsLeft(sent, sent + 59_100)).toBe(1)
    expect(secondsLeft(sent, sent + 60_000)).toBe(0)
    expect(secondsLeft(sent, sent + 3_600_000)).toBe(0)
  })
  it('is ready straight away when nothing was sent', () => {
    expect(secondsLeft(0, sent)).toBe(0)
  })
})
