import {
  createClient,
  type PostgrestSingleResponse,
  type SupabaseClient,
  type SupportedStorage
} from '@supabase/supabase-js'
import type { Database } from './database.types'
import { ymd } from './workdays'

let client: SupabaseClient<Database> | null = null
let project: { url: string; key: string } | null = null

// Each app calls this once at startup and passes its encrypted session store. detectSessionInUrl is off: sign-up uses
// in-app codes, never redirects.
export const initSupabase = (
  url: string,
  key: string,
  storage?: SupportedStorage
): SupabaseClient<Database> => {
  project = { url, key }
  return (client = createClient<Database>(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      ...(storage && { storage })
    }
  }))
}

export const db = (): SupabaseClient<Database> => {
  if (!client) throw new Error('Supabase is not configured: call initSupabase first.')
  return client
}

// A recovery code signs in. On a memory-only client that session can't reach useAuth, so the app doesn't open before
// the new password is saved.
export const recoveryClient = (): SupabaseClient<Database> => {
  if (!project) throw new Error('Supabase is not configured: call initSupabase first.')
  return createClient<Database>(project.url, project.key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: 'password-recovery'
    }
  })
}

export const unwrap = <T>(res: PostgrestSingleResponse<T>): T => {
  if (res.error !== null) throw res.error
  return res.data
}

// PostgREST caps a response at 1000 rows whatever the query asks for. It also refuses a counted range past the end.
const ROWS = 1000
export const collect = async <T>(
  page: (from: number, to: number) => PromiseLike<PostgrestSingleResponse<T[]>>,
  limit = Infinity,
  got: T[] = [],
  offset = 0
): Promise<{ rows: T[]; count: number | null }> => {
  const from = offset + got.length
  const res = await page(from, from + Math.min(ROWS, limit - got.length) - 1)
  // Rows were removed since the list last looked: there is simply nothing further down.
  if (res.error?.code === 'PGRST103') return { rows: got, count: null }
  const batch = unwrap(res)
  const rows = [...got, ...batch]
  return batch.length < ROWS ||
    rows.length >= limit ||
    from + batch.length >= (res.count ?? Infinity)
    ? { rows, count: res.count }
    : collect(page, limit, rows, offset)
}

export const PAGE = 20
export type Page<T> = { rows: T[]; total: number; more: boolean }

// The query orders by something unique so rows can't shift between batches. { count: 'exact' } fills in the total; a
// list that never shows one leaves it out, since counting a whole table is the slowest part of the request.
export const pageOf = async <T>(
  page: (from: number, to: number) => PromiseLike<PostgrestSingleResponse<T[]>>,
  limit: number,
  offset = 0
): Promise<Page<T>> => {
  const { rows, count } = await collect(page, limit, [], offset)
  const seen = offset + rows.length
  return { rows, total: count ?? seen, more: count === null ? rows.length >= limit : seen < count }
}

// The device's calendar day, matching the date column.
export const today = (): string => ymd(new Date())

// Strips PostgREST filter syntax (commas, parens, quotes) and LIKE wildcards from free-text search.
export const searchTerm = (q: string): string => q.replace(/[%_,()"\\*]/g, ' ').trim()
