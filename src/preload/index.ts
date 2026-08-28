import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { HostToParent, ParentToHost } from '../shared/contract'
import type { ReviewResult } from '../shared/review/types'

/**
 * Seam-1 bridge: the renderer's only channel to the agent host system.
 * Chat/session traffic flows exclusively through these three functions plus
 * the versions snapshot from ticket 01. The review bridge (ticket 06) is a
 * separate additive namespace: request/response for workspace-vs-HEAD diffs.
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
  review: {
    /** Collect a workspace-vs-HEAD diff snapshot for the given directory. */
    load: (cwd: string): Promise<ReviewResult> => ipcRenderer.invoke('review:load', cwd)
  }
})
