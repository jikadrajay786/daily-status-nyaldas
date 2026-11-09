// IPC contract shared by main, preload and renderer. Keep it free of runtime imports.
import type { Theme } from './appearance'

export const IPC = {
  ping: 'ping',
  getAppVersion: 'get-app-version',
  notify: 'notify',
  notifyClick: 'notify-click',
  setTheme: 'set-theme',
  textSize: 'text-size',
  share: 'share',
  sessionGet: 'session-get',
  sessionSet: 'session-set',
  sessionRemove: 'session-remove'
} as const

// "system" is the macOS share menu; elsewhere the renderer offers the named apps only.
export const SHARE_VIA = ['system', 'whatsapp', 'email', 'slack', 'copy'] as const
export type ShareVia = (typeof SHARE_VIA)[number]

// Ctrl/Cmd with +, - or 0: one size step bigger or smaller, or 0 for the default size.
export type SizeStep = 1 | -1 | 0

export interface Api {
  platform: string
  ping: () => Promise<'pong'>
  // The sign-in session, encrypted by main. sessionSet is false when this computer has no keychain to encrypt with.
  sessionGet: (key: string) => Promise<string | null>
  sessionSet: (key: string, value: string) => Promise<boolean>
  sessionRemove: (key: string) => Promise<void>
  getAppVersion: () => Promise<string>
  // `open` ("status:<id>", "task:<id>", "leave:<id>" or "leaveRequests:<id>") comes back through onNotifyClick when the notification is clicked.
  notify: (title: string, body: string, open?: string) => Promise<boolean>
  // Returns an unsubscribe.
  onNotifyClick: (cb: (open: string) => void) => () => void
  // Syncs the native frame (title bar, menus, scrollbars) and window background with the page theme.
  setTheme: (theme: Theme) => Promise<void>
  // Zoom shortcuts change the Text size setting instead of zooming, so the two never stack. Returns an unsubscribe.
  onTextSize: (cb: (step: SizeStep) => void) => () => void
  // Sends plain text to another app. False when that way isn't available here.
  share: (via: ShareVia, text: string) => Promise<boolean>
}
