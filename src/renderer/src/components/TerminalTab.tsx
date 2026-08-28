import { useCallback, useEffect, useRef, useState, type JSX, type PointerEvent } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import {
  initialBridgeProjectorState,
  projectBridgeEvent,
  type BridgeProjectorState
} from '../../../shared/bridge/projector'
import type { HostToParent } from '../../../shared/contract'
import type { PtyFactory, PtyHandle } from '../../../shared/terminal/pty'
import { TerminalSession, type TerminalLifecycle } from '../../../shared/terminal/terminal-session'
import { RefreshIcon, TerminalSquareIcon } from './icons'
import { createTerminalOptions } from '../terminal/theme'

/**
 * Terminal tab (ticket 08). Top pane: the Agent Bridge — a WRITE-ONLY
 * projection of the agent's bash commands and their output (CONTEXT.md:
 * 桥接). It has no key listener, no focus handling, and no path into any
 * pty: keystrokes can never re-enter the agent's execution stream
 * (ADR-0004). Bottom pane: the user's own interactive shell, a full PTY
 * spawned in the main process and driven over the Seam-3 byte channels.
 */

interface TerminalTabProps {
  /** Active session working directory; null when no task is running. */
  cwd: string | null
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

export default function TerminalTab({ cwd }: TerminalTabProps): JSX.Element {
  if (cwd === null) {
    return (
      <div className="review-empty">
        <TerminalSquareIcon size={28} />
        <p className="review-empty-title">No workspace yet</p>
        <p className="review-empty-hint">Start a task in a project folder to anchor the terminal to it.</p>
      </div>
    )
  }
  // Key by cwd: switching tasks replaces the whole workspace (and its shell).
  return <TerminalWorkspace key={cwd} cwd={cwd} />
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
  bridgeTerm: Terminal
  userFit: FitAddon
  bridgeFit: FitAddon
  session: TerminalSession
  projector: BridgeProjectorState
  seenFrames: boolean
}

function TerminalWorkspace({ cwd }: { cwd: string }): JSX.Element {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const userHostRef = useRef<HTMLDivElement | null>(null)
  const bridgeHostRef = useRef<HTMLDivElement | null>(null)
  const kitRef = useRef<TerminalKit | null>(null)
  const [lifecycle, setLifecycle] = useState<TerminalLifecycle>({ phase: 'idle' })
  const [bridgeLive, setBridgeLive] = useState(false)
  const [bridgeRunning, setBridgeRunning] = useState(false)

  useEffect(() => {
    const userHost = userHostRef.current
    const bridgeHost = bridgeHostRef.current
    const root = rootRef.current
    if (!userHost || !bridgeHost || !root) return

    const id = crypto.randomUUID()
    const userTerm = new Terminal({ ...createTerminalOptions(), cursorBlink: true })
    // The bridge pane is write-only: disableStdin AND no onData wiring —
    // there is no code path from its keystrokes to any process.
    const bridgeTerm = new Terminal({ ...createTerminalOptions(), disableStdin: true, cursorBlink: false })
    const userFit = new FitAddon()
    const bridgeFit = new FitAddon()
    userTerm.loadAddon(userFit)
    bridgeTerm.loadAddon(bridgeFit)
    userTerm.open(userHost)
    bridgeTerm.open(bridgeHost)

    const session = new TerminalSession(
      remotePtyFactory(id, window.picode.terminal),
      { write: (data) => userTerm.write(data) },
      (state) => setLifecycle(state)
    )
    // Keystrokes AND terminal query responses (e.g. DA answers the shell
    // waits for) flow out through the session to the pty. The bridge pane
    // deliberately gets NO such wiring.
    userTerm.onData((data) => session.handleInput(data))
    const kit: TerminalKit = {
      id,
      userTerm,
      bridgeTerm,
      userFit,
      bridgeFit,
      session,
      projector: initialBridgeProjectorState,
      seenFrames: false
    }
    kitRef.current = kit

    fitBoth()
    session.start({ cwd, cols: userTerm.cols, rows: userTerm.rows })

    // Agent Bridge: consume the SAME Seam-1 contract stream the chat uses;
    // the projector reduces it to write-only display frames.
    const unwireChat = window.picode.chat.onHostEvent((event: HostToParent) => {
      const projection = projectBridgeEvent(kit.projector, event)
      kit.projector = projection.state
      if (projection.frames.length > 0) {
        bridgeTerm.write(projection.frames.join(''))
        if (!kit.seenFrames) {
          kit.seenFrames = true
          setBridgeLive(true)
        }
      }
      setBridgeRunning(Object.keys(kit.projector.streamed).length > 0)
    })

    const observer = new ResizeObserver(() => fitBoth())
    observer.observe(root)

    function fitBoth(): void {
      const container = rootRef.current
      if (!container || container.clientWidth === 0 || container.clientHeight === 0) return
      try {
        kit.userFit.fit()
        kit.bridgeFit.fit()
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
      unwireChat()
      session.dispose()
      window.picode.terminal.kill(id)
      userTerm.dispose()
      bridgeTerm.dispose()
      kitRef.current = null
    }
  }, [cwd])

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
      <section className="terminal-bridge" aria-label="Agent Bridge">
        <header className="terminal-bridge-header">
          <span className="terminal-bridge-title">Agent Bridge</span>
          <span className="terminal-bridge-status">
            <span className={`terminal-bridge-dot${bridgeRunning ? ' terminal-bridge-dot-running' : ''}`} />
            {bridgeRunning ? 'Agent running' : 'Idle'}
          </span>
        </header>
        <div className="terminal-bridge-body">
          <div className="terminal-xterm-host" ref={bridgeHostRef} />
          {!bridgeLive && (
            <div className="terminal-bridge-placeholder">
              Bash commands the agent runs — and their live output — stream here. Read-only: this pane never
              accepts input.
            </div>
          )}
        </div>
      </section>

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
