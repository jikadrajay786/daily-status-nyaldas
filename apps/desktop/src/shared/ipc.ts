// IPC contract shared by main, preload and renderer. Keep it free of runtime imports.
import type { Theme } from './appearance'

export const IPC = {
  ping: 'ping',
  getAppVersion: 'get-app-version',
  notify: 'notify',
  notifyClick: 'notify-click',
  setTheme: 'set-theme',
  textSize: 'text-size'
} as const

// Ctrl/Cmd with +, - or 0: one size step bigger or smaller, or 0 for the default size.
export type SizeStep = 1 | -1 | 0

export interface Api {
  ping: () => Promise<'pong'>
  getAppVersion: () => Promise<string>
  // `open` ("status:<id>" or "task:<id>") comes back through onNotifyClick when the notification is clicked.
  notify: (title: string, body: string, open?: string) => Promise<boolean>
  // Returns an unsubscribe.
  onNotifyClick: (cb: (open: string) => void) => () => void
  // Syncs the native frame (title bar, menus, scrollbars) and window background with the page theme.
  setTheme: (theme: Theme) => Promise<void>
  // Zoom shortcuts change the Text size setting instead of zooming, so the two never stack. Returns an unsubscribe.
  onTextSize: (cb: (step: SizeStep) => void) => () => void
}
