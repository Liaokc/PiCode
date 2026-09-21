import { useCallback, useEffect, useRef, useState, type Dispatch, type JSX, type PointerEvent, type RefObject } from 'react'
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
 * Terminal panel (ticket 18): the user's own interactive shell inside the
 * shared bottom dock frame (BottomDock.tsx). The header carries the ZCode
 * tab strip (「Terminal | <shell> | <session> ×」) plus new/close actions.
 * A full PTY spawns in the main process and is driven over the Seam-3 byte
 * channels; the panel stays mounted across dock hide and panel switches,
 * so a live shell survives both (closing the tab — chip × — kills it).
 */

interface TerminalDockProps {
  /** Whether a terminal tab exists (drives workspace vs empty state). */
  tabOpen: boolean
  /** Active session working directory; null shows the empty state. */
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
  /** Focus-request sequence from the dock model (ticket 105): every bump
   * means a dock action just made this panel the visible one (⌘J / titlebar
   * toggle / bridge swap-in / +) and the shell must take input focus. */
  focusSeq: number
}

export default function TerminalDock({
  tabOpen,
  workspaceCwd,
  sessionLabel,
  shellName,
  gen,
  fontStack,
  dispatch,
  focusSeq
}: TerminalDockProps): JSX.Element {
  // TerminalWorkspace registers its live focus handle here on mount and
  // clears it on unmount. The seq-diff lives in THIS component (the dock
  // frame keeps it mounted across task switches) so a workspace remount
  // without a bump — switching tasks while the dock shows — never steals
  // focus; only dock actions do.
  const focusTerminalRef = useRef<(() => void) | null>(null)
  const lastFocusSeq = useRef(focusSeq)

  useEffect(() => {
    if (focusSeq === lastFocusSeq.current) return
    lastFocusSeq.current = focusSeq
    // xterm must be visible before focus lands: an open run flips the
    // frame's visibility on the first animation frame (pane-motion
    // transitions visibility) and a sibling swap just left display:none —
    // a focus() into a stale-rendered element would silently miss. Double
    // rAF = one painted frame with the host actually rendered, then focus
    // (ticket 105: mount-timing discretion).
    let inner = 0
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => focusTerminalRef.current?.())
    })
    return () => {
      cancelAnimationFrame(outer)
      cancelAnimationFrame(inner)
    }
  }, [focusSeq])

  return (
    <>
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
                onClick={() => dispatch({ type: 'close-terminal-tab' })}
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
          <Tooltip label="Hide panel">
            <button type="button" className="tb-btn" aria-label="Hide panel" onClick={() => dispatch({ type: 'hide-dock' })}>
              <CloseIcon size={13} />
            </button>
          </Tooltip>
        </span>
      </header>

      <div className="terminal-dock-body">
        {!tabOpen || workspaceCwd === null ? (
          <div className="review-empty">
            <TerminalSquareIcon size={28} />
            <p className="review-empty-title">No workspace yet</p>
            <p className="review-empty-hint">Start a task in a project folder to anchor the terminal to it.</p>
          </div>
        ) : (
          // Keyed by workspace + generation: switching tasks replaces the
          // whole workspace (and its shell); + respawns a fresh shell in place.
          <TerminalWorkspace
            key={`${workspaceCwd}:${gen}`}
            cwd={workspaceCwd}
            fontStack={fontStack}
            focusRef={focusTerminalRef}
          />
        )}
      </div>
    </>
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

interface TerminalWorkspaceProps {
  cwd: string
  fontStack: string
  /** Registered with the live kit's focus and nulled on unmount (ticket
   * 105): the parent's seq-diff calls it exactly when a dock action asks
   * for shell focus. */
  focusRef: RefObject<(() => void) | null>
}

function TerminalWorkspace({ cwd, fontStack, focusRef }: TerminalWorkspaceProps): JSX.Element {
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
    focusRef.current = () => kit.userTerm.focus()

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
      focusRef.current = null
    }
    // focusRef is a stable ref object handed down by TerminalDock; it is
    // listed to satisfy the hooks lint and can never re-run this effect.
  }, [cwd, fontStack, focusRef])

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
