import { describe, expect, it } from 'vitest'
import { LANG_LIST, translator, type Key } from '../src/i18n'

describe('translations', () => {
  it('fills placeholders and leaves unknown ones visible', () => {
    expect(translator('en')('updatesCount' as Key, { n: 3 })).toBe('3 updates')
    expect(translator('en')('updatesCount' as Key)).toBe('{n} updates')
  })
  it('has every key in every language, never blank', () => {
    const en = translator('en')
    for (const lang of LANG_LIST)
      for (const key of ['signIn', 'navToday', 'stateMissed', 'errOffline'] as Key[])
        expect(translator(lang)(key).trim(), `${lang}.${key}`).not.toBe('')
    expect(translator('hi')('signIn')).not.toBe(en('signIn'))
  })
})
