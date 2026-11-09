import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  getIndividualUserMetrics,
  getTeamSummaryMetrics,
  getUserDirectoryWithStats,
  setUserRole
} from '../src/adminService'
import type { Database, Role } from '../src/database.types'
import { initSupabase, today } from '../src/supabase'
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

type Client = SupabaseClient<Database>
// Some of what this suite calls isn't part of the app's typed API, on purpose.
type Loose = {
  rpc: (fn: string, args?: object) => Promise<{ data: unknown; error: { message: string } | null }>
  from: (t: string) => any // eslint-disable-line @typescript-eslint/no-explicit-any
}
const loose = (c: Client): Loose => c as unknown as Loose

const root = createClient<Database>(url, service, { auth: { persistSession: false } })
const run = Date.now().toString(36)
const password = `pw-${run}-${Math.random().toString(36).slice(2)}`
const people = { ana: '', ben: '', boss: '', asha: '', ravi: '' }
type Who = keyof typeof people
const START: Record<Who, Role> = {
  ana: 'admin',
  ben: 'admin',
  boss: 'manager',
  asha: 'user',
  ravi: 'user'
}

const memory = (): {
  getItem: (k: string) => string | null
  setItem: (k: string, v: string) => void
  removeItem: (k: string) => void
} => {
  const m = new Map<string, string>()
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k)
  }
}

