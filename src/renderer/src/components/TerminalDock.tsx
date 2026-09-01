import { useCallback, useEffect, useRef, useState, type Dispatch, type JSX, type PointerEvent } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import type { DockAction } from '../../../shared/dock-model'
import type { PtyFactory, PtyHandle } from '../../../shared/terminal/pty'
import { TerminalSession, type TerminalLifecycle } from '../../../shared/terminal/terminal-session'
import { CloseIcon, PlusIcon, RefreshIcon, TerminalSquareIcon } from './icons'
import Tooltip from './Tooltip'
import { createTerminalOptions } from '../terminal/theme'

/**
 * Bottom terminal dock (ticket 18) — VS Code-style panel under the chat:
 * full workspace-column width, draggable height (top-edge handle → fit
 * addon), opened by ⌘J or the titlebar toggle. The header carries the ZCode
 * tab strip (「Terminal | <shell> | <session> ×」) plus new/close actions.
 *
 * One pane: the user's own interactive shell — a full PTY spawned in the
 * main process and driven over the Seam-3 byte channels. The Agent Bridge
 * projection is NOT here anymore: since the 18-feedback revision it lives
 * in its own Bridge Dock (BridgeDock.tsx, ⌘B), keeping the user shell and
 * the read-only projection visually separate.
 *
 * Visibility and lifecycle are independent (dock-model): hiding the panel
 * keeps the workspace mounted so a live shell survives ⌘J cycles; closing
 * the tab (chip ×) unmounts and kills the shell.
 */

interface TerminalDockProps {
  /** Panel visibility (⌘J / titlebar toggle); false hides but keeps the shell. */
  open: boolean
  /** Whether a terminal tab exists at all; false unmounts everything. */
  mounted: boolean
  /** Panel height in px (drag handle dispatches set-height). */
  height: number
  /** Active session working directory; null shows the dock's empty state. */
  workspaceCwd: string | null
  /** Active session display label for the tab strip; null hides the chip. */
  sessionLabel: string | null
  /** Login shell display name (e.g. "fish") from the preload versions block. */
  shellName: string
  /** Dock mount generation — bumping it respawns the shell (new session). */
  gen: number
  /** Probe-resolved mono/Nerd-Font stack for the shell (starship glyphs). */
  fontStack: string
  dispatch: Dispatch<DockAction>
}

