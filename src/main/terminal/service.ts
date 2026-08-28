/**
 * Terminal service (main process, Seam-3): owns the app's pty instances via
 * the injected PtyFactory and mediates the terminal-dedicated IPC channels
 * (ADR-0004: pty output must NOT travel the per-event JSON contract stream —
 * chunks are coalesced per flush interval into one message).
 *
 * No Electron imports here: the sink is an injected callback object, so the
 * service is unit-testable with a fake pty factory.
 */
import type { PtyFactory, PtyHandle } from '../../shared/terminal/pty'
import { isValidTerminalSize } from '../../shared/terminal/terminal-session'
import type { TerminalDataMessage, TerminalExitMessage } from '../../shared/terminal/messages'

export type { TerminalDataMessage, TerminalExitMessage } from '../../shared/terminal/messages'

export interface TerminalBroadcastSink {
  data(message: TerminalDataMessage): void
  exit(message: TerminalExitMessage): void
}

export interface TerminalStartSpec {
  cwd: string
  cols: number
  rows: number
}

/** Output flush cadence: ~one frame at 60fps, far above typing latency. */
export const TERMINAL_FLUSH_INTERVAL_MS = 16

interface ManagedTerminal {
  pty: PtyHandle
  buffer: string[]
  flushTimer: NodeJS.Timeout | null
}

export class TerminalService {
  private terminals = new Map<string, ManagedTerminal>()

  constructor(
    private readonly factory: PtyFactory,
    private readonly sink: TerminalBroadcastSink,
    private readonly flushIntervalMs: number = TERMINAL_FLUSH_INTERVAL_MS
  ) {}

  /** Spawn a pty under `id`. Returns its pid, or null when the id is taken. */
  start(id: string, spec: TerminalStartSpec): number | null {
    if (this.terminals.has(id)) return null
    const pty = this.factory(spec)
    const terminal: ManagedTerminal = { pty, buffer: [], flushTimer: null }
    this.terminals.set(id, terminal)

    pty.onData((chunk) => {
      terminal.buffer.push(chunk)
      if (terminal.flushTimer === null) {
        terminal.flushTimer = setTimeout(() => this.flush(id), this.flushIntervalMs)
      }
    })
    pty.onExit(({ exitCode, signal }) => {
      // Deliver trailing bytes with the exit so nothing is lost or reordered.
      this.flush(id)
      if (process.env['PICODE_PTY_DEBUG'] === '1') {
        console.log(`[pty-debug] terminal ${id} exit code=${exitCode} signal=${signal ?? '-'} bufferTail=${JSON.stringify(terminal.buffer.join('').slice(-300))}`)
      }
      this.sink.exit({ id, exitCode, signal })
      this.dispose(id)
    })
    return pty.pid ?? null
  }

  write(id: string, data: string): void {
    this.terminals.get(id)?.pty.write(data)
  }

  resize(id: string, cols: number, rows: number): void {
    if (!isValidTerminalSize(cols, rows)) return
    this.terminals.get(id)?.pty.resize(cols, rows)
  }

  kill(id: string): void {
    this.terminals.get(id)?.pty.kill()
  }

  /** Drop one terminal: clear timers, kill the pty, forget the id. */
  dispose(id: string): void {
    const terminal = this.terminals.get(id)
    if (!terminal) return
    this.clearTimer(terminal)
    this.terminals.delete(id)
    terminal.pty.kill()
  }

  /** App quit: no orphaned pty processes (same invariant as the host supervisor). */
  disposeAll(): void {
    for (const id of [...this.terminals.keys()]) this.dispose(id)
  }

  private clearTimer(terminal: ManagedTerminal): void {
    if (terminal.flushTimer !== null) {
      clearTimeout(terminal.flushTimer)
      terminal.flushTimer = null
    }
  }

  private flush(id: string): void {
    const terminal = this.terminals.get(id)
    if (!terminal) return
    this.clearTimer(terminal)
    if (terminal.buffer.length === 0) return
    const data = terminal.buffer.join('')
    terminal.buffer = []
    this.sink.data({ id, data })
  }
}
