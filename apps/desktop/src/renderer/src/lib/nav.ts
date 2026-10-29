import type { Role } from '@daily-status/core/database.types'
import type { Key } from '@daily-status/core/i18n'

export type View = 'today' | 'history' | 'tasks' | 'team' | 'taskBoard' | 'calendar' | 'appearance'

// Admins manage rather than report: Today, History and "My tasks" are for staff and managers.
export const NAV: readonly { id: View; label: Key; only?: readonly Role[] }[] = [
  { id: 'today', label: 'navToday', only: ['user', 'manager'] },
  { id: 'history', label: 'navHistory', only: ['user', 'manager'] },
  { id: 'tasks', label: 'navTasks', only: ['user', 'manager'] },
  { id: 'team', label: 'navTeam', only: ['admin'] },
  { id: 'taskBoard', label: 'navTaskBoard', only: ['admin', 'manager'] },
  { id: 'calendar', label: 'navCalendar' },
  { id: 'appearance', label: 'navAppearance' }
]

export const canSee = (view: View, role: Role): boolean => {
  const only = NAV.find((n) => n.id === view)?.only
  return !only || only.includes(role)
}

// The first page the role may open, so admins land on Team.
export const home = (role: Role): View => NAV.find((n) => canSee(n.id, role))?.id ?? 'appearance'
