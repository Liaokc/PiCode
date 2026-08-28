import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { HostToParent, ParentToHost } from '../shared/contract'
import type { UsageSnapshot } from '../shared/usage/aggregate'

/**
 * Renderer-facing bridge. Ticket 01 exposed environment versions; ticket 02
 * added the Seam-1 chat channels (the renderer's only channel to the agent
 * host system); ticket 10 adds the usage snapshot query (Seam-2 contract,
 * ADR-0002).
 */
contextBridge.exposeInMainWorld('picode', {
  versions: {
    app: process.env.npm_package_version ?? 'dev',
    electron: process.versions.electron ?? '?',
    chrome: process.versions.chrome ?? '?',
    node: process.versions.node ?? '?'
  },
  chat: {
    sendToHost: (message: ParentToHost): void => {
      ipcRenderer.send('chat:to-host', message)
    },
    onHostEvent: (listener: (event: HostToParent) => void): (() => void) => {
      const wrapped = (_event: IpcRendererEvent, message: HostToParent): void => listener(message)
      ipcRenderer.on('chat:from-host', wrapped)
      return () => {
        ipcRenderer.removeListener('chat:from-host', wrapped)
      }
    },
    pickWorkingDirectory: (): Promise<string | null> => ipcRenderer.invoke('chat:pick-directory')
  },
  usage: {
    snapshot: (): Promise<UsageSnapshot> => ipcRenderer.invoke('usage:snapshot')
  }
})
