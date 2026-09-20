/// <reference types="vite/client" />
import type { HostToParent, ImageAttachment, ParentToHost } from '../shared/contract'
import type { FollowUpdate, SessionSummary, TranscriptItem } from '../../shared/sessions/types'
import type { TracePayload } from '../../shared/sessions/trace'
import type { SubagentTranscriptPayload } from '../../shared/subagents/chat-model'
import type { SessionContextAction } from '../shared/sessions/context-actions'
import type { ReviewResult } from '../shared/review/types'
import type { PreviewResult } from '../shared/preview/types'
import type { AuthProbeReport } from '../shared/auth-status'
import type { AppPreferences } from '../shared/preferences'
import type { NewTaskCommandCatalog } from '../shared/new-task-commands'
import type { SkillsReport } from '../shared/skills-management'
import type { McpLayerReport } from '../shared/mcp-management'
import type { KnownProject } from '../shared/sessions/group'
import type {
  PackagesOpOutcome,
  PackagesProgressEvent,
  PackagesReport
} from '../shared/packages-management'
import type { UsageSnapshot } from '../../shared/usage/aggregate'
import type { TerminalDataMessage, TerminalExitMessage } from '../../shared/terminal/messages'

interface ImportMetaEnv {
  /** QA hook: pin the empty-state greeting hour so screenshot runs are deterministic. */
  readonly VITE_PICODE_FAKE_HOUR?: string
  /** QA hook: launch with the side panel expanded (screenshot 03 composition). */
  readonly VITE_PICODE_PANEL_OPEN?: string
  /** QA hook: open the settings window shell at launch (screenshot 09 composition). */
  readonly VITE_PICODE_VIEW?: string
}

interface PicodeChatBridge {
  sendToHost(message: ParentToHost): void
  /** Subscribe to the Seam-1 contract stream; returns an unsubscribe function. */
  onHostEvent(listener: (event: HostToParent) => void): () => void
  pickWorkingDirectory(): Promise<string | null>
  /** Pick image files for the composer (read in main, returned as base64). */
  pickImages(): Promise<ImageAttachment[]>
  /** Report the New Task chip's selected directory (ticket 52): main
   * debounces, probes the directory's command catalog once, and pushes it
   * to `onCommandCatalog`. null = no selection (global resources only). */
  setNewTaskCwd(cwd: string | null): void
  /** Per-directory command catalog push (ticket 52), one payload per
   * probed directory. */
  onCommandCatalog(listener: (payload: NewTaskCommandCatalog) => void): () => void
}

interface PicodeSessionsBridge {
  list(): Promise<SessionSummary[]>
  /** Rename write-back for sessions NOT open in a host process. */
  rename(file: string, name: string): Promise<SessionSummary | null>
  /** Begin Live Follow tailing; resolves with the full transcript snapshot. */
  follow(file: string): Promise<{ file: string; items: TranscriptItem[] } | null>
  /** Call-trace payload for one session file (ticket 36): read-only build
   * over the jsonl, any session (TUI included). Null = unreadable file. */
  trace(file: string): Promise<TracePayload | null>
  /** Begin the trace tab's live-follow tail (ticket 37): snapshot + tail
   * registration in one request. */
  traceFollow(file: string): Promise<TracePayload | null>
  /** End one trace tab's growth tail. */
  untraceFollow(file: string): void
  unfollow(): void
  onIndexChanged(listener: () => void): () => void
  onFollowUpdate(listener: (update: FollowUpdate) => void): () => void
  /** Trace-tab live-follow push (ticket 37): the rebuilt payload after the
   * traced file changed size. */
  onTraceUpdate(listener: (payload: TracePayload) => void): () => void
  /** Subagent conversation-tab transcript (ticket 99): one run's child
   * session transcript resolved through its status.json artifact.
   * `follow: true` registers the live tail (running subagents) and
   * resolves the initial snapshot; `follow: false` is a one-shot read
   * (settled runs). Error states ride the payload; null = invalid input. */
  subagentTranscript(asyncDir: string, follow: boolean): Promise<SubagentTranscriptPayload | null>
  /** End one conversation tab's live tail. */
  unsubagentTranscriptFollow(asyncDir: string): void
  /** Conversation-tab live-follow push (ticket 99): the rebuilt child
   * transcript after the run's artifact / child session file changed. */
  onSubagentTranscriptUpdate(listener: (payload: SubagentTranscriptPayload) => void): () => void
  /** Read-only context-menu actions (ticket 35): reveal the session file
   * in Finder or copy task path / session file path / session id; main
   * validates the payload before touching shell/clipboard. */
  contextAction(action: SessionContextAction): Promise<boolean>
}

interface PicodeReviewBridge {
  /** Collect a workspace-vs-HEAD diff snapshot for the given directory. */
  load(cwd: string): Promise<ReviewResult>
}

interface PicodePreviewBridge {
  /** Open a file (content) or directory (listing) for the Preview tab. */
  load(cwd: string, target: string): Promise<PreviewResult>
}

