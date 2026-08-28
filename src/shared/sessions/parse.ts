/**
 * Pi session jsonl parsing for the session index, Live Follow, and the tree
 * panel (pure — no fs, no SDK). Follows the tolerance rules established by the
 * usage parser (Seam-2): append-only writers can be caught mid-line, so a
 * malformed FINAL line is a half-written tail (ignored), while malformed
 * interior lines are skipped.
 *
 * Writes are limited to one helper: `makeSessionInfoLine` produces the exact
 * entry the SDK's `SessionManager.appendSessionInfo` would persist, chained to
 * the current leaf (the last entry in file order — Pi's own restore rule).
 */
import type { SessionSummary, SessionTreeNodeDTO, TranscriptItem } from './types.ts'

export interface RawSessionEntry {
  type: string
  id: string
  parentId: string | null
  timestamp: string
  message?: { role?: unknown; content?: unknown }
  name?: unknown
  label?: unknown
  targetId?: unknown
  summary?: unknown
}

export interface ParsedSessionLines {
  header: { id: string; cwd: string; timestamp: string } | null
  entries: RawSessionEntry[]
}

const TITLE_MAX_CHARS = 80

export function parseSessionLines(text: string): ParsedSessionLines {
  const result: ParsedSessionLines = { header: null, entries: [] }
  const lines = text.split('\n')
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop() // trailing newline

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.trim() === '') continue
    let value: unknown
    try {
      value = JSON.parse(line)
    } catch {
      continue // half-written tail or damaged interior line — never throw
    }
    if (typeof value !== 'object' || value === null) continue
    const entry = value as Record<string, unknown>
    const entryType = entry['type']
    if (typeof entryType !== 'string') continue

    if (entryType === 'session') {
      if (typeof entry['id'] === 'string' && result.header === null) {
        result.header = {
          id: entry['id'],
          cwd: typeof entry['cwd'] === 'string' ? entry['cwd'] : '',
          timestamp: typeof entry['timestamp'] === 'string' ? entry['timestamp'] : ''
        }
      }
      continue
    }

    const id = typeof entry['id'] === 'string' ? entry['id'] : ''
    if (!id) continue
    result.entries.push({
      type: entryType,
      id,
      parentId: typeof entry['parentId'] === 'string' ? entry['parentId'] : null,
      timestamp: typeof entry['timestamp'] === 'string' ? entry['timestamp'] : '',
      message: entry['message'] as RawSessionEntry['message'],
      name: entry['name'],
      label: entry['label'],
      targetId: entry['targetId'],
      summary: entry['summary']
    })
  }
  return result
}

function entryName(entry: RawSessionEntry): string | null {
  return typeof entry.name === 'string' && entry.name.trim() !== '' ? entry.name.trim() : null
}

/** Text of the first user text part across a message content value. */
function firstUserText(content: unknown): string | null {
  if (typeof content === 'string') return content.trim() === '' ? null : content
  if (!Array.isArray(content)) return null
  for (const part of content) {
    if (typeof part === 'object' && part !== null && (part as Record<string, unknown>)['type'] === 'text') {
      const text = (part as Record<string, unknown>)['text']
      if (typeof text === 'string' && text.trim() !== '') return text
    }
  }
  return null
}

/** Concatenated text parts of a message content value ('' when none). */
function messageText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  let out = ''
  for (const part of content) {
    if (typeof part === 'object' && part !== null && (part as Record<string, unknown>)['type'] === 'text') {
      const text = (part as Record<string, unknown>)['text']
      if (typeof text === 'string') out += text
    }
  }
  return out
}

/** Derive the sidebar summary of one session file. Null when not a session. */
export function summarizeSession(fileText: string, file: string, modifiedAt: number): SessionSummary | null {
  const { header, entries } = parseSessionLines(fileText)
  if (!header) return null

  let name: string | null = null
  let firstUser: string | null = null
  let messageCount = 0
  for (const entry of entries) {
    if (entry.type === 'session_info') name = entryName(entry) ?? name
    if (entry.type !== 'message') continue
    messageCount++
    if (firstUser === null && entry.message?.role === 'user') {
      firstUser = firstUserText(entry.message.content)
    }
  }
  // Later session_info entries win (file order), matching SessionManager.getSessionName.
  const trimmedName = name !== null ? name : null

  return {
    file,
    id: header.id,
    cwd: header.cwd,
    name: trimmedName,
    title: trimmedName ?? (firstUser !== null ? truncateTitle(firstUser) : 'New Task'),
    startedAt: header.timestamp,
    modifiedAt,
    messageCount
  }
}