export default function TerminalDock({
  open,
  mounted,
  height,
  workspaceCwd,
  sessionLabel,
  shellName,
  gen,
  fontStack,
  dispatch
}: TerminalDockProps): JSX.Element | null {
  const drag = useRef<{ startY: number; startHeight: number } | null>(null)

  if (!mounted) return null

  function startResize(event: PointerEvent<HTMLDivElement>): void {
    event.preventDefault()
    drag.current = { startY: event.clientY, startHeight: height }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function moveResize(event: PointerEvent<HTMLDivElement>): void {
    if (!drag.current) return
    // Dragging up grows the panel (dock hangs from the bottom edge).
    dispatch({ type: 'set-height', height: drag.current.startHeight + (drag.current.startY - event.clientY) })
  }

  function endResize(event: PointerEvent<HTMLDivElement>): void {
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  return (
    <section className="terminal-dock" aria-label="Terminal" style={{ height, display: open ? undefined : 'none' }}>
      <div
        className="terminal-dock-resizer"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize terminal panel"
        onPointerDown={startResize}
        onPointerMove={moveResize}
        onPointerUp={endResize}
        onDoubleClick={() => dispatch({ type: 'reset-height' })}
      />

      <header className="terminal-dock-header">
        <span className="terminal-dock-title">Terminal</span>
        <span className="terminal-dock-chip">{shellName}</span>
        {sessionLabel !== null && (
          <span className="terminal-dock-chip terminal-dock-session-chip">
            <span className="terminal-dock-chip-label">{sessionLabel}</span>
            <Tooltip label="Close terminal tab">
              <button
                type="button"
                className="terminal-dock-chip-close"
                aria-label="Close terminal tab"
                onClick={() => dispatch({ type: 'close-tab' })}
              >
                <CloseIcon size={11} />
              </button>
            </Tooltip>
          </span>
        )}
        <span className="terminal-dock-actions">
          <Tooltip label="New terminal session">
            <button
              type="button"
              className="tb-btn"
              aria-label="New terminal session"
              onClick={() => dispatch({ type: 'new-session' })}
            >
              <PlusIcon size={15} />
            </button>
          </Tooltip>
          <Tooltip label="Hide terminal">
            <button
              type="button"
              className="tb-btn"
              aria-label="Hide terminal"
              onClick={() => dispatch({ type: 'hide-dock' })}
            >
              <CloseIcon size={13} />
            </button>
          </Tooltip>
        </span>
      </header>

      <div className="terminal-dock-body">
        {workspaceCwd === null ? (
          <div className="review-empty">
            <TerminalSquareIcon size={28} />
            <p className="review-empty-title">No workspace yet</p>
            <p className="review-empty-hint">Start a task in a project folder to anchor the terminal to it.</p>
          </div>
        ) : (
          // Keyed by workspace + generation: switching tasks replaces the
          // whole workspace (and its shell); + respawns a fresh shell in place.
          <TerminalWorkspace key={`${workspaceCwd}:${gen}`} cwd={workspaceCwd} fontStack={fontStack} />
        )}
      </div>
    </section>
  )
}

/** Main-process pty seen through the Seam-3 handle, addressed by `id`. */
function remotePtyFactory(id: string, api: Window['picode']['terminal']): PtyFactory {
  return ({ cwd, cols, rows }) => {
    void api.start(id, cwd, cols, rows)
    const handle: PtyHandle = {
      pid: null,
      write: (data) => api.write(id, data),
      resize: (nextCols, nextRows) => api.resize(id, nextCols, nextRows),
      kill: () => api.kill(id),
      onData: (listener) =>
        api.onData((message) => {
          if (message.id === id) listener(message.data)
        }),
      onExit: (listener) =>
        api.onExit((message) => {
          if (message.id === id) listener({ exitCode: message.exitCode, signal: message.signal })
        })
    }
    return handle
  }
}

function exitDetailLabel(state: TerminalLifecycle): string {
  if (state.phase !== 'exited') return ''
  if (state.signal !== null) return `Session ended · signal ${state.signal}`
  if (state.exitCode !== 0) return `Session ended · exit code ${state.exitCode}`
  return 'Session ended'
}

interface TerminalKit {
  id: string
  userTerm: Terminal
  userFit: FitAddon
  session: TerminalSession
}

function TerminalWorkspace({ cwd, fontStack }: { cwd: string; fontStack: string }): JSX.Element {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const userHostRef = useRef<HTMLDivElement | null>(null)
  const kitRef = useRef<TerminalKit | null>(null)
  const [lifecycle, setLifecycle] = useState<TerminalLifecycle>({ phase: 'idle' })

  useEffect(() => {
    const userHost = userHostRef.current
    const root = rootRef.current
    if (!userHost || !root) return

    const id = crypto.randomUUID()
    const userTerm = new Terminal({ ...createTerminalOptions(fontStack), cursorBlink: true })
    const userFit = new FitAddon()
    userTerm.loadAddon(userFit)
    userTerm.open(userHost)

    const session = new TerminalSession(
      remotePtyFactory(id, window.picode.terminal),
      { write: (data) => userTerm.write(data) },
      (state) => setLifecycle(state)
    )
    // Keystrokes AND terminal query responses (e.g. DA answers the shell
    // waits for) flow out through the session to the pty.
    userTerm.onData((data) => session.handleInput(data))
    const kit: TerminalKit = { id, userTerm, userFit, session }
    kitRef.current = kit

    fit()
    session.start({ cwd, cols: userTerm.cols, rows: userTerm.rows })

    const observer = new ResizeObserver(() => fit())
    observer.observe(root)

    function fit(): void {
      const container = rootRef.current
      if (!container || container.clientWidth === 0 || container.clientHeight === 0) return
      try {
        kit.userFit.fit()
      } catch {
        // Fit before layout settles can fail; the ResizeObserver retries.
        return
      }
      if (kit.session.state.phase === 'running') {
        kit.session.resize(kit.userTerm.cols, kit.userTerm.rows)
      }
    }

    return () => {
      observer.disconnect()
      session.dispose()
      window.picode.terminal.kill(id)
      userTerm.dispose()
      kitRef.current = null
    }
  }, [cwd, fontStack])

  const restart = useCallback((): void => {
    const kit = kitRef.current
    if (!kit) return
    kit.userTerm.reset()
    kit.session.restart()
    kit.userTerm.focus()
  }, [])

  const focusUser = useCallback((event: PointerEvent<HTMLDivElement>): void => {
    // Clicks on the pane's padding should focus the shell like a real terminal.
    event.preventDefault()
    kitRef.current?.userTerm.focus()
  }, [])

  const exited = lifecycle.phase === 'exited'

  return (
    <div className="terminal-tab" ref={rootRef}>
      <div className="terminal-user" onPointerDown={focusUser}>
        <div className="terminal-xterm-host" ref={userHostRef} />
      </div>

      {exited && (
        <footer className="terminal-restart-strip">
          <span>{exitDetailLabel(lifecycle)}</span>
          <button type="button" className="terminal-restart-btn" aria-label="Restart terminal session" onClick={restart}>
            <RefreshIcon size={12} />
            Restart
          </button>
        </footer>
      )}
    </div>
  )
}
