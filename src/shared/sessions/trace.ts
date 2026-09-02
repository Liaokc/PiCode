/**
 * Call-trace payload builder (ticket 36). Pure — no fs, no SDK — so the host
 * side (SessionIndexService) feeds it the file text and the renderer consumes
 * the payload verbatim. ONE assistant message = ONE model call (entry):
 *
 *   input section  — user / tool-result blocks accumulated since the previous
 *                    assistant message (exactly the traffic that fed this call)
 *   output section — thinking / assistant-text / tool-call blocks of the
 *                    message itself, in recorded order
 *
 * Usage columns derive per ADR-0002 from each assistant message's own
 * `usage` field; a message without usage degrades to timestamp-only display
 * (usage: null). Duration is the file's own record: the entry timestamp
 * (completion) minus the message timestamp (request start).
 *
 * Data-source truthfulness (数据源如实): the trace shows what the Pi session
 * file actually records. There are no ZCode-style title-generation calls; the
 * SDK's internal system prompt is never persisted, so 'system-prompt' blocks
 * exist in the contract (the six-type vocabulary) but the builder never
 * emits one. TUI bash-mode entries ARE part of the model's input (the SDK
 * converts them to user text via convertToLlm), so they surface as user
 * blocks in the next call's input section. Compaction/branch-summary entries
 * replace the accumulated input — everything before the boundary is no
 * longer what the model sees, and the six-type vocabulary has no summary
 * block to show it with.
 *
 * The chat contract (contract.ts) is untouched: the trace is file-scoped
 * (any session, TUI included) and rides the sessions channel family like
 * Live Follow — the IPC addition is purely additive.
 */

import type { UsageTokens } from '../usage/types.ts'
import { parseSessionLines, truncateTitle } from './parse.ts'
import { toolResultText } from '../tool-format.ts'

// ---- payload contract -------------------------------------------------------

/** Usage columns of one call, from the assistant message's `usage` field.
 * Null = the file recorded none — the UI degrades to timestamp-only. */
export type TraceUsage = UsageTokens

/** The six block kinds of a call's input/output sections. */
export type TraceBlockKind = 'system-prompt' | 'user' | 'thinking' | 'assistant' | 'tool-call' | 'tool-result'

export type TraceBlock =
  | { kind: 'system-prompt'; text: string }
  | { kind: 'user'; text: string }
  | { kind: 'thinking'; text: string }
  | { kind: 'assistant'; text: string }
  /** A tool invocation in the output section; `args` is the recorded
   * arguments JSON (stringified defensively). */
  | { kind: 'tool-call'; toolName: string; callId: string; args: string }
  /** A tool outcome in the NEXT call's input section. */
  | { kind: 'tool-result'; toolName: string; callId: string; output: string; isError: boolean }

/** One model call: one assistant message plus the input that fed it. */
export interface TraceCall {
  /** 1-based position in file order. */
  index: number
  /** The assistant message's entry id (stable React key). */
  messageId: string
  /** Model that served this call (message field, else the last model_change
   * id); null when the file records neither. */
  model: string | null
  /** Entry timestamp (ISO, completion time) — the call's timestamp column. */
  timestamp: string
  /** Entry timestamp minus message timestamp; null when either is unusable. */
  durationMs: number | null
  /** The message's stopReason (stop / toolUse / length / aborted / error…);
   * drives the status chip. Null when absent. */
  stopReason: string | null
  usage: TraceUsage | null
  inputBlocks: TraceBlock[]
  outputBlocks: TraceBlock[]
}

/** Everything one session file's trace needs — self-contained so the tab
 * renders even before the sidebar index knows the file. */
export interface TracePayload {
  /** Absolute session file path the payload was built from. */
  file: string
  /** Same derivation as the sidebar summary: session_info name, else first
   * user text, else the fallback. */
  title: string
  /** Last model in effect (model_change entries + assistant messages). */
  model: string | null
  calls: TraceCall[]
}

// ---- builder ----------------------------------------------------------------

