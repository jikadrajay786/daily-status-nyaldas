import { describe, expect, it, vi } from 'vitest'
import { firstGrapheme, initials, nameOf } from '../src/format'
import { searchTerm } from '../src/supabase'
import { errMsg } from '../src/useQuery'

describe('names', () => {
  it('falls back from name to email to a dash', () => {
    expect(nameOf({ full_name: 'Asha Patel', email: 'a@x.in' })).toBe('Asha Patel')
    expect(nameOf({ full_name: null, email: 'a@x.in' })).toBe('a@x.in')
    expect(nameOf(null)).toBe('—')
  })
  it('keeps Devanagari and Gujarati conjuncts whole in initials', () => {
    expect(initials({ full_name: 'Marcus Reed', email: null })).toBe('MR')
    expect(initials({ full_name: 'क्षमा शर्मा', email: null })).toBe('क्षश')
    expect(initials({ full_name: 'સ્નેહા પટેલ', email: null })).toBe('સ્નેપ')
  })
  it('gives the same first letter without Intl.Segmenter (React Native)', () => {
    const seg = new Intl.Segmenter()
    const words = [
      'क्षमा',
      'स्त्री',
      'ज़ैनब',
      'श्रेया',
      'સ્નેહા',
      'ક્ષિતિજ',
      'દ્વારકા',
      'José',
      'Ångström',
      'äb'
    ]
    for (const w of words) expect(firstGrapheme(w, null)).toBe(firstGrapheme(w, seg))
  })
  it('handles a missing Intl.Segmenter at import time', async () => {
    vi.resetModules()
    vi.stubGlobal('Intl', { ...Intl, Segmenter: undefined })
    const fresh = await import('../src/format')
    expect(fresh.initials({ full_name: 'क्षमा शर्मा', email: null })).toBe('क्षश')
    vi.unstubAllGlobals()
  })
})

describe('search input', () => {
  it('strips PostgREST filter syntax and LIKE wildcards', () => {
    expect(searchTerm(' report,(x)%_* ')).toBe('report  x')
  })
})

describe('friendly errors', () => {
  it('maps by auth code first, then by message', () => {
    expect(errMsg({ code: 'invalid_credentials', message: 'whatever' })).toBe('errBadLogin')
    expect(errMsg(new Error('new row violates row-level security policy'))).toBe('errDenied')
    expect(errMsg(new Error('Failed to fetch'))).toBe('errOffline')
  })
  it('tells server errors apart from being offline', () => {
    const retryable = (message: string, status: number): Error =>
      Object.assign(new Error(message), { name: 'AuthRetryableFetchError', status })
    expect(errMsg(retryable('Load failed', 0))).toBe('errOffline')
    expect(errMsg(retryable('Gateway Timeout', 504))).toBe('errServerBusy')
    expect(errMsg(retryable('Error sending confirmation email', 500))).toBe('errEmailSend')
  })
})
