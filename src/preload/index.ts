import { contextBridge } from 'electron'

/**
 * Ticket 01 exposes only environment versions as a renderer-side smoke signal.
 * The chat/session IPC contract lands with ticket 02 via this same bridge.
 */
contextBridge.exposeInMainWorld('picode', {
  versions: {
    app: process.env.npm_package_version ?? 'dev',
    electron: process.versions.electron ?? '?',
    chrome: process.versions.chrome ?? '?',
    node: process.versions.node ?? '?'
  }
})
