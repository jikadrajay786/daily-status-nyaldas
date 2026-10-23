import type { Profile } from '@daily-status/core/database.types'
import { createContext, use } from 'react'

export const ProfileContext = createContext<Profile | null>(null)

// Only screens under the signed-in (app) group call this, and the root layout guards that group.
export const useProfile = (): Profile => {
  const p = use(ProfileContext)
  if (!p) throw new Error('useProfile must be used inside the signed-in app')
  return p
}
