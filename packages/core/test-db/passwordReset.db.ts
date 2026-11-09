import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '../src/database.types'
import { db, initSupabase, recoveryClient } from '../src/supabase'

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

const root = createClient<Database>(url, service, { auth: { persistSession: false } })
const run = Date.now().toString(36)
const email = `reset-${run}@example.com`
const [before, after] = [`old-${run}-pw`, `new-${run}-pw`]
let id = ''

const recoveryCode = async (): Promise<string> => {
  const { data, error } = await root.auth.admin.generateLink({ type: 'recovery', email })
  if (error) throw error
  return data.properties.email_otp
}

beforeAll(async () => {
  const saved = new Map<string, string>()
  initSupabase(url, anon, {
    getItem: (k) => saved.get(k) ?? null,
    setItem: (k, v) => void saved.set(k, v),
    removeItem: (k) => void saved.delete(k)
  })
  const { data, error } = await root.auth.admin.createUser({
    email,
    password: before,
    email_confirm: true
  })
  if (error) throw error
  id = data.user.id
})

afterAll(async () => {
  await root.auth.admin.deleteUser(id)
})

describe('password reset', () => {
  it('keeps the app signed out until the new password is saved', async () => {
    const rec = recoveryClient()
    const verified = await rec.auth.verifyOtp({
      email,
      token: await recoveryCode(),
      type: 'recovery'
    })
    expect(verified.error).toBeNull()
    expect((await db().auth.getSession()).data.session).toBeNull()

    expect((await rec.auth.updateUser({ password: before })).error?.code).toBe('same_password')
    expect((await rec.auth.updateUser({ password: '123' })).error?.code).toBe('weak_password')
    expect((await rec.auth.updateUser({ password: after })).error).toBeNull()
    expect((await db().auth.getSession()).data.session).toBeNull()

    expect((await db().auth.signInWithPassword({ email, password: before })).error?.code).toBe(
      'invalid_credentials'
    )
    expect((await db().auth.signInWithPassword({ email, password: after })).error).toBeNull()
  })

  it('refuses a wrong code and a used one', async () => {
    const token = await recoveryCode()
    const wrong = token === '000000' ? '111111' : '000000'
    const attempt = async (t: string): Promise<string | undefined | null> =>
      (await recoveryClient().auth.verifyOtp({ email, token: t, type: 'recovery' })).error?.code ??
      null
    expect(await attempt(wrong)).toBe('otp_expired')
    expect(await attempt(token)).toBeNull()
    expect(await attempt(token)).toBe('otp_expired')
  })
})
