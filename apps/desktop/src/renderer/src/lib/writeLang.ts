import { isLang, type Lang } from '@daily-status/core/i18n'

// The editor's "Write in" choice, remembered per device; defaults to the UI language.
export const initialWriteLang = (fallback: Lang): Lang => {
  const saved = localStorage.getItem('writeLang')
  return isLang(saved) ? saved : fallback
}

export const saveWriteLang = (l: Lang): void => localStorage.setItem('writeLang', l)
