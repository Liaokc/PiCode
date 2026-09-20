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
import type { SessionSummary, SessionTreeNodeDTO, TranscriptAssistantPart, TranscriptImagePart, TranscriptItem } from './types.ts'
import type { SubagentCallChild, SubagentCallInfo } from '../subagents/types.ts'
import { toolResultText, UNFINISHED_TOOL_OUTPUT } from '../tool-format.ts'

/** Per-child clamp for the recorded final output (preview raw material). */
const SUBAGENT_CHILD_OUTPUT_CHARS = 200

/**
 * The subagent call info projected from a toolResult's recorded `details`
 * (ticket 90, additive — the replay's primary source). pi-subagents records
 * `{ mode, runId, asyncId?, asyncDir?, results: [...] }`; only a record that
 * actually names a run projects — every other tool's details (and legacy
 * shapes) keep the field absent. Unknown fields are ignored (forward
 * compatibility per pi-subagents' own contract).
 */
export function subagentInfoOfDetails(details: Record<string, unknown> | null): SubagentCallInfo | undefined {
  if (details === null) return undefined
  const mode = details['mode']
  const runId = details['runId']
  const asyncId = details['asyncId']
  const asyncDir = details['asyncDir']
  if (typeof runId !== 'string' && typeof asyncId !== 'string') return undefined
  const rawResults = details['results']
  const children = Array.isArray(rawResults)
    ? rawResults.flatMap((raw): SubagentCallChild[] => {
        if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return []
        const child = raw as Record<string, unknown>
        const projected: SubagentCallChild = {}
        if (typeof child['agent'] === 'string') projected.agent = child['agent']
        if (typeof child['status'] === 'string') projected.status = child['status']
        if (typeof child['finalOutput'] === 'string') {
          projected.finalOutput = child['finalOutput'].slice(0, SUBAGENT_CHILD_OUTPUT_CHARS)
        } else if (typeof child['summary'] === 'string') {
          // The async result shape carries `summary` instead of finalOutput.
          projected.finalOutput = child['summary'].slice(0, SUBAGENT_CHILD_OUTPUT_CHARS)
        }
        if (typeof child['error'] === 'string') projected.error = child['error']
        if (typeof child['exitCode'] === 'number') projected.exitCode = child['exitCode']
        if (child['detached'] === true) projected.detached = true
        if (child['interrupted'] === true) projected.interrupted = true
        if (child['stopped'] === true) projected.stopped = true
        if (child['timedOut'] === true) projected.timedOut = true
        return Object.keys(projected).length > 0 ? [projected] : []
      })
    : undefined
  return {
    ...(typeof mode === 'string' ? { mode } : {}),
    ...(typeof runId === 'string' ? { runId } : {}),
    ...(typeof asyncId === 'string' ? { asyncId } : {}),
    ...(typeof asyncDir === 'string' ? { asyncDir } : {}),
    ...(children !== undefined && children.length > 0 ? { children } : {})
  }
}