interface PendingInput {
  blocks: TraceBlock[]
  /** First user text seen in this window (title fallback). */
  firstUserText: string | null
}

/** Text of a message content value (string or content-part array). */
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

/** toolCall parts of an assistant message content value, defensively typed. */
function toolCallParts(content: unknown): { id: string; name: string; args: Record<string, unknown> }[] {
  if (!Array.isArray(content)) return []
  const calls: { id: string; name: string; args: Record<string, unknown> }[] = []
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

/** thinking / text parts of an assistant message content value, in order. */
function outputTextParts(content: unknown): { kind: 'thinking' | 'assistant'; text: string }[] {
  if (!Array.isArray(content)) return []
  const parts: { kind: 'thinking' | 'assistant'; text: string }[] = []
  for (const part of content) {
    if (typeof part !== 'object' || part === null) continue
    const record = part as Record<string, unknown>
    if (record['type'] === 'thinking' && typeof record['thinking'] === 'string' && record['thinking'].trim() !== '') {
      parts.push({ kind: 'thinking', text: record['thinking'] })
    } else if (record['type'] === 'text' && typeof record['text'] === 'string' && record['text'].trim() !== '') {
      parts.push({ kind: 'assistant', text: record['text'] })
    }
  }
  return parts
}

/** Same projection the SDK applies when feeding bash-mode runs to the model
 * (convertToLlm → bashExecutionToText): the model's honest view of the run. */
function bashExecutionText(message: Record<string, unknown>): string {
  const command = typeof message['command'] === 'string' ? message['command'] : ''
  const output = typeof message['output'] === 'string' ? message['output'] : ''
  let text = `Ran \`${command}\`\n`
  text += output !== '' ? `\`\`\`\n${output}\n\`\`\`` : '```\n(no output)\n```'
  if (message['cancelled'] === true) {
    text += '\n\n(command cancelled)'
  } else if (typeof message['exitCode'] === 'number' && message['exitCode'] !== 0) {
    text += `\n\nCommand exited with code ${message['exitCode']}`
  }
  return text
}

function usageOf(value: unknown): TraceUsage | null {
  if (typeof value !== 'object' || value === null) return null
  const usage = value as Record<string, unknown>
  const num = (key: string): number => {
    const v = usage[key]
    return typeof v === 'number' && Number.isFinite(v) ? v : 0
  }
  const input = num('input')
  const output = num('output')
  const cacheRead = num('cacheRead')
  const cacheWrite = num('cacheWrite')
  const cacheWrite1h = num('cacheWrite1h')
  const total = num('totalTokens') || input + output + cacheRead + cacheWrite + cacheWrite1h
  return { input, output, cacheRead, cacheWrite, total }
}

function durationOf(entryTimestamp: string, message: Record<string, unknown> | undefined): number | null {
  const end = Date.parse(entryTimestamp)
  const raw = message?.['timestamp']
  const start = typeof raw === 'number' && Number.isFinite(raw) ? raw : NaN
  if (!Number.isFinite(end) || !Number.isFinite(start)) return null
  const duration = end - start
  return duration >= 0 ? duration : null
}

/**
 * Build the per-call trace payload from one session file's text. Null when
 * the text is not a session file (no header). Never throws: the underlying
 * line parser skips malformed lines (half-written tail tolerance).
 */
export function buildTracePayload(fileText: string, file: string): TracePayload | null {
  const { header, entries } = parseSessionLines(fileText)
  if (!header) return null

  const calls: TraceCall[] = []
  const pending: PendingInput = { blocks: [], firstUserText: null }
  let model: string | null = null
  let name: string | null = null

  const consume = (): TraceBlock[] => {
    const blocks = pending.blocks
    pending.blocks = []
    return blocks
  }

  for (const entry of entries) {
    switch (entry.type) {
      case 'model_change': {
        if (typeof entry.modelId === 'string' && entry.modelId !== '') model = entry.modelId
        break
      }
      case 'session_info': {
        const infoName = typeof entry.name === 'string' && entry.name.trim() !== '' ? entry.name.trim() : null
        // Later session_info entries win, matching the sidebar summary rule.
        if (infoName !== null) name = infoName
        break
      }
      case 'message': {
        const message = entry.message
        if (message?.role === 'user') {
          const text = messageText(message.content)
          if (text.trim() === '') break
          if (pending.firstUserText === null) pending.firstUserText = text
          pending.blocks.push({ kind: 'user', text })
        } else if (message?.role === 'bashExecution') {
          pending.blocks.push({ kind: 'user', text: bashExecutionText(message) })
        } else if (message?.role === 'toolResult') {
          const callId = typeof message.toolCallId === 'string' ? message.toolCallId : ''
          if (callId === '') break
          pending.blocks.push({
            kind: 'tool-result',
            toolName: typeof message.toolName === 'string' ? message.toolName : '',
            callId,
            output: toolResultText(message.content),
            isError: message.isError === true
          })
        } else if (message?.role === 'assistant') {
          const outputBlocks: TraceBlock[] = outputTextParts(message.content).map((part) =>
            part.kind === 'thinking' ? { kind: 'thinking', text: part.text } : { kind: 'assistant', text: part.text }
          )
          for (const call of toolCallParts(message.content)) {
            let args: string
            try {
              args = JSON.stringify(call.args) ?? '{}'
            } catch {
              args = '{}'
            }
            outputBlocks.push({ kind: 'tool-call', toolName: call.name, callId: call.id, args })
          }
          const messageModel = typeof message.model === 'string' && message.model !== '' ? message.model : null
          if (messageModel !== null) model = messageModel
          calls.push({
            index: calls.length + 1,
            messageId: entry.id,
            model,
            timestamp: entry.timestamp,
            durationMs: durationOf(entry.timestamp, message),
            stopReason: typeof message.stopReason === 'string' ? message.stopReason : null,
            usage: usageOf(message.usage),
            inputBlocks: consume(),
            outputBlocks
          })
        }
        // Other message roles (compaction summaries as messages etc.) carry
        // no model-call traffic — ignored without touching the accumulator.
        break
      }
      case 'compaction':
      case 'branch_summary': {
        // Context boundary: the summary replaces the accumulated input, and
        // the six-type vocabulary has no block to show it with. Neither is a
        // model call here (their usage is outside the assistant-message
        // scope this ticket derives the usage columns from).
        consume()
        break
      }
      default:
        break // labels, thinking-level changes, extensions — no trace traffic
    }
  }

  const firstUser = pending.firstUserText
  return {
    file,
    title: name ?? (firstUser !== null ? truncateTitle(firstUser) : 'New Task'),
    model,
    calls
  }
}

// ---- header stats -----------------------------------------------------------

/** Header stats line: call count, token total, model. `totalTokens` is null
 * when NO call carries usage (degradation: the segment is hidden), and sums
 * every call's usage total where present. */
export interface TraceStats {
  calls: number
  totalTokens: number | null
  model: string | null
}

export function traceStats(payload: TracePayload): TraceStats {
  let totalTokens: number | null = null
  for (const call of payload.calls) {
    if (call.usage === null) continue
    totalTokens = (totalTokens ?? 0) + call.usage.total
  }
  return { calls: payload.calls.length, totalTokens, model: payload.model }
}

// ---- display formatters ------------------------------------------------------

/** '4.83s' — the usage column's duration spelling (ZCode trace parity). */
export function formatCallDuration(ms: number): string {
  return `${(ms / 1_000).toFixed(2)}s`
}

/** '2:23:20 PM' — en-US time-of-day. Zone defaults to the host's; the
 * optional parameter pins tests. Null for unusable input (column hidden). */
export function formatTraceTimestamp(iso: string, timeZone?: string): string | null {
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return null
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  }).format(ms)
}

/** '15,614' — en-US thousands separators for the IN/OUT columns. */
export function formatTraceTokens(count: number): string {
  return count.toLocaleString('en-US')
}
