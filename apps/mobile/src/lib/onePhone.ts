import { db } from '@daily-status/core/supabase'
import { useEffect } from 'react'
import { AppState } from 'react-native'

// getUser asks the server, so a phone replaced by a newer sign-in leaves at once rather than when its token runs out
// (up to an hour). Being offline only returns an error, which keeps the person signed in.
const claim = async (): Promise<void> => {
  const { data } = await db().auth.getUser()
  if (!data.user) return
  const { error } = await db().rpc('claim_phone_session')
  if (error) console.warn('phone session claim failed', error)
}

export const useOnePhone = (userId: string): void =>
  useEffect(() => {
    void claim()
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void claim())
    return () => sub.remove()
  }, [userId])
