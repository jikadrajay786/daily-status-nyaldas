import { z } from 'zod'
import type {
  LeaveBalance,
  LeaveHalf,
  LeaveLedgerEntry,
  LeaveRequest,
  LeaveType,
  Profile
} from './database.types'
import { db, pageOf, unwrap, type Page } from './supabase'

const DAY = z.iso.date()
const HALF = z.enum(['full', 'first', 'second'] as const satisfies readonly LeaveHalf[])

export const applyLeaveSchema = z
  .object({
    typeId: z.uuid(),
    start: DAY,
    end: DAY,
    startHalf: HALF,
    endHalf: HALF,
    reason: z.string().trim().min(1).max(500)
  })
  .refine((l) => l.end >= l.start, { path: ['end'] })

export const decideLeaveSchema = z.object({
  id: z.uuid(),
  approve: z.boolean(),
  note: z.string().trim().max(300).optional()
})

export const cancelLeaveSchema = z.object({
  id: z.uuid(),
  note: z.string().trim().max(300).optional()
})

export const adjustLeaveSchema = z.object({
  userId: z.uuid(),
  typeId: z.uuid(),
  days: z
    .number()
    .min(-999)
    .max(999)
    .refine((d) => d !== 0),
  note: z.string().trim().min(1).max(300)
})

export type ApplyLeaveInput = z.input<typeof applyLeaveSchema>
export type DecideLeaveInput = z.input<typeof decideLeaveSchema>
export type CancelLeaveInput = z.input<typeof cancelLeaveSchema>
export type AdjustLeaveInput = z.input<typeof adjustLeaveSchema>
export type LeavePerson = Pick<Profile, 'id' | 'full_name' | 'email'>
export type TeamLeaveRequest = LeaveRequest & { person: LeavePerson | null }

// errMsg looks up `code`, so a bad field surfaces as a translated message rather than Zod's JSON.
const parse = <S extends z.ZodType>(schema: S, input: unknown): z.output<S> => {
  const res = schema.safeParse(input)
  if (res.success) return res.data
  throw Object.assign(new Error('invalid leave input'), {
    code: `leave_${String(res.error.issues[0]?.path[0])}`
  })
}

const WITH_PERSON = '*, person:profiles!leave_requests_user_id_fkey(id, full_name, email)'

export const listLeaveTypes = async (): Promise<LeaveType[]> =>
  unwrap(await db().from('leave_types').select().order('created_at'))

// A person with no ledger lines yet has no row here, so screens treat a missing type as zero.
export const listLeaveBalances = async (userId: string): Promise<LeaveBalance[]> =>
  unwrap(await db().from('leave_balances').select().eq('user_id', userId))

export const listLeaveRequests = async (userId: string): Promise<LeaveRequest[]> =>
  unwrap(
    await db()
      .from('leave_requests')
      .select()
      .eq('user_id', userId)
      .order('start_day', { ascending: false })
      .limit(200)
  )

export const listLeaveLedger = async (userId: string): Promise<LeaveLedgerEntry[]> =>
  unwrap(
    await db()
      .from('leave_ledger')
      .select()
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(200)
  )

// RLS limits this to everyone for an admin, and to their staff plus themselves for a store or agency manager.
export const listTeamBalances = async (): Promise<LeaveBalance[]> =>
  unwrap(await db().from('leave_balances').select())

// Admin: everything still waiting for a decision, oldest first.
export const listPendingLeave = async (): Promise<TeamLeaveRequest[]> =>
  unwrap(
    await db()
      .from('leave_requests')
      .select(WITH_PERSON)
      .eq('status', 'pending')
      .order('start_day')
      .limit(200)
  )

// The same list a page at a time, leaving out the person's own requests.
export const listPendingLeavePage = (
  me: string,
  limit: number,
  offset: number
): Promise<Page<TeamLeaveRequest>> =>
  pageOf(
    (from, to) =>
      db()
        .from('leave_requests')
        .select(WITH_PERSON, { count: 'exact' })
        .eq('status', 'pending')
        .neq('user_id', me)
        .order('start_day')
        .order('id')
        .range(from, to),
    limit,
    offset
  )

// Admin: approved leave touching a date range ("who's out").
export const listApprovedLeave = async (start: string, end: string): Promise<TeamLeaveRequest[]> =>
  unwrap(
    await db()
      .from('leave_requests')
      .select(WITH_PERSON)
      .eq('status', 'approved')
      .lte('start_day', end)
      .gte('end_day', start)
      .order('start_day')
      .limit(500)
  )

export const applyLeave = async (input: ApplyLeaveInput): Promise<LeaveRequest> => {
  const l = parse(applyLeaveSchema, input)
  return unwrap(
    await db()
      .rpc('apply_leave', {
        p_type: l.typeId,
        p_start: l.start,
        p_end: l.end,
        p_start_half: l.startHalf,
        p_end_half: l.endHalf,
        p_reason: l.reason
      })
      .single()
  )
}

export const decideLeave = async (input: DecideLeaveInput): Promise<LeaveRequest> => {
  const { id, approve, note } = parse(decideLeaveSchema, input)
  return unwrap(
    await db()
      .rpc('decide_leave', { p_id: id, p_approve: approve, p_note: note ?? null })
      .single()
  )
}

export const cancelLeave = async (input: CancelLeaveInput): Promise<LeaveRequest> => {
  const { id, note } = parse(cancelLeaveSchema, input)
  return unwrap(
    await db()
      .rpc('cancel_leave', { p_id: id, p_note: note ?? null })
      .single()
  )
}

export const adjustLeaveBalance = async (input: AdjustLeaveInput): Promise<LeaveLedgerEntry> => {
  const a = parse(adjustLeaveSchema, input)
  return unwrap(
    await db()
      .rpc('adjust_leave_balance', {
        p_user: a.userId,
        p_type: a.typeId,
        p_days: a.days,
        p_note: a.note
      })
      .single()
  )
}
