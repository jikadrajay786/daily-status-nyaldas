import { fmtDate, nameOf } from './format'
import type { T } from './i18n'
import { STATUS_KEY, dueDay, type BoardTask } from './taskService'

// Plain text for chat apps; WhatsApp and Slack both read *x* as bold.
export const shareText = (task: BoardTask, t: T, locale: string): string =>
  [
    `📌 *${task.title.trim()}*`,
    `${t('taskAssignedTo')}: ${task.assignees.map(nameOf).join(', ')}`,
    t('taskDueOn', { date: fmtDate(dueDay(task.due_date), locale) }),
    `${t('taskStatus')}: ${t(STATUS_KEY[task.status])}`,
    task.description?.trim() && `\n${task.description.trim()}`,
    `\n— ${t('shareFooter')}`
  ]
    .filter(Boolean)
    .join('\n')
