import { useCallback, useEffect, useReducer, useRef, useState, type JSX } from 'react'
import { chatReducer, initialChatState, type ChatError } from '../../shared/chat-reducer'
import { resolvePreviewPath } from '../../shared/preview/policy'
import type { PreviewSelection } from '../../shared/preview/view-model'
import { initialShellUiState, shellUiReducer } from '../../shared/layout-model'
import { initialPanelState, panelReducer } from '../../shared/panel-model'
import { isSessionLive } from '../../shared/sessions/group'
import type { SessionSummary, SessionTreePayload, TranscriptItem } from '../../shared/sessions/types'
import TitleBar from './components/TitleBar'
import Sidebar, { FOCUS_FILTER_EVENT } from './components/Sidebar'
import EmptyState from './components/EmptyState'
import SidePanel from './components/SidePanel'
import ChatView from './components/ChatView'
import FollowView from './components/FollowView'
import ErrorBanner from './components/ErrorBanner'
import SettingsWindow from './components/SettingsWindow'

const PIN_STORAGE_KEY = 'picode.pinned-sessions'

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

  // ---- session index + sidebar state ----
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [pinnedIds, setPinnedIds] = useState<ReadonlySet<string>>(() => loadPinnedIds())
  const [tree, setTree] = useState<SessionTreePayload | null>(null)
  const [treeOpen, setTreeOpen] = useState(false)
  /** Live Follow: the session file being watched read-only, its transcript. */
  const [followedFile, setFollowedFile] = useState<string | null>(null)
  const [followItems, setFollowItems] = useState<TranscriptItem[]>([])
  /** Transient feedback for session command failures (non-blocking). */
  const [toast, setToast] = useState<string | null>(null)
  const followedFileRef = useRef<string | null>(null)
  followedFileRef.current = followedFile

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
          pendingPromptRef.current = null
          if (pending !== null) window.picode.chat.sendToHost({ type: 'prompt', text: pending })
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
        case 'session_command_error':
          setToast(event.message)
          break
        case 'session_error':
        case 'host_exit':
          setCreating(false)
          pendingPromptRef.current = null
          break
        default:
          break
      }
    })
    // Marker for harness/e2e drivers: the Seam-1 subscription is live and no
    // contract event emitted before this point was seen by the reducer.
    document.documentElement.dataset.chatSubscribed = 'true'
    return unsubscribe
  }, [refreshSessions])

  useEffect(() => {
    if (toast === null) return
    const timer = setTimeout(() => setToast(null), 4_000)
    return () => clearTimeout(timer)
  }, [toast])

  const handleNewTask = useCallback(async (): Promise<void> => {
    const cwd = await window.picode.chat.pickWorkingDirectory()
    if (!cwd) return
    setCreating(true)
    pendingPromptRef.current = null
    window.picode.chat.sendToHost({ type: 'create_session', cwd })
  }, [])

  // ---- global keybindings: ⌘N new task, ⌘K filter tasks ----
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (!event.metaKey || event.shiftKey || event.altKey || event.ctrlKey) return
      if (event.key === 'n' || event.key === 'N') {
        event.preventDefault()
        void handleNewTask()
      } else if (event.key === 'k' || event.key === 'K') {
        event.preventDefault()
        window.dispatchEvent(new Event(FOCUS_FILTER_EVENT))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleNewTask])

  const now = Date.now()

  async function handleComposerSend(text: string): Promise<void> {
    if (chat.session) {
      window.picode.chat.sendToHost({ type: 'prompt', text })
      return
    }
    const cwd = await window.picode.chat.pickWorkingDirectory()
    if (!cwd) return
    setCreating(true)
    pendingPromptRef.current = text
    window.picode.chat.sendToHost({ type: 'create_session', cwd })
  }

  function handleStop(): void {
    window.picode.chat.sendToHost({ type: 'abort_turn' })
  }

  function handleRebuild(): void {
    const cwd = chat.error?.kind === 'host' ? chat.error.cwd : null
    if (!cwd) return
    setCreating(true)
    window.picode.chat.sendToHost({ type: 'create_session', cwd })
  }

  async function handlePickAnotherFolder(): Promise<void> {
    const cwd = await window.picode.chat.pickWorkingDirectory()
    if (!cwd) return
    setCreating(true)
    window.picode.chat.sendToHost({ type: 'create_session', cwd })
  }

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
        <SettingsWindow dispatchShell={dispatch} />
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
        {toast !== null && <div className="toast">{toast}</div>}
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
            onSend={handleComposerSend}
            onStop={handleStop}
            onOpenFile={handleOpenFileFromTranscript}
          />
        ) : (
          <EmptyState creating={creating} onSend={handleComposerSend} />
        )}
      </main>
      <SidePanel
        open={ui.sidePanelOpen}
        panel={panel}
        dispatch={panelDispatch}
        onCollapse={() => dispatch({ type: 'close-side-panel' })}
        reviewCwd={chat.session?.cwd ?? null}
        previewTarget={previewTarget}
        onPreviewNavigate={handlePreviewNavigate}
      />
    </div>
  )
}
