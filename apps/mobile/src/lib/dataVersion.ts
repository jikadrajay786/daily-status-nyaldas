import { useSyncExternalStore } from 'react'

// Bumped after any save or delete; every query key that lists updates includes it, so other tabs and screens
// further back in the stack refetch instead of showing what was there before.
let version = 0
const listeners = new Set<() => void>()

export const bumpData = (): void => {
  version++
  listeners.forEach((f) => f())
}

export const useDataVersion = (): number =>
  useSyncExternalStore(
    (f) => {
      listeners.add(f)
      return () => listeners.delete(f)
    },
    () => version
  )
