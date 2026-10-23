import type { Key } from './i18n'

// Back within 30s (copying a code from Mail, answering a quick message) doesn't ask again; longer away does.
export const LOCK_AFTER_MS = 30_000

export const lockDue = (backgroundedAt: number | null, now: number): boolean =>
  backgroundedAt !== null && now - backgroundedAt >= LOCK_AFTER_MS

// Failure codes from the OS prompt (expo-local-authentication's `error`). null means stay quiet: the person
// closed the prompt, or the system did (a call came in), and the Unlock button is right there.
export const unlockMessage = (error: string): Key | null => {
  if (['user_cancel', 'system_cancel', 'app_cancel', 'user_fallback'].includes(error)) return null
  if (error === 'lockout') return 'lockLockout'
  if (['not_enrolled', 'not_available', 'passcode_not_set'].includes(error)) return 'lockGone'
  return 'lockFailed'
}
