import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type CSSProperties, type JSX } from 'react'
import {
  awaitingApprovalSessionIds,
  focusedSession,
  initialRegistryState,
  liveSessionIds,
  registryReducer,
  runningSessionIds
} from '../../shared/session-registry'
import { initialChatState } from '../../shared/chat-reducer'
import type { SessionCommand } from '../../shared/contract'
import { resolvePreviewPath } from '../../shared/preview/policy'
import { initialShellUiState, shellUiReducer, SIDEBAR_WIDTH_PX, SIDEBAR_MIN_WIDTH_PX, MAIN_ZONE_MIN_WIDTH_PX, clampSidebarWidth, type ShellUiAction } from '../../shared/layout-model'
import { resolveKeybinding } from '../../shared/keymap'
import { initialPanelState, normalizeRecentlyClosed, panelReducer, PANEL_DEFAULT_WIDTH_PX, PANEL_MIN_WIDTH_PX, clampPanelWidth, type PanelAction } from '../../shared/panel-model'
import { initialDockState, dockReducer } from '../../shared/dock-model'
import { projectPaneMotion } from '../../shared/pane-motion'
import { initialBridgeFeedState, projectBridgeFeed } from '../../shared/bridge/feed'
import { terminalFontStack } from '../../shared/terminal/font'
import { detectNerdFont } from './terminal/probe-font'
import { isSessionLive, decideFollowTakeover, FOLLOW_TAKEOVER_REJECTED_TOAST } from '../../shared/sessions/group'
import {
  baselineReadStates,
  markSessionRead,
  setManualUnread,
  unreadSessionIds,
  type ReadStates
} from '../../shared/sessions/unread'
import type { SessionRowAction } from '../../shared/sessions/context-menu'
import { sessionDefaultsFromPreferences, DEFAULT_PREFERENCES, setSessionArchived, toggleHiddenGroup, type AppPreferences } from '../../shared/preferences'
import { recentProjects, resolveNewTaskProject } from '../../shared/new-task'
import { toastReducer, type ToastLevel, type ToastList } from '../../shared/toast'
import type { AccessMode, ImageAttachment, ThinkingLevel } from '../../shared/contract'
import type { AuthProbeReport } from '../../shared/auth-status'
import type { SessionSummary, TranscriptItem } from '../../shared/sessions/types'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import EmptyState from './components/EmptyState'
import SidePanel from './components/SidePanel'
import BottomDock from './components/BottomDock'
import ChatView, { RENAME_EVENT } from './components/ChatView'
import { OPEN_MODEL_MENU_EVENT, OPEN_THINKING_MENU_EVENT } from './components/Composer'
import FollowView from './components/FollowView'
import { useNowTick } from './components/use-now'
import ErrorBanner from './components/ErrorBanner'
import SettingsWindow from './components/SettingsWindow'
import TaskSearchPalette from './components/TaskSearchPalette'
import ToastStack from './components/ToastStack'
import { TooltipHost } from './components/Tooltip'
import type { ComposerApi } from './components/Composer'

const PIN_STORAGE_KEY = 'picode.pinned-sessions'

interface SettingsSnapshotState {
  preferences: AppPreferences
  lastUsedDirectory: string | null
  auth: AuthProbeReport | null
  authScanning: boolean
}

const INITIAL_SETTINGS_STATE: SettingsSnapshotState = {
  preferences: DEFAULT_PREFERENCES,
  lastUsedDirectory: null,
  auth: null,
  authScanning: false
}

function loadPinnedIds(): Set<string> {
  try {
    const raw = window.localStorage.getItem(PIN_STORAGE_KEY)
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? new Set(parsed.filter((v): v is string => typeof v === 'string')) : new Set()
  } catch {
    return new Set()
  }
}

/**
 * Window shell — matching reference screenshots 02/03 plus the ticket-18
 * bottom docks: [nav sidebar (⌘B) | (main zone | collapsible side panel
 * (⌥⌘B)) above an optionally docked Agent Bridge (⌥⌘J) and terminal (⌘J)],
 * launched with
 * both docks collapsed and the sidebar visible. The settings window shell
 * (screenshot 09) replaces the workspace zones while open.
 * `VITE_PICODE_PANEL_OPEN=1` expands the side panel at startup and
 * `VITE_PICODE_VIEW=settings` opens the settings shell (screenshot-QA hooks).
 *
 * Chat state lives in the session registry (ticket 20, ADR-0006): the
 * Seam-1 IPC contract stream (window.picode.chat.onHostEvent) folds into
 * per-session chat states via the registry; the FOCUSED session's state
 * drives the main zone. Multi-active sessions keep running in the
 * background while only the focused one renders. The composer and all
 * session-level commands target the focused session explicitly
 * (`session_command`); the sidebar consumes the read-only session index
 * (window.picode.sessions) and drives focus / resume / fork / tree
 * navigation / rename write-back / Live Follow.
 */
