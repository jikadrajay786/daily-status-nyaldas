import { translator, type Lang } from '@daily-status/core/i18n'
import { getMyStatus } from '@daily-status/core/statusService'
import { today } from '@daily-status/core/supabase'
import { holidayMap } from '@daily-status/core/holidayService'
import { addDays, isWorkday } from '@daily-status/core/workdays'
import * as N from 'expo-notifications'
import { router } from 'expo-router'
import { useEffect, useSyncExternalStore } from 'react'
import { AppState, Platform } from 'react-native'
import { prefs } from './storage'

export const DEFAULT_TIME = '17:30'
const CHANNEL = 'reminder'
const PREFIX = 'reminder-'
// Four weeks of one-shot reminders, so someone away for a while still gets nudged; iOS caps pending ones at 64.
const DAYS = 28

// Shown even with the app open: being in the app doesn't mean today's update is written.
N.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false
  })
})

// on defaults to true at 5:30 PM. done: `${userId}:${date}` of the last day known submitted, kept so an offline
// launch doesn't bring back a reminder that was already answered.
type Reminder = { on: boolean; time: string; done: string | null }
let state: Reminder | undefined
const listeners = new Set<() => void>()
const read = (): Reminder => {
  if (state) return state
  const time = prefs.get('reminderTime')
  return (state = {
    on: prefs.get('reminderOn') !== 'false',
    time: time && /^\d\d:\d\d$/.test(time) ? time : DEFAULT_TIME,
    done: prefs.get('reminderDone')
  })
}
const update = (p: Partial<Reminder>): void => {
  const prev = read()
  if (Object.entries(p).every(([k, v]) => prev[k as keyof Reminder] === v)) return
  state = { ...prev, ...p }
  prefs.set('reminderOn', String(state.on))
  prefs.set('reminderTime', state.time)
  if (state.done) prefs.set('reminderDone', state.done)
  else prefs.remove('reminderDone')
  listeners.forEach((f) => f())
}

export const useReminder = (): Reminder =>
  useSyncExternalStore((f) => {
    listeners.add(f)
    return () => listeners.delete(f)
  }, read)

export const setReminderTime = (time: string): void => update({ time })

// Called wherever today's own update is saved or deleted, so its reminder drops out or comes back.
export const markToday = (userId: string, done: boolean): void =>
  update({ done: done ? `${userId}:${today()}` : null })

// Android 13+ only shows the permission prompt once a channel exists; its name follows the app's language.
const channel = async (lang: Lang): Promise<void> => {
  if (Platform.OS === 'android')
    await N.setNotificationChannelAsync(CHANNEL, {
      name: translator(lang)('reminder'),
      importance: N.AndroidImportance.HIGH
    })
}

// When the next reminder will fire, so Settings can say so (Sundays, holidays and done days are skipped).
let nextAt: number | null = null
const nextListeners = new Set<() => void>()
export const useNextReminder = (): number | null =>
  useSyncExternalStore(
    (f) => {
      nextListeners.add(f)
      return () => nextListeners.delete(f)
    },
    () => nextAt
  )

// Android 12+ delays reminders by up to an hour unless "Alarms & reminders" is allowed; it opens that page.
export const exactAllowed = async (): Promise<boolean> =>
  Platform.OS !== 'android' || (await N.getExactAlarmPermissionsAsync()).granted
export const allowExact = async (): Promise<boolean> =>
  Platform.OS !== 'android' || (await N.requestExactAlarmPermissionsAsync()).granted

// The signed-in person; unset after sign-out, which makes the next sync cancel everything.
let who: { userId: string; lang: Lang } | undefined

// Built from local parts so 5:30 PM means 5:30 PM wherever the phone is.
const at = (day: string, time: string): number => {
  const [y = 0, mo = 1, d = 1] = day.split('-').map(Number)
  const [h = 17, m = 30] = time.split(':').map(Number)
  return new Date(y, mo - 1, d, h, m).getTime()
}

