import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Profile } from './database.types'
import type { Key } from './i18n'
import { getProfile } from './statusService'
import { db } from './supabase'
import { useLiveQuery } from './live'

export type Auth =
  | { state: 'loading' }
  | { state: 'signed-out' }
  | { state: 'error'; message: Key; retry: () => void }
  | { state: 'signed-in'; session: Session; profile: Profile }

export function useAuth(): Auth {
  const [session, setSession] = useState<Session | null>()

  useEffect(() => {
    const { data } = db().auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  // Keyed on user id, so token refreshes don't refetch the profile.
  const uid = session?.user.id
  // Live, so a role change (made admin, or demoted) reaches the signed-in person without signing out.
  const [profile, retry] = useLiveQuery(`profile:${uid}`, () =>
    uid ? getProfile(uid) : Promise.resolve(null)
  )

  if (session === undefined) return { state: 'loading' }
  if (!session) return { state: 'signed-out' }
  // Token refreshes keep the same uid, so an offline launch never refetches on its own: the UI offers retry.
  if (profile.state === 'error') return { ...profile, retry }
  if (profile.state === 'loading') return profile
  return profile.data
    ? { state: 'signed-in', session, profile: profile.data }
    : { state: 'error', message: 'noProfile', retry }
}