const signedIn = async (who: Who): Promise<Client> => {
  const c = createClient<Database>(url, anon, { auth: { persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email: `${who}-${run}@e2e.test`, password })
  if (error) throw error
  return c
}

// Points core's shared client at this person, so the services run exactly as the apps do.
const as = async (who: Who): Promise<void> => {
  const { error } = await initSupabase(url, anon, memory()).auth.signInWithPassword({
    email: `${who}-${run}@e2e.test`,
    password
  })
  if (error) throw error
}

const setRole = async (id: string, role: Role): Promise<void> => {
  const { error } = await loose(root).from('profiles').update({ role }).eq('id', id)
  if (error) throw error
}
const roleOf = async (id: string): Promise<Role> => {
  const { data } = await root.from('profiles').select('role').eq('id', id).single()
  return data?.role as Role
}

const giveTask = async (who: Who, status = 'pending'): Promise<string> => {
  const c = await signedIn('ana')
  const { data, error } = await c.rpc('create_task', {
    p_title: `Task ${Math.random()}`,
    p_description: null,
    p_due_date: new Date(Date.now() + 864e5).toISOString(),
    p_user_ids: [people[who]]
  })
  if (error) throw error
  const id = (data as { id: string }).id
  if (status !== 'pending')
    await loose(root).from('task_assignments').update({ status }).eq('task_id', id)
  return id
}

const clearWork = async (): Promise<void> => {
  const ids = Object.values(people)
  await loose(root).from('leave_requests').delete().in('user_id', ids)
  await loose(root).from('leave_ledger').delete().in('user_id', ids)
  await loose(root).from('tasks').delete().in('created_by', ids)
}

const rejectsWith = async (p: Promise<unknown>, key: string): Promise<void> => {
  const err = await p.then(
    () => null,
    (e: unknown) => e
  )
  expect(err, `expected ${key}`).not.toBeNull()
  expect(errMsg(err)).toBe(key)
}

beforeAll(async () => {
  // Role changes credit yearly leave, which is off for this company: test it with a type switched on.
  await loose(root).from('leave_types').update({ active: true }).eq('code', 'casual')
  for (const who of Object.keys(people) as Who[]) {
    const { data, error } = await root.auth.admin.createUser({
      email: `${who}-${run}@e2e.test`,
      password,
      email_confirm: true,
      user_metadata: { full_name: `${who} E2E` }
    })
    if (error) throw error
    people[who] = data.user.id
    // Sign-ups wait for an admin (approve_signup); these accounts skip the queue.
    await root
      .from('profiles')
      .upsert({ id: data.user.id, email: data.user.email, full_name: `${who} E2E` } as never)
      .throwOnError()
  }
})

beforeEach(async () => {
  await clearWork()
  for (const who of Object.keys(people) as Who[]) await setRole(people[who], START[who])
})

afterAll(async () => {
  await loose(root).from('leave_types').update({ active: false }).eq('code', 'casual')
  await clearWork()
  await Promise.all(
    Object.values(people)
      .filter(Boolean)
      .map((id) => root.auth.admin.deleteUser(id))
  )
})

describe('who may change a role', () => {
  it.each(['asha', 'boss'] as const)('%s, not being an admin, is refused', async (who) => {
    await as(who)
    await rejectsWith(setUserRole(people[who], 'admin'), 'errDenied')
    await rejectsWith(setUserRole(people.ravi, 'admin'), 'errDenied')
    expect(await roleOf(people[who])).toBe(START[who])
    expect(await roleOf(people.ravi)).toBe('user')
  })

  it('refuses someone signed out', async () => {
    const c = createClient<Database>(url, anon, { auth: { persistSession: false } })
    const { error } = await c.rpc('set_user_role', { p_user: people.asha, p_role: 'admin' })
    expect(error).not.toBeNull()
    expect(await roleOf(people.asha)).toBe('user')
  })

  it.each(['asha', 'boss', 'ana'] as const)('%s cannot write the column directly', async (who) => {
    const c = loose(await signedIn(who))
    const { error } = await c.from('profiles').update({ role: 'admin' }).eq('id', people.asha)
    expect(error?.message).toMatch(/permission denied/)
    expect(await roleOf(people.asha)).toBe('user')
  })

  it('refuses an admin changing their own role', async () => {
    await as('ana')
    await rejectsWith(setUserRole(people.ana, 'user'), 'errRoleOwn')
    expect(await roleOf(people.ana)).toBe('admin')
  })

  it('refuses a role that does not exist', async () => {
    const c = loose(await signedIn('ana'))
    const { error } = await c.rpc('set_user_role', { p_user: people.asha, p_role: 'owner' })
    expect(error).not.toBeNull()
    expect(await roleOf(people.asha)).toBe('user')
  })

  it('refuses a null role or person without changing anything', async () => {
    const c = loose(await signedIn('ana'))
    expect(
      (await c.rpc('set_user_role', { p_user: people.asha, p_role: null })).error
    ).not.toBeNull()
    expect((await c.rpc('set_user_role', { p_user: null, p_role: 'admin' })).error).not.toBeNull()
    expect(await roleOf(people.asha)).toBe('user')
  })

  it('takes effect at once for someone already signed in', async () => {
    const asha = await signedIn('asha')
    await as('ana')
    await setUserRole(people.asha, 'admin')
    expect((await asha.rpc('is_admin')).data).toBe(true)
    await setUserRole(people.asha, 'user')
    expect((await asha.rpc('is_admin')).data).toBe(false)
  })
})

describe('tasks', () => {
  it('blocks becoming admin with unfinished work, whatever its status', async () => {
    await as('ana')
    for (const status of ['pending', 'in_progress', 'blocked']) {
      const id = await giveTask('asha', status)
      await rejectsWith(setUserRole(people.asha, 'admin'), 'errRoleOpenTasks')
      await loose(root).from('tasks').delete().eq('id', id)
    }
    expect(await roleOf(people.asha)).toBe('user')
  })

  it('allows it once tasks are finished', async () => {
    await giveTask('asha', 'completed')
    await as('ana')
    await setUserRole(people.asha, 'admin')
    expect(await roleOf(people.asha)).toBe('admin')
  })

  it('allows becoming a manager with unfinished work', async () => {
    await giveTask('asha')
    await as('ana')
    await setUserRole(people.asha, 'manager')
    expect(await roleOf(people.asha)).toBe('manager')
  })

  it('does not remind a new admin about a finished task someone reopens', async () => {
    const id = await giveTask('asha', 'completed')
    await as('ana')
    await setUserRole(people.asha, 'admin')
    await loose(root).from('task_assignments').update({ status: 'pending' }).eq('task_id', id)
    await loose(root)
      .from('task_assignments')
      .update({ assigned_at: new Date(Date.now() - 36e5).toISOString() })
      .eq('task_id', id)
    const noon = '2026-11-02T06:30:00Z' // a Monday, noon in India
    const { error } = await loose(root).rpc('remind_pending_tasks', { p_at: noon })
    expect(error).toBeNull()
    const { data } = await loose(root)
      .from('notifications')
      .select('id')
      .eq('user_id', people.asha)
      .eq('event', 'taskReminder')
    expect(data).toEqual([])
  })

  it('moves a demoted manager’s tasks and their notifications to the admins', async () => {
    const boss = await signedIn('boss')
    const { data, error } = await boss.rpc('create_task', {
      p_title: 'From boss',
      p_description: null,
      p_due_date: new Date(Date.now() + 864e5).toISOString(),
      p_user_ids: [people.asha]
    })
    if (error) throw error
    const id = (data as { id: string }).id
    await as('ana')
    await setUserRole(people.boss, 'user')

    const stale = await loose(boss)
      .from('tasks')
      .update({ title: 'Mine still' })
      .eq('id', id)
      .select()
    expect(stale.data ?? []).toEqual([])

    const asha = await signedIn('asha')
    const moved = await asha
      .from('task_assignments')
      .update({ status: 'in_progress' })
      .eq('task_id', id)
      .eq('user_id', people.asha)
      .select()
    expect(moved.data).toHaveLength(1)
    const told = await loose(root)
      .from('notifications')
      .select('user_id')
      .eq('target_id', id)
      .eq('event', 'taskStatus')
    const to = (told.data as { user_id: string }[]).map((n) => n.user_id)
    expect(to).toContain(people.ana)
    expect(to).not.toContain(people.boss)
  })
})

describe('leave', () => {
  const nextMonday = (): string => {
    const d = new Date(`${today()}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7 || 7) + 14)
    return d.toISOString().slice(0, 10)
  }
  const typeId = async (): Promise<string> =>
    (await loose(root).from('leave_types').select('id').eq('code', 'casual').single()).data.id

  const askLeave = async (who: Who): Promise<string> => {
    const type = await typeId()
    await loose(root)
      .from('leave_ledger')
      .insert({ user_id: people[who], type_id: type, days: 5, kind: 'adjust', note: 'test' })
    const day = nextMonday()
    const res = await loose(await signedIn(who)).rpc('apply_leave', {
      p_type: type,
      p_start: day,
      p_end: day,
      p_start_half: 'full',
      p_end_half: 'full',
      p_reason: 'test'
    })
    if (res.error) throw new Error(res.error.message)
    return (res.data as { id: string }).id
  }

  it('blocks becoming admin while a leave request waits, so nobody approves their own', async () => {
    await askLeave('asha')
    await as('ana')
    await rejectsWith(setUserRole(people.asha, 'admin'), 'errRoleOpenLeave')
    expect(await roleOf(people.asha)).toBe('user')
  })

  it('allows it once the request is closed', async () => {
    const id = await askLeave('asha')
    expect((await loose(await signedIn('asha')).rpc('cancel_leave', { p_id: id })).error).toBeNull()
    await as('ana')
    await setUserRole(people.asha, 'admin')
    expect(await roleOf(people.asha)).toBe('admin')
  })

  it('gives a former admin this year’s leave, once', async () => {
    await as('ana')
    const credits = async (): Promise<number> =>
      (
        await loose(root)
          .from('leave_ledger')
          .select('id')
          .eq('user_id', people.ben)
          .eq('kind', 'credit')
      ).data.length
    expect(await credits()).toBe(0)
    await setUserRole(people.ben, 'user')
    const first = await credits()
    expect(first).toBeGreaterThan(0)
    await setUserRole(people.ben, 'admin')
    await setUserRole(people.ben, 'user')
    expect(await credits()).toBe(first)
  })

  it('gives nothing extra when a member becomes a manager', async () => {
    await as('ana')
    await setUserRole(people.ravi, 'manager')
    const { data } = await loose(root)
      .from('leave_ledger')
      .select('id')
      .eq('user_id', people.ravi)
      .eq('kind', 'credit')
    expect(data).toEqual([])
  })
})

describe('reporting', () => {
  it('does not count a former admin’s admin days as missed', async () => {
    await loose(root)
      .from('profiles')
      .update({ created_at: new Date(Date.now() - 90 * 864e5).toISOString() })
      .eq('id', people.ben)
    await as('ana')
    await setUserRole(people.ben, 'user')
    const now = today()
    const m = await getIndividualUserMetrics(people.ben, addDays(now, -30), now)
    expect(m.missing).toEqual([])
    expect(m.workdays).toBe(0)
  })

  it('still counts someone who was never an admin from the day they joined', async () => {
    await loose(root)
      .from('profiles')
      .update({ created_at: new Date(Date.now() - 90 * 864e5).toISOString() })
      .eq('id', people.ravi)
    await as('ana')
    await setUserRole(people.ravi, 'manager')
    const now = today()
    const m = await getIndividualUserMetrics(people.ravi, addDays(now, -30), now)
    expect(m.missing.length).toBeGreaterThan(0)
  })

  it('lists admins in People but keeps them out of the counts', async () => {
    await as('ana')
    const dir = await getUserDirectoryWithStats()
    expect(dir.map((p) => p.id)).toEqual(expect.arrayContaining([people.ana, people.ben]))
    const { members } = await getTeamSummaryMetrics(today())
    expect(members.map((p) => p.id)).not.toContain(people.ana)
    expect(members.map((p) => p.id)).toContain(people.boss)
  })

  it('lets a former admin see only their own updates', async () => {
    const ben = await signedIn('ben')
    await as('ana')
    await setUserRole(people.ben, 'user')
    const { data } = await ben.from('profiles').select('id')
    expect(data?.map((p) => p.id)).toEqual([people.ben])
  })
})

describe('at the same moment', () => {
  it('two admins demoting each other always leave one admin', async () => {
    const [ana, ben] = [await signedIn('ana'), await signedIn('ben')]
    for (let i = 0; i < 15; i++) {
      await setRole(people.ana, 'admin')
      await setRole(people.ben, 'admin')
      await Promise.all([
        ana.rpc('set_user_role', { p_user: people.ben, p_role: 'user' }),
        ben.rpc('set_user_role', { p_user: people.ana, p_role: 'user' })
      ])
      const roles = [await roleOf(people.ana), await roleOf(people.ben)]
      expect(roles.filter((r) => r === 'admin')).toHaveLength(1)
    }
  })

  it('a task given during a promotion never ends up on a new admin', async () => {
    const [ana, ben] = [await signedIn('ana'), await signedIn('ben')]
    for (let i = 0; i < 25; i++) {
      await setRole(people.asha, 'user')
      await Promise.all([
        ana.rpc('create_task', {
          p_title: `Race ${i}`,
          p_description: null,
          p_due_date: new Date(Date.now() + 864e5).toISOString(),
          p_user_ids: [people.asha]
        }),
        ben.rpc('set_user_role', { p_user: people.asha, p_role: 'admin' })
      ])
      const { data } = await root
        .from('task_assignments')
        .select('task_id')
        .eq('user_id', people.asha)
      if ((await roleOf(people.asha)) === 'admin') expect(data).toEqual([])
      await clearWork()
    }
  })

  it('a leave request sent during a promotion never ends up on a new admin', async () => {
    const type = (await loose(root).from('leave_types').select('id').eq('code', 'casual').single())
      .data.id
    const [asha, ben] = [loose(await signedIn('asha')), await signedIn('ben')]
    const d = new Date(`${today()}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7 || 7) + 14)
    const day = d.toISOString().slice(0, 10)
    for (let i = 0; i < 25; i++) {
      await setRole(people.asha, 'user')
      await loose(root)
        .from('leave_ledger')
        .insert({ user_id: people.asha, type_id: type, days: 5, kind: 'adjust', note: 'race' })
      await Promise.all([
        asha.rpc('apply_leave', {
          p_type: type,
          p_start: day,
          p_end: day,
          p_start_half: 'full',
          p_end_half: 'full',
          p_reason: 'race'
        }),
        ben.rpc('set_user_role', { p_user: people.asha, p_role: 'admin' })
      ])
      const { data } = await loose(root)
        .from('leave_requests')
        .select('id')
        .eq('user_id', people.asha)
        .eq('status', 'pending')
      if ((await roleOf(people.asha)) === 'admin') expect(data).toEqual([])
      await clearWork()
    }
  })
})

