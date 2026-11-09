import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  getTeamSummaryMetrics,
  getUserDirectoryWithStats,
  getIndividualUserMetrics
} from '../src/adminService'
import type { Database } from '../src/database.types'
import { addStatus, deleteStatus, listMyDay, updateStatus } from '../src/statusService'
import { db, initSupabase, today } from '../src/supabase'
import { errMsg } from '../src/useQuery'
import { addDays } from '../src/workdays'

// Runs against a local stack only (`supabase start`): it creates and deletes real accounts.
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
const run = `mu${Date.now().toString(36)}`
const password = `pw-${run}`
const ids = { admin: '', staff: '', other: '' }
const signIn = (who: keyof typeof ids): Promise<unknown> =>
  db().auth.signInWithPassword({ email: `${who}-${run}@load.test`, password })
const entry = (hours: number, date = day): Parameters<typeof addStatus>[1] => ({
  date,
  description: `<p>${run} ${hours}</p>`,
  hours_logged: hours
})
const day = today()

beforeAll(async () => {
  initSupabase(url, anon)
  for (const who of Object.keys(ids) as (keyof typeof ids)[]) {
    const { data, error } = await root.auth.admin.createUser({
      email: `${who}-${run}@load.test`,
      password,
      email_confirm: true
    })
    if (error) throw error
    ids[who] = data.user.id
    await root
      .from('profiles')
      .upsert({
        id: data.user.id,
        email: `${who}-${run}@load.test`,
        full_name: who,
        role: who === 'admin' ? 'admin' : 'user',
        created_at: '2020-01-01T00:00:00Z'
      })
      .throwOnError()
  }
})

afterAll(async () => {
  await db().auth.signOut({ scope: 'local' })
  for (const id of Object.values(ids)) if (id) await root.auth.admin.deleteUser(id)
})

describe('several updates in a day', () => {
  it('keeps each update, oldest first, and leaves others alone', async () => {
    await signIn('staff')
    const a = await addStatus(ids.staff, entry(3))
    const b = await addStatus(ids.staff, entry(2))
    expect((await listMyDay(ids.staff, day)).map((r) => r.id)).toEqual([a.id, b.id])
    await updateStatus(a.id, { description: '<p>changed</p>', hours_logged: 4 })
    const rows = await listMyDay(ids.staff, day)
    expect(rows[0]?.hours_logged).toBe(4)
    expect(rows[1]?.description).toContain(run)
    await signIn('other')
    expect(await listMyDay(ids.staff, day)).toEqual([])
  })

  it('refuses a day past 24 hours, on adding and on changing', async () => {
    await signIn('staff')
    await expect(addStatus(ids.staff, entry(19))).rejects.toSatisfy(
      (err) => errMsg(err) === 'errHoursDay'
    )
    const c = await addStatus(ids.staff, entry(18))
    await expect(
      updateStatus(c.id, { description: '<p>x</p>', hours_logged: 19 })
    ).rejects.toSatisfy((err) => errMsg(err) === 'errHoursDay')
    await deleteStatus(c.id)
  })

  it('holds the limit when two saves arrive together', async () => {
    await signIn('other')
    const res = await Promise.allSettled(
      Array.from({ length: 4 }, () => addStatus(ids.other, entry(10)))
    )
    expect(res.filter((r) => r.status === 'fulfilled')).toHaveLength(2)
    const rows = await listMyDay(ids.other, day)
    expect(rows.reduce((sum, r) => sum + r.hours_logged, 0)).toBe(20)
    await Promise.all(rows.map((r) => deleteStatus(r.id)))
  })

  it('counts a person once and a date once, but every update and hour', async () => {
    await signIn('staff')
    const earlier = addDays(day, -1)
    await addStatus(ids.staff, entry(1, earlier))
    await signIn('admin')
    const team = await getTeamSummaryMetrics(day)
    const me = team.members.find((m) => m.id === ids.staff)
    expect(me).toBeDefined()
    expect(team.missing.some((m) => m.id === ids.staff)).toBe(false)
    const dir = await getUserDirectoryWithStats()
    expect(dir.find((p) => p.id === ids.staff)).toMatchObject({
      submissions: 2,
      updates: 3,
      totalHours: 7
    })
    const m = await getIndividualUserMetrics(ids.staff, earlier, day)
    expect(m.days.filter(([, s]) => s === 'done')).toHaveLength(2)
    expect(m.hours).toBe(7)
  })

  it('stays marked as submitted until the last update of the day is gone', async () => {
    await signIn('staff')
    const rows = await listMyDay(ids.staff, day)
    await deleteStatus(rows[0]?.id ?? '')
    expect(await listMyDay(ids.staff, day)).toHaveLength(1)
    await deleteStatus(rows[1]?.id ?? '')
    expect(await listMyDay(ids.staff, day)).toEqual([])
  })
})
