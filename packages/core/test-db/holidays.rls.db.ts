import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '../src/database.types'
import { addHoliday, deleteHoliday, updateHoliday } from '../src/holidayService'
import { initSupabase } from '../src/supabase'
import { errMsg } from '../src/useQuery'

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
const password = `pw-${run}-${Math.random().toString(36).slice(2)}`
const people = { admin: '', boss: '', asha: '' }
type Who = keyof typeof people
const DAYS = ['2031-03-03', '2031-03-04', '2031-03-05']

const as = async (who: Who): Promise<void> => {
  const m = new Map<string, string>()
  const c = initSupabase(url, anon, {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k)
  })
  const { error } = await c.auth.signInWithPassword({ email: `${who}-${run}@e2e.test`, password })
  if (error) throw error
}

const rowOn = async (day: string): Promise<string | undefined> =>
  (await root.from('holidays').select('name').eq('day', day).maybeSingle()).data?.name

beforeAll(async () => {
  for (const who of Object.keys(people) as Who[]) {
    const { data, error } = await root.auth.admin.createUser({
      email: `${who}-${run}@e2e.test`,
      password,
      email_confirm: true
    })
    if (error) throw error
    people[who] = data.user.id
    // Sign-ups wait for an admin (approve_signup); these accounts skip the queue.
    await root
      .from('profiles')
      .upsert({ id: data.user.id, email: data.user.email, full_name: `${who} E2E` } as never)
      .throwOnError()
  }
  await root
    .from('profiles')
    .update({ role: 'admin' } as never)
    .eq('id', people.admin)
  await root
    .from('profiles')
    .update({ role: 'manager' } as never)
    .eq('id', people.boss)
})

afterAll(async () => {
  await root.from('holidays').delete().in('day', DAYS)
  await Promise.all(Object.values(people).map((id) => root.auth.admin.deleteUser(id)))
})

describe('editing a holiday', () => {
  it('an admin changes the name and keeps the day', async () => {
    await as('admin')
    await addHoliday(DAYS[0]!, 'Uttarayan')
    await updateHoliday(DAYS[0]!, DAYS[0]!, 'Vasi Uttarayan')
    expect(await rowOn(DAYS[0]!)).toBe('Vasi Uttarayan')
  })

  it('an admin moves it to another day', async () => {
    await as('admin')
    await updateHoliday(DAYS[0]!, DAYS[1]!, 'Vasi Uttarayan')
    expect(await rowOn(DAYS[0]!)).toBeUndefined()
    expect(await rowOn(DAYS[1]!)).toBe('Vasi Uttarayan')
  })

  it('cannot land on a day that already has a holiday', async () => {
    await as('admin')
    await addHoliday(DAYS[2]!, 'Holi')
    const err = await updateHoliday(DAYS[1]!, DAYS[2]!, 'Vasi Uttarayan').catch((e: unknown) => e)
    expect(errMsg(err)).toBe('errHolidayExists')
    expect(await rowOn(DAYS[1]!)).toBe('Vasi Uttarayan')
    expect(await rowOn(DAYS[2]!)).toBe('Holi')
  })

  it.each(['asha', 'boss'] as const)('%s cannot edit or remove one', async (who) => {
    await as(who)
    await expect(updateHoliday(DAYS[1]!, DAYS[0]!, 'Hacked')).rejects.toBeTruthy()
    await expect(deleteHoliday(DAYS[1]!)).rejects.toBeTruthy()
    expect(await rowOn(DAYS[1]!)).toBe('Vasi Uttarayan')
  })

  it('signed out, nothing changes', async () => {
    const c = createClient<Database>(url, anon, { auth: { persistSession: false } })
    await c.from('holidays').update({ name: 'Hacked' }).eq('day', DAYS[1]!)
    expect(await rowOn(DAYS[1]!)).toBe('Vasi Uttarayan')
  })

  it('a holiday someone else already removed gives an error, not silence', async () => {
    await as('admin')
    await deleteHoliday(DAYS[2]!)
    await expect(updateHoliday(DAYS[2]!, DAYS[2]!, 'Gone')).rejects.toBeTruthy()
  })
})
