/**
 * Seam-3: the minimal pseudo-terminal abstraction (spec: testing seam #3).
 * The terminal UI (renderer) and the terminal service (main) depend only on
 * these interfaces; a REAL pty implementation exists solely behind the
 * main-process factory adapter and the dedicated smoke script — enforced by
 * tests/terminal/pty-guardrail.test.ts.
 *
 * Data flows as raw bytes (strings of terminal output). Control decisions
 * (resize, exit) travel as typed fields. Everything here must stay
 * JSON/IPC-friendly or in-process callable.
 */

/** Report delivered when the pty's process terminates. */
export interface PtyExitEvent {
  exitCode: number
  /** Signal that killed the process, if any (stringified for IPC ease). */
  signal: string | null
}

/** Options a pty is spawned with. */
export interface PtySpawnOptions {
  cwd: string
  cols: number
  rows: number
}

/**
 * Minimal pseudo-terminal handle. `write` feeds the process's stdin;
 * `onData` delivers its stdout+stderr interleaved as terminal bytes.
 */
export interface PtyHandle {
  readonly pid: number | null
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(): void
  /** Subscribe to output bytes; returns an unsubscribe function. */
  onData(listener: (data: string) => void): () => void
  /** Subscribe to process termination; returns an unsubscribe function. */
  onExit(listener: (event: PtyExitEvent) => void): () => void
}

/**
 * Factory seam: production wires node-pty behind this; tests and the smoke
 * harness substitute their own implementations.
 */
export type PtyFactory = (options: PtySpawnOptions) => PtyHandle
