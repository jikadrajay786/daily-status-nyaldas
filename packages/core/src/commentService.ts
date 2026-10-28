import { useState } from 'react'
import type { Comment } from './database.types'
import type { Key } from './i18n'
import { bumpLive, useLiveQuery } from './live'
import { changed } from './statusService'
import { db, unwrap } from './supabase'
import { useBusy } from './useBusy'
import { errMsg, type Query } from './useQuery'

export type CommentTarget = { kind: 'status' | 'task'; id: string }
export const COMMENT_MAX = 2000

const column = (kind: CommentTarget['kind']): 'status_id' | 'task_id' =>
  kind === 'status' ? 'status_id' : 'task_id'

// Oldest first, like a chat: the newest sits right above the reply box.
export const listComments = async ({ kind, id }: CommentTarget): Promise<Comment[]> =>
  unwrap(
    await db().from('comments').select('*').eq(column(kind), id).order('created_at').limit(500)
  )

export const addComment = async ({ kind, id }: CommentTarget, body: string): Promise<Comment> => {
  const text = body.trim()
  if (!text || text.length > COMMENT_MAX)
    throw Object.assign(new Error('invalid comment'), { code: 'comment_body' })
  return unwrap(
    await db()
      .from('comments')
      .insert(kind === 'status' ? { status_id: id, body: text } : { task_id: id, body: text })
      .select()
      .single()
  )
}

export const deleteComment = async (id: string): Promise<void> => {
  changed(unwrap(await db().from('comments').delete().eq('id', id).select('id')))
}

// Comment counts for the cards on screen, keyed by update or task id.
export const countComments = async (
  kind: CommentTarget['kind'],
  ids: readonly string[]
): Promise<Record<string, number>> =>
  ids.length
    ? Object.fromEntries(
        unwrap(await db().rpc('comment_counts', { p_kind: kind, p_ids: [...ids] })).map((r) => [
          r.id,
          r.n
        ])
      )
    : {}

export const useComments = (t: CommentTarget): [Query<Comment[]>, () => void, boolean] =>
  useLiveQuery(`comments:${t.kind}:${t.id}`, () => listComments(t))

export const useCommentCounts = (
  kind: CommentTarget['kind'],
  ids: readonly string[]
): Record<string, number> => {
  const [q] = useLiveQuery(`comment-counts:${kind}:${ids.join(',')}`, () =>
    countComments(kind, ids)
  )
  return q.state === 'ok' ? q.data : {}
}

// The reply box. Text typed while a send is in flight stays put; only what was sent is cleared.
export const useCommentComposer = (
  target: CommentTarget,
  onSent?: () => void
): {
  body: string
  setBody: (body: string) => void
  error: Key | undefined
  busy: boolean
  send: () => Promise<void>
} => {
  const [body, setBody] = useState('')
  const [error, setError] = useState<Key>()
  const [busy, run] = useBusy()
  const send = (): Promise<void> =>
    run(async () => {
      const sent = body
      try {
        await addComment(target, sent)
        setBody((b) => (b.startsWith(sent) ? b.slice(sent.length).trimStart() : b))
        setError(undefined)
        bumpLive()
        onSent?.()
      } catch (err) {
        setError(errMsg(err))
      }
    })
  return { body, setBody, error, busy, send }
}

export const useDeleteComment = (
  id: string
): { error: Key | undefined; busy: boolean; remove: () => Promise<void> } => {
  const [error, setError] = useState<Key>()
  const [busy, run] = useBusy()
  const remove = (): Promise<void> =>
    run(async () => {
      try {
        await deleteComment(id)
        bumpLive()
      } catch (err) {
        setError(errMsg(err))
      }
    })
  return { error, busy, remove }
}
