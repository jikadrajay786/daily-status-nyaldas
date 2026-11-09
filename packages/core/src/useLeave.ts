import { useState } from 'react'
import type { LeaveBalance, LeaveLedgerEntry, LeaveRequest, LeaveType } from './database.types'
import { useHolidays } from './holidayService'
import type { Key } from './i18n'
import { fixLeaveHalves, leaveBalance, leaveDays, type LeaveSpan } from './leave'
import {
  adjustLeaveBalance,
  applyLeave,
  cancelLeave,
  decideLeave,
  listApprovedLeave,
  listLeaveBalances,
  listLeaveLedger,
  listLeaveRequests,
  listLeaveTypes,
  listPendingLeave,
  listPendingLeavePage,
  listTeamBalances,
  type AdjustLeaveInput,
  type ApplyLeaveInput,
  type CancelLeaveInput,
  type DecideLeaveInput,
  type TeamLeaveRequest
} from './leaveService'
import { bumpLive, useLiveQuery } from './live'
import { usePaged, type Paged } from './usePaged'
import { useMutation, type Mutation } from './useTasks'
import type { Query } from './useQuery'

type Live<T> = [Query<T>, () => void, boolean]

export const useLeaveTypes = (): Live<LeaveType[]> => useLiveQuery('leave:types', listLeaveTypes)
export const useLeaveBalances = (userId: string): Live<LeaveBalance[]> =>
  useLiveQuery(`leave:balances:${userId}`, () => listLeaveBalances(userId))
export const useLeaveRequests = (userId: string): Live<LeaveRequest[]> =>
  useLiveQuery(`leave:requests:${userId}`, () => listLeaveRequests(userId))
export const useLeaveLedger = (userId: string): Live<LeaveLedgerEntry[]> =>
  useLiveQuery(`leave:ledger:${userId}`, () => listLeaveLedger(userId))
// A store or agency manager can read their own requests too, but those are for an admin to decide.
export const usePendingLeave = (me: string): Live<TeamLeaveRequest[]> =>
  useLiveQuery(`leave:pending:${me}`, async () =>
    (await listPendingLeave()).filter((r) => r.user_id !== me)
  )
export const usePendingLeavePage = (
  me: string
): [Query<Paged<TeamLeaveRequest>>, () => void, boolean] =>
  usePaged(`leave:pending:page:${me}`, (limit, offset) => listPendingLeavePage(me, limit, offset))
export const useApprovedLeave = (
  start: string,
  end: string,
  me: string
): Live<TeamLeaveRequest[]> =>
  useLiveQuery(`leave:approved:${start}:${end}:${me}`, async () =>
    (await listApprovedLeave(start, end)).filter((r) => r.user_id !== me)
  )
export const useTeamBalances = (): Live<LeaveBalance[]> =>
  useLiveQuery('leave:balances:team', listTeamBalances)

// Own saves bump right away so balances and lists don't wait for realtime.
const useLeaveWrite = <A, R>(fn: (arg: A) => Promise<R>): Mutation<A, R> =>
  useMutation((arg: A) => fn(arg).finally(bumpLive))

export const useApplyLeave = (): Mutation<ApplyLeaveInput, LeaveRequest> =>
  useLeaveWrite(applyLeave)
export const useDecideLeave = (): Mutation<DecideLeaveInput, LeaveRequest> =>
  useLeaveWrite(decideLeave)
export const useCancelLeave = (): Mutation<CancelLeaveInput, LeaveRequest> =>
  useLeaveWrite(cancelLeave)
export const useAdjustLeave = (): Mutation<AdjustLeaveInput, LeaveLedgerEntry> =>
  useLeaveWrite(adjustLeaveBalance)

export type LeaveChoice = 'approve' | 'reject'
export type LeaveDecision = {
  choice: LeaveChoice | null
  choose: (c: LeaveChoice | null) => void
  note: string
  setNote: (n: string) => void
  busy: boolean
  error: Key | null
  confirm: () => Promise<void>
}

// One request's approve/reject flow: pick, optionally add a note, confirm. Both apps draw it.
export const useLeaveDecision = (id: string, onDone: (c: LeaveChoice) => void): LeaveDecision => {
  const [choice, choose] = useState<LeaveChoice | null>(null)
  const [note, setNote] = useState('')
  const { run, busy, error } = useDecideLeave()
  const confirm = async (): Promise<void> => {
    if (!choice) return
    if (await run({ id, approve: choice === 'approve', note: note.trim() || undefined }))
      onDone(choice)
  }
  return { choice, choose, note, setNote, busy, error, confirm }
}

export type LeaveForm = {
  loading: boolean
  loadError: Key | null
  types: LeaveType[]
  type: LeaveType | undefined
  pick: (id: string) => void
  span: LeaveSpan
  update: (patch: Partial<LeaveSpan>) => void
  reason: string
  setReason: (r: string) => void
  days: number | null
  left: number | null
  over: boolean
  ready: boolean
  submit: () => Promise<LeaveRequest | null>
  busy: boolean
  error: Key | null
}

// The "ask for leave" form both apps draw: the choices, the preview of days used, and sending it.
export const useLeaveForm = (userId: string, today: string): LeaveForm => {
  const [types] = useLeaveTypes()
  const [balances] = useLeaveBalances(userId)
  const [picked, setPicked] = useState<string>()
  const [span, setSpan] = useState<LeaveSpan>({
    start: today,
    end: today,
    startHalf: 'full',
    endHalf: 'full'
  })
  const [reason, setReason] = useState('')
  const [holidays] = useHolidays(span.start, span.end)
  const apply = useApplyLeave()
  const list = types.state === 'ok' ? types.data.filter((x) => x.active) : []
  const type = list.find((x) => x.id === picked) ?? list[0]
  const days =
    type && holidays.state === 'ok'
      ? leaveDays(span, new Set(holidays.data.map((h) => h.day)), type.sandwich)
      : null
  const left =
    type && balances.state === 'ok' ? leaveBalance(balances.data, type.id).available : null
  const over =
    !!type?.needs_balance && !type.allow_negative && days !== null && left !== null && days > left

  const update = (patch: Partial<LeaveSpan>): void =>
    setSpan((s) => {
      const next = { ...s, ...patch }
      return fixLeaveHalves({ ...next, end: next.end < next.start ? next.start : next.end })
    })
  const pick = (id: string): void => {
    setPicked(id)
    if (list.find((x) => x.id === id)?.allow_half_day === false)
      update({ startHalf: 'full', endHalf: 'full' })
  }

  return {
    loading: types.state === 'loading',
    loadError: types.state === 'error' ? types.message : null,
    types: list,
    type,
    pick,
    span,
    update,
    reason,
    setReason,
    days,
    left,
    over,
    ready: !!type && days !== 0 && !over,
    submit: (): Promise<LeaveRequest | null> =>
      type ? apply.run({ typeId: type.id, ...span, reason }) : Promise.resolve(null),
    busy: apply.busy,
    error: apply.error
  }
}
