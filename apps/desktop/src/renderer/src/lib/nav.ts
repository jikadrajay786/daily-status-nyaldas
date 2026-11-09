import type { Role } from '@daily-status/core/database.types'
import type { Key } from '@daily-status/core/i18n'

export type View =
  | 'home'
  | 'today'
  | 'history'
  | 'tasks'
  | 'leave'
  | 'team'
  | 'leaveRequests'
  | 'taskBoard'
  | 'calendar'
  | 'appearance'

const LEADS: readonly Role[] = ['store_manager', 'agency_manager']
const REPORT: readonly Role[] = ['user', 'manager', ...LEADS]

// Admins manage rather than report: Today, History and "My tasks" are for everyone else.
export const NAV: readonly { id: View; label: Key; only?: readonly Role[] }[] = [
  { id: 'home', label: 'navHome', only: ['admin', ...LEADS] },
  { id: 'today', label: 'navToday', only: REPORT },
  { id: 'history', label: 'navHistory', only: REPORT },
  { id: 'tasks', label: 'navTasks', only: REPORT },
  { id: 'leave', label: 'navLeave', only: REPORT },
  { id: 'team', label: 'navTeam', only: ['admin', ...LEADS] },
  { id: 'leaveRequests', label: 'navLeaveRequests', only: ['admin', ...LEADS] },
  { id: 'taskBoard', label: 'navTaskBoard', only: ['admin', 'manager', ...LEADS] },
  { id: 'calendar', label: 'navCalendar' },
  { id: 'appearance', label: 'navAppearance' }
]

export const canSee = (view: View, role: Role): boolean => {
  const only = NAV.find((n) => n.id === view)?.only
  return !only || only.includes(role)
}

// The first page the role may open, so admins and leads land on Home.
export const home = (role: Role): View => NAV.find((n) => canSee(n.id, role))?.id ?? 'appearance'
