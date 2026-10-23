import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IPC, type Api, type SizeStep } from '../shared/ipc'

// Narrow, typed surface. Never expose ipcRenderer itself to the renderer.
const api: Api = {
  ping: () => ipcRenderer.invoke(IPC.ping),
  getAppVersion: () => ipcRenderer.invoke(IPC.getAppVersion),
  notify: (title, body) => ipcRenderer.invoke(IPC.notify, title, body),
  setTheme: (theme) => ipcRenderer.invoke(IPC.setTheme, theme),
  onTextSize: (cb) => {
    const fn = (_: unknown, step: SizeStep): void => cb(step)
    ipcRenderer.on(IPC.textSize, fn)
    return () => ipcRenderer.off(IPC.textSize, fn)
  }
}

contextBridge.exposeInMainWorld('electron', electronAPI)
contextBridge.exposeInMainWorld('api', api)
