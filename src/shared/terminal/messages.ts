/**
 * Wire messages for the terminal-dedicated IPC channels (Seam-3, ADR-0004).
 * Shared so the main service, preload bridge, and renderer agree on shapes
 * without the renderer importing anything from src/main.
 */

export interface TerminalDataMessage {
  /** The terminal instance id the bytes belong to. */
  id: string
  /** Raw terminal output bytes (possibly coalesced chunks). */
  data: string
}

export interface TerminalExitMessage {
  id: string
  exitCode: number
  signal: string | null
}