export default function App(): JSX.Element {
  const [ui, dispatch] = useReducer(shellUiReducer, undefined, () => ({
    ...initialShellUiState(),
    sidePanelOpen: import.meta.env.VITE_PICODE_PANEL_OPEN === '1',
    view: import.meta.env.VITE_PICODE_VIEW === 'settings' ? ('settings' as const) : initialShellUiState().view
  }))
  /** Panel tab framework state (tabs, picker, dragged width) — ticket 06. */
  const [panel, panelDispatch] = useReducer(panelReducer, undefined, initialPanelState)
  /** Bottom dock (ticket 18, sibling-panel revision): ONE frame hosting the
   * terminal (⌘J) and Agent Bridge (⌥⌘J) panels; launches collapsed (18f). */
  const [dock, dockDispatch] = useReducer(dockReducer, undefined, initialDockState)
  /** Deep-link highlight: a bash tool card's Bridge chip opens the panel
   * AND flashes the matching feed entry; cleared after the flash. */
  const [bridgeHighlight, setBridgeHighlight] = useState<string | null>(null)
  /** Agent Bridge feed: the SAME Seam-1 stream folded into a read-only
   * command list. Folded at the App level so hiding the dock or visiting
   * the settings shell never loses projection history. */
  const [bridgeFeed, bridgeFeedDispatch] = useReducer(projectBridgeFeed, undefined, () => initialBridgeFeedState)
  /** Nerd Font probe (starship glyphs): resolved once per window lifetime. */
  const fontStack = useMemo(() => terminalFontStack(detectNerdFont()), [])
  /** Multi-active sessions (ticket 20): per-session view state + focus. */
  const [registry, registryDispatch] = useReducer(registryReducer, undefined, initialRegistryState)
  /** The focused session's view state (registry projection for rendering). */
  const focused = focusedSession(registry)
  const chat = focused?.chat ?? initialChatState()
  const tree = focused?.tree ?? null
  /** The id of the session whose view is on screen (commands target it). */
  const focusedId = registry.focusedId
  /** Latest focus/registry without re-creating the callbacks below. */
  const focusedIdRef = useRef<string | null>(null)
  focusedIdRef.current = focusedId
  const registryRef = useRef(registry)
  registryRef.current = registry
  /** True between create/resume and its terminal event. */
  const [creating, setCreating] = useState(false)
  /** New-task empty state (ticket 17): ⌘N swaps the main zone to the chip
   * empty state even while a session is open; no system folder dialog. */
  const [newTaskOpen, setNewTaskOpen] = useState(false)
  /** Project cwd PRESELECTED for the new-task chip (ticket 19: the group
   * row's hover action opens the state with that project's chip). Only
   * meaningful while the new-task state is open — the boot empty state and
   * ⌘N follow the ticket-17 fallback chain. */
  const [newTaskPreset, setNewTaskPreset] = useState<string | null>(null)
  /** First prompt typed before a folder exists; sent once the session is ready. */
  const pendingPromptRef = useRef<string | null>(null)
  /** Images typed (pasted) before a folder exists; attached to the first prompt. */
  const pendingImagesRef = useRef<ImageAttachment[] | null>(null)

  // ---- session index + sidebar state ----
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [pinnedIds, setPinnedIds] = useState<ReadonlySet<string>>(() => loadPinnedIds())
  const [treeOpen, setTreeOpen] = useState(false)
  /** Live Follow: the session file being watched read-only, its transcript. */
  const [followedFile, setFollowedFile] = useState<string | null>(null)
  const [followItems, setFollowItems] = useState<TranscriptItem[]>([])
  /** Global toast stack (ticket 11): the single non-blocking notice surface. */
  const [toasts, dispatchToast] = useReducer(toastReducer, [] as ToastList)
  const toastIdRef = useRef(0)
  /** ⌘K task-search palette (ticket 11). */
  const [searchOpen, setSearchOpen] = useState(false)
  /** Settings snapshot: preferences + last used directory + auth report. */
  const [settings, setSettings] = useState<SettingsSnapshotState>(INITIAL_SETTINGS_STATE)
  /** True once the boot settings snapshot has landed (ticket 28): the
   * read-state persistence effect must not baseline against the empty
   * defaults — that could overwrite watermarks persisted by a previous run
   * and lose unread state for sessions that grew while the app was closed. */
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  /** Pane-motion arming (ticket 40): flipped one double-rAF after the boot
   * settings snapshot has seeded the persisted pane widths AND painted —
   * the seed is a style change after first paint, and animating it would
   * wiggle the boot frame. Both load outcomes arm (the failure path never
   * seeds, so it can arm immediately too). */
  const [paneMotionArmed, setPaneMotionArmed] = useState(false)
  /** Recently closed persistence guard (ticket 31): the JSON of the last
   * hydrated/written history, so no-op renders never write preferences. */
  const lastClosedTabsJsonRef = useRef(JSON.stringify([]))
  const followedFileRef = useRef<string | null>(null)
  followedFileRef.current = followedFile

  /** Push a toast with a monotonic id. */
  const notify = useCallback((message: string, level: ToastLevel): void => {
    toastIdRef.current += 1
    dispatchToast({ type: 'push', message, level, id: toastIdRef.current })
  }, [])
  const dismissToastById = useCallback((id: number): void => {
    dispatchToast({ type: 'dismiss', id })
  }, [])

  // Settings load once at boot; the snapshot drives both the settings window
  // and the new-task flow (defaults + "reuse last folder"). The snapshot's
  // recently closed tab history also hydrates the panel framework (ticket 31).
  useEffect(() => {
    let cancelled = false
    /** Arm pane transitions one double-rAF after the CURRENT commit paints
     * (one-shot; App lives for the window's lifetime). Called only from the
     * not-cancelled branches below. */
    const armPaneMotionAfterPaint = (): void => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setPaneMotionArmed(true))
      })
    }
    void window.picode.settings
      .get()
      .then((snapshot) => {
        if (cancelled) return
        setSettings({
          preferences: snapshot.preferences,
          lastUsedDirectory: snapshot.lastUsedDirectory,
          auth: null,
          authScanning: false
        })
        // Ticket 29: restore the persisted pane widths exactly once at boot,
        // through the RAW dispatches — seeding must not re-persist.
        dispatch({ type: 'set-sidebar-width', width: snapshot.preferences.sidebarWidth })
        panelDispatch({ type: 'set-width', width: snapshot.preferences.panelWidth })
        setSettingsLoaded(true)
        const closed = normalizeRecentlyClosed(snapshot.preferences.recentlyClosedTabs)
        panelDispatch({ type: 'hydrate-recently-closed', entries: closed })
        // Seed the persistence guard with the normalized form so hydration
        // alone never triggers a redundant write-back.
        lastClosedTabsJsonRef.current = JSON.stringify(closed)
        // Ticket 40: the width seed must PAINT before transitions arm, or
        // the boot frame animates the restore.
        armPaneMotionAfterPaint()
      })
      .catch(() => {
        if (cancelled) return
        notify('Settings could not be loaded — using defaults.', 'error')
        armPaneMotionAfterPaint()
      })
    return () => {
      cancelled = true
    }
  }, [notify])

  const refreshSessions = useCallback((): void => {
    void window.picode.sessions
      .list()
      .then((list) => setSessions(list))
      .catch(() => setSessions([]))
  }, [])

  useEffect(() => {
    refreshSessions()
    return window.picode.sessions.onIndexChanged(refreshSessions)
  }, [refreshSessions])

  useEffect(() => {
    return window.picode.sessions.onFollowUpdate((update) => {
      if (update.file !== followedFileRef.current) return
      setFollowItems((prev) => [...prev, ...update.items])
    })
  }, [])

  useEffect(() => {
    const unsubscribe = window.picode.chat.onHostEvent((event) => {
      // Every event (focused or not) folds into its session's view state.
      registryDispatch(event)
      // The Bridge feed folds the SAME stream read-only (ticket 18) — all
      // sessions' bash commands stream to the observation panel.
      bridgeFeedDispatch(event)
      // App-level side effects key off the event's SESSION SCOPE (ticket 20:
      // wrapped `session_event` from the supervisor, or the legacy unwrapped
      // shape the visual harnesses inject).
      const scopeType = event.type === 'session_event' ? event.event.type : event.type
      const scopeId = event.type === 'session_event' ? event.sessionId : event.type === 'session_created' ? event.sessionId : null
      switch (scopeType) {
        case 'session_created': {
          setCreating(false)
          setNewTaskOpen(false)
          setFollowedFile(null)
          window.picode.sessions.unfollow()
          // Focus is switching to the announced session — the branch-history
          // panel belongs to the view being left behind; close it.
          setTreeOpen(false)
          // Ticket 21: the announced session's workspace may differ from the
          // view before it (create / resume / fork / takeover) — refresh the
          // read-only branch readout for THIS session's host.
          if (scopeId !== null) {
            window.picode.chat.sendToHost({ type: 'session_command', sessionId: scopeId, command: { type: 'get_branch' } })
          }
          const pending = pendingPromptRef.current
          const pendingImages = pendingImagesRef.current
          pendingPromptRef.current = null
          pendingImagesRef.current = null
          if ((pending !== null || pendingImages !== null) && scopeId !== null) {
            window.picode.chat.sendToHost({
              type: 'session_command',
              sessionId: scopeId,
              command: {
                type: 'prompt',
                text: pending !== null && pending.trim() !== '' ? pending : 'Describe the attached images.',
                images: pendingImages ?? undefined
              }
            })
          }
          refreshSessions()
          break
        }
        case 'history_loaded':
          // Transcript replay arrived — the session is usable.
          setCreating(false)
          break
        case 'session_renamed':
          refreshSessions()
          break
        case 'fork_created':
          // Kept for contract symmetry: the fork now continues in-host (the
          // host re-announces via session_created); just refresh the index.
          refreshSessions()
          break
        case 'approval_required': {
          // Ticket 25: a gate hit in a BACKGROUND session must reach the
          // user even while another view is on screen — the pill parks in
          // that session's registry state, the sidebar lights its orange
          // badge, and the OS notification offers the jump (a click never
          // approves anything). The focused session's pill is already on
          // screen, so it never notifies.
          const req = event.type === 'session_event' ? event.event : event
          if (req.type === 'approval_required' && scopeId !== null && scopeId !== focusedIdRef.current) {
            const session = registryRef.current.sessions.find((s) => s.id === scopeId)
            const title = session?.name ?? session?.cwd?.split('/').pop() ?? null
            window.picode.notifications.requestApproval({ sessionId: scopeId, toolName: req.toolName, title })
          }
          break
        }
        case 'host_notice': {
          const notice = event.type === 'session_event' ? event.event : event
          if (notice.type === 'host_notice') notify(notice.message, notice.level)
          break
        }
        case 'session_command_error':
          if (event.type === 'session_event') notify(event.event.message, 'error')
          else notify(event.message, 'error')
          break
        case 'session_error':
        case 'host_exit':
          setCreating(false)
          pendingPromptRef.current = null
          pendingImagesRef.current = null
          break
        default:
          break
      }
    })
    // Marker for harness/e2e drivers: the Seam-1 subscription is live and no
    // contract event emitted before this point was seen by the registry.
    document.documentElement.dataset.chatSubscribed = 'true'
    return unsubscribe
  }, [refreshSessions, notify])

  // System-notification deep link (ticket 25): clicking a background
  // session's approval notification foregrounds the window and mounts THAT
  // session's view — a pure focus change (ticket 20 registry semantics),
  // same routing as a sidebar click on a live in-app session. The pill
  // waits inside the session; the click never approves anything.
  useEffect(() => {
    return window.picode.notifications.onFocusRequest((sessionId) => {
      registryDispatch({ type: 'focus_session', sessionId })
      setNewTaskOpen(false)
      setTreeOpen(false)
      stopFollowing()
    })
  }, [])

  /** create_session carrying the settings-window defaults (ticket 11). */
  const sendCreateSession = useCallback((cwd: string): void => {
    const defaults = sessionDefaultsFromPreferences(settings.preferences) ?? undefined
    window.picode.chat.sendToHost({ type: 'create_session', cwd, defaults })
  }, [settings.preferences])

  /** Ticket 17/19: ⌘N, the New Task row or a group's hover action opens the
   * new-task empty state — no system folder picker. A preset cwd preselects
   * that project's chip; otherwise the chip follows the fallback chain
   * (active session → last used → recent first). */
  const handleNewTask = useCallback((presetCwd?: string): void => {
    // ⌘N × dock (ticket 17×18 decision, dock-model.dockForNewTask): the
    // new-task state replaces the MAIN ZONE only — the dock shell stays
    // exactly as the user arranged it.
    dockDispatch({ type: 'dock-for-new-task' })
    setNewTaskPreset(presetCwd ?? null)
    setNewTaskOpen(true)
  }, [])

  // ---- global keybindings (ticket 27, shared/keymap.ts): ⌘N new task,
  // ⌘K task search, ⌘B left sidebar, ⌥⌘B side panel, ⌘J terminal dock,
  // ⌥⌘J bridge dock — resolved table-driven by PHYSICAL event.code, so the
  // ⌥⌘ chords survive macOS Option rewriting the character (⌥B → "∫").
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      const action = resolveKeybinding(event)
      if (action === null) return
      // Toggling chrome must never leak into the composer/editor —
      // preventDefault keeps the keystroke ours (tickets 18b/27).
      event.preventDefault()
      switch (action.type) {
        case 'new-task':
          void handleNewTask()
          break
        case 'task-search':
          setSearchOpen((open) => !open)
          break
        case 'toggle-sidebar':
          dispatch({ type: 'toggle-sidebar' })
          break
        case 'toggle-side-panel':
          dispatch({ type: 'toggle-side-panel' })
          break
        case 'toggle-terminal-panel':
          dockDispatch({ type: 'toggle-terminal-panel' })
          break
        case 'toggle-bridge-panel':
          dockDispatch({ type: 'toggle-bridge-panel' })
          break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleNewTask])

  // Escape leaves the new-task state (ticket 17) — except inside the
  // composer, the chip dropdown, and the ⌘K palette, where Escape closes
  // menus/overlays locally.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      const target = event.target
      if (target instanceof Element && target.closest('.composer, .newtask-pop, .palette-overlay')) return
      setNewTaskOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Honest liveness: the Live Follow badge and its Open control (ticket 24)
  // must flip when a watched session goes quiet even if no file changes —
  // a periodic re-render keeps the derived live state from going stale.
  const now = useNowTick(30_000)

  /** Target one session-scoped command at the focused session's host
   * (ticket 20 registry semantics). No focus → nothing to target. */
  const sendFocused = useCallback(
    (command: SessionCommand): void => {
      const id = focusedIdRef.current
      if (id !== null) window.picode.chat.sendToHost({ type: 'session_command', sessionId: id, command })
    },
    []
  )

  /** Ticket 21: refresh the read-only branch readout when the focused
   * session changes (session switch). Hostless entries are skipped — the
   * supervisor would only answer with a null readout. */
  const focusedAliveRef = useRef(false)
  focusedAliveRef.current = (focused?.chat.session ?? null) !== null
  useEffect(() => {
    if (focusedId === null || !focusedAliveRef.current) return
    window.picode.chat.sendToHost({ type: 'session_command', sessionId: focusedId, command: { type: 'get_branch' } })
  }, [focusedId])

  async function handleComposerSend(text: string, images: ImageAttachment[] = []): Promise<void> {
    if (focusedId !== null && chat.session !== null) {
      window.picode.chat.sendToHost({
        type: 'session_command',
        sessionId: focusedId,
        command: { type: 'prompt', text, images: images.length > 0 ? images : undefined }
      })
      return
    }
    startTask(null, text, images)
  }

  /** Ticket 17: start a task from the empty state in the chip's project.
   * null degrades to the system folder picker (brand-new machine with no
   * recent projects); the first message (text + images) rides the pending
   * chain and is delivered once the session exists. */
  function startTask(cwd: string | null, text: string, images: ImageAttachment[]): void {
    void (async () => {
      const project = cwd ?? (await window.picode.chat.pickWorkingDirectory())
      if (!project) return
      setCreating(true)
      // Both survive the session boot: text AND images are delivered together
      // as the first prompt once the session exists.
      pendingPromptRef.current = text
      pendingImagesRef.current = images.length > 0 ? images : null
      sendCreateSession(project)
    })()
  }

  function handleSteer(text: string, images: ImageAttachment[] = []): void {
    sendFocused({ type: 'steer_prompt', text, images: images.length > 0 ? images : undefined })
  }

  function handleFollowUp(text: string, images: ImageAttachment[] = []): void {
    sendFocused({ type: 'follow_up_prompt', text, images: images.length > 0 ? images : undefined })
  }

  function handleClearQueue(): void {
    sendFocused({ type: 'clear_queue' })
  }

  function handleSetAccessMode(mode: AccessMode): void {
    sendFocused({ type: 'set_access_mode', mode })
  }

  function handleSetModel(providerId: string, modelId: string): void {
    sendFocused({ type: 'set_model', providerId, modelId })
  }

  function handleSetThinkingLevel(level: ThinkingLevel): void {
    sendFocused({ type: 'set_thinking_level', level })
  }

  function handleListFiles(requestId: string, query: string): void {
    sendFocused({ type: 'list_files', requestId, query })
  }

  async function handlePickImages(): Promise<ImageAttachment[]> {
    return window.picode.chat.pickImages()
  }

  function handleApprove(toolCallId: string, remember: boolean): void {
    sendFocused({ type: 'approve_tool', toolCallId, remember })
  }

  function handleDeny(toolCallId: string, reason: string): void {
    sendFocused({ type: 'deny_tool', toolCallId, reason })
  }

  /** The `/` menu's built-in commands drive PiCode's own controls. */
  function handleBuiltinCommand(name: string): void {
    switch (name) {
      case 'new':
        void handleNewTask()
        break
      case 'tree':
        if (chat.session) {
          sendFocused({ type: 'request_tree' })
          setTreeOpen(true)
        }
        break
      case 'copy': {
        const lastAssistant = [...chat.entries].reverse().find((entry) => entry.role === 'assistant')
        const text = lastAssistant && lastAssistant.role === 'assistant'
          ? lastAssistant.parts.filter((p) => p.kind === 'text').map((p) => p.text).join('\n\n')
          : ''
        if (text !== '') void navigator.clipboard.writeText(text)
        break
      }
      case 'name':
        if (chat.session) window.dispatchEvent(new Event(RENAME_EVENT))
        break
      case 'model':
        window.dispatchEvent(new Event(OPEN_MODEL_MENU_EVENT))
        break
      case 'thinking':
        window.dispatchEvent(new Event(OPEN_THINKING_MENU_EVENT))
        break
      case 'compact':
        if (chat.session) sendFocused({ type: 'compact_session' })
        break
      default:
        break
    }
  }

  /** Ticket 38: a hand-typed retired `/` command was blocked — point at
   * the control that owns the job. */
  function handleSlashHint(hint: string): void {
    notify(hint, 'info')
  }

  const composerApi: ComposerApi = {
    onSend: (text, images) => void handleComposerSend(text, images),
    onSteer: handleSteer,
    onFollowUp: handleFollowUp,
    onStop: handleStop,
    onSetAccessMode: handleSetAccessMode,
    onSetModel: handleSetModel,
    onSetThinkingLevel: handleSetThinkingLevel,
    onClearQueue: handleClearQueue,
    onListFiles: handleListFiles,
    onPickImages: () => handlePickImages(),
    onBuiltinCommand: handleBuiltinCommand,
    onSlashHint: handleSlashHint
  }

  function handleStop(): void {
    sendFocused({ type: 'abort_turn' })
  }

  function handleRebuild(): void {
    const cwd = chat.error?.kind === 'host' ? chat.error.cwd : null
    if (!cwd) return
    setCreating(true)
    sendCreateSession(cwd)
  }

  async function handlePickAnotherFolder(): Promise<void> {
    // Recovery path: the user explicitly wants a DIFFERENT folder, so always
    // open the picker regardless of the startup preference.
    const cwd = await window.picode.chat.pickWorkingDirectory()
    if (!cwd) return
    setCreating(true)
    sendCreateSession(cwd)
  }

  // ---- settings window callbacks (ticket 11) ----

  const handleSetPreferences = useCallback((patch: Partial<AppPreferences>): void => {
    void window.picode.settings
      .set(patch)
      .then((preferences) => setSettings((prev) => ({ ...prev, preferences })))
      .catch(() => undefined)
  }, [])

  // ---- pane width persistence + main-zone floor (ticket 29 + round-2
  // feedback): components dispatch width actions only; THESE wrappers clamp
  // each commit to `window − other pane − MAIN_ZONE_MIN_WIDTH_PX` — the
  // exact bound the CSS max-widths render with, so committed state always
  // equals the rendered layout — then persist real changes (a no-op drag
  // never touches disk). The boot seed bypasses them on purpose —
  // restoring persisted widths must not re-persist.
  const sidebarWidthRef = useRef(ui.sidebarWidth)
  sidebarWidthRef.current = ui.sidebarWidth
  const panelWidthRef = useRef(panel.width)
  panelWidthRef.current = panel.width
  const sidebarOpenRef = useRef(ui.sidebarOpen)
  sidebarOpenRef.current = ui.sidebarOpen
  const panelOpenRef = useRef(ui.sidePanelOpen)
  panelOpenRef.current = ui.sidePanelOpen

  const dispatchShellPersisting = useCallback(
    (action: ShellUiAction): void => {
      if (action.type === 'set-sidebar-width') {
        const bound = Math.max(
          SIDEBAR_MIN_WIDTH_PX,
          window.innerWidth - (panelOpenRef.current ? panelWidthRef.current : 0) - MAIN_ZONE_MIN_WIDTH_PX
        )
        const width = Math.min(clampSidebarWidth(action.width), bound)
        dispatch({ type: 'set-sidebar-width', width })
        if (width !== sidebarWidthRef.current) void handleSetPreferences({ sidebarWidth: width })
        return
      }
      if (action.type === 'reset-sidebar-width') {
        dispatch(action)
        if (sidebarWidthRef.current !== SIDEBAR_WIDTH_PX) void handleSetPreferences({ sidebarWidth: SIDEBAR_WIDTH_PX })
        return
      }
      dispatch(action)
    },
    [handleSetPreferences]
  )

  const dispatchPanelPersisting = useCallback(
    (action: PanelAction): void => {
      if (action.type === 'set-width') {
        const bound = Math.max(
          PANEL_MIN_WIDTH_PX,
          window.innerWidth - (sidebarOpenRef.current ? sidebarWidthRef.current : 0) - MAIN_ZONE_MIN_WIDTH_PX
        )
        const width = Math.min(clampPanelWidth(action.width), bound)
        panelDispatch({ type: 'set-width', width })
        if (width !== panelWidthRef.current) void handleSetPreferences({ panelWidth: width })
        return
      }
      if (action.type === 'reset-width') {
        panelDispatch(action)
        if (panelWidthRef.current !== PANEL_DEFAULT_WIDTH_PX) void handleSetPreferences({ panelWidth: PANEL_DEFAULT_WIDTH_PX })
        return
      }
      panelDispatch(action)
    },
    [handleSetPreferences]
  )

  const handleRefreshAuth = useCallback((): void => {
    setSettings((prev) => ({ ...prev, authScanning: true }))
    void window.picode.settings
      .refreshAuth()
      .then((auth) => setSettings((prev) => ({ ...prev, auth, authScanning: false })))
      .catch(() =>
        // Resolve with an error report (not null) so the auto-scan effect in
        // the Models section never loops on a persistent failure.
        setSettings((prev) => ({
          ...prev,
          authScanning: false,
          auth: {
            scannedAt: Date.now(),
            providers: [],
            models: [],
            error: 'PiCode could not run the auth probe.'
          }
        }))
      )
  }, [])

  // ---- sidebar interactions ----

  /** Registry projection for the sidebar: which sessions have a live host in
   * this app (click = focus, never respawn), which are running (animated
   * dot), and which are parked at the approval gate (orange badge, ticket 25). */
  const inAppIds = liveSessionIds(registry)
  const runningIds = runningSessionIds(registry)
  const awaitingIds = awaitingApprovalSessionIds(registry)

  /** The view on screen (ticket 28): the followed session while Follow is
   * active, else the focused one. While following, the suspended focused
   * session is NOT on screen — its background growth counts as unread. */
  const followActive = followedFile !== null
  const onViewId = followActive ? null : focusedId
  const onViewFile = followedFile

  /** Unread projection for the sidebar (ticket 28): the indigo dot set.
   * Archived sessions never show unread (ticket 35 consumes the filter
   * slot ticket 28 reserved). */
  const archivedIds = useMemo(
    () => new Set(settings.preferences.archivedSessions),
    [settings.preferences.archivedSessions]
  )
  const unreadIds = useMemo(
    () => unreadSessionIds(sessions, settings.preferences.readStates, onViewId, onViewFile, archivedIds),
    [sessions, settings.preferences.readStates, onViewId, onViewFile, archivedIds]
  )

  /** Read-state persistence (ticket 28): first sightings are baselined at
   * their current mtime (upgrades never flood the sidebar with unread), and
   * the view on screen chases its file's mtime while it grows — reading is
   * the only way to make it read. One effect, one upsert patch per change;
   * the content guard keeps degenerate preference stores (visual fixtures)
   * from looping. Archiving ships in ticket 35; the filter slot is reserved
   * in unreadSessionIds. */
  const lastReadStatesPatchRef = useRef('')
  useEffect(() => {
    if (!settingsLoaded) return
    const prev = settings.preferences.readStates
    const { next, changed: baselined } = baselineReadStates(
      prev,
      sessions.map((s) => ({ id: s.id, modifiedAt: s.modifiedAt }))
    )
    const onView = followActive
      ? sessions.find((s) => s.file === followedFile)
      : sessions.find((s) => s.id === focusedId)
    let merged = next
    let chased = false
    if (onView) {
      const read = markSessionRead(merged, onView.id, onView.modifiedAt)
      merged = read.next
      chased = read.changed
    }
    if (!baselined && !chased) return
    const patch: Partial<AppPreferences> = {
      readStates: Object.fromEntries(
        Object.entries(merged).filter(([id, entry]) => prev[id] !== entry)
      ) as ReadStates
    }
    const key = JSON.stringify(patch.readStates)
    if (key === lastReadStatesPatchRef.current) return
    lastReadStatesPatchRef.current = key
    handleSetPreferences(patch)
  }, [sessions, focusedId, followedFile, settings.preferences.readStates, handleSetPreferences, followActive, settingsLoaded])

  /** Hidden project groups (ticket 19) — a read-only Set projection of the
   * persisted preference; the pure filter consumes it in the Sidebar. */
  const hiddenCwds = useMemo(
    () => new Set(settings.preferences.hiddenGroups),
    [settings.preferences.hiddenGroups]
  )

  /** Hide a project group (ticket 19): local preference only, recovered in
   * Settings → General → Hidden projects. Session files are untouched and
   * ⌘K / the Groups all-tasks view still reach every session. */
  function handleHideGroup(cwd: string): void {
    handleSetPreferences({ hiddenGroups: toggleHiddenGroup(settings.preferences.hiddenGroups, cwd, true) })
    notify('Group hidden. Restore it in Settings → General → Hidden projects.', 'info')
  }

  function handleOpenSession(summary: SessionSummary): void {
    if (summary.id === focusedId) {
      // Already the focused view — leave Follow mode, if any.
      stopFollowing()
      return
    }
    if (inAppIds.has(summary.id)) {
      // Multi-active sessions (ticket 20): the host is alive in this app —
      // switching is a pure focus change. Nothing is terminated; the view
      // remounts already caught up and live.
      registryDispatch({ type: 'focus_session', sessionId: summary.id })
      setTreeOpen(false)
      stopFollowing()
      return
    }
    if (isSessionLive(summary, now)) {
      // Live Follow (read-only): the session is running in another window.
      void startFollowing(summary)
      return
    }
    // Resume: same session file the TUI would continue — full Handoff.
    resumeSession(summary)
  }

  async function startFollowing(summary: SessionSummary): Promise<void> {
    const snapshot = await window.picode.sessions.follow(summary.file)
    if (!snapshot) return
    setFollowedFile(snapshot.file)
    setFollowItems(snapshot.items)
    setNewTaskOpen(false)
  }

  function stopFollowing(): void {
    if (followedFileRef.current === null) return
    window.picode.sessions.unfollow()
    setFollowedFile(null)
    setFollowItems([])
  }

  /** Resume a session file through the existing Handoff chain: the same
   * command the sidebar's open path uses. The host re-announces via
   * session_created, which auto-switches the main zone to that session. */
  function resumeSession(summary: SessionSummary): void {
    stopFollowing()
    setCreating(true)
    setNewTaskOpen(false)
    window.picode.chat.sendToHost({
      type: 'resume_session',
      sessionFile: summary.file,
      cwd: summary.cwd
    })
  }

  /** Ticket 24 Open action: promote the followed session into a full one.
   * Liveness is RE-CHECKED at click time against a fresh index scan — the
   * button may have rendered while the session was quiet, but the TUI could
   * have woken up since. Still live → toast rejection; quiet → resume. */
  async function handleFollowOpen(): Promise<void> {
    const file = followedFileRef.current
    if (file === null) return
    let summary = (await window.picode.sessions.list()).find((s) => s.file === file) ?? null
    if (summary === null) summary = sessions.find((s) => s.file === file) ?? null
    switch (decideFollowTakeover(summary, Date.now())) {
      case 'still-live':
        notify(FOLLOW_TAKEOVER_REJECTED_TOAST, 'info')
        return
      case 'missing':
        notify('This session no longer exists on disk.', 'error')
        return
      case 'resume':
        if (summary !== null) resumeSession(summary)
        return
    }
  }

  function setPinnedId(id: string, pinned: boolean): void {
    setPinnedIds((prev) => {
      if (prev.has(id) === pinned) return prev
      const next = new Set(prev)
      if (pinned) next.add(id)
      else next.delete(id)
      try {
        window.localStorage.setItem(PIN_STORAGE_KEY, JSON.stringify([...next]))
      } catch {
        // localStorage unavailable — pinning just won't persist.
      }
      return next
    })
  }

  function handleTogglePin(summary: SessionSummary): void {
    setPinnedId(summary.id, !pinnedIds.has(summary.id))
  }

  /** Archive one session (ticket 35): a local-preference projection only —
   * the session file is untouched, the row leaves both sidebar views, and
   * ⌘K still reaches it. Archiving a pinned task implicitly unpins it
   * (pinned and archived never conflict). */
  function handleArchiveSession(summary: SessionSummary): void {
    handleSetPreferences({
      archivedSessions: setSessionArchived(settings.preferences.archivedSessions, summary.id, true)
    })
    if (pinnedIds.has(summary.id)) setPinnedId(summary.id, false)
    notify('Task archived. Restore it from the Archived view.', 'info')
  }

  /** One-click restore from the archive view (ticket 35): the row returns
   * to both sidebar lists on the next projection pass. */
  function handleRestoreSession(summary: SessionSummary): void {
    handleSetPreferences({
      archivedSessions: setSessionArchived(settings.preferences.archivedSessions, summary.id, false)
    })
  }

  /** The context menu's manual unread toggle (ticket 35 on ticket 28's
   * model bit): Mark as Unread pins the flag; Mark as Read advances the
   * watermark. The per-session patch upserts through mergePreferences, so
   * the read-chaser's writes never lose this entry (and focusing the
   * session still clears the flag — reading is the only way to make it
   * read). */
  function handleToggleUnread(summary: SessionSummary): void {
    const unread = unreadIds.has(summary.id)
    const { next, changed } = setManualUnread(settings.preferences.readStates, summary.id, !unread, summary.modifiedAt)
    if (!changed) return
    const entry = next[summary.id]
    if (entry === undefined) return
    handleSetPreferences({ readStates: { [summary.id]: entry } })
  }

  /** Everything the row context menu dispatches past the sidebar (ticket
   * 35). Reveal/copy ride the read-only context-action IPC; view-trace
   * seats the entry here — its consumption (the call-trace tab) lands with
   * ticket 36. */
  function handleSessionAction(session: SessionSummary, action: SessionRowAction): void {
    switch (action) {
      case 'archive':
        handleArchiveSession(session)
        break
      case 'restore':
        handleRestoreSession(session)
        break
      case 'toggle-unread':
        handleToggleUnread(session)
        break
      case 'reveal-in-finder':
        void window.picode.sessions.contextAction({ kind: 'reveal', file: session.file })
        break
      case 'copy-task-path':
        void window.picode.sessions.contextAction({ kind: 'copy', text: session.cwd })
        break
      case 'copy-session-file':
        void window.picode.sessions.contextAction({ kind: 'copy', text: session.file })
        break
      case 'copy-session-id':
        void window.picode.sessions.contextAction({ kind: 'copy', text: session.id })
        break
      case 'view-trace':
        // Ticket 36: the trace tab's identity is the session file; opening
        // it follows the same deep-link semantics as file previews (open
        // new tab / focus existing, panel unfurled).
        panelDispatch({ type: 'open-tab', tab: { kind: 'trace', sessionFile: session.file } })
        dispatch({ type: 'open-side-panel' })
        break
    }
  }

  function handleRenameSession(summary: SessionSummary, name: string): void {
    // Optimistic local update; the authoritative list arrives via the index.
    setSessions((prev) =>
      prev.map((s) => (s.file === summary.file ? { ...s, name, title: name } : s))
    )
    if (inAppIds.has(summary.id)) {
      // A session hosted in this app renames through ITS host process
      // (leaf consistency) — focused or not (ticket 20).
      window.picode.chat.sendToHost({
        type: 'session_command',
        sessionId: summary.id,
        command: { type: 'set_session_label', name }
      })
      return
    }
    void window.picode.sessions.rename(summary.file, name).then(refreshSessions)
  }

  /** Rename the ACTIVE session from the chat topbar (host write-back path). */
  function handleRenameActive(name: string): void {
    const activeId = focusedId
    if (!activeId) return
    setSessions((prev) => prev.map((s) => (s.id === activeId ? { ...s, name, title: name } : s)))
    sendFocused({ type: 'set_session_label', name })
  }

  function handleNavigateTree(entryId: string): void {
    sendFocused({ type: 'navigate_tree', entryId })
  }

  /** Fork the session at an entry (branch-history panel or message action
   * row, ticket 16). The host swaps to the branched session by re-announcing
   * session_created — the toast confirms the switch the user just got. */
  function handleFork(entryId: string): void {
    sendFocused({ type: 'fork_session', entryId })
    notify('Forked to a new session.', 'info')
  }

  // ---- File Preview deep-links (ticket 07, multi-tab semantics ticket 31) ----

  /** Open any path (file or folder) in the side panel: a NEW tab per path,
   * or focus the existing tab for the same path. Never replaces another
   * tab's target — deep links leave the current tabs exactly as they are. */
  const openPreview = useCallback(
    (cwd: string, rawPath: string): void => {
      const absolute = resolvePreviewPath(cwd, rawPath)
      if (absolute === null) return
      panelDispatch({ type: 'open-tab', tab: { kind: 'file', cwd, path: absolute } })
      dispatch({ type: 'open-side-panel' })
    },
    [panelDispatch, dispatch]
  )

  const handleOpenFileFromTranscript = useCallback(
    (path: string): void => {
      const cwd = chat.session?.cwd
      if (cwd) openPreview(cwd, path)
    },
    [chat.session?.cwd, openPreview]
  )

  /** Fold/unfold one turn's work container (ticket 23) — a UI action routed
   * to the focused session through the registry. */
  const handleToggleTurn = useCallback((turnId: string): void => {
    registryDispatch({ type: 'toggle_turn_expanded', turnId })
  }, [])

  /** Tool card → Bridge deep link: open the panel in place and flash the
   * matching feed entry (the panel clears it after the flash). */
  const handleShowInBridge = useCallback((toolCallId: string): void => {
    dockDispatch({ type: 'open-bridge-panel' })
    setBridgeHighlight(toolCallId)
  }, [])
  const clearBridgeHighlight = useCallback(() => setBridgeHighlight(null), [])

  const handlePreviewNavigate = openPreview

  /** Recently closed persistence (ticket 31): every change to the panel's
   * closed-history stack writes the whole list into preferences (capacity 10,
   * already enforced by the reducer). The JSON guard keeps hydration and
   * no-op renders from writing back the same value forever. */
  useEffect(() => {
    if (!settingsLoaded) return
    const json = JSON.stringify(panel.recentlyClosed)
    if (json === lastClosedTabsJsonRef.current) return
    lastClosedTabsJsonRef.current = json
    handleSetPreferences({ recentlyClosedTabs: panel.recentlyClosed })
  }, [panel.recentlyClosed, settingsLoaded, handleSetPreferences])

  // Ticket 17: recent workspaces for the project chip's dropdown, and the
  // chip's default (fixed → focused session → last used → recent first).
  // Anchored at the FOCUSED session's cwd (ticket 20: chat IS the focused
  // session's view state).
  const recentWorkspaceList = useMemo(() => recentProjects(sessions), [sessions])
  const newTaskDefaultProject = useMemo(
    () =>
      resolveNewTaskProject({
        mode: settings.preferences.newTaskDirectory,
        fixedProject: settings.preferences.newTaskFixedProject,
        activeSessionCwd: chat.session?.cwd ?? null,
        lastUsedDirectory: settings.lastUsedDirectory,
        recentProjects: recentWorkspaceList
      }),
    [
      settings.preferences.newTaskDirectory,
      settings.preferences.newTaskFixedProject,
      settings.lastUsedDirectory,
      chat.session?.cwd,
      recentWorkspaceList
    ]
  )

  // Ticket 20: the error dismissal lives in the session registry (per
  // session) — no local state.
  const showError = chat.error !== null && chat.error !== focused?.dismissedError
  const showFollow = followedFile !== null
  const showTranscript = chat.entries.length > 0 || chat.session !== null
  /** The group-row preset is only meaningful while the new-task state is
   * open — closing it (Escape, session create, follow) falls back to the
   * ticket-17 chain so the boot empty state never inherits a stale preset. */
  const newTaskPresetActive = newTaskOpen ? newTaskPreset : null

  if (ui.view === 'settings') {
    return (
      <div className="app-shell">
        <TitleBar ui={ui} dispatch={dispatch} dispatchDock={dockDispatch} />
        <SettingsWindow
          dispatchShell={dispatch}
          preferences={settings.preferences}
          lastUsedDirectory={settings.lastUsedDirectory}
          auth={settings.auth}
          authScanning={settings.authScanning}
          onSetPreferences={handleSetPreferences}
          onRefreshAuth={handleRefreshAuth}
        />
        <TooltipHost />
      </div>
    )
  }

  const followedSummary = sessions.find((s) => s.file === followedFile) ?? null
  const followLive = followedSummary !== null && isSessionLive(followedSummary, now)
  /** Dock tab-strip session label (18c): the FOCUSED session's announced
   * name from the registry (ticket 20 spine), falling back to the workspace
   * folder name; null hides the chip when no session is focused. */
  const sessionLabel = focused?.name ?? chat.session?.cwd.split('/').pop() ?? null

  /** Pane-motion projection (ticket 40, Seam-1): each pane's open/close
   * variable carries the ANIMATED size (0px when closed) while the content
   * variable keeps the pane's real size, so pane content clips instead of
   * reflowing while the edge slides. */
  const sidebarMotion = projectPaneMotion(ui.sidebarOpen, ui.sidebarWidth)
  const panelMotion = projectPaneMotion(ui.sidePanelOpen, panel.width)
  const dockMotion = projectPaneMotion(dock.open, dock.height)

  return (
    <div
      className="app-shell"
      data-pane-motion-armed={paneMotionArmed ? '' : undefined}
      style={
        {
          // Pane bounds for the CSS max-widths (round-2 feedback) AND the
          // pane open/close motion (ticket 40): the pane vars are the
          // animated sizes (0px while closed); the content vars pin each
          // pane's real size so content clips, never reflows. Each pane
          // yields before the main zone's floor does.
          '--sidebar-w': sidebarMotion.pane,
          '--sidebar-content-w': sidebarMotion.content,
          '--panel-w': panelMotion.pane,
          '--panel-content-w': panelMotion.content,
          '--dock-h': dockMotion.pane,
          '--dock-content-h': dockMotion.content
        } as CSSProperties
      }
    >
      <TitleBar ui={ui} dispatch={dispatch} dispatchDock={dockDispatch} />
      <Sidebar
        open={ui.sidebarOpen}
        width={ui.sidebarWidth}
        dispatch={dispatchShellPersisting}
        sessions={sessions}
        activeSessionId={focusedId}
        followedFile={followedFile}
        pinnedIds={pinnedIds}
        inAppIds={inAppIds}
        runningIds={runningIds}
        awaitingIds={awaitingIds}
        unreadIds={unreadIds}
        archivedIds={archivedIds}
        onTogglePin={handleTogglePin}
        onOpenSession={handleOpenSession}
        onRenameSession={handleRenameSession}
        onSessionAction={handleSessionAction}
        onNewTask={(presetCwd) => void handleNewTask(presetCwd)}
        hiddenCwds={hiddenCwds}
        onHideGroup={handleHideGroup}
        onOpenPreview={openPreview}
        onOpenSearch={() => setSearchOpen(true)}
        onOpenSettings={() => dispatch({ type: 'open-settings' })}
        view={settings.preferences.sidebarView}
        sort={settings.preferences.sidebarSort}
        onViewChange={(view) => handleSetPreferences({ sidebarView: view })}
        onSortChange={(sort) => handleSetPreferences({ sidebarSort: sort })}
      />
      <div className="workspace-column">
        <div className="workspace-row">
          <main className="main-zone">
            {showError && chat.error && (
              <ErrorBanner
                error={chat.error}
                onRebuild={handleRebuild}
                onPickAnotherFolder={handlePickAnotherFolder}
                onDismiss={() => registryDispatch({ type: 'dismiss_error' })}
              />
            )}
            {showFollow ? (
              <FollowView
                title={followedSummary?.title ?? followedFile ?? ''}
                items={followItems}
                live={followLive}
                onStop={stopFollowing}
                onOpen={() => void handleFollowOpen()}
              />
            ) : newTaskOpen || !showTranscript ? (
              // New-task mode (⌘N, ticket 17; group hover action, ticket 19) and
              // the boot empty state render the same chip empty state. The key
              // remounts it per preset so the group's chip preselection always
              // wins over a leftover dropdown override; ⌘N and the boot state
              // share the chain-default key and keep their draft across ⌘N.
              <EmptyState
                key={newTaskPresetActive ?? 'newtask-chain'}
                creating={creating}
                defaultProject={newTaskPresetActive ?? newTaskDefaultProject}
                recentProjects={recentWorkspaceList}
                onStart={startTask}
                onOpenFolder={() => window.picode.chat.pickWorkingDirectory()}
                composerApi={composerApi}
              />
            ) : (
              <ChatView
                chat={chat}
                creating={creating}
                tree={tree}
                branch={focused?.branch ?? null}
                treeOpen={treeOpen}
                onToggleTree={() => {
                  if (!treeOpen && chat.session) sendFocused({ type: 'request_tree' })
                  setTreeOpen((v) => !v)
                }}
                onRename={handleRenameActive}
                onNavigateTree={handleNavigateTree}
                onFork={handleFork}
                onCloseTree={() => setTreeOpen(false)}
                onOpenFile={handleOpenFileFromTranscript}
                onShowInBridge={handleShowInBridge}
                onToggleTurn={handleToggleTurn}
                composerApi={composerApi}
                onApprove={handleApprove}
                onDeny={handleDeny}
              />
            )}
          </main>
          <SidePanel
            open={ui.sidePanelOpen}
            panel={panel}
            dispatch={dispatchPanelPersisting}
            workspaceCwd={chat.session?.cwd ?? null}
            onPreviewNavigate={handlePreviewNavigate}
          />
        </div>
        {/* Bottom dock: ONE frame, sibling panels — terminal (⌘J) and the
            Agent Bridge feed (⌥⌘J / tool-card deep link) swap in place. */}
        <BottomDock
          dock={dock}
          workspaceCwd={chat.session?.cwd ?? null}
          sessionLabel={sessionLabel}
          shellName={window.picode.versions.shell}
          fontStack={fontStack}
          bridgeFeed={bridgeFeed}
          bridgeHighlight={bridgeHighlight}
          onBridgeHighlightDone={clearBridgeHighlight}
          dispatch={dockDispatch}
        />
      </div>
      {searchOpen && (
        <TaskSearchPalette
          sessions={sessions}
          onOpenSession={handleOpenSession}
          onClose={() => setSearchOpen(false)}
        />
      )}
      <ToastStack toasts={toasts} onDismiss={dismissToastById} />
      <TooltipHost />
    </div>
  )
}