describe('live updates', () => {
  it('reach the person whose role changed', async () => {
    const [asha, ana] = [await signedIn('asha'), await signedIn('ana')]
    let flip: ReturnType<typeof setInterval> | undefined
    // Realtime starts listening a moment after it says subscribed, so keep changing the role until one gets through.
    const seen = new Promise<Role>((ok, bad) => {
      const giveUp = setTimeout(() => bad(new Error('no live update')), 35_000)
      asha
        .channel(`role-${run}`)
        .on(
          'postgres_changes' as never,
          { event: 'UPDATE', schema: 'public', table: 'profiles' } as never,
          ((p: { new: { id: string; role: Role } }) => {
            if (p.new.id !== people.asha) return
            clearTimeout(giveUp)
            ok(p.new.role)
          }) as never
        )
        .subscribe((state) => {
          if (state !== 'SUBSCRIBED') return
          let role: Role = 'user'
          flip = setInterval(() => {
            role = role === 'user' ? 'manager' : 'user'
            // PostgREST builders send only when awaited or thenned.
            void ana.rpc('set_user_role', { p_user: people.asha, p_role: role }).then()
          }, 2000)
        })
    })
    expect(['user', 'manager']).toContain(await seen)
    clearInterval(flip)
    await asha.removeAllChannels()
  }, 40_000)
})
