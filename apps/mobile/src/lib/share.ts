import { useT } from '@daily-status/core/i18n'
import type { BoardTask } from '@daily-status/core/taskService'
import { shareText } from '@daily-status/core/taskShare'
import { Share } from 'react-native'

// The phone's own share sheet lists every installed app (WhatsApp, Slack, Mail…) plus Copy.
export const useShareTask = (): ((task: BoardTask) => void) => {
  const { t, locale } = useT()
  return (task) =>
    void Share.share(
      { message: shareText(task, t, locale), title: task.title },
      { dialogTitle: t('shareTask'), subject: task.title }
    ).catch(() => undefined)
}
