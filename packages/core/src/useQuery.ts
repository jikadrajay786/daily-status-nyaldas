import { useCallback, useEffect, useEffectEvent, useState } from 'react'
import type { Key } from './i18n'

export type Query<T> =
  { state: 'loading' } | { state: 'ok'; data: T } | { state: 'error'; message: Key }

const rawMsg = (err: unknown): string =>
  err instanceof Error
    ? err.message
    : typeof err === 'object' && err && 'message' in err
      ? String(err.message)
      : String(err)

// Supabase errors are written for developers; users only ever see these translated plain-language keys.
// Auth errors carry a stable `code`, which is checked before falling back to message text.
const CODES: Partial<Record<string, Key>> = {
  invalid_credentials: 'errBadLogin',
  email_not_confirmed: 'errNotConfirmed',
  user_already_exists: 'errExists',
  email_exists: 'errExists',
  weak_password: 'errWeakPassword',
  otp_expired: 'errCodeInvalid',
  email_address_invalid: 'errInvalidEmail',
  over_email_send_rate_limit: 'errRate',
  over_request_rate_limit: 'errRate',
  task_title: 'errTaskTitle',
  task_description: 'errLength',
  task_dueDate: 'errTaskDue',
  task_userIds: 'errTaskPeople'
}

const FRIENDLY: readonly [RegExp, Key][] = [
  [/invalid login credentials/i, 'errBadLogin'],
  [/email not confirmed/i, 'errNotConfirmed'],
  [/already (been )?registered/i, 'errExists'],
  [/password should be at least/i, 'errWeakPassword'],
  [/token has expired or is invalid/i, 'errCodeInvalid'],
  // The SMTP server refused the message (e.g. Mailtrap's sandbox throttling back-to-back emails).
  [/error sending .*email/i, 'errEmailSend'],
  [/rate limit|too many/i, 'errRate'],
  [/failed to fetch|network|fetch failed/i, 'errOffline'],
  [/row-level security|permission denied|only the task status can change/i, 'errDenied'],
  [/hours_check/i, 'errHours'],
  [/description_check/i, 'errLength'],
  [/tasks_title_check/i, 'errTaskTitle'],
  [/at least one assignee/i, 'errTaskPeople'],
  [/only be given to staff/i, 'errTaskStaffOnly']
]

const codeOf = (err: unknown): string =>
  typeof err === 'object' && err && 'code' in err && typeof err.code === 'string' ? err.code : ''

export const errMsg = (err: unknown): Key => {
  // Auth throws this both with no connection (status 0) and for any 5xx, whose message (e.g. a failed
  // confirmation email) is more useful than a generic server error.
  const retry = err instanceof Error && err.name === 'AuthRetryableFetchError'
  const key =
    retry && !('status' in err && err.status)
      ? 'errOffline'
      : (CODES[codeOf(err)] ??
        FRIENDLY.find(([re]) => re.test(rawMsg(err)))?.[1] ??
        (retry ? 'errServerBusy' : undefined))
  if (!key) console.error(err)
  return key ?? 'errGeneric'
}

// Refetches whenever `key` changes, so the key must encode every input `fn` reads.
export function useQuery<T>(key: string, fn: () => Promise<T>): [Query<T>, () => void] {
  const [nonce, setNonce] = useState(0)
  const [res, setRes] = useState<{ id: string; q: Query<T> }>()
  const id = `${key}#${nonce}`
  const run = useEffectEvent(fn)

  useEffect(() => {
    let live = true
    run().then(
      (data) => live && setRes({ id, q: { state: 'ok', data } }),
      (err: unknown) => live && setRes({ id, q: { state: 'error', message: errMsg(err) } })
    )
    return () => {
      live = false
    }
  }, [id])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  return [res?.id === id ? res.q : { state: 'loading' }, reload]
}
