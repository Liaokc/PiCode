/**
 * Session index types shared between the main-process scanner, the renderer
 * sidebar, and the follow view. File-derived data only; PiCode-local UI state
 * (pinning) lives in the renderer.
 */

/** File-derived summary of one Pi session jsonl (one sidebar Task row). */
export interface SessionSummary {
  /** Absolute path of the session jsonl. */
  file: string
  /** Pi session id (stable across renames). */
  id: string
  /** Working directory recorded in the session header. */
  cwd: string
  /** Latest session_info name (the rename write-back target), if any. */
  name: string | null
  /** Display title: name, else first user message text, else a fallback. */
  title: string
  /** Header timestamp (ISO). */
  startedAt: string
  /** File mtime in epoch ms — drives recency sort and liveness. */
  modifiedAt: number
  /** Number of message entries (any role). */
  messageCount: number
}

/** One renderable turn of the read-only Live Follow transcript. */
export interface TranscriptItem {
  /** Session entry id (stable across refreshes). */
  id: string
  role: 'user' | 'assistant'
  text: string
  timestamp: string
}

/** Serializable node of a session's entry tree (tree navigation panel). */
export interface SessionTreeNodeDTO {
  id: string
  kind: 'user' | 'assistant' | 'session-info' | 'compaction' | 'branch-summary' | 'other'
  /** Resolved bookmark label (latest label entry wins). */
  label: string | null
  /** session_info name on this entry, if any. */
  name: string | null
  /** Short text preview (message text / summary / name). */
  preview: string
  timestamp: string
  children: SessionTreeNodeDTO[]
}

/** Full tree payload the host sends for the open session. */
export interface SessionTreePayload {
  sessionId: string
  /** Current leaf (last entry in file order — Pi's own restore rule). */
  leafId: string | null
  name: string | null
  nodes: SessionTreeNodeDTO[]
}

/** Pushed when a followed (Live Follow) session file grows. */
export interface FollowUpdate {
  file: string
  items: TranscriptItem[]
}
