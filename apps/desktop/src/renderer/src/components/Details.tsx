import {
  COMMENT_MAX,
  useCommentComposer,
  useComments,
  useDeleteComment,
  type CommentTarget
} from '@daily-status/core/commentService'
import type { Comment } from '@daily-status/core/database.types'
import { fmtAgo, fmtStamp, initials, ROLE_KEY } from '@daily-status/core/format'
import { useT } from '@daily-status/core/i18n'
import { useLiveQuery } from '@daily-status/core/live'
import { getProfile, getStatus } from '@daily-status/core/statusService'
import { getTask, managesTask } from '@daily-status/core/taskService'
import { useDeleteTask } from '@daily-status/core/useTasks'
import { Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { DetailsContext } from '../lib/details'
import { CardsSkeleton } from './Skeletons'
import { StatusCard } from './StatusCard'
import { Members } from './Tasks/Members'
import { ShareButton } from './Tasks/ShareButton'
import { TaskMeta } from './Tasks/TaskMeta'
import { Avatar, Badge, Button, Card, Loading, Notice, Skeleton, TextArea } from './ui'
import type { Profile } from '@daily-status/core/database.types'

const SEND_KEYS = /Mac/.test(navigator.userAgent) ? '⌘ Enter' : 'Ctrl Enter'

const StatusDetails = ({ id, me }: { id: string; me: Profile }): React.JSX.Element => {
  const { t } = useT()
  const admin = me.role === 'admin'
  const [q] = useLiveQuery(`status-details:${id}`, async () => {
    const st = await getStatus(id)
    return st && { st, author: admin ? await getProfile(st.user_id) : undefined }
  })
  if (q.state === 'loading') return <CardsSkeleton count={1} />
  if (q.state === 'error') return <Notice tone="bad">{t(q.message)}</Notice>
  return q.data ? (
    <StatusCard status={q.data.st} author={q.data.author} commentable={false} />
  ) : (
    <Notice>{t('notFound')}</Notice>
  )
}

// In-app confirm: window.confirm's OK/Cancel buttons stay in the OS language.
const DeleteTask = ({
  id,
  onDeleted
}: {
  id: string
  onDeleted: () => void
}): React.JSX.Element => {
  const { t } = useT()
  const [confirming, setConfirming] = useState(false)
  const { run, busy, error } = useDeleteTask()
  return (
    <div className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-auto text-sm text-bad-fg">{t('confirmDeleteTask')}</span>
          <Button variant="ghost" onClick={() => setConfirming(false)}>
            {t('cancel')}
          </Button>
          <Button
            variant="danger"
            busy={busy}
            onClick={() => void run(id).then((res) => res && onDeleted())}
          >
            {t('yesDelete')}
          </Button>
        </div>
      ) : (
        <Button variant="danger" className="self-start" onClick={() => setConfirming(true)}>
          {t('deleteTask')}
        </Button>
      )}
      {error && <Notice tone="bad">{t(error)}</Notice>}
    </div>
  )
}

const TaskDetails = ({
  id,
  me,
  onDeleted
}: {
  id: string
  me: Profile
  onDeleted: () => void
}): React.JSX.Element => {
  const { t } = useT()
  const [q] = useLiveQuery(`task-details:${id}`, () => getTask(id))
  if (q.state === 'loading') return <CardsSkeleton count={1} />
  if (q.state === 'error') return <Notice tone="bad">{t(q.message)}</Notice>
  if (!q.data) return <Notice>{t('notFound')}</Notice>
  const task = q.data
  return (
    <Card>
      <h3 className="mb-2 text-lg font-semibold text-fg">{task.title}</h3>
      <TaskMeta task={task} />
      {task.description && (
        <p className="mt-3 text-sm/relaxed whitespace-pre-line text-fg-2">{task.description}</p>
      )}
      <div className="mt-4 flex flex-col items-start gap-4 border-t border-line pt-4">
        <div className="w-full">
          <Members task={task} me={me.id} />
        </div>
        {managesTask(task, me) && <ShareButton task={task} />}
      </div>
      {managesTask(task, me) && <DeleteTask id={task.id} onDeleted={onDeleted} />}
    </Card>
  )
}

const CommentRow = ({ c, me }: { c: Comment; me: Profile }): React.JSX.Element => {
  const { t, locale } = useT()
  const [confirming, setConfirming] = useState(false)
  const { error, busy, remove } = useDeleteComment(c.id)
  const mine = c.author_id === me.id
  return (
    <li className="group flex gap-3">
      <Avatar text={initials({ full_name: c.author_name, email: null })} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className="font-semibold text-fg">{mine ? t('you') : c.author_name}</span>
          {c.author_role !== 'user' && <Badge label={t(ROLE_KEY[c.author_role])} tone="info" />}
          <time
            dateTime={c.created_at}
            title={fmtStamp(c.created_at, locale)}
            className="text-xs text-fg-3"
          >
            {fmtAgo(c.created_at, t, locale)}
          </time>
          {(mine || me.role === 'admin') && !confirming && (
            <button
              type="button"
              aria-label={t('commentDelete')}
              title={t('commentDelete')}
              onClick={() => setConfirming(true)}
              className="ml-auto grid size-8 place-items-center rounded-md text-fg-3 transition-colors duration-150 ease-enter hover:bg-hover hover:text-bad-fg"
            >
              <Trash2 aria-hidden className="size-4" />
            </button>
          )}
        </div>
        <p className="text-sm/relaxed break-words whitespace-pre-line text-fg">{c.body}</p>
        {confirming && (
          <div className="mt-1 flex flex-wrap items-center gap-2 rounded-lg border border-line p-2 text-sm">
            <span className="mr-auto text-fg">{t('confirmDeleteComment')}</span>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              {t('cancel')}
            </Button>
            <Button variant="danger" busy={busy} onClick={() => void remove()}>
              {t('delete')}
            </Button>
          </div>
        )}
        {error && <Notice tone="bad">{t(error)}</Notice>}
      </div>
    </li>
  )
}