export interface RawSessionEntry {
  type: string
  id: string
  parentId: string | null
  timestamp: string
  message?: { [key: string]: unknown; role?: unknown; content?: unknown; toolCallId?: unknown; isError?: unknown }
  name?: unknown
  label?: unknown
  targetId?: unknown
  summary?: unknown
  /** model_change entries only (ticket 36): the model id that came into
   * effect — the trace builder's fallback when an assistant message omits
   * its model field. Purely additive. */
  modelId?: unknown
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
      summary: entry['summary'],
      modelId: entry['modelId']
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

/**
 * The exact prologue shape the Pi SDK injects when a turn is driven by a
 * skill — mirrors the SDK's own parseSkillBlock (agent-session.js):
 * `<skill name="…" location="…">\n<body>\n</skill>` with the user's own
 * text riding after a blank line. Anchored at BOTH ends: a mid-message
 * mention is not an invocation, and a shape the SDK itself would not parse
 * is shown as-is.
 */
const SKILL_BLOCK = /^<skill name="([^"]+)" location="([^"]+)">\n([\s\S]*?)\n<\/skill>(?:\n\n([\s\S]+))?$/

/** Title text of the first user message (ticket 42): a skill-driven turn's
 * message opens with the injected skill block — raw skill prose, never a
 * readable title. When the message is the SDK's skill-block shape, the
 * title is the text AFTER the block; when the block is the whole message
 * (or nothing usable follows it), the skill name is the fallback. Anything
 * else passes through untouched. Tested through summarizeSession — the
 * title the sidebar actually shows. */
function sessionTitleFromUserText(text: string): string {
  const match = SKILL_BLOCK.exec(text)
  if (match === null) return text
  const userMessage = match[4]?.trim()
  return userMessage !== undefined && userMessage !== '' ? userMessage : (match[1] ?? '')
}

/** Concatenated text parts of a message content value ('' when none).
 * Exported for the call-trace builder (ticket 36), which needs the same
 * projection of user-message content. */
export function messageText(content: unknown): string {
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

/** Derive the sidebar summary of one session file. Null when not a session.
 * `createdAt` (ticket 33) is the file birthtime in epoch ms, or null when the
 * platform reports none — a purely additive contract field. */
export function summarizeSession(
  fileText: string,
  file: string,
  modifiedAt: number,
  createdAt: number | null = null
): SessionSummary | null {
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
      // Ticket 42: skip a leading skill-injection prologue — the title is
      // the user's own words (or the skill name when the turn carries
      // nothing else), never the raw `<skill name=… locat…` text.
      const raw = firstUserText(entry.message.content)
      if (raw !== null) firstUser = sessionTitleFromUserText(raw)
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
    createdAt: typeof createdAt === 'number' && Number.isFinite(createdAt) && createdAt > 0 ? createdAt : null,
    messageCount
  }
}

/**
 * Skill name sniffed from a user message's injected `<skill name="…">`
 * prologue — the exact shape the Pi SDK prepends when a turn is driven by a
 * skill (Pi has no structured skill events, so this text sniff is the marker).
 * Anchored at the message start: a mid-message mention is not an invocation.
 */
const SKILL_INJECTION = /^<skill name="([^"]+)" location="[^"]*">/

export function sniffSkillName(text: string): string | null {
  return SKILL_INJECTION.exec(text)?.[1] ?? null
}

export interface ToolCallPart {
  id: string
  name: string
  args: Record<string, unknown>
}

/** toolCall parts of an assistant message content value, defensively typed.
 * Exported for the call-trace builder (ticket 36) — same projection. */
export function toolCalls(content: unknown): ToolCallPart[] {
  if (!Array.isArray(content)) return []
  const calls: ToolCallPart[] = []
  for (const part of content) {
    if (typeof part !== 'object' || part === null) continue
    const record = part as Record<string, unknown>
    if (record['type'] !== 'toolCall') continue
    const id = typeof record['id'] === 'string' ? record['id'] : ''
    const name = typeof record['name'] === 'string' ? record['name'] : ''
    if (id === '' || name === '') continue
    const args = record['arguments']
    calls.push({
      id,
      name,
      args: typeof args === 'object' && args !== null && !Array.isArray(args) ? (args as Record<string, unknown>) : {}
    })
  }
  return calls
}

/** Inline base64 image blocks of a user message content value (tickets
 * 79+97, additive projection): the edit-resend prefill's raw material AND
 * the live echo's — the session file records ImageContent inline in user
 * message content, so both the replay and the live `user_message` echo
 * read it through this ONE projection (identical shapes guaranteed).
 * Only well-formed blocks project; anything else is skipped so the field
 * can never carry a half-shaped part. */
export function userImageParts(content: unknown): TranscriptImagePart[] {
  if (!Array.isArray(content)) return []
  const parts: TranscriptImagePart[] = []
  for (const part of content) {
    if (typeof part !== 'object' || part === null) continue
    const record = part as Record<string, unknown>
    if (record['type'] !== 'image') continue
    const mimeType = record['mimeType']
    const data = record['data']
    if (typeof mimeType !== 'string' || mimeType === '') continue
    if (typeof data !== 'string' || data === '') continue
    parts.push({ kind: 'image', mimeType, data })
  }
  return parts
}

/** Thinking/text parts of an assistant message content value (ticket 14). */
function assistantParts(content: unknown): TranscriptAssistantPart[] {
  if (!Array.isArray(content)) return []
  const parts: TranscriptAssistantPart[] = []
  for (const part of content) {
    if (typeof part !== 'object' || part === null) continue
    const record = part as Record<string, unknown>
    if (record['type'] === 'thinking') {
      const text = record['thinking']
      if (typeof text === 'string' && text.trim() !== '') parts.push({ kind: 'thinking', text, durationMs: null })
    } else if (record['type'] === 'text') {
      const text = record['text']
      if (typeof text === 'string' && text.trim() !== '') parts.push({ kind: 'text', text })
    }
  }
  return parts
}

/** The toolResult message's recorded `details` object, when it is a record. */
function resultDetails(message: NonNullable<RawSessionEntry['message']>): Record<string, unknown> | null {
  const details = message['details']
  return typeof details === 'object' && details !== null && !Array.isArray(details) ? (details as Record<string, unknown>) : null
}

/**
 * Structured transcript items for resume replay and the Live Follow payload
 * (ticket 14): user/assistant text plus thinking parts, tool calls with their
 * FINAL results, and sniffed skill markers — replay stays isomorphic with the
 * live transcript. toolResult messages are folded into their toolCall's item
 * (last result wins); a call without any result degrades to the same settled
 * error card the live path produces. TUI bash-mode and other message roles
 * stay out of the replay, as do non-message entries. Ticket 78 (additive):
 * a recorded `details.diff` string rides the item as `diff` — the turn file
 * bar's raw material; absent on every other result shape.
 */
export function extractTranscriptItems(entries: RawSessionEntry[]): TranscriptItem[] {
  // Pass 1: final result per tool call id (a retried call would append a
  // second result — the last one wins).
  const results = new Map<string, { output: string; isError: boolean; diff?: string; subagent?: SubagentCallInfo }>()
  for (const entry of entries) {
    if (entry.type !== 'message') continue
    const message = entry.message
    if (message?.role !== 'toolResult') continue
    const toolCallId = typeof message.toolCallId === 'string' ? message.toolCallId : ''
    if (toolCallId === '') continue
    const details = resultDetails(message)
    const diff = typeof details?.['diff'] === 'string' ? details['diff'] : undefined
    // Ticket 90 (additive projection): pi-subagents records its structured
    // run identity in the toolResult's `details` — the replay's primary
    // source. Only record-shaped details with a run identity project; every
    // other result keeps the old payload shape (field absent).
    const subagent = subagentInfoOfDetails(details)
    results.set(toolCallId, {
      output: toolResultText(message.content),
      isError: message.isError === true,
      ...(diff !== undefined ? { diff } : {}),
      ...(subagent !== undefined ? { subagent } : {})
    })
  }

  const items: TranscriptItem[] = []
  for (const entry of entries) {
    if (entry.type !== 'message') continue
    const message = entry.message
    if (message?.role === 'user') {
      const text = messageText(message.content)
      if (text.trim() === '') continue
      // Ticket 79 (additive): the field rides ONLY when the message carries
      // images — imageless messages keep the exact pre-79 item shape.
      const images = userImageParts(message.content)
      items.push({
        role: 'user',
        id: entry.id,
        text,
        timestamp: entry.timestamp,
        skillName: sniffSkillName(text),
        ...(images.length > 0 ? { images } : {})
      })
    } else if (message?.role === 'assistant') {
      // Assistant item first (live order: the message closes, then its tool
      // cards run), then one settled tool item per toolCall part.
      const parts = assistantParts(message.content)
      if (parts.length > 0) {
        const text = parts
          .filter((part) => part.kind === 'text')
          .map((part) => part.text)
          .join('\n\n')
        items.push({ role: 'assistant', id: entry.id, timestamp: entry.timestamp, text, parts })
      }
      for (const call of toolCalls(message.content)) {
        const result = results.get(call.id)
        items.push({
          role: 'tool',
          id: call.id,
          timestamp: entry.timestamp,
          name: call.name,
          args: call.args,
          output: result !== undefined ? result.output : UNFINISHED_TOOL_OUTPUT,
          isError: result !== undefined ? result.isError : true,
          ...(result?.diff !== undefined ? { diff: result.diff } : {}),
          ...(result?.subagent !== undefined ? { subagent: result.subagent } : {})
        })
      }
    }
  }
  return items
}

/**
 * Build the entry tree for the navigation panel. Orphaned entries (broken
 * parent chain) become roots, mirroring SessionManager.getTree. The leaf is
 * the LAST entry in file order — the same rule SessionManager applies when
 * reopening a file. `home` (ticket 43) shortens absolute paths in tool-call
 * summaries; pass '' to disable shortening.
 */
export function buildSessionTree(
  entries: RawSessionEntry[],
  home = ''
): { nodes: SessionTreeNodeDTO[]; leafId: string | null } {
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
    // Ticket 43: assistant messages carry their tool calls (possibly empty)
    // so the tree display can expand them into [name: summary] rows.
    if (node.kind === 'assistant') {
      node.toolCalls = toolCalls(entry.message?.content).map((call) => ({
        id: call.id,
        name: call.name,
        summary: toolCallSummary(call.name, call.args, home)
      }))
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
    if (text.trim() !== '') return truncate(text, TITLE_MAX_CHARS)
    // Ticket 43: a text-less assistant message degrades like the TUI's
    // /tree — the abort state, the platform error, or (no content) when
    // the content was all thinking/tool traffic.
    if (entry.message?.role === 'assistant') {
      if (entry.message['stopReason'] === 'aborted') return '(aborted)'
      const error = entry.message['errorMessage']
      if (typeof error === 'string' && error.trim() !== '') return truncate(error, TITLE_MAX_CHARS)
      return '(no content)'
    }
    return `(${entry.message?.role ?? 'message'})`
  }
  if (entry.type === 'session_info') return entryName(entry) ?? '(session info)'
  if (entry.type === 'compaction' || entry.type === 'branch_summary') {
    const summary = typeof entry.summary === 'string' ? entry.summary : ''
    return summary.trim() !== '' ? truncate(summary, TITLE_MAX_CHARS) : `(${entry.type})`
  }
  return `(${entry.type})`
}

/** Single-line argument summary of one tool call (ticket 43) — the desktop
 * port of the Pi TUI's /tree formatter: per-tool-family projections (bash
 * commands flattened and cut at 50, read/write/edit paths home-shortened
 * with read line ranges, grep/find pattern-in-path, ls path), unknown tools
 * falling back to 40 chars of JSON. Pure: `home` injected by the caller
 * (the host passes os.homedir(); '' disables shortening). */
export function toolCallSummary(name: string, args: Record<string, unknown>, home: string): string {
  const shorten = (value: string): string =>
    home !== '' && value.startsWith(home) ? `~${value.slice(home.length)}` : value
  const pathArg = (): string => shorten(String(args['path'] || args['file_path'] || ''))
  switch (name) {
    case 'read': {
      const display = pathArg()
      const offset = args['offset']
      const limit = args['limit']
      if (offset === undefined && limit === undefined) return display
      const start = typeof offset === 'number' ? offset : 1
      const end = limit !== undefined ? start + (typeof limit === 'number' ? limit : 0) - 1 : ''
      return `${display}:${start}${end !== '' ? `-${end}` : ''}`
    }
    case 'write':
    case 'edit':
      return pathArg()
    case 'bash': {
      const flat = String(args['command'] || '')
        .replace(/\s+/g, ' ')
        .trim()
      return flat.length > 50 ? `${flat.slice(0, 50)}...` : flat
    }
    case 'grep':
      return `/${String(args['pattern'] || '')}/ in ${shorten(String(args['path'] || '.'))}`
    case 'find':
      return `${String(args['pattern'] || '')} in ${shorten(String(args['path'] || '.'))}`
    case 'ls':
      return shorten(String(args['path'] || '.'))
    default: {
      const json = JSON.stringify(args)
      return json.length > 40 ? `${json.slice(0, 40)}...` : json
    }
  }
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
