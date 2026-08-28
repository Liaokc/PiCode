import { useEffect, useReducer, useRef, useState, type JSX } from 'react'
import { chatReducer, initialChatState, type ChatError } from '../../shared/chat-reducer'
import { initialShellUiState, shellUiReducer } from '../../shared/layout-model'
import { initialPanelState, panelReducer } from '../../shared/panel-model'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import EmptyState from './components/EmptyState'
import SidePanel from './components/SidePanel'
import ChatView from './components/ChatView'
import ErrorBanner from './components/ErrorBanner'
import SettingsWindow from './components/SettingsWindow'

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
 * ParentToHost commands.
 */
export default function App(): JSX.Element {
  const [ui, dispatch] = useReducer(shellUiReducer, undefined, () => ({
    ...initialShellUiState(),
    sidePanelOpen: import.meta.env.VITE_PICODE_PANEL_OPEN === '1',
    view: import.meta.env.VITE_PICODE_VIEW === 'settings' ? ('settings' as const) : initialShellUiState().view
  }))
  /** Panel tab framework state (tabs, picker, dragged width) — ticket 06. */
  const [panel, panelDispatch] = useReducer(panelReducer, undefined, initialPanelState)
  const [chat, chatDispatch] = useReducer(chatReducer, undefined, initialChatState)
  /** True between create_session and its terminal event. */
  const [creating, setCreating] = useState(false)
  /** Agent errors are dismissible; host/session errors keep their actions. */
  const [dismissedError, setDismissedError] = useState<ChatError | null>(null)
  /** First prompt typed before a folder exists; sent once the session is ready. */
  const pendingPromptRef = useRef<string | null>(null)

  useEffect(() => {
    return window.picode.chat.onHostEvent((event) => {
      chatDispatch(event)
      switch (event.type) {
        case 'session_created': {
          setCreating(false)
          const pending = pendingPromptRef.current
          pendingPromptRef.current = null
          if (pending !== null) window.picode.chat.sendToHost({ type: 'prompt', text: pending })
          break
        }
        case 'session_error':
        case 'host_exit':
          setCreating(false)
          pendingPromptRef.current = null
          break
        default:
          break
      }
    })
  }, [])

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

  const showError = chat.error !== null && chat.error !== dismissedError
  const showTranscript = chat.messages.length > 0 || chat.session !== null

  if (ui.view === 'settings') {
    return (
      <div className="app-shell">
        <TitleBar ui={ui} dispatch={dispatch} />
        <SettingsWindow dispatchShell={dispatch} />
      </div>
    )
  }

  return (
    <div className="app-shell">
      <TitleBar ui={ui} dispatch={dispatch} />
      <Sidebar open={ui.sidebarOpen} onOpenSettings={() => dispatch({ type: 'open-settings' })} />
      <main className="main-zone">
        {showError && chat.error && (
          <ErrorBanner
            error={chat.error}
            onRebuild={handleRebuild}
            onPickAnotherFolder={handlePickAnotherFolder}
            onDismiss={() => setDismissedError(chat.error)}
          />
        )}
        {showTranscript ? (
          <ChatView chat={chat} creating={creating} onSend={handleComposerSend} onStop={handleStop} />
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
      />
    </div>
  )
}
