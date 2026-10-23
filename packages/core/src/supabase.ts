import {
  createClient,
  type PostgrestSingleResponse,
  type SupabaseClient,
  type SupportedStorage
} from '@supabase/supabase-js'
import type { Database } from './database.types'
import { ymd } from './workdays'

let client: SupabaseClient<Database> | null = null

// Each app calls this once at startup. Desktop keeps the session in localStorage (the default); mobile passes
// an encrypted store. detectSessionInUrl is off: sign-up uses in-app codes, never redirects.
export const initSupabase = (
  url: string,
  key: string,
  storage?: SupportedStorage
): SupabaseClient<Database> =>
  (client = createClient<Database>(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      ...(storage && { storage })
    }
  }))

export const db = (): SupabaseClient<Database> => {
  if (!client) throw new Error('Supabase is not configured: call initSupabase first.')
  return client
}

export const unwrap = <T>(res: PostgrestSingleResponse<T>): T => {
  if (res.error !== null) throw res.error
  return res.data
}

// The device's calendar day, matching the date column.
export const today = (): string => ymd(new Date())

// Strips PostgREST filter syntax (commas, parens, quotes) and LIKE wildcards from free-text search.
export const searchTerm = (q: string): string => q.replace(/[%_,()"\\*]/g, ' ').trim()
