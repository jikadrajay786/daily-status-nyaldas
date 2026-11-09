import {
  app,
  shell,
  BrowserWindow,
  clipboard,
  ipcMain,
  nativeTheme,
  Notification,
  safeStorage,
  session,
  ShareMenu
} from 'electron'
import { readFileSync, renameSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { CANVAS, NATIVE_SCHEME, isTheme, type Theme } from '../shared/appearance'
import { IPC, SHARE_VIA, type ShareVia, type SizeStep } from '../shared/ipc'

// Main keeps its own copy of the theme so the first frame of the next launch already has the right background.
const themeFile = (): string => join(app.getPath('userData'), 'appearance.json')
let theme: Theme = 'system'

const loadTheme = (): Theme => {
  try {
    const saved: unknown = JSON.parse(readFileSync(themeFile(), 'utf8')).theme
    return isTheme(saved) ? saved : 'system'
  } catch {
    return 'system'
  }
}

const canvas = (): string =>
  theme === 'system' ? CANVAS[nativeTheme.shouldUseDarkColors ? 'dark' : 'light'] : CANVAS[theme]

const syncBackground = (): void =>
  BrowserWindow.getAllWindows().forEach((w) => w.setBackgroundColor(canvas()))

const applyTheme = (): void => {
  nativeTheme.themeSource = NATIVE_SCHEME[theme]
  syncBackground()
}

// The sign-in session, encrypted with the OS keychain so other programs and backups can't reuse it.
const sessionFile = (): string => join(app.getPath('userData'), 'session.bin')
const SESSION_KEY = /^sb-[\w-]{1,100}$/
let saved: Record<string, string> | undefined

const loadSession = (): Record<string, string> => {
  if (saved) return saved
  try {
    saved = JSON.parse(safeStorage.decryptString(readFileSync(sessionFile()))) as Record<
      string,
      string
    >
  } catch {
    // No file yet, or the keychain entry is gone: signed out, not a crash.
    saved = {}
  }
  return saved
}

const saveSession = (next: Record<string, string>): void => {
  saved = next
  const tmp = `${sessionFile()}.tmp`
  // Rename, so a crash mid-write can't sign someone out.
  writeFileSync(tmp, safeStorage.encryptString(JSON.stringify(next)), { mode: 0o600 })
  renameSync(tmp, sessionFile())
}

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: canvas(),
    autoHideMenuBar: true,
    // macOS takes the window's icon from the app bundle (or the dock, below).
    ...(process.platform === 'darwin' ? {} : { icon }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // Status text is user-written, so a file:// or custom-scheme link must never reach the OS.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?|mailto):/i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  // Only the dev server needs navigation (hot reload, same origin). Built files never do: every
  // file:// URL has the opaque origin "null", so comparing origins alone would let them all through.
  mainWindow.webContents.on('will-navigate', (e, url) => {
    const devServer = is.dev && !!process.env['ELECTRON_RENDERER_URL']
    if (!devServer || new URL(url).origin !== new URL(mainWindow.webContents.getURL()).origin)
      e.preventDefault()
  })

  // Native zoom would stack with the Text size setting and reset on restart, so the zoom keys drive the setting.
  // preventDefault here also stops the View menu's own zoom accelerators.
  const zoomKeys = new Map<string, SizeStep>([
    ['=', 1],
    ['+', 1],
    ['-', -1],
    ['_', -1],
    ['0', 0]
  ])
  mainWindow.webContents.on('before-input-event', (e, input) => {
    const step = zoomKeys.get(input.key)
    // On Windows the meta key is the Windows key, and Win +/− belong to Magnifier.
    const mod = process.platform === 'darwin' ? input.meta : input.control
    if (step === undefined || input.type !== 'keyDown' || !mod || input.alt) return
    e.preventDefault()
    mainWindow.webContents.send(IPC.textSize, step)
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// A second copy can't open the storage the first holds, so it would start signed out and lose drafts.
// exit() rather than quit(): nothing has started yet, and quit() would still let whenReady create a window.
if (!app.requestSingleInstanceLock()) app.exit()
app.on('second-instance', () => {
  const [win] = BrowserWindow.getAllWindows()
  if (win?.isMinimized()) win.restore()
  win?.focus()
})

let shown: Notification[] = []

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // A packaged app has its own icon; in dev the dock would show Electron's.
  if (is.dev) app.dock?.setIcon(icon)
  theme = loadTheme()
  applyTheme()
  // Must match electron-builder's appId, or Windows shows notifications under the wrong name or not at all.
  electronApp.setAppUserModelId('com.electron.app')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // The app uses no camera, microphone, location or web notifications (alerts go through main).
  session.defaultSession.setPermissionRequestHandler((_, __, cb) => cb(false))
  session.defaultSession.setPermissionCheckHandler(() => false)

  // IPC handlers. Renderer input is untrusted, so validate it before use.
  ipcMain.handle(IPC.sessionGet, (_, key: unknown) =>
    typeof key === 'string' && SESSION_KEY.test(key) && safeStorage.isEncryptionAvailable()
      ? (loadSession()[key] ?? null)
      : null
  )
  ipcMain.handle(IPC.sessionSet, (_, key: unknown, value: unknown) => {
    if (
      typeof key !== 'string' ||
      !SESSION_KEY.test(key) ||
      typeof value !== 'string' ||
      value.length > 100_000 ||
      !safeStorage.isEncryptionAvailable()
    )
      return false
    saveSession({ ...loadSession(), [key]: value })
    return true
  })
  ipcMain.handle(IPC.sessionRemove, (_, key: unknown) => {
    if (typeof key !== 'string' || !safeStorage.isEncryptionAvailable()) return
    const { [key]: gone, ...rest } = loadSession()
    if (gone === undefined) return
    if (Object.keys(rest).length) saveSession(rest)
    else {
      saved = {}
      rmSync(sessionFile(), { force: true })
    }
  })
  ipcMain.handle(IPC.setTheme, (_, t: unknown) => {
    if (!isTheme(t) || t === theme) return
    theme = t
    applyTheme()
    writeFileSync(themeFile(), JSON.stringify({ theme }))
  })
  // Under "system" the OS can flip light/dark at any time; the page follows via CSS, the window bg follows here.
  // Only the background, never themeSource: setting themeSource itself fires 'updated'.
  nativeTheme.on('updated', syncBackground)
  ipcMain.handle(IPC.ping, () => 'pong')
  ipcMain.handle(IPC.getAppVersion, () => app.getVersion())
  ipcMain.handle(IPC.notify, (e, title: unknown, body: unknown, open: unknown) => {
    if (typeof title !== 'string' || typeof body !== 'string' || !Notification.isSupported())
      return false
    const n = new Notification({ title: title.slice(0, 200), body: body.slice(0, 500) })
    if (
      typeof open === 'string' &&
      /^(status|task|leave|leaveRequests|team):[0-9a-f-]{36}$/.test(open)
    )
      n.on('click', () => {
        const win = BrowserWindow.fromWebContents(e.sender)
        if (!win || win.isDestroyed()) return
        if (win.isMinimized()) win.restore()
        win.show()
        win.focus()
        e.sender.send(IPC.notifyClick, open)
      })
    // Electron drops a notification's click handler once nothing references it, so the latest few are kept.
    shown = [...shown.slice(-19), n]
    n.show()
    return true
  })
  ipcMain.handle(IPC.share, async (e, via: unknown, text: unknown) => {
    if (
      !SHARE_VIA.includes(via as ShareVia) ||
      typeof text !== 'string' ||
      !text ||
      text.length > 20_000
    )
      return false
    const open = (url: string): Promise<boolean> =>
      shell.openExternal(url).then(
        () => true,
        () => false
      )
    const body = encodeURIComponent(text)
    if (via === 'system') {
      const win = BrowserWindow.fromWebContents(e.sender)
      if (process.platform !== 'darwin' || !win) return false
      new ShareMenu({ texts: [text] }).popup({ window: win })
      return true
    }
    if (via === 'whatsapp') return open(`https://wa.me/?text=${body}`)
    if (via === 'email') return open(`mailto:?body=${body}`)
    clipboard.writeText(text)
    // Slack can't take pre-filled text, so the message waits on the clipboard while Slack opens.
    return via === 'copy' || (await open('slack://open')) || open('https://app.slack.com/client')
  })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
