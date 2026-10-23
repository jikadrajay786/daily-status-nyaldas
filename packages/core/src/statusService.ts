import type { DailyStatus, Profile, StatusInput } from './database.types'
import { db, searchTerm, unwrap } from './supabase'

export const getProfile = async (id: string): Promise<Profile | null> =>
  unwrap(await db().from('profiles').select().eq('id', id).maybeSingle())

export const getStatus = async (id: string): Promise<DailyStatus | null> =>
  unwrap(await db().from('daily_statuses').select().eq('id', id).maybeSingle())

export const getMyStatus = async (userId: string, date: string): Promise<DailyStatus | null> =>
  unwrap(
    await db().from('daily_statuses').select().eq('user_id', userId).eq('date', date).maybeSingle()
  )

// The user_id filter matters for admins, whose RLS policy would otherwise return the whole team.
export const listMyStatuses = async (
  userId: string,
  search = '',
  limit = 365
): Promise<DailyStatus[]> => {
  const q = searchTerm(search)
  const req = db().from('daily_statuses').select().eq('user_id', userId)
  return unwrap(
    await (q ? req.ilike('description_text', `%${q}%`) : req)
      .order('date', { ascending: false })
      .limit(limit)
  )
}

export const saveStatus = async (userId: string, input: StatusInput): Promise<DailyStatus> =>
  unwrap(
    await db()
      .from('daily_statuses')
      .upsert({ ...input, user_id: userId }, { onConflict: 'user_id,date' })
      .select()
      .single()
  )

// PostgREST reports a write that RLS filtered out as success with zero rows, so treat that as refused.
export const changed = <T>(rows: T[]): T => {
  const [row] = rows
  if (!row) throw new Error('permission denied: no row changed')
  return row
}

export const deleteStatus = async (id: string): Promise<void> => {
  changed(unwrap(await db().from('daily_statuses').delete().eq('id', id).select('id')))
}

// By id rather than upsert: an upsert runs the insert policy, which only allows your own rows.
export const updateStatus = async (
  id: string,
  patch: Pick<StatusInput, 'description' | 'hours_logged'>
): Promise<DailyStatus> =>
  changed(unwrap(await db().from('daily_statuses').update(patch).eq('id', id).select()))

// Most recent earlier update, not literally yesterday, so Monday picks up Friday's plan.
export const getLastStatusBefore = async (
  userId: string,
  date: string
): Promise<DailyStatus | null> =>
  unwrap(
    await db()
      .from('daily_statuses')
      .select()
      .eq('user_id', userId)
      .lt('date', date)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle()
  )
