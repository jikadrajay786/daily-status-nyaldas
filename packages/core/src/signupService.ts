import type { SignupRequest, SignupStatus } from './database.types'
import { bumpLive, useLiveQuery } from './live'
import { db, unwrap } from './supabase'
import type { Query } from './useQuery'
import { useMutation, type Mutation } from './useTasks'

// Joins the queue on the first call, so opening the app is what puts someone on the admins' list.
export const requestAccess = async (): Promise<SignupStatus> =>
  unwrap(await db().rpc('request_access'))

export const listSignupRequests = async (): Promise<SignupRequest[]> =>
  unwrap(
    await db()
      .from('signup_requests')
      .select()
      .eq('status', 'waiting')
      .order('created_at')
      .limit(200)
  )

export const useSignupRequests = (): Query<SignupRequest[]> =>
  useLiveQuery('signups', listSignupRequests)[0]

export type SignupChoice = 'approve' | 'decline'
// Resolves to the person's id, or null with a translated `error`.
export const useSignupDecision = (): Mutation<{ id: string; choice: SignupChoice }, string> =>
  useMutation(async ({ id, choice }) => {
    unwrap(
      await db().rpc(choice === 'approve' ? 'approve_signup' : 'decline_signup', { p_user: id })
    )
    bumpLive()
    return id
  })
