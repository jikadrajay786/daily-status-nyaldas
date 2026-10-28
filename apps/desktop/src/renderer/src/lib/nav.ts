import type { Role } from '@daily-status/core/database.types'
import type { Key } from '@daily-status/core/i18n'

export type View = 'today' | 'history' | 'tasks' | 'team' | 'taskBoard' | 'calendar' | 'appearance'

// Admins manage rather than report: Today, History and "My tasks" are staff-only.
export const NAV: readonly { id: View; label: Key; only?: Role }[] = [
  { id: 'today', label: 'navToday', only: 'user' },
  { id: 'history', label: 'navHistory', only: 'user' },
  { id: 'tasks', label: 'navTasks', only: 'user' },
  { id: 'team', label: 'navTeam', only: 'admin' },
  { id: 'taskBoard', label: 'navTaskBoard', only: 'admin' },
  { id: 'calendar', label: 'navCalendar' },
  { id: 'appearance', label: 'navAppearance' }
]

export const canSee = (view: View, role: Role): boolean => {
  const only = NAV.find((n) => n.id === view)?.only
  return !only || only === role
}

// The first page the role may open, so admins land on Team.
export const home = (role: Role): View => NAV.find((n) => canSee(n.id, role))?.id ?? 'appearance'