const reschedule = async (): Promise<void> => {
  const { on, time, done } = read()
  const keep = new Set<string>()
  if (who && on && (await N.getPermissionsAsync()).granted) {
    const { userId, lang } = who
    const t = translator(lang)
    await channel(lang)
    // Offline, remind on every working day rather than not at all; the next sync drops holidays again.
    const off = await holidayMap(today(), addDays(today(), DAYS)).catch(
      () => new Map<string, string>()
    )
    for (let i = 0; i < DAYS; i++) {
      const day = addDays(today(), i)
      const when = at(day, time)
      if (!isWorkday(day, off) || when <= Date.now() || done === `${userId}:${day}`) continue
      keep.add(PREFIX + day)
      // A fixed id per day replaces rather than duplicates when the schedule is rebuilt.
      await N.scheduleNotificationAsync({
        identifier: PREFIX + day,
        content: { title: t('reminderTitle'), body: t('reminderBody') },
        trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: when, channelId: CHANNEL }
      })
    }
  }
  const stale = (await N.getAllScheduledNotificationsAsync()).filter(
    (n) => n.identifier.startsWith(PREFIX) && !keep.has(n.identifier)
  )
  await Promise.all(stale.map((n) => N.cancelScheduledNotificationAsync(n.identifier)))
  // Ids end in YYYY-MM-DD, so the first in order is the soonest.
  const [first] = [...keep].sort()
  nextAt = first ? at(first.slice(PREFIX.length), time) : null
  nextListeners.forEach((f) => f())
  // One already showing is stale once its day is done, or once its person has signed out.
  const shown = (await N.getPresentedNotificationsAsync()).filter(
    ({ request: { identifier: id } }) =>
      id.startsWith(PREFIX) && (!who || done === `${who.userId}:${id.slice(PREFIX.length)}`)
  )
  await Promise.all(shown.map((n) => N.dismissNotificationAsync(n.request.identifier)))
}

// Queued: a launch and a foreground event arrive together, and interleaved runs would undo each other.
let queue = Promise.resolve()
const enqueue = (job: () => Promise<void>): Promise<void> =>
  (queue = queue.then(job).catch((err: unknown) => console.warn('reminder sync failed', err)))
const sync = (): Promise<void> => enqueue(reschedule)

// Asks only when it matters (first sign-in, or switching the reminder on); after a refusal the phone's settings decide.
const askPermission = async (): Promise<boolean> => {
  const cur = await N.getPermissionsAsync()
  if (cur.granted || !cur.canAskAgain) return cur.granted
  return (await N.requestPermissionsAsync()).granted
}

export const setReminderOn = async (on: boolean): Promise<void> => {
  update({ on })
  if (on && (await askPermission())) {
    if (!(await exactAllowed())) await allowExact()
    await sync()
  }
}

const openToday = (res: N.NotificationResponse | null): void => {
  if (!res?.notification.request.identifier.startsWith(PREFIX)) return
  // Otherwise every remount of the signed-in layout would see the same cold-start tap and jump to Today again.
  N.clearLastNotificationResponse()
  router.navigate({ pathname: '/', params: { date: today() } })
}

// Keeps the signed-in person's reminders in step with their settings, language and today's update.
// A null userId (admins, who don't report) keeps nothing scheduled.
export const useReminders = (userId: string | null, lang: Lang): void => {
  const { on, time, done } = useReminder()

  useEffect(() => {
    who = userId ? { userId, lang } : undefined
    void sync()
  }, [userId, lang, on, time, done])

  useEffect(() => {
    if (!userId) return
    // First sign-in on this phone: ask once, so the default 5:30 PM reminder can actually arrive.
    if (prefs.get('reminderAsked') === null && read().on) {
      prefs.set('reminderAsked', '1')
      void enqueue(async () => {
        if (who) await channel(who.lang)
        if (await askPermission()) await reschedule()
      })
    }
    // On every return to the app: the day may have changed, or notifications been allowed in the phone's settings.
    const check = (): void =>
      void getMyStatus(userId, today())
        .then((row) => markToday(userId, !!row))
        .catch(() => {})
        .then(sync)
    check()
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check())
    return () => {
      sub.remove()
      // Signing out (the only way this layout unmounts) leaves nothing scheduled for the next person.
      who = undefined
      void sync()
    }
  }, [userId])

  useEffect(() => {
    openToday(N.getLastNotificationResponse())
    const sub = N.addNotificationResponseReceivedListener(openToday)
    return () => sub.remove()
  }, [])
}
