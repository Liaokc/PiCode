import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { HostToParent, ImageAttachment, ParentToHost } from '../shared/contract'
import type { FollowUpdate, SessionSummary, TranscriptItem } from '../shared/sessions/types'
import type { UsageSnapshot } from '../shared/usage/aggregate'
import type { ReviewResult } from '../shared/review/types'
import type { PreviewResult } from '../shared/preview/types'
import type { AuthProbeReport } from '../shared/auth-status'
import type { AppPreferences } from '../shared/preferences'
import type { TerminalDataMessage, TerminalExitMessage } from '../shared/terminal/messages'
import { shellDisplayName } from '../shared/terminal/shell-name'

/**
 * Renderer-facing bridge. Ticket 01 exposed environment versions; ticket 02
 * added the Seam-1 chat channels (the renderer's only channel to the agent
 * host system); ticket 04 adds the session index + Live Follow channels
 * (read-only scan of the shared Pi session store); ticket 10 adds the usage
 * snapshot query (Seam-2 contract, ADR-0002); ticket 06 adds the review
 * bridge: request/response for workspace-vs-HEAD diffs; ticket 08 adds the
 * terminal bridge: byte channels to the main-process pty (Seam-3).
 *
 * `sessions.rename` must only be called for sessions that are NOT currently
 * open in a host process — the active session renames through the host
 * (`set_session_label`) so its in-memory leaf stays consistent.
 */
contextBridge.exposeInMainWorld('picode', {
  versions: {
    app: process.env.npm_package_version ?? 'dev',
    electron: process.versions.electron ?? '?',
    chrome: process.versions.chrome ?? '?',
    node: process.versions.node ?? '?',
    /** Login shell display name for the dock tab strip (ticket 18c) — the
     * same environment the pty factory spawns from. */
    shell: shellDisplayName(process.env, process.platform)
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
    pickWorkingDirectory: (): Promise<string | null> => ipcRenderer.invoke('chat:pick-directory'),
    /** Pick image files for the composer (read in main, returned as base64). */
    pickImages: (): Promise<ImageAttachment[]> => ipcRenderer.invoke('chat:pick-images')
  },
  sessions: {
    list: (): Promise<SessionSummary[]> => ipcRenderer.invoke('sessions:list'),
    rename: (file: string, name: string): Promise<SessionSummary | null> =>
      ipcRenderer.invoke('sessions:rename', file, name),
    follow: (file: string): Promise<{ file: string; items: TranscriptItem[] } | null> =>
      ipcRenderer.invoke('sessions:follow', file),
    unfollow: (): void => {
      ipcRenderer.send('sessions:unfollow')
    },
    onIndexChanged: (listener: () => void): (() => void) => {
      const wrapped = (): void => listener()
      ipcRenderer.on('sessions:index-changed', wrapped)
      return () => {
        ipcRenderer.removeListener('sessions:index-changed', wrapped)
      }
    },
    onFollowUpdate: (listener: (update: FollowUpdate) => void): (() => void) => {
      const wrapped = (_event: IpcRendererEvent, update: FollowUpdate): void => listener(update)
      ipcRenderer.on('sessions:follow-update', wrapped)
      return () => {
        ipcRenderer.removeListener('sessions:follow-update', wrapped)
      }
    }
  },
  usage: {
    snapshot: (): Promise<UsageSnapshot> => ipcRenderer.invoke('usage:snapshot')
  },
  settings: {
    /** Preferences + last used directory in one query (ticket 11). */
    get: (): Promise<{ preferences: AppPreferences; lastUsedDirectory: string | null }> =>
      ipcRenderer.invoke('settings:get'),
    /** Merge a preferences patch; resolves with the updated preferences. */
    set: (patch: Partial<AppPreferences>): Promise<AppPreferences> =>
      ipcRenderer.invoke('settings:set', patch),
    /** Force a fresh read-only auth probe (host-family child, ADR-0003). */
    refreshAuth: (): Promise<AuthProbeReport> => ipcRenderer.invoke('settings:refresh-auth')
  },
  review: {
    /** Collect a workspace-vs-HEAD diff snapshot for the given directory. */
    load: (cwd: string): Promise<ReviewResult> => ipcRenderer.invoke('review:load', cwd)
  },
  preview: {
    /** Open a file (content) or directory (listing) for the Preview tab. */
    load: (cwd: string, target: string): Promise<PreviewResult> => ipcRenderer.invoke('preview:load', cwd, target)
  },
  terminal: {
    /** Spawn the user's shell pty; resolves with its pid (null when taken). */
    start: (id: string, cwd: string, cols: number, rows: number): Promise<number | null> =>
      ipcRenderer.invoke('terminal:start', id, cwd, cols, rows),
    write: (id: string, data: string): void => {
      ipcRenderer.send('terminal:input', id, data)
    },
    resize: (id: string, cols: number, rows: number): void => {
      ipcRenderer.send('terminal:resize', id, cols, rows)
    },
    kill: (id: string): void => {
      ipcRenderer.send('terminal:kill', id)
    },
    onData: (listener: (message: TerminalDataMessage) => void): (() => void) => {
      const wrapped = (_event: IpcRendererEvent, message: TerminalDataMessage): void => listener(message)
      ipcRenderer.on('terminal:data', wrapped)
      return () => {
        ipcRenderer.removeListener('terminal:data', wrapped)
      }
    },
    onExit: (listener: (message: TerminalExitMessage) => void): (() => void) => {
      const wrapped = (_event: IpcRendererEvent, message: TerminalExitMessage): void => listener(message)
      ipcRenderer.on('terminal:exit', wrapped)
      return () => {
        ipcRenderer.removeListener('terminal:exit', wrapped)
      }
    }
  }
})
