import { useRef, useState } from 'react'

// For one-off actions (delete, sign out): `busy` drives the button's spinner, and a second tap while the first is
// still running is ignored rather than sent twice. Errors still reach the caller's own catch.
export const useBusy = (): [boolean, (fn: () => Promise<unknown>) => Promise<void>] => {
  const [busy, setBusy] = useState(false)
  const running = useRef(false)
  const run = async (fn: () => Promise<unknown>): Promise<void> => {
    if (running.current) return
    running.current = true
    setBusy(true)
    try {
      await fn()
    } finally {
      running.current = false
      setBusy(false)
    }
  }
  return [busy, run]
}
