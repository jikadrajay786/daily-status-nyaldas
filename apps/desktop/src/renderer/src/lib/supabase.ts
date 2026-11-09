import { initSupabase } from '@daily-status/core/supabase'
import type { SupportedStorage } from '@supabase/supabase-js'

const { VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: key } = import.meta.env

// Main encrypts the session. localStorage only remains for computers without a keychain, and for a session saved by an
// older version, which moves across the first time it's read so nobody is signed out by the update.
const storage: SupportedStorage = {
  getItem: async (k) => {
    const saved = await window.api.sessionGet(k)
    if (saved !== null) return saved
    const old = localStorage.getItem(k)
    if (old !== null && (await window.api.sessionSet(k, old))) localStorage.removeItem(k)
    return old
  },
  setItem: async (k, v) => {
    if (await window.api.sessionSet(k, v)) localStorage.removeItem(k)
    else localStorage.setItem(k, v)
  },
  removeItem: async (k) => {
    await window.api.sessionRemove(k)
    localStorage.removeItem(k)
  }
}

// null when .env is empty, because createClient throws on an empty URL and would crash the renderer.
export const supabase = url && key ? initSupabase(url, key, storage) : null
