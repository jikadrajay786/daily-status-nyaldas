import type { CommentTarget } from './commentService'
import { LANG_LIST, translator, type Key, type Lang } from './i18n'
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
