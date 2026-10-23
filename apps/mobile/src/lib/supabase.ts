import { initSupabase } from '@daily-status/core/supabase'
import { AppState } from 'react-native'
import { sessionStorage } from './storage'

// Expo inlines EXPO_PUBLIC_ vars only when written out as process.env.NAME; destructuring leaves them undefined.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY

export const supabase = url && key ? initSupabase(url, key, sessionStorage) : null

// Timers stop in the background, so token refresh runs only while the app is in front (someone switching to
// Mail for their code comes back to a fresh token rather than an expired one).
AppState.addEventListener('change', (state) =>
  state === 'active' ? supabase?.auth.startAutoRefresh() : supabase?.auth.stopAutoRefresh()
)
