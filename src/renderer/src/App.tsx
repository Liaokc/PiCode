import { useCallback, useEffect, useReducer, useRef, useState, type JSX } from 'react'
import { chatReducer, initialChatState, type ChatError } from '../../shared/chat-reducer'
import { resolvePreviewPath } from '../../shared/preview/policy'
import type { PreviewSelection } from '../../shared/preview/view-model'
import { initialShellUiState, shellUiReducer } from '../../shared/layout-model'
import { initialPanelState, panelReducer } from '../../shared/panel-model'
import { isSessionLive } from '../../shared/sessions/group'
import { sessionDefaultsFromPreferences, type AppPreferences } from '../../shared/preferences'
import { toastReducer, type ToastLevel, type ToastList } from '../../shared/toast'
import type { AccessMode, ImageAttachment, ThinkingLevel } from '../../shared/contract'
import type { AuthProbeReport } from '../../shared/auth-status'
import type { SessionSummary, SessionTreePayload, TranscriptItem } from '../../shared/sessions/types'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import EmptyState from './components/EmptyState'
import SidePanel from './components/SidePanel'
import ChatView, { RENAME_EVENT } from './components/ChatView'
import { OPEN_MODEL_MENU_EVENT, OPEN_THINKING_MENU_EVENT } from './components/Composer'
import FollowView from './components/FollowView'
import ErrorBanner from './components/ErrorBanner'
import SettingsWindow from './components/SettingsWindow'
import TaskSearchPalette from './components/TaskSearchPalette'
import ToastStack from './components/ToastStack'
import type { ComposerApi } from './components/Composer'

const PIN_STORAGE_KEY = 'picode.pinned-sessions'

interface SettingsSnapshotState {
  preferences: AppPreferences
  lastUsedDirectory: string | null
  auth: AuthProbeReport | null
  authScanning: boolean
}

