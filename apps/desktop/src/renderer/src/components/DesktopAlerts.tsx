import { useT } from '@daily-status/core/i18n'
import { leaveScreen, pushText, useNotificationFeed } from '@daily-status/core/push'
import { useEffect } from 'react'
import { useOpenDetails } from '../lib/details'
import type { View } from '../lib/nav'

// System notifications for the same events phones get a push for. Only while the window is in the background: in
// front, the live screens already show the change. A click brings the window forward on that update or task.
export const DesktopAlerts = ({
  userId,
  onOpenPage
}: {
  userId: string
  onOpenPage: (view: View) => void
}): null => {
  const { lang } = useT()
  const open = useOpenDetails()

  useNotificationFeed(userId, (n) => {
    const text = !document.hasFocus() && pushText(n, lang)
    const to =
      n.kind === 'leave' && leaveScreen(n.event) === 'requests'
        ? 'leaveRequests'
        : n.kind === 'person'
          ? 'team'
          : n.kind
    if (text) void window.api.notify(text.title, text.body, `${to}:${n.target_id}`)
  })

  useEffect(
    () =>
      window.api.onNotifyClick((to) => {
        const [kind, id] = to.split(':')
        if (kind === 'leave' || kind === 'leaveRequests' || kind === 'team') onOpenPage(kind)
        else if ((kind === 'status' || kind === 'task') && id) open({ kind, id })
      }),
    [open, onOpenPage]
  )
  return null
}
