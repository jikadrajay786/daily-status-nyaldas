import { lockDue } from '@daily-status/core/appLock'
import type { Key, T } from '@daily-status/core/i18n'
import { db } from '@daily-status/core/supabase'
import * as LA from 'expo-local-authentication'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { AppState, Platform } from 'react-native'
import { prefs } from './storage'

// The session itself stays where it is (AES-encrypted, key in SecureStore): putting the refresh token behind
// Face ID would make every background token refresh need the person's face. The lock guards the app instead.

// Per person, so whoever signs in next on a shared phone starts unlocked. In the sync kv-store so the very first
// frame already knows whether to cover the app.
const keyFor = (userId: string): string => `appLock:${userId}`
const listeners = new Set<() => void>()
export const lockOn = (userId: string): boolean => prefs.get(keyFor(userId)) === 'on'
export const setLockOn = (userId: string, on: boolean): void => {
  prefs.set(keyFor(userId), on ? 'on' : 'off')
  listeners.forEach((f) => f())
}
export const useLockOn = (userId: string): boolean =>
  useSyncExternalStore(
    (f) => {
      listeners.add(f)
      return () => listeners.delete(f)
    },
    () => lockOn(userId)
  )

// SIGNED_IN only follows a password or code sign-in (a restored session is INITIAL_SESSION), and someone who just
// typed their password shouldn't meet Face ID straight after. Registered on import, before anyone signs in.
let freshSignIn = false
db().auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_IN') freshSignIn = true
})

export type Support = { hardware: boolean; enrolled: boolean; method: Key }

export const checkSupport = async (): Promise<Support> => {
  const [hardware, enrolled, types] = await Promise.all([
    LA.hasHardwareAsync(),
    LA.isEnrolledAsync(),
    LA.supportedAuthenticationTypesAsync()
  ])
  const face = types.includes(LA.AuthenticationType.FACIAL_RECOGNITION)
  const finger = types.includes(LA.AuthenticationType.FINGERPRINT)
  const android: Key = finger || !face ? 'methodFingerprint' : 'methodFace'
  return {
    hardware,
    enrolled,
    method: Platform.OS !== 'ios' ? android : face ? 'methodFaceId' : 'methodTouchId'
  }
}

// The phone passcode stays available as a fallback, so a wet finger or a mask never locks someone out.
export const askToUnlock = (t: T, prompt: string): Promise<LA.LocalAuthenticationResult> =>
  LA.authenticateAsync({
    promptMessage: prompt,
    cancelLabel: t('cancel'),
    fallbackLabel: t('lockUsePasscode'),
    disableDeviceFallback: false
  })

export type LockState = { locked: boolean; covered: boolean; unlock: () => void }

// Locks at launch and after 30s+ in the background. Only 'background' counts as away: the Face ID sheet itself
// turns the app 'inactive', and treating that as leaving would lock again the moment someone unlocked.
// `covered` hides the screen whenever the app isn't in front, so the app switcher snapshot shows no updates.
export const useAppLock = (userId: string): LockState => {
  const on = useLockOn(userId)
  const [locked, setLocked] = useState(() => {
    const fresh = freshSignIn
    freshSignIn = false
    return !fresh && lockOn(userId)
  })
  const [covered, setCovered] = useState(false)
  const away = useRef<number | null>(null)

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') away.current = Date.now()
      if (state !== 'active') return setCovered(lockOn(userId))
      setCovered(false)
      if (lockOn(userId) && lockDue(away.current, Date.now())) setLocked(true)
      away.current = null
    })
    return () => sub.remove()
  }, [userId])

  return { locked: on && locked, covered: on && covered, unlock: () => setLocked(false) }
}