interface PicodeTerminalBridge {
  /** Spawn the user's shell pty; resolves with its pid (null when taken). */
  start(id: string, cwd: string, cols: number, rows: number): Promise<number | null>
  /** Keystrokes → pty stdin (user pane only; the Bridge has no write path). */
  write(id: string, data: string): void
  resize(id: string, cols: number, rows: number): void
  kill(id: string): void
  /** Batched pty output bytes for any terminal instance. */
  onData(listener: (message: TerminalDataMessage) => void): () => void
  onExit(listener: (message: TerminalExitMessage) => void): () => void
}

interface PicodeNotificationsBridge {
  /** Raise the OS notification for one background session's approval gate
   * (ticket 25). Only asked for sessions whose pill is not on screen. */
  requestApproval(notice: { sessionId: string; toolName: string; title: string | null }): void
  /** The notification was clicked: main asks the renderer to focus that
   * session (pure focus change through the session registry). */
  onFocusRequest(listener: (sessionId: string) => void): () => void
}

interface PicodeSettingsBridge {
  /** Preferences + last used directory in one query (ticket 11). */
  get(): Promise<{ preferences: AppPreferences; lastUsedDirectory: string | null }>
  /** Merge a preferences patch; resolves with the updated preferences. */
  set(patch: Partial<AppPreferences>): Promise<AppPreferences>
  /** Force a fresh read-only auth probe (host-family child, ADR-0003). */
  refreshAuth(): Promise<AuthProbeReport>
  /** Skills-section enumeration for one directory (ticket 63; null = the
   * global face). `force` re-probes instead of serving the cache. */
  listSkills(cwd: string | null, force: boolean): Promise<SkillsReport>
  /** Known-project list for the Project card (ticket 67): distinct session
   * cwds, fs-pre-filtered to plausible candidates, newest first. */
  listProjects(): Promise<KnownProject[]>
  /** Per-skill toggle — writes Pi's settings.json in pi-config format. */
  toggleSkill(row: unknown, enable: boolean): Promise<{ ok: boolean; error?: string }>
  /** Delete one entry under ~/.pi/agent/skills (link targets untouched). */
  deleteSkillEntry(entryPath: string): Promise<{ ok: boolean; error?: string }>
  /** Read-only Finder reveal of the row's skill file. */
  revealSkill(target: string): Promise<boolean>
  /** MCP-section layer report for one directory (ticket 89; null = the
   * global face — no project layers). Read fresh on every call. */
  listMcpConfig(cwd: string | null): Promise<McpLayerReport>
  /** Enable/disable one server — writes ONLY the disabled flag into the
   * project Pi override (adapter /mcp enable|disable semantics). */
  toggleMcpServer(
    serverName: string,
    disabled: boolean,
    cwd: string | null
  ): Promise<{ ok: boolean; path?: string; error?: string }>
  /** Add/edit one server through the form model. mode 'add' writes the
   * chosen /mcp setup target; 'edit' rewrites the winning layer's file. */
  writeMcpServer(
    mode: 'add' | 'edit',
    form: unknown,
    target: 'project' | 'global',
    cwd: string | null,
    preserve?: unknown
  ): Promise<{ ok: boolean; path?: string; error?: string }>
  /** Delete one server from the layer owning its winning definition. */
  removeMcpServer(serverName: string, cwd: string | null): Promise<{ ok: boolean; path?: string; error?: string }>
  /** Read-only Finder reveal of one layer's config file (or its nearest
   * existing ancestor); resolves the revealed path. */
  revealMcpLayer(layerPath: string, cwd: string | null): Promise<{ ok: boolean; target: string | null }>
  /** Packages-section report for one directory (ticket 64; null = the
   * global face — no project layer). `force` re-probes. */
  listPackages(cwd: string | null, force: boolean): Promise<PackagesReport>
  /** Package toggle — writes the pi-config filter format into the
   * scope's settings.json (project writes are trust-gated in main). */
  togglePackage(
    scope: 'global' | 'project',
    source: string,
    enable: boolean,
    cwd: string | null
  ): Promise<{ ok: boolean; error?: string }>
  /** Install/remove one package through the SDK's own package manager
   * (op host, one at a time); progress streams to onPackagesProgress. */
  installPackage(source: string, local: boolean, cwd: string | null): Promise<PackagesOpOutcome>
  removePackage(source: string, local: boolean, cwd: string | null): Promise<PackagesOpOutcome>
  /** Live progress of a running install/remove (op host relay). */
  onPackagesProgress(listener: (event: PackagesProgressEvent) => void): () => void
}

declare global {
  interface Window {
    picode: {
      versions: {
        app: string
        electron: string
        chrome: string
        node: string
        shell: string
      }
      chat: PicodeChatBridge
      sessions: PicodeSessionsBridge
      settings: PicodeSettingsBridge
      usage: {
        snapshot: () => Promise<UsageSnapshot>
      }
      review: PicodeReviewBridge
      preview: PicodePreviewBridge
      terminal: PicodeTerminalBridge
      notifications: PicodeNotificationsBridge
    }
  }
}

export {}
