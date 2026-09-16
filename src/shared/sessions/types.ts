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
  /** File birthtime in epoch ms (ticket 33) — drives the Created sort. Null
   * when the platform reports no birthtime; consumers degrade to the header
   * timestamp (sessionCreatedMs). Purely additive contract field. */
  createdAt: number | null
  /** Number of message entries (any role). */
  messageCount: number
  /** Ticket 54 (additive contract field): true when the session's working
   * directory did not exist at the last index scan. ABSENT (undefined) on
   * sessions with a living cwd — the exact pre-54 payload shape — so old
   * payloads and consumers keep validating. Consumers must test
   * `cwdMissing === true`, never truthiness of the field's absence. */
  cwdMissing?: boolean
}

/** A thinking or text part of a replayed assistant message (ticket 14).
 * Thinking durations are host-measured in the live path; the session file
 * does not record them, so replayed thinking degrades to `durationMs: null`. */
export interface TranscriptThinkingPart {
  kind: 'thinking'
  text: string
  durationMs: number | null
}

export interface TranscriptTextPart {
  kind: 'text'
  text: string
}

export type TranscriptAssistantPart = TranscriptThinkingPart | TranscriptTextPart

/** One inline base64 image block of a replayed user message (ticket 79,
 * additive projection — reported into the host-contract smoke): the raw
 * material of the edit-resend composer prefill (the operator ruled images
 * ride back into the attachment state). Mirrors the session-format
 * ImageContent the SDK persists inline in user message content. */
export interface TranscriptImagePart {
  kind: 'image'
  mimeType: string
  /** Raw base64 payload (no data: prefix) — the contract's attachment shape. */
  data: string
}

/**
 * One renderable item of a replayed transcript (resume / tree navigation /
 * Live Follow). Structured since ticket 14: assistant items carry ordered
 * thinking/text parts, tool calls appear as their own items with the FINAL
 * result attached, and a user item exposes the skill marker sniffed from
 * injected `<skill name="…">` text. Replay is isomorphic with the live
 * transcript — reopening a session no longer drops thinking/tool traffic.
 */
export type TranscriptItem =
  | {
      role: 'user'
      id: string
      text: string
      timestamp: string
      /** Skill name from the `<skill name="…">` injection prologue; null when plain. */
      skillName: string | null
      /** The message's inline image parts, in content order (ticket 79,
       * additive): present ONLY on messages that carry images — absent on
       * imageless messages and on pre-79 payloads, so consumers must treat
       * absence as "no images", never default it. */
      images?: TranscriptImagePart[]
    }
  | {
      role: 'assistant'
      id: string
      timestamp: string
      /** Convenience projection of the text parts (paragraph-joined) for
       * text-only consumers; derived from `parts` at the single build site. */
      text: string
      parts: TranscriptAssistantPart[]
    }
  | {
      role: 'tool'
      /** The tool call id (stable across re-replays; matches the live path). */
      id: string
      timestamp: string
      name: string
      args: Record<string, unknown>
      /** Final serialized result (same projection the live path uses). */
      output: string
      isError: boolean
      /** The result's display diff text (ticket 78, additive): present when
       * the recorded toolResult carries a string `details.diff` (the edit
       * tool); ABSENT on every other tool and on pre-78 session payloads —
       * consumers must treat absence as "no diff text", never default it. */
      diff?: string
    }

/** One tool call of an assistant message, projected for the history tree
 * (ticket 43): the node's display expands it into a `[name: summary]`
 * monospace row under the assistant row. Purely additive contract field. */
export interface SessionTreeToolCallDTO {
  /** Tool call id — unique within the message; the display row key builds
   * on it (`<entryId>#<toolCallId>`). */
  id: string
  name: string
  /** Single-line argument summary (the args part of the display row). */
  summary: string
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
  /** Tool calls of an assistant message (ticket 43). Present — possibly
   * empty — on `assistant` nodes; absent on every other kind. */
  toolCalls?: SessionTreeToolCallDTO[]
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
