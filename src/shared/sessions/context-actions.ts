/**
 * Session context-menu action payloads (ticket 35): the read-only half of
 * the row context menu — Reveal in Finder and the three copy actions —
 * travels as one of these across the `sessions:context-action` IPC channel
 * into the main process, where Electron's shell/clipboard APIs live.
 * Read-only red line: the only possible effects are showing the session
 * file in Finder and writing text to the clipboard — no filesystem writes,
 * no session-file changes.
 *
 * The parser is pure and shared (renderer builds, main validates); the
 * performing service lives in src/main/sessions/context-actions.ts.
 */

/** One context-menu action the renderer may ask main to perform. */
export type SessionContextAction =
  /** shell.showItemInFolder on the session jsonl (user story 48). */
  | { kind: 'reveal'; file: string }
  /** clipboard.writeText — task path (cwd), session file path, session id. */
  | { kind: 'copy'; text: string }

/** Defensive parse of an untrusted IPC payload; null = junk, perform nothing. */
export function parseSessionContextAction(raw: unknown): SessionContextAction | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  if (record['kind'] === 'reveal') {
    return typeof record['file'] === 'string' && record['file'] !== ''
      ? { kind: 'reveal', file: record['file'] }
      : null
  }
  if (record['kind'] === 'copy') {
    return typeof record['text'] === 'string' && record['text'] !== ''
      ? { kind: 'copy', text: record['text'] }
      : null
  }
  return null
}
