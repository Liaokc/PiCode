/**
 * Terminal session controller (Seam-3 consumer): glues one pty to one
 * terminal view. Pure orchestration over the seam interfaces — no xterm, no
 * node-pty, no IPC — so fake-pty byte replays cover projection, input relay,
 * resize, and exit (spec: testing seam #3).
 *
 * Single-direction rule: `handleInput` exists for the USER's interactive
 * pane only. The Bridge feed (src/shared/bridge/feed.ts) folds display
 * state and nothing else — it never sees a write path back into any
 * execution stream.
 */
import type { PtyExitEvent, PtyFactory, PtyHandle } from './pty'

/** Byte sink the session projects pty output into (xterm in the renderer). */
export interface TerminalView {
  write(data: string): void
}

/** Options used to spawn (and restart) the underlying pty. */
export interface TerminalSpawnOptions {
  cwd: string
  cols: number
  rows: number
}

export type TerminalLifecycle =
  | { phase: 'idle' }
  | { phase: 'running' }
  | { phase: 'exited'; exitCode: number; signal: string | null }

export function isCleanExit(state: TerminalLifecycle): boolean {
  return state.phase === 'exited' && state.exitCode === 0 && state.signal === null
}

/** Status frame written into the view when the pty dies. */
export function terminalExitFrame(state: Extract<TerminalLifecycle, { phase: 'exited' }>): string {
  const clean = isCleanExit(state)
  const detail = clean ? '' : state.signal !== null ? ` · signal ${state.signal}` : ` · exit code ${state.exitCode}`
  return `\r\n\u001b[2m[Session ended${detail}]\u001b[0m\r\n`
}

/** Smallest terminal geometry a real pty accepts. */
export const TERMINAL_MIN_COLS = 2
export const TERMINAL_MIN_ROWS = 2

export function isValidTerminalSize(cols: number, rows: number): boolean {
  return (
    Number.isInteger(cols) &&
    Number.isInteger(rows) &&
    cols >= TERMINAL_MIN_COLS &&
    rows >= TERMINAL_MIN_ROWS
  )
}

export class TerminalSession {
  private pty: PtyHandle | null = null
  private unwires: Array<() => void> = []
  private options: TerminalSpawnOptions | null = null
  private lifecycleState: TerminalLifecycle = { phase: 'idle' }

  constructor(
    private readonly factory: PtyFactory,
    private readonly view: TerminalView,
    private readonly onLifecycleChange?: (state: TerminalLifecycle) => void
  ) {}

  get state(): TerminalLifecycle {
    return this.lifecycleState
  }

  /** Spawn the pty. No-op while one is already running. */
  start(options: TerminalSpawnOptions): void {
    if (this.pty) return
    this.options = options
    this.spawn()
  }

  /** Replace the pty with a fresh one using the original spawn options. */
  restart(): void {
    if (!this.options) return
    this.kill()
    this.spawn()
  }

  /** User keystrokes → pty stdin. The Bridge never calls this. */
  handleInput(data: string): void {
    this.pty?.write(data)
  }

  resize(cols: number, rows: number): void {
    if (!this.pty || !isValidTerminalSize(cols, rows)) return
    this.pty.resize(cols, rows)
  }

  kill(): void {
    const pty = this.pty
    this.teardown()
    pty?.kill()
    this.setLifecycle({ phase: 'idle' })
  }

  /** Same as kill: terminal tabs dispose their session on unmount. */
  dispose(): void {
    this.kill()
  }

  private spawn(): void {
    const options = this.options
    if (!options) return
    const pty = this.factory(options)
    this.pty = pty
    this.setLifecycle({ phase: 'running' })
    this.unwires.push(pty.onData((data) => this.view.write(data)))
    this.unwires.push(
      pty.onExit((event: PtyExitEvent) => {
        // Detach first so late output can't land after the status frame.
        this.teardown()
        const exited: TerminalLifecycle = { phase: 'exited', exitCode: event.exitCode, signal: event.signal }
        this.setLifecycle(exited)
        this.view.write(terminalExitFrame(exited))
      })
    )
  }

  private teardown(): void {
    for (const unwire of this.unwires) unwire()
    this.unwires = []
    this.pty = null
  }

  private setLifecycle(state: TerminalLifecycle): void {
    this.lifecycleState = state
    this.onLifecycleChange?.(state)
  }
}
