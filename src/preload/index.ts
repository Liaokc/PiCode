import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { HostToParent, ImageAttachment, ParentToHost } from '../shared/contract'
import type { FollowUpdate, SessionSummary, TranscriptItem } from '../shared/sessions/types'
import type { TracePayload } from '../shared/sessions/trace'
import type { SessionContextAction } from '../shared/sessions/context-actions'
import type { UsageSnapshot } from '../shared/usage/aggregate'
import type { ReviewResult } from '../shared/review/types'
import type { PreviewResult } from '../shared/preview/types'
import type { AuthProbeReport } from '../shared/auth-status'
import type { AppPreferences } from '../shared/preferences'
import type { NewTaskCommandCatalog } from '../shared/new-task-commands'
import type { SkillsReport } from '../shared/skills-management'
import type { KnownProject } from '../shared/sessions/group'
import type {
  PackagesOpOutcome,
  PackagesProgressEvent,
  PackagesReport
} from '../shared/packages-management'
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
    pickImages: (): Promise<ImageAttachment[]> => ipcRenderer.invoke('chat:pick-images'),
    /** Report the New Task chip's selected directory (ticket 52): main
     * debounces, probes the directory's command catalog once, and pushes it
     * to `onCommandCatalog`. null = no selection (global resources only). */
    setNewTaskCwd: (cwd: string | null): void => {
      ipcRenderer.send('chat:new-task-cwd', cwd)
    },
    /** Per-directory command catalog push (ticket 52), one payload per
     * probed directory. */
    onCommandCatalog: (listener: (payload: NewTaskCommandCatalog) => void): (() => void) => {
      const wrapped = (_event: IpcRendererEvent, payload: NewTaskCommandCatalog): void => listener(payload)
      ipcRenderer.on('chat:command-catalog', wrapped)
      return () => {
        ipcRenderer.removeListener('chat:command-catalog', wrapped)
      }
    }
  },
  sessions: {
    list: (): Promise<SessionSummary[]> => ipcRenderer.invoke('sessions:list'),
    rename: (file: string, name: string): Promise<SessionSummary | null> =>
      ipcRenderer.invoke('sessions:rename', file, name),
    follow: (file: string): Promise<{ file: string; items: TranscriptItem[] } | null> =>
      ipcRenderer.invoke('sessions:follow', file),
    /** Call-trace payload for one session file (ticket 36): read-only build
     * over the jsonl, any session (TUI included). Null = unreadable file. */
    trace: (file: string): Promise<TracePayload | null> => ipcRenderer.invoke('sessions:trace', file),
    /** Begin the trace tab's live-follow tail (ticket 37): resolves with the
     * initial payload and registers the growth tail — the same snapshot+
     * tail semantics as `follow`, scoped to per-file slots. */
    traceFollow: (file: string): Promise<TracePayload | null> => ipcRenderer.invoke('sessions:trace-follow', file),
    /** End one trace tab's tail (tab closed / file switched). */
    untraceFollow: (file: string): void => {
      ipcRenderer.send('sessions:untrace-follow', file)
    },
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
    },
    /** Trace-tab live-follow push (ticket 37): the rebuilt payload after
     * the traced file changed size. */
    onTraceUpdate: (listener: (payload: TracePayload) => void): (() => void) => {
      const wrapped = (_event: IpcRendererEvent, payload: TracePayload): void => listener(payload)
      ipcRenderer.on('sessions:trace-update', wrapped)
      return () => {
        ipcRenderer.removeListener('sessions:trace-update', wrapped)
      }
    },
    /** Read-only context-menu actions (ticket 35): reveal the session file
     * in Finder, or copy task path / session file path / session id to the
     * clipboard. Main validates the payload (parseSessionContextAction)
     * before touching shell/clipboard; resolves false for junk. */
    contextAction: (action: SessionContextAction): Promise<boolean> =>
      ipcRenderer.invoke('sessions:context-action', action)
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
    refreshAuth: (): Promise<AuthProbeReport> => ipcRenderer.invoke('settings:refresh-auth'),
    /** Skills-section enumeration for one directory (ticket 63; null = the
     * global face). `force` re-probes instead of serving the cache. */
    listSkills: (cwd: string | null, force: boolean): Promise<SkillsReport> =>
      ipcRenderer.invoke('settings:skills', cwd, force),
    /** Known-project list for the Project card (ticket 67): distinct
     * session cwds, fs-pre-filtered to projects that can carry project
     * skills, newest first. */
    listProjects: (): Promise<KnownProject[]> => ipcRenderer.invoke('settings:projects'),
    /** Per-skill toggle — writes Pi's settings.json in pi-config format. */
    toggleSkill: (row: unknown, enable: boolean): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('settings:skills-toggle', row, enable),
    /** Delete one entry under ~/.pi/agent/skills (link targets untouched). */
    deleteSkillEntry: (entryPath: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('settings:skills-delete', entryPath),
    /** Read-only Finder reveal of the row's skill file. */
    revealSkill: (target: string): Promise<boolean> => ipcRenderer.invoke('settings:skills-reveal', target),
    /** Packages-section report for one directory (ticket 64; null = the
     * global face — no project layer). `force` re-probes. */
    listPackages: (cwd: string | null, force: boolean): Promise<PackagesReport> =>
      ipcRenderer.invoke('settings:packages', cwd, force),
    /** Package toggle — writes the pi-config filter format into the
     * scope's settings.json (project writes are trust-gated in main). */
    togglePackage: (
      scope: 'global' | 'project',
      source: string,
      enable: boolean,
      cwd: string | null
    ): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('settings:packages-toggle', scope, source, enable, cwd),
    /** Install/remove one package through the SDK's own package manager
     * (op host, one at a time). Progress events stream to
     * `onPackagesProgress` while the invoke is in flight. */
    installPackage: (
      source: string,
      local: boolean,
      cwd: string | null
    ): Promise<PackagesOpOutcome> => ipcRenderer.invoke('settings:packages-op', 'install', source, local, cwd),
    removePackage: (
      source: string,
      local: boolean,
      cwd: string | null
    ): Promise<PackagesOpOutcome> => ipcRenderer.invoke('settings:packages-op', 'remove', source, local, cwd),
    /** Live progress of a running install/remove (op host relay). */
    onPackagesProgress: (listener: (event: PackagesProgressEvent) => void): (() => void) => {
      const wrapped = (_event: IpcRendererEvent, payload: PackagesProgressEvent): void => listener(payload)
      ipcRenderer.on('settings:packages-progress', wrapped)
      return () => {
        ipcRenderer.removeListener('settings:packages-progress', wrapped)
      }
    }
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
  },
  notifications: {
    /** Ask main to raise the OS notification for one background session's
     * approval gate (ticket 25). The renderer only asks for sessions whose
     * pill is not on screen; the pill itself never auto-resolves. */
    requestApproval: (notice: { sessionId: string; toolName: string; title: string | null }): void => {
      ipcRenderer.send('notifications:approval-request', notice)
    },
    /** A notification was clicked: main foregrounds the window and asks the
     * renderer to focus that session (deep link, ticket 25). */
    onFocusRequest: (listener: (sessionId: string) => void): (() => void) => {
      const wrapped = (_event: IpcRendererEvent, sessionId: string): void => listener(sessionId)
      ipcRenderer.on('notifications:focus-session', wrapped)
      return () => {
        ipcRenderer.removeListener('notifications:focus-session', wrapped)
      }
    }
  }
})
