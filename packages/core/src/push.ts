import { useEffect, useEffectEvent } from 'react'
import type { CommentTarget } from './commentService'
import type { AppNotification } from './database.types'
import { LANG_LIST, translator, type Key, type Lang, type Vars } from './i18n'
import { db, unwrap } from './supabase'
import { STATUS_KEY, TASK_STATUSES } from './taskService'

// One place for what a push is about: the notify Edge Function sends `{ event, kind, id }` as the push's data, and
// both apps open the update or task it names.
export const PUSH_EVENTS = [
  'statusSubmitted',
  'taskStatus',
  'taskAssigned',
  'taskReminder',
  'comment'
] as const
export type PushEvent = (typeof PUSH_EVENTS)[number]
export type PushData = CommentTarget & { event: PushEvent }

// Android lets people mute each channel in the phone's settings, so events are grouped the way staff think of them.
export const PUSH_CHANNELS = {
  updates: 'pushUpdates',
  tasks: 'pushTasks',
  comments: 'comments'
} as const satisfies Record<string, Key>
export type PushChannel = keyof typeof PUSH_CHANNELS
export const channelOf: Record<PushEvent, PushChannel> = {
  statusSubmitted: 'updates',
  taskStatus: 'tasks',
  taskAssigned: 'tasks',
  taskReminder: 'tasks',
  comment: 'comments'
}

// The body is the update, task or comment text the trigger sends, unless the event has its own wording.
export const PUSH_TEXT: Record<PushEvent, { title: Key; body?: Key }> = {
  statusSubmitted: { title: 'pushStatusTitle' },
  taskStatus: { title: 'pushTaskStatusTitle', body: 'pushTaskStatusBody' },
  taskAssigned: { title: 'pushTaskAssignedTitle' },
  taskReminder: { title: 'pushTaskReminderTitle' },
  comment: { title: 'pushCommentTitle' }
}

type ServerText = Record<string, { title: string; body?: string | undefined }>
export type PushServerConfig = {
  channels: Record<PushEvent, PushChannel>
  text: Record<string, { events: ServerText; status: Record<string, string> }>
}
// The Edge Function can't import the dictionaries, so the core tests write this out as its messages.gen.ts.
export const pushServerConfig = (): PushServerConfig => ({
  channels: channelOf,
  text: Object.fromEntries(
    LANG_LIST.map((lang) => {
      const t = translator(lang)
      return [
        lang,
        {
          events: Object.fromEntries(
            PUSH_EVENTS.map((e) => [
              e,
              { title: t(PUSH_TEXT[e].title), body: PUSH_TEXT[e].body && t(PUSH_TEXT[e].body) }
            ])
          ),
          status: Object.fromEntries(TASK_STATUSES.map((s) => [s, t(STATUS_KEY[s])]))
        }
      ]
    })
  )
})

// The words the notify function sends, for alerts an app shows itself (desktop). Null for an event this build
// doesn't know yet.
export const pushText = (
  { event, vars }: Pick<AppNotification, 'event' | 'vars'>,
  lang: Lang
): { title: string; body: string } | null => {
  if (!PUSH_EVENTS.includes(event as PushEvent)) return null
  const t = translator(lang)
  const { title, body } = PUSH_TEXT[event as PushEvent]
  const v = Object.fromEntries(
    Object.entries({ ...vars, status: vars.status && t(STATUS_KEY[vars.status]) }).filter(
      (e): e is [string, string] => typeof e[1] === 'string'
    )
  ) as Vars
  return {
    title: t(title, v),
    body: (body ? t(body, v) : (vars.text ?? '')).replace(/\s+/g, ' ').trim()
  }
}

// Each notification addressed to this person while the app is open, as it is written.
export const useNotificationFeed = (userId: string, onNew: (n: AppNotification) => void): void => {
  const handle = useEffectEvent(onNew)
  useEffect(() => {
    const ch = db()
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`
        },
        ({ new: n }) => handle(n as AppNotification)
      )
      .subscribe()
    return () => void db().removeChannel(ch)
  }, [userId])
}

// A push's data comes from outside the app, so it is checked before anything navigates on it.
export const pushData = (raw: unknown): PushData | null => {
  const { event, kind, id } = (raw ?? {}) as Record<string, unknown>
  return PUSH_EVENTS.includes(event as PushEvent) &&
    (kind === 'status' || kind === 'task') &&
    typeof id === 'string'
    ? { event: event as PushEvent, kind, id }
    : null
}

export const registerPushToken = async (
  token: string,
  platform: 'ios' | 'android',
  lang: Lang
): Promise<void> =>
  unwrap(
    await db().rpc('register_push_token', { p_token: token, p_platform: platform, p_lang: lang })
  )

export const unregisterPushToken = async (token: string): Promise<void> =>
  unwrap(await db().rpc('unregister_push_token', { p_token: token }))
