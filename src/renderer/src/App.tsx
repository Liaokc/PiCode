import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type JSX } from 'react'
import {
  focusedSession,
  initialRegistryState,
  liveSessionIds,
  registryReducer,
  runningSessionIds
} from '../../shared/session-registry'
import { initialChatState } from '../../shared/chat-reducer'
import type { SessionCommand } from '../../shared/contract'
import { resolvePreviewPath } from '../../shared/preview/policy'
import type { PreviewSelection } from '../../shared/preview/view-model'
import { initialShellUiState, shellUiReducer } from '../../shared/layout-model'
import { initialPanelState, panelReducer } from '../../shared/panel-model'
import { isSessionLive, decideFollowTakeover, FOLLOW_TAKEOVER_REJECTED_TOAST } from '../../shared/sessions/group'
import { sessionDefaultsFromPreferences, DEFAULT_PREFERENCES, type AppPreferences } from '../../shared/preferences'
import { recentProjects, resolveNewTaskProject } from '../../shared/new-task'
import { toastReducer, type ToastLevel, type ToastList } from '../../shared/toast'
import type { AccessMode, ImageAttachment, ThinkingLevel } from '../../shared/contract'
import type { AuthProbeReport } from '../../shared/auth-status'
import type { SessionSummary, TranscriptItem } from '../../shared/sessions/types'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import EmptyState from './components/EmptyState'
import SidePanel from './components/SidePanel'
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
 * Window shell — three zones matching reference screenshots 02/03:
 * [nav sidebar | main zone | collapsible side panel], launched with the
 * panel collapsed and the sidebar visible. The settings window shell
 * (screenshot 09) replaces the workspace zones while open.
 * `VITE_PICODE_PANEL_OPEN=1` expands the panel at startup and
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
  /** File Preview deep-link target (ticket 07) — token increments force reloads. */
  const [previewTarget, setPreviewTarget] = useState<PreviewSelection | null>(null)
  /** Multi-active sessions (ticket 20): per-session view state + focus. */
  const [registry, registryDispatch] = useReducer(registryReducer, undefined, initialRegistryState)
  /** The focused session's view state (registry projection for rendering). */
  const focused = focusedSession(registry)
  const chat = focused?.chat ?? initialChatState()
  const tree = focused?.tree ?? null
  /** True between create/resume and its terminal event. */
  const [creating, setCreating] = useState(false)
  /** New-task empty state (ticket 17): ⌘N swaps the main zone to the chip
   * empty state even while a session is open; no system folder dialog. */
  const [newTaskOpen, setNewTaskOpen] = useState(false)
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
  // and the new-task flow (defaults + "reuse last folder").
  useEffect(() => {
    let cancelled = false
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
      })
      .catch(() => {
        if (!cancelled) notify('Settings could not be loaded — using defaults.', 'error')
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

  /** create_session carrying the settings-window defaults (ticket 11). */
  const sendCreateSession = useCallback((cwd: string): void => {
    const defaults = sessionDefaultsFromPreferences(settings.preferences) ?? undefined
    window.picode.chat.sendToHost({ type: 'create_session', cwd, defaults })
  }, [settings.preferences])

  /** Ticket 17: ⌘N / New Task opens the new-task empty state — no system
   * folder picker. The project chip preselects the fallback chain
   * (active session → last used → recent first); the send creates the
   * session. */
  const handleNewTask = useCallback((): void => {
    setNewTaskOpen(true)
  }, [])

  // ---- global keybindings: ⌘N new task, ⌘K task search ----
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (!event.metaKey || event.shiftKey || event.altKey || event.ctrlKey) return
      if (event.key === 'n' || event.key === 'N') {
        event.preventDefault()
        void handleNewTask()
      } else if (event.key === 'k' || event.key === 'K') {
        event.preventDefault()
        setSearchOpen((open) => !open)
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

  /** The id of the session whose view is on screen (commands target it). */
  const focusedId = registry.focusedId
  /** Latest focus without re-creating the callbacks below. */
  const focusedIdRef = useRef<string | null>(null)
  focusedIdRef.current = focusedId
  /** Target one session-scoped command at the focused session's host
   * (ticket 20 registry semantics). No focus → nothing to target. */
  const sendFocused = useCallback(
    (command: SessionCommand): void => {
      const id = focusedIdRef.current
      if (id !== null) window.picode.chat.sendToHost({ type: 'session_command', sessionId: id, command })
    },
    []
  )

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
    onBuiltinCommand: handleBuiltinCommand
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
   * this app (click = focus, never respawn) and which are running (dot). */
  const inAppIds = liveSessionIds(registry)
  const runningIds = runningSessionIds(registry)

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

  function handleTogglePin(summary: SessionSummary): void {
    setPinnedIds((prev) => {
      const next = new Set(prev)
      if (next.has(summary.id)) next.delete(summary.id)
      else next.add(summary.id)
      try {
        window.localStorage.setItem(PIN_STORAGE_KEY, JSON.stringify([...next]))
      } catch {
        // localStorage unavailable — pinning just won't persist.
      }
      return next
    })
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

  // ---- File Preview deep-links (ticket 07) ----

  /** Open any path (file or folder) in the side panel's Preview tab. */
  const openPreview = useCallback(
    (cwd: string, rawPath: string): void => {
      const absolute = resolvePreviewPath(cwd, rawPath)
      if (absolute === null) return
      setPreviewTarget((prev) => ({ cwd, path: absolute, token: (prev?.token ?? 0) + 1 }))
      panelDispatch({ type: 'open-tab', tab: 'preview' })
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

  const handlePreviewNavigate = useCallback(openPreview, [openPreview])

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

  if (ui.view === 'settings') {
    return (
      <div className="app-shell">
        <TitleBar ui={ui} dispatch={dispatch} />
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

  return (
    <div className="app-shell">
      <TitleBar ui={ui} dispatch={dispatch} />
      <Sidebar
        open={ui.sidebarOpen}
        sessions={sessions}
        activeSessionId={focusedId}
        followedFile={followedFile}
        pinnedIds={pinnedIds}
        inAppIds={inAppIds}
        runningIds={runningIds}
        onTogglePin={handleTogglePin}
        onOpenSession={handleOpenSession}
        onRenameSession={handleRenameSession}
        onNewTask={() => void handleNewTask()}
        onOpenSearch={() => setSearchOpen(true)}
        onOpenSettings={() => dispatch({ type: 'open-settings' })}
      />
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
          // New-task mode (⌘N, ticket 17) and the boot empty state render the
          // same chip empty state; ⌘N shows it even while a session is open.
          <EmptyState
            creating={creating}
            defaultProject={newTaskDefaultProject}
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
        dispatch={panelDispatch}
        onCollapse={() => dispatch({ type: 'close-side-panel' })}
        workspaceCwd={chat.session?.cwd ?? null}
        previewTarget={previewTarget}
        onPreviewNavigate={handlePreviewNavigate}
      />
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