const Composer = ({
  target,
  onSent
}: {
  target: CommentTarget
  onSent: () => void
}): React.JSX.Element => {
  const { t } = useT()
  const { body, setBody, error, busy, send } = useCommentComposer(target, onSent)
  // Cmd/Ctrl+Enter sends; plain Enter adds a line.
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key !== 'Enter' || !(e.metaKey || e.ctrlKey)) return
    e.preventDefault()
    if (body.trim()) void send()
  }
  return (
    <div className="flex flex-col gap-2">
      <TextArea
        aria-label={t('commentPlaceholder')}
        placeholder={t('commentPlaceholder')}
        maxLength={COMMENT_MAX}
        rows={2}
        value={body}
        onChange={(e) => setBody(e.currentTarget.value)}
        onKeyDown={onKey}
      />
      {error && <Notice tone="bad">{t(error)}</Notice>}
      <div className="flex flex-wrap items-center gap-3">
        <Button busy={busy} disabled={!body.trim()} onClick={() => void send()}>
          {t('commentSend')}
        </Button>
        <span className="text-xs text-fg-3">{t('shortcutHint', { keys: SEND_KEYS })}</span>
      </div>
    </div>
  )
}

const Thread = ({
  target,
  me,
  onClose
}: {
  target: CommentTarget
  me: Profile
  onClose: () => void
}): React.JSX.Element => {
  const { t } = useT()
  const [comments] = useComments(target)
  const end = useRef<HTMLDivElement>(null)
  // Follow the thread down once, to the comment just sent; later live updates leave the reader where they are.
  const follow = useRef(false)
  useEffect(() => {
    if (!follow.current || comments.state !== 'ok') return
    follow.current = false
    end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }, [comments])
  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-5 [scrollbar-gutter:stable]">
        {target.kind === 'status' ? (
          <StatusDetails id={target.id} me={me} />
        ) : (
          <TaskDetails id={target.id} me={me} onDeleted={onClose} />
        )}
        <section aria-labelledby="comments-title" className="flex flex-col gap-4">
          <h3 id="comments-title" className="font-semibold text-fg">
            {t('comments')}
          </h3>
          {comments.state === 'ok' ? (
            comments.data.length ? (
              <ul className="flex flex-col gap-5">
                {comments.data.map((c) => (
                  <CommentRow key={c.id} c={c} me={me} />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-fg-2">{t('commentsEmpty')}</p>
            )
          ) : comments.state === 'error' ? (
            <Notice tone="bad">{t(comments.message)}</Notice>
          ) : (
            <Loading>
              <Skeleton className="h-12 w-full" />
            </Loading>
          )}
        </section>
        <div ref={end} />
      </div>
      <footer className="border-t border-line bg-card p-4">
        <Composer target={target} onSent={() => (follow.current = true)} />
      </footer>
    </>
  )
}

// One details dialog for the whole workspace: any card's Comments button opens it.
export const DetailsProvider = ({
  me,
  children
}: {
  me: Profile
  children: ReactNode
}): React.JSX.Element => {
  const { t } = useT()
  const [target, setTarget] = useState<CommentTarget | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = dialog.current
    if (target && !d?.open) d?.showModal()
    if (!target && d?.open) d.close()
  }, [target])

  return (
    <DetailsContext value={setTarget}>
      {children}
      <dialog
        ref={dialog}
        aria-labelledby="details-title"
        onClose={() => setTarget(null)}
        className="m-auto h-[min(48rem,calc(100vh-4rem))] w-[min(42rem,calc(100vw-2rem))] max-w-none flex-col overflow-hidden rounded-2xl border border-line bg-canvas p-0 text-fg shadow-raised open:flex"
      >
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 id="details-title" className="text-lg font-semibold">
            {t('details')}
          </h2>
          <button
            type="button"
            aria-label={t('close')}
            title={t('close')}
            onClick={() => setTarget(null)}
            className="grid size-9 place-items-center rounded-md text-fg-2 transition-colors duration-150 ease-enter hover:bg-hover hover:text-fg"
          >
            <X aria-hidden className="size-5" />
          </button>
        </header>
        {target && (
          <Thread
            key={`${target.kind}:${target.id}`}
            target={target}
            me={me}
            onClose={() => setTarget(null)}
          />
        )}
      </dialog>
    </DetailsContext>
  )
}
