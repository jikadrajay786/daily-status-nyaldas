import { isLang, type Lang } from '@daily-status/core/i18n'
import { getLocales } from 'expo-localization'
import { prefs } from './storage'

// Saved per device so the choice applies on the sign-in screen too, before any profile is loaded.
export const initialLang = (): Lang => {
  const saved = prefs.get('lang')
  const sys = getLocales()[0]?.languageCode
  return isLang(saved) ? saved : isLang(sys) ? sys : 'en'
}

export const saveLang = (l: Lang): void => prefs.set('lang', l)