/**
 * Transcript items for resume replay and the Live Follow view: user and
 * assistant text in file order, dropping thinking/tool traffic.
 */
export function extractTranscriptItems(entries: RawSessionEntry[]): TranscriptItem[] {
  const items: TranscriptItem[] = []
  for (const entry of entries) {
    if (entry.type !== 'message') continue
    const role = entry.message?.role
    if (role !== 'user' && role !== 'assistant') continue
    const text = messageText(entry.message?.content)
    if (text.trim() === '') continue
    items.push({ id: entry.id, role, text, timestamp: entry.timestamp })
  }
  return items
}

/**
 * Build the entry tree for the navigation panel. Orphaned entries (broken
 * parent chain) become roots, mirroring SessionManager.getTree. The leaf is
 * the LAST entry in file order — the same rule SessionManager applies when
 * reopening a file.
 */
export function buildSessionTree(entries: RawSessionEntry[]): { nodes: SessionTreeNodeDTO[]; leafId: string | null } {
  const labels = new Map<string, string>()
  for (const entry of entries) {
    if (entry.type === 'label') {
      const label = typeof entry.label === 'string' ? entry.label.trim() : ''
      const target = typeof entry.targetId === 'string' ? entry.targetId : ''
      if (target === '') continue
      if (label === '') labels.delete(target)
      else labels.set(target, label)
    }
  }

  const byId = new Map<string, SessionTreeNodeDTO>()
  const nodes: SessionTreeNodeDTO[] = []
  for (const entry of entries) {
    const node: SessionTreeNodeDTO = {
      id: entry.id,
      kind: nodeKind(entry),
      label: labels.get(entry.id) ?? null,
      name: entryName(entry),
      preview: nodePreview(entry),
      timestamp: entry.timestamp,
      children: []
    }
    byId.set(entry.id, node)
    const parent = entry.parentId !== null ? byId.get(entry.parentId) : undefined
    if (parent) parent.children.push(node)
    else nodes.push(node)
  }
  return { nodes, leafId: entries.length > 0 ? (entries[entries.length - 1]?.id ?? null) : null }
}

function nodeKind(entry: RawSessionEntry): SessionTreeNodeDTO['kind'] {
  if (entry.type === 'message') {
    return entry.message?.role === 'assistant' ? 'assistant' : entry.message?.role === 'user' ? 'user' : 'other'
  }
  if (entry.type === 'session_info') return 'session-info'
  if (entry.type === 'compaction') return 'compaction'
  if (entry.type === 'branch_summary') return 'branch-summary'
  return 'other'
}

function nodePreview(entry: RawSessionEntry): string {
  if (entry.type === 'message') {
    const text = messageText(entry.message?.content)
    return text.trim() !== '' ? truncate(text, TITLE_MAX_CHARS) : `(${entry.message?.role ?? 'message'})`
  }
  if (entry.type === 'session_info') return entryName(entry) ?? '(session info)'
  if (entry.type === 'compaction' || entry.type === 'branch_summary') {
    const summary = typeof entry.summary === 'string' ? entry.summary : ''
    return summary.trim() !== '' ? truncate(summary, TITLE_MAX_CHARS) : `(${entry.type})`
  }
  return `(${entry.type})`
}

function truncate(text: string, max: number): string {
  const singleLine = text.replace(/\s+/g, ' ').trim()
  return singleLine.length <= max ? singleLine : `${singleLine.slice(0, max)}…`
}

/** Single-line title text, truncated to the sidebar row budget. */
export function truncateTitle(text: string, max = TITLE_MAX_CHARS): string {
  return truncate(text, max)
}

/**
 * The exact line a rename must append to a session file: a `session_info`
 * entry chained to the current leaf, byte-equivalent in shape to what the
 * SDK's appendSessionInfo persists (sanitized name, 8-char id supplied by the
 * caller so this stays deterministic and testable).
 */
export function makeSessionInfoLine(info: { id: string; parentId: string | null; name: string; timestamp: string }): string {
  const sanitized = info.name.replace(/[\r\n]+/g, ' ').trim()
  return `${JSON.stringify({ type: 'session_info', id: info.id, parentId: info.parentId, timestamp: info.timestamp, name: sanitized })}\n`
}

/** Current leaf of a parsed file: the last entry in file order. */
export function leafIdOf(entries: RawSessionEntry[]): string | null {
  return entries.length > 0 ? (entries[entries.length - 1]?.id ?? null) : null
}
