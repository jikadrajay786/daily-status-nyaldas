import { initSupabase } from '@daily-status/core/supabase'

const { VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: key } = import.meta.env

// null when .env is empty, because createClient throws on an empty URL and would crash the renderer.
// The session lives in the renderer's localStorage (userData folder), so people stay signed in across restarts.
export const supabase = url && key ? initSupabase(url, key) : null
