import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '../src/database.types'

// Local stack only (`supabase start`): it creates and deletes real accounts.
const {
  SUPABASE_URL: url = '',
  SUPABASE_ANON_KEY: anon = '',
  SUPABASE_SERVICE_ROLE_KEY: service = ''
} = process.env
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url) || !anon || !service)
  throw new Error(
    'test:db needs SUPABASE_URL (local), SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY'
  )

type Client = SupabaseClient<Database>

const root = createClient<Database>(url, service, { auth: { persistSession: false } })
const run = Date.now().toString(36)
const password = `pw-${run}-${Math.random().toString(36).slice(2)}`
const ids = { asha: '', ravi: '' }
const pushToken = (n: string): string => `ExpoPushToken[${run}-${n}]`

// Each call is one device with its own session, stored only in memory.
const device = async (who: keyof typeof ids): Promise<Client> => {
  const m = new Map<string, string>()
  const c = createClient<Database>(url, anon, {
    auth: {
      autoRefreshToken: false,
      storage: {
        getItem: (k) => m.get(k) ?? null,
        setItem: (k, v) => void m.set(k, v),
        removeItem: (k) => void m.delete(k)
      }
    }
  })
  const { error } = await c.auth.signInWithPassword({ email: `${who}-${run}@e2e.test`, password })
  if (error) throw error
  return c
}

const phone = async (who: keyof typeof ids): Promise<Client> => {
  const c = await device(who)
  await claim(c)
  return c
}

const claim = async (c: Client): Promise<void> => {
  const { error } = await c.rpc('claim_phone_session')
  if (error) throw error
}

const signedIn = async (c: Client): Promise<boolean> => !!(await c.auth.getUser()).data.user

// Session ages are compared, and two sign-ins can land within one clock tick.
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 20))

beforeAll(async () => {
  for (const who of Object.keys(ids) as (keyof typeof ids)[]) {
    const { data, error } = await root.auth.admin.createUser({
      email: `${who}-${run}@e2e.test`,
      password,
      email_confirm: true
    })
    if (error) throw error
    ids[who] = data.user.id
    // Sign-ups wait for an admin (approve_signup); these accounts skip the queue.
    await root
      .from('profiles')
      .upsert({ id: data.user.id, email: data.user.email, full_name: `${who} E2E` } as never)
      .throwOnError()
  }
})

afterAll(async () => {
  await Promise.all(Object.values(ids).map((id) => root.auth.admin.deleteUser(id)))
})

describe('one phone at a time', () => {
  it('a new phone ends the older phone, which clears its saved session', async () => {
    const old = await phone('asha')
    await tick()
    await phone('asha')
    const events: string[] = []
    old.auth.onAuthStateChange((e) => void events.push(e))
    expect(await signedIn(old)).toBe(false)
    expect((await old.auth.getSession()).data.session).toBeNull()
    // useAuth moves to the sign-in screen on this event.
    expect(events).toContain('SIGNED_OUT')
  })

  it('an older phone calling again never ends the newer one', async () => {
    const old = await device('asha')
    await tick()
    const fresh = await device('asha')
    await claim(fresh)
    await claim(old)
    await claim(old)
    expect(await signedIn(fresh)).toBe(true)
  })

  it('repeat launches of the same phone keep it signed in', async () => {
    const c = await phone('asha')
    await claim(c)
    await claim(c)
    expect(await signedIn(c)).toBe(true)
  })

  it('a phone sign-in leaves the desktop signed in', async () => {
    const desktop = await device('asha')
    await tick()
    await phone('asha')
    await tick()
    await phone('asha')
    expect(await signedIn(desktop)).toBe(true)
  })

  it("does not touch someone else's phone", async () => {
    const hers = await phone('asha')
    await tick()
    await phone('ravi')
    expect(await signedIn(hers)).toBe(true)
  })

  it('signing out only leaves the device it was done on', async () => {
    const desktop = await device('ravi')
    await tick()
    const c = await phone('ravi')
    await c.auth.signOut({ scope: 'local' })
    expect(await signedIn(desktop)).toBe(true)
  })

  it('a replaced phone stops getting push, the new one keeps it', async () => {
    const old = await phone('ravi')
    const { error } = await old.rpc('register_push_token', {
      p_token: pushToken('old'),
      p_platform: 'android',
      p_lang: 'en'
    })
    expect(error).toBeNull()
    await tick()
    const fresh = await phone('ravi')
    await fresh.rpc('register_push_token', {
      p_token: pushToken('new'),
      p_platform: 'android',
      p_lang: 'en'
    })
    const { data } = await root.from('push_tokens').select('token').eq('user_id', ids.ravi)
    expect(data?.map((r) => r.token)).toEqual([pushToken('new')])
  })

  it('a phone with no network stays signed in', async () => {
    let offline = false
    const m = new Map<string, string>()
    const c = createClient<Database>(url, anon, {
      global: {
        fetch: (...args) =>
          offline ? Promise.reject(new TypeError('Network request failed')) : fetch(...args)
      },
      auth: {
        autoRefreshToken: false,
        storage: {
          getItem: (k) => m.get(k) ?? null,
          setItem: (k, v) => void m.set(k, v),
          removeItem: (k) => void m.delete(k)
        }
      }
    })
    const { error } = await c.auth.signInWithPassword({
      email: `asha-${run}@e2e.test`,
      password
    })
    expect(error).toBeNull()
    offline = true
    expect((await c.auth.getUser()).data.user).toBeNull()
    expect((await c.auth.getSession()).data.session).not.toBeNull()
  })

  it('a replaced phone cannot refresh its token either', async () => {
    const old = await phone('ravi')
    await tick()
    await phone('ravi')
    expect((await old.auth.refreshSession()).error?.code).toBe('refresh_token_not_found')
  })

  it('phone_sessions and the function are closed to the client', async () => {
    const c = await device('asha')
    const read = await c.from('phone_sessions' as never).select('*')
    expect(read.error).not.toBeNull()
    const signedOut = createClient<Database>(url, anon, { auth: { persistSession: false } })
    expect((await signedOut.rpc('claim_phone_session')).error).not.toBeNull()
  })
})
