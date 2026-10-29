import { translator, type Lang } from '@daily-status/core/i18n'
import { PUSH_CHANNELS, pushData } from '@daily-status/core/push'
import { today } from '@daily-status/core/supabase'
import * as N from 'expo-notifications'
import { router } from 'expo-router'
import { useEffect } from 'react'
import { Platform } from 'react-native'
import { detailsHref } from './quickComment'
import { prefs } from './storage'

// Shared by local reminders and pushes: permission, Android channels, and where a tap leads.
export const REMINDER_CHANNEL = 'reminder'
export const REMINDER_PREFIX = 'reminder-'

// Shown even with the app open: being in the app doesn't mean today's update is written or a new task was seen.
N.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false
  })
})

// Android 13+ only shows the permission prompt once a channel exists; names follow the app's language.
export const setupChannels = async (lang: Lang): Promise<void> => {
  if (Platform.OS !== 'android') return
  const t = translator(lang)
  const channels = { [REMINDER_CHANNEL]: 'reminder', ...PUSH_CHANNELS } as const
  await Promise.all(
    Object.entries(channels).map(([id, key]) =>
      N.setNotificationChannelAsync(id, { name: t(key), importance: N.AndroidImportance.HIGH })
    )
  )
}

// Asks only when it matters; after a refusal the phone's settings decide.
export const askPermission = async (): Promise<boolean> => {
  const cur = await N.getPermissionsAsync()
  if (cur.granted || !cur.canAskAgain) return cur.granted
  return (await N.requestPermissionsAsync()).granted
}

// First sign-in on this phone asks once, for reminders and pushes alike; callers arriving together share the prompt.
let asking: Promise<boolean> | undefined
export const firstAsk = (lang: Lang): Promise<boolean> =>
  (asking ??= (async () => {
    await setupChannels(lang)
    if (prefs.get('notifyAsked') !== null) return (await N.getPermissionsAsync()).granted
    prefs.set('notifyAsked', '1')
    return askPermission()
  })().finally(() => (asking = undefined)))

const open = (res: N.NotificationResponse | null): void => {
  if (!res) return
  const { identifier, content } = res.notification.request
  const push = pushData(content.data)
  const href = identifier.startsWith(REMINDER_PREFIX)
    ? ({ pathname: '/', params: { date: today() } } as const)
    : push && detailsHref(push)
  if (!href) return
  // Otherwise every remount of the signed-in layout would see the same cold-start tap and jump there again.
  N.clearLastNotificationResponse()
  router.navigate(href)
}

// Mounted once in the signed-in layout, so a tap opens its screen behind the app lock.
export const useNotificationTaps = (): void =>
  useEffect(() => {
    open(N.getLastNotificationResponse())
    const sub = N.addNotificationResponseReceivedListener(open)
    return () => sub.remove()
  }, [])