const INITIAL_SETTINGS_STATE: SettingsSnapshotState = {
  preferences: { defaultModel: null, defaultThinkingLevel: null, newTaskDirectory: 'ask' },
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
 * Chat state is folded exclusively from the Seam-1 IPC contract stream
 * (window.picode.chat.onHostEvent → chatReducer); the composer only issues
 * ParentToHost commands. The sidebar consumes the read-only session index
 * (window.picode.sessions) and drives resume / fork / tree navigation /
 * rename write-back / Live Follow.
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
  const [chat, chatDispatch] = useReducer(chatReducer, undefined, initialChatState)
  /** True between create/resume and its terminal event. */
  const [creating, setCreating] = useState(false)
  /** Agent errors are dismissible; host/session errors keep their actions. */
  const [dismissedError, setDismissedError] = useState<ChatError | null>(null)
  /** First prompt typed before a folder exists; sent once the session is ready. */
  const pendingPromptRef = useRef<string | null>(null)
  /** Images typed (pasted) before a folder exists; attached to the first prompt. */
  const pendingImagesRef = useRef<ImageAttachment[] | null>(null)

  // ---- session index + sidebar state ----
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [pinnedIds, setPinnedIds] = useState<ReadonlySet<string>>(() => loadPinnedIds())
  const [tree, setTree] = useState<SessionTreePayload | null>(null)
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
      chatDispatch(event)
      switch (event.type) {
        case 'session_created': {
          setCreating(false)
          setFollowedFile(null)
          window.picode.sessions.unfollow()
          setTree(null)
          setTreeOpen(false)
          const pending = pendingPromptRef.current
          const pendingImages = pendingImagesRef.current
          pendingPromptRef.current = null
          pendingImagesRef.current = null
          if (pending !== null || pendingImages !== null) {
            window.picode.chat.sendToHost({
              type: 'prompt',
              text: pending !== null && pending.trim() !== '' ? pending : 'Describe the attached images.',
              images: pendingImages ?? undefined
            })
          }
          refreshSessions()
          break
        }
        case 'history_loaded':
          // Transcript replay arrived — the session is usable.
          setCreating(false)
          break
        case 'session_tree':
          setTree(event.tree)
          break
        case 'session_renamed':
          refreshSessions()
          break
        case 'fork_created':
          // Kept for contract symmetry: the fork now continues in-host (the
          // host re-announces via session_created); just refresh the index.
          setTreeOpen(false)
          refreshSessions()
          break
        case 'host_notice':
          notify(event.message, event.level)
          break
        case 'session_command_error':
          notify(event.message, 'error')
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
    // contract event emitted before this point was seen by the reducer.
    document.documentElement.dataset.chatSubscribed = 'true'
    return unsubscribe
  }, [refreshSessions, notify])

  /** Working directory for a new task: the startup preference reuses the last
   * folder when set (falling back to the picker when there is none yet). */
  const resolveNewTaskDirectory = useCallback(async (): Promise<string | null> => {
    if (settings.preferences.newTaskDirectory === 'last-used' && settings.lastUsedDirectory) {
      return settings.lastUsedDirectory
    }
    return window.picode.chat.pickWorkingDirectory()
  }, [settings.preferences.newTaskDirectory, settings.lastUsedDirectory])

  /** create_session carrying the settings-window defaults (ticket 11). */
  const sendCreateSession = useCallback((cwd: string): void => {
    const defaults = sessionDefaultsFromPreferences(settings.preferences) ?? undefined
    window.picode.chat.sendToHost({ type: 'create_session', cwd, defaults })
  }, [settings.preferences])

  const handleNewTask = useCallback(async (): Promise<void> => {
    const cwd = await resolveNewTaskDirectory()
    if (!cwd) return
    setCreating(true)
    pendingPromptRef.current = null
    sendCreateSession(cwd)
  }, [resolveNewTaskDirectory, sendCreateSession])

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

  const now = Date.now()

  async function handleComposerSend(text: string, images: ImageAttachment[] = []): Promise<void> {
    if (chat.session) {
      window.picode.chat.sendToHost({ type: 'prompt', text, images: images.length > 0 ? images : undefined })
      return
    }
    const cwd = await resolveNewTaskDirectory()
    if (!cwd) return
    setCreating(true)
    // Both survive the folder pick: text AND images are delivered together
    // as the first prompt once the session exists.
    pendingPromptRef.current = text
    pendingImagesRef.current = images.length > 0 ? images : null
    sendCreateSession(cwd)
  }

  function handleSteer(text: string, images: ImageAttachment[] = []): void {
    window.picode.chat.sendToHost({ type: 'steer_prompt', text, images: images.length > 0 ? images : undefined })
  }

  function handleFollowUp(text: string, images: ImageAttachment[] = []): void {
    window.picode.chat.sendToHost({ type: 'follow_up_prompt', text, images: images.length > 0 ? images : undefined })
  }

  function handleClearQueue(): void {
    window.picode.chat.sendToHost({ type: 'clear_queue' })
  }

  function handleSetAccessMode(mode: AccessMode): void {
    window.picode.chat.sendToHost({ type: 'set_access_mode', mode })
  }

  function handleSetModel(providerId: string, modelId: string): void {
    window.picode.chat.sendToHost({ type: 'set_model', providerId, modelId })
  }

  function handleSetThinkingLevel(level: ThinkingLevel): void {
    window.picode.chat.sendToHost({ type: 'set_thinking_level', level })
  }

  function handleListFiles(requestId: string, query: string): void {
    window.picode.chat.sendToHost({ type: 'list_files', requestId, query })
  }

  async function handlePickImages(): Promise<ImageAttachment[]> {
    return window.picode.chat.pickImages()
  }

  function handleApprove(toolCallId: string, remember: boolean): void {
    window.picode.chat.sendToHost({ type: 'approve_tool', toolCallId, remember })
  }

  function handleDeny(toolCallId: string, reason: string): void {
    window.picode.chat.sendToHost({ type: 'deny_tool', toolCallId, reason })
  }

  /** The `/` menu's built-in commands drive PiCode's own controls. */
  function handleBuiltinCommand(name: string): void {
    switch (name) {
      case 'new':
        void handleNewTask()
        break
      case 'tree':
        if (chat.session) {
          window.picode.chat.sendToHost({ type: 'request_tree' })
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
        if (chat.session) window.picode.chat.sendToHost({ type: 'compact_session' })
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
    window.picode.chat.sendToHost({ type: 'abort_turn' })
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

  function handleOpenSession(summary: SessionSummary): void {
    if (summary.id === chat.session?.sessionId) {
      // Already open in the chat view — leave Follow mode, if any.
      stopFollowing()
      return
    }
    if (isSessionLive(summary, now)) {
      // Live Follow (read-only): the session is running in another window.
      void startFollowing(summary)
      return
    }
    // Resume: same session file the TUI would continue — full Handoff.
    stopFollowing()
    setCreating(true)
    window.picode.chat.sendToHost({
      type: 'resume_session',
      sessionFile: summary.file,
      cwd: summary.cwd
    })
  }

  async function startFollowing(summary: SessionSummary): Promise<void> {
    const snapshot = await window.picode.sessions.follow(summary.file)
    if (!snapshot) return
    setFollowedFile(snapshot.file)
    setFollowItems(snapshot.items)
  }

  function stopFollowing(): void {
    if (followedFileRef.current === null) return
    window.picode.sessions.unfollow()
    setFollowedFile(null)
    setFollowItems([])
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
    if (summary.id === chat.session?.sessionId) {
      // Active session: write back through its host process (leaf consistency).
      window.picode.chat.sendToHost({ type: 'set_session_label', name })
      return
    }
    void window.picode.sessions.rename(summary.file, name).then(refreshSessions)
  }

  /** Rename the ACTIVE session from the chat topbar (host write-back path). */
  function handleRenameActive(name: string): void {
    const activeId = chat.session?.sessionId
    if (!activeId) return
    setSessions((prev) => prev.map((s) => (s.id === activeId ? { ...s, name, title: name } : s)))
    setTree((prev) => (prev !== null ? { ...prev, name } : prev))
    window.picode.chat.sendToHost({ type: 'set_session_label', name })
  }

  function handleNavigateTree(entryId: string): void {
    window.picode.chat.sendToHost({ type: 'navigate_tree', entryId })
  }

  function handleFork(entryId: string): void {
    window.picode.chat.sendToHost({ type: 'fork_session', entryId })
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

  const handlePreviewNavigate = useCallback(openPreview, [openPreview])

  const showError = chat.error !== null && chat.error !== dismissedError
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
        activeSessionId={chat.session?.sessionId ?? null}
        followedFile={followedFile}
        pinnedIds={pinnedIds}
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
            onDismiss={() => setDismissedError(chat.error)}
          />
        )}
        {showFollow ? (
          <FollowView
            title={followedSummary?.title ?? followedFile ?? ''}
            items={followItems}
            live={followLive}
            onStop={stopFollowing}
          />
        ) : showTranscript ? (
          <ChatView
            chat={chat}
            creating={creating}
            tree={tree}
            treeOpen={treeOpen}
            onToggleTree={() => {
              if (!treeOpen && chat.session) window.picode.chat.sendToHost({ type: 'request_tree' })
              setTreeOpen((v) => !v)
            }}
            onRename={handleRenameActive}
            onNavigateTree={handleNavigateTree}
            onFork={handleFork}
            onCloseTree={() => setTreeOpen(false)}
            onOpenFile={handleOpenFileFromTranscript}
            composerApi={composerApi}
            onApprove={handleApprove}
            onDeny={handleDeny}
          />
        ) : (
          <EmptyState creating={creating} composerApi={composerApi} />
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
    </div>
  )
}
