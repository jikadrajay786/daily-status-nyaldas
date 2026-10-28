import type { Lang } from '@daily-status/core/i18n'
import { registerPushToken, unregisterPushToken } from '@daily-status/core/push'
import { db } from '@daily-status/core/supabase'
import Constants from 'expo-constants'
import * as N from 'expo-notifications'
import { useEffect } from 'react'
import { AppState, Platform } from 'react-native'
import { firstAsk } from './notifications'

// iOS needs the APNs entitlement (`enableRemoteNotifications` in app.json), which only a paid Apple account can sign.
const SUPPORTED = Platform.OS === 'android'

// The Expo token is fetched once per run (it costs a request to Expo) and again only when Android hands out a new
// device token; `sent` is what the server last heard, so a return to the app doesn't re-register for nothing.
let token: string | null = null
let device: string | null = null
let sent: string | null = null

const fetchToken = async (): Promise<string | null> =>
  SUPPORTED && (await N.getPermissionsAsync()).granted
    ? (token ??= (
        await N.getExpoPushTokenAsync({
          projectId: Constants.expoConfig?.extra?.eas?.projectId as string | undefined
        })
      ).data)
    : null

const register = async (userId: string, lang: Lang): Promise<void> => {
  const token = await fetchToken()
  if (!token) return
  const key = `${token}:${userId}:${lang}`
  if (key === sent) return
  await registerPushToken(token, 'android', lang)
  sent = key
}

let queue = Promise.resolve()
const sync = (userId: string, lang: Lang): Promise<void> =>
  (queue = queue
    .then(() => register(userId, lang))
    .catch((err: unknown) => console.warn('push registration failed', err)))

// Keeps this phone registered for the signed-in person, in their language, with a fresh token.
export const usePush = (userId: string, lang: Lang): void =>
  useEffect(() => {
    void firstAsk(lang).then(() => sync(userId, lang))
    // Notifications may have been allowed in the phone's settings meanwhile.
    const app = AppState.addEventListener(
      'change',
      (s) => s === 'active' && void sync(userId, lang)
    )
    // Fetching the Expo token fires this too, with the same device token: reacting to that would loop forever.
    const fresh = N.addPushTokenListener(({ data }) => {
      const next = String(data)
      const changed = device !== null && next !== device
      device = next
      if (!changed) return
      token = sent = null
      void sync(userId, lang)
    })
    return () => {
      app.remove()
      fresh.remove()
    }
  }, [userId, lang])

// Unregisters first, while the session can still prove whose phone this is; offline, the next sign-in moves it anyway.
export const signOut = async (): Promise<void> => {
  await queue
  // The token is asked for again if this run of the app never registered (a reload, or a failed registration).
  const t = token ?? (await fetchToken().catch(() => null))
  if (t)
    await unregisterPushToken(t).catch((err: unknown) =>
      console.warn('push unregister failed', err)
    )
  token = sent = null
  await db().auth.signOut()
}
