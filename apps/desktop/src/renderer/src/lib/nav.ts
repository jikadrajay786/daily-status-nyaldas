import type { Role } from '@daily-status/core/database.types'
import type { Key } from '@daily-status/core/i18n'

export type View = 'today' | 'history' | 'tasks' | 'team' | 'taskBoard' | 'appearance'

// Admins hand out tasks and never receive them, so "My tasks" is staff-only.
export const NAV: readonly { id: View; label: Key; only?: Role }[] = [
  { id: 'today', label: 'navToday' },
  { id: 'history', label: 'navHistory' },
  { id: 'tasks', label: 'navTasks', only: 'user' },
  { id: 'team', label: 'navTeam', only: 'admin' },
  { id: 'taskBoard', label: 'navTaskBoard', only: 'admin' },
  { id: 'appearance', label: 'navAppearance' }
]

export const canSee = (view: View, role: Role): boolean => {
  const only = NAV.find((n) => n.id === view)?.only
  return !only || only === role
}
