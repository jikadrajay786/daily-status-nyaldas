import { useState } from 'react'
import { setUserManager, setUserRole } from './adminService'
import type { Profile, Role } from './database.types'
import type { Key } from './i18n'
import { bumpLive } from './live'
import { useBusy } from './useBusy'
import { errMsg } from './useQuery'

type RoleChange = {
  // The role waiting for confirmation, if any.
  next: Role | undefined
  saved: boolean
  error: Key | undefined
  busy: boolean
  pick: (role: Role) => void
  confirm: () => Promise<void>
}

type ReportsToChange = {
  saved: boolean
  error: Key | undefined
  busy: boolean
  pick: (manager: string | null) => Promise<void>
}

// Applies at once: unlike a role, it can be put straight back and changes nothing the person sees.
export const useReportsTo = (person: Pick<Profile, 'id' | 'reports_to'>): ReportsToChange => {
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<Key>()
  const [busy, run] = useBusy()
  const pick = (manager: string | null): Promise<void> =>
    run(async () => {
      setSaved(false)
      setError(undefined)
      if (manager === person.reports_to) return
      try {
        await setUserManager(person.id, manager)
        setSaved(true)
        bumpLive()
      } catch (err) {
        setError(errMsg(err))
      }
    })
  return { saved, error, busy, pick }
}

export const useRoleChange = (person: Pick<Profile, 'id' | 'role'>): RoleChange => {
  const [picked, setNext] = useState<Role>()
  // Another admin may have made the same change while this one waited for confirmation.
  const next = picked === person.role ? undefined : picked
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<Key>()
  const [busy, run] = useBusy()
  const pick = (role: Role): void => {
    // Mid-save the choice is already on its way, so a new tap couldn't be honoured.
    if (busy) return
    setSaved(false)
    setError(undefined)
    setNext(role === person.role ? undefined : role)
  }
  const confirm = (): Promise<void> =>
    run(async () => {
      if (!next) return
      setError(undefined)
      try {
        await setUserRole(person.id, next)
        setNext(undefined)
        setSaved(true)
        bumpLive()
      } catch (err) {
        setError(errMsg(err))
      }
    })
  return { next, saved, error, busy, pick, confirm }
}
