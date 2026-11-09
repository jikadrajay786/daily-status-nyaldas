import './supabase'
import { addComment, type CommentTarget } from '@daily-status/core/commentService'
import { translator, type Key, type Lang } from '@daily-status/core/i18n'
import { channelOf, pushData, type PushEvent } from '@daily-status/core/push'
import { db } from '@daily-status/core/supabase'
import * as N from 'expo-notifications'
import * as TaskManager from 'expo-task-manager'
import { useEffect } from 'react'
import { lockOn, useLockOn } from './appLock'
import { initialLang } from './lang'
import { prefs } from './storage'

// A phone that hasn't set this category up (app lock on) shows comment notifications without Reply.
const CATEGORY = 'comment'
const REPLY = 'reply'
const TASK = 'comment-reply'
const SEEN = 'repliedTo'

// Without the app lock, a comment notification gets a Reply box; with it, replies need Face ID like everything else.
export const useCommentReply = (userId: string, lang: Lang): void => {
  const locked = useLockOn(userId)
  useEffect(() => {
    const t = translator(lang)
    void (
      locked
        ? N.deleteNotificationCategoryAsync(CATEGORY)
        : N.setNotificationCategoryAsync(CATEGORY, [
            {
              identifier: REPLY,
              buttonTitle: t('commentReply'),
              textInput: {
                submitButtonTitle: t('commentSend'),
                placeholder: t('commentPlaceholder')
              },
              options: { opensAppToForeground: false }
            }
          ])
    ).catch((err: unknown) => console.warn('reply setup failed', err))
  }, [locked, lang])
}

export const stopCommentReply = (): Promise<boolean> =>
  N.deleteNotificationCategoryAsync(CATEGORY).catch(() => false)

// Android hands a reply to both the background task and the app's listener while the app is alive, and again to the
// listener on the next launch after a headless run; prefs is shared by all of them, and this check never awaits.
const firstTime = (id: string): boolean => {
  const seen: string[] = JSON.parse(prefs.get(SEEN) ?? '[]')
  if (seen.includes(id)) return false
  prefs.set(SEEN, JSON.stringify([id, ...seen].slice(0, 20)))
  return true
}

type Reply = CommentTarget & { event: PushEvent }

// Tapping this note opens the thread, where the reply can be written again.
const tellUser = (key: Key, target: Reply, text: string): Promise<string> =>
  N.scheduleNotificationAsync({
    content: { title: translator(initialLang())(key), body: text, data: target },
    trigger: { channelId: channelOf.comment }
  })

const send = async (target: Reply, id: string, text: string): Promise<void> => {
  const user = (await db().auth.getSession()).data.session?.user.id
  const locked = !!user && lockOn(user)
  const sent =
    !!text &&
    !!user &&
    !locked &&
    (await addComment(target, text).then(
      () => true,
      () => false
    ))
  if (text && !sent)
    await tellUser(locked ? 'commentReplyLocked' : 'commentReplyFailed', target, text)
  // Ends the spinner older Android shows after Send; Android 15+ ignores it and keeps the sent reply on show instead.
  await N.dismissNotificationAsync(id)
}

// Null when the response is a plain tap; otherwise the reply's send, which a background run must wait for.
export const handleReply = (res: N.NotificationResponse): Promise<void> | null => {
  if (res.actionIdentifier !== REPLY) return null
  const { identifier, content } = res.notification.request
  // The background task gets the data as a JSON string instead.
  const { dataString } = content as { dataString?: unknown }
  const target = pushData(
    content.data ?? (typeof dataString === 'string' ? JSON.parse(dataString) : null)
  )
  return target && (target.kind === 'status' || target.kind === 'task') && firstTime(identifier)
    ? send(target, identifier, res.userText?.trim() ?? '').catch((err: unknown) =>
        console.warn('reply failed', err)
      )
    : Promise.resolve()
}

// Comment pushes to phones that report `replies` arrive as data only: Android draws a regular push itself while the
// app is in the background, without the category, so this draws it instead.
const show = async (raw: unknown): Promise<void> => {
  const msg =
    typeof raw === 'string'
      ? (JSON.parse(raw) as { show?: { title?: unknown; body?: unknown } })
      : {}
  const target = pushData(msg)
  const { title, body } = msg.show ?? {}
  if (!target || typeof title !== 'string' || typeof body !== 'string') return
  await N.scheduleNotificationAsync({
    content: { title, body, data: target, categoryIdentifier: CATEGORY },
    trigger: { channelId: channelOf.comment }
  })
}

// Runs in every app state for data pushes, and for a Reply while the app is in the background or closed.
TaskManager.defineTask<N.NotificationTaskPayload>(TASK, ({ data }) =>
  ('actionIdentifier' in data
    ? (handleReply(data) ?? Promise.resolve())
    : show(data.data.dataString)
  ).catch((err: unknown) => console.warn('reply task failed', err))
)
void N.registerTaskAsync(TASK).catch((err: unknown) => console.warn('reply task failed', err))
