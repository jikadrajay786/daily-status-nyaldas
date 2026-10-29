import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IPC, type Api, type SizeStep } from '../shared/ipc'

// Narrow, typed surface. Never expose ipcRenderer itself to the renderer.
const api: Api = {
  ping: () => ipcRenderer.invoke(IPC.ping),
  getAppVersion: () => ipcRenderer.invoke(IPC.getAppVersion),
  notify: (title, body, open) => ipcRenderer.invoke(IPC.notify, title, body, open),
  setTheme: (theme) => ipcRenderer.invoke(IPC.setTheme, theme),
  share: (via, text) => ipcRenderer.invoke(IPC.share, via, text),
  onNotifyClick: (cb) => {
    const fn = (_: unknown, open: string): void => cb(open)
    ipcRenderer.on(IPC.notifyClick, fn)
    return () => ipcRenderer.off(IPC.notifyClick, fn)
  },
  onTextSize: (cb) => {
    const fn = (_: unknown, step: SizeStep): void => cb(step)
    ipcRenderer.on(IPC.textSize, fn)
    return () => ipcRenderer.off(IPC.textSize, fn)
  }
}

contextBridge.exposeInMainWorld('electron', electronAPI)
contextBridge.exposeInMainWorld('api', api)
