import { useRef, useState } from 'react'
import type { Key } from './i18n'
import { useLiveQuery } from './live'
import { PAGE, type Page } from './supabase'
import { errMsg, type Query } from './useQuery'

export type Paged<T> = Page<T> & { older: () => void; busy: boolean; failed: Key | null }

// The top of a list stays live this far down. Past it, older pages are added once and left alone: refetching thousands
// of rows on every change anyone makes would cost more than a person scrolling that far could ever see.
const LIVE = 100

type Older<T> = { rows: T[]; done: boolean; busy: boolean; failed: Key | null }
const noOlder = { rows: [], done: false, busy: false, failed: null }

// A live list that opens with one page and grows. What's on screen stays up if loading more fails. `sticky` keeps the
// last page while a new key loads, for lists the screen narrows itself in the meantime.
export const usePaged = <T extends { id: string }>(
  key: string,
  load: (limit: number, offset: number) => Promise<Page<T>>,
  sticky = false
): [Query<Paged<T>>, () => void, boolean] => {
  const [limit, setLimit] = useState(PAGE)
  const [seen, setSeen] = useState(key)
  const [old, setOld] = useState<Older<T>>(noOlder)
  const latest = useRef(key)
  latest.current = key
  if (seen !== key) {
    setSeen(key)
    setLimit(PAGE)
    setOld(noOlder)
  }
  const [q, reloadTop, refreshing] = useLiveQuery(key, () => load(limit, 0))
  const reload = (): void => {
    setOld(noOlder)
    setLimit(PAGE)
    reloadTop()
  }
  const [kept, setKept] = useState<{ key: string; page: Page<T> }>()
  if (q.state === 'ok' && kept?.page !== q.data) setKept({ key, page: q.data })
  const page = kept && (sticky || kept.key === key) ? kept.page : null
  if (!page) return [q.state === 'error' ? q : { state: 'loading' }, reload, false]
  const failed = old.failed ?? (q.state === 'error' ? q.message : null)
  // A background refresh isn't "loading more": only a window bigger than what's on screen is.
  const busy = old.busy || ((refreshing || q.state === 'loading') && page.rows.length < limit)
  const top = new Set(page.rows.map((r) => r.id))
  const rows = [...page.rows, ...old.rows.filter((r) => !top.has(r.id))]
  const more = page.more && !old.done
  const addOlder = async (): Promise<void> => {
    setOld((o) => ({ ...o, busy: true, failed: null }))
    try {
      const next = await load(PAGE, rows.length)
      if (latest.current === key)
        setOld((o) => ({
          rows: [...o.rows, ...next.rows],
          done: !next.more || !next.rows.length,
          busy: false,
          failed: null
        }))
    } catch (err) {
      if (latest.current === key) setOld((o) => ({ ...o, busy: false, failed: errMsg(err) }))
    }
  }
  return [
    {
      state: 'ok',
      data: {
        ...page,
        rows,
        more,
        failed,
        busy,
        older: () => {
          if (busy || !(more || failed)) return
          if (rows.length >= LIVE) return void addOlder()
          if (!failed) setLimit((n) => n + PAGE)
          reloadTop()
        }
      }
    },
    reload,
    refreshing
  ]
}
