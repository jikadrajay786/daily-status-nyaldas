import { useEffect, useState, useSyncExternalStore } from 'react'
import { db } from './supabase'
import { useQuery, type Query } from './useQuery'

// One counter for "shared data changed": bumped by realtime events and by the app's own saves. Live queries put it
// in their key, so every screen refetches, whoever made the change and on whichever device.
let version = 0
const listeners = new Set<() => void>()

export const bumpLive = (): void => {
  version++
  listeners.forEach((f) => f())
}

export const useLiveVersion = (): number =>
  useSyncExternalStore(
    (f) => {
      listeners.add(f)
      return () => listeners.delete(f)
    },
    () => version
  )

const TABLES = [
  'daily_statuses',
  'profiles',
  'tasks',
  'task_assignments',
  'comments',
  'holidays'
] as const

// Mounted once while signed in. Realtime applies each subscriber's RLS, so nobody hears about rows they can't read.
// Bursts (a bulk edit, several people at once) collapse into one refetch, and a reconnect after the network or the
// app was away refetches too, since anything that changed meanwhile was never delivered.
export const useRealtimeSync = (userId: string): void => {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let connected = false
    const bump = (): void => {
      clearTimeout(timer)
      timer = setTimeout(bumpLive, 250)
    }
    const ch = db().channel(`live:${userId}`)
    for (const table of TABLES)
      ch.on('postgres_changes', { event: '*', schema: 'public', table }, bump)
    ch.subscribe((status) => {
      if (status !== 'SUBSCRIBED') return
      if (connected) bump()
      connected = true
    })
    return () => {
      clearTimeout(timer)
      void db().removeChannel(ch)
    }
  }, [userId])
}

// useQuery that also refetches on every live bump, and keeps showing what it had while that refetch runs, so other
// people's changes slide in without a skeleton flash. A different `key` (another date, filter or person) still shows
// loading: old data for a different question would be wrong, not just stale. The third value is true while such a
// background refetch runs, for pull-to-refresh spinners.
export function useLiveQuery<T>(
  key: string,
  fn: () => Promise<T>
): [Query<T>, () => void, boolean] {
  const live = useLiveVersion()
  const [q, reload] = useQuery(`${key}~${live}`, fn)
  const [last, setLast] = useState<{ key: string; q: Query<T> }>()
  if (q.state !== 'loading' && (last?.key !== key || last.q !== q)) setLast({ key, q })
  return q.state === 'loading' && last?.key === key && last.q.state === 'ok'
    ? [last.q, reload, true]
    : [q, reload, false]
}
