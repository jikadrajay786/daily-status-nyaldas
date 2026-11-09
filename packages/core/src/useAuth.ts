import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Profile } from './database.types'
import type { Key } from './i18n'
import { requestAccess } from './signupService'
import { getProfile } from './statusService'
import { db } from './supabase'
import { useLiveQuery } from './live'

export type Auth =
  | { state: 'loading' }
  | { state: 'signed-out' }
  | { state: 'error'; message: Key; retry: () => void }
  // Signed in, but an admin hasn't approved the account (or turned it down).
  | { state: 'waiting'; declined: boolean; email: string; retry: () => void }
  | { state: 'signed-in'; session: Session; profile: Profile }

// Nothing live reaches someone without a profile, so the waiting screen asks again on this beat.
const RECHECK_MS = 30_000

export function useAuth(): Auth {
  const [session, setSession] = useState<Session | null>()

  useEffect(() => {
    const { data } = db().auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  // Keyed on user id, so token refreshes don't refetch the profile.
  const uid = session?.user.id
  // Live, so a role change (made admin, or demoted) reaches the signed-in person without signing out.
  const [profile, retry] = useLiveQuery(`profile:${uid}`, async () =>
    uid ? ((await getProfile(uid)) ?? (await requestAccess())) : null
  )
  const waiting = typeof (profile.state === 'ok' && profile.data) === 'string'

  useEffect(() => {
    if (!waiting) return
    const id = setInterval(retry, RECHECK_MS)
    return () => clearInterval(id)
  }, [waiting, retry])

  if (session === undefined) return { state: 'loading' }
  if (!session) return { state: 'signed-out' }
  // Token refreshes keep the same uid, so an offline launch never refetches on its own: the UI offers retry.
  if (profile.state === 'error') return { ...profile, retry }
  if (profile.state === 'loading') return profile
  const p = profile.data
  // 'approved' with no profile yet is the moment of approval itself; the next check finds the profile.
  return typeof p === 'string' || !p
    ? { state: 'waiting', declined: p === 'declined', email: session.user.email ?? '', retry }
    : { state: 'signed-in', session, profile: p }
}
