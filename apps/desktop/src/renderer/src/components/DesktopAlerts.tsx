import { useT } from '@daily-status/core/i18n'
import { pushText, useNotificationFeed } from '@daily-status/core/push'
import { useEffect } from 'react'
import { useOpenDetails } from '../lib/details'

// System notifications for the same events phones get a push for. Only while the window is in the background: in
// front, the live screens already show the change. A click brings the window forward on that update or task.
export const DesktopAlerts = ({ userId }: { userId: string }): null => {
  const { lang } = useT()
  const open = useOpenDetails()

  useNotificationFeed(userId, (n) => {
    const text = !document.hasFocus() && pushText(n, lang)
    if (text) void window.api.notify(text.title, text.body, `${n.kind}:${n.target_id}`)
  })

  useEffect(
    () =>
      window.api.onNotifyClick((to) => {
        const [kind, id] = to.split(':')
        if ((kind === 'status' || kind === 'task') && id) open({ kind, id })
      }),
    [open]
  )
  return null
}
