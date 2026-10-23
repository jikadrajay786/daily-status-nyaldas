import { isLang, type Lang } from '@daily-status/core/i18n'

// Saved per device so the choice applies on the sign-in screen too, before any profile is loaded.
export const initialLang = (): Lang => {
  const saved = localStorage.getItem('lang')
  const sys = navigator.language.slice(0, 2)
  return isLang(saved) ? saved : isLang(sys) ? sys : 'en'
}

export const saveLang = (l: Lang): void => localStorage.setItem('lang', l)
