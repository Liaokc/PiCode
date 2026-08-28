/**
 * Pure formatting helpers for the chat transcript's tool cards. Live on the
 * shared side so the host (serialization of SDK results into the contract)
 * and the renderer (argument summaries on the card) agree on the shapes.
 */

/** Hard cap for serialized tool output crossing the IPC contract. */
const MAX_RESULT_CHARS = 64_000

const TRUNCATION_NOTE = '… (output truncated)'

function textContent(value: unknown): string {
  if (typeof value === 'object' && value !== null && 'type' in value) {
    const tagged = value as { type?: unknown; text?: unknown }
    if (tagged.type === 'image') return '[image]'
    if (tagged.type === 'text' && typeof tagged.text === 'string') return tagged.text
  }
  return ''
}

/**
 * Serialize any SDK tool result (string, content array, `{content}` wrapper,
 * plain object) into displayable text. Oversized output is truncated with an
 * explicit marker so the contract stays IPC-friendly.
 */
export function toolResultText(value: unknown): string {
  let text: string
  if (value === null || value === undefined) {
    text = ''
  } else if (typeof value === 'string') {
    text = value
  } else if (Array.isArray(value)) {
    text = value.map((item) => textContent(item) || toolResultText(item)).join('\n')
  } else if (typeof value === 'object' && 'content' in value && Array.isArray((value as { content: unknown }).content)) {
    text = toolResultText((value as { content: unknown[] }).content)
  } else if (typeof value === 'object' && 'text' in value && typeof (value as { text: unknown }).text === 'string') {
    text = (value as { text: string }).text
  } else {
    try {
      text = JSON.stringify(value, null, 2) ?? String(value)
    } catch {
      text = String(value) // circular or otherwise unserializable
    }
  }
  return text.length > MAX_RESULT_CHARS ? text.slice(0, MAX_RESULT_CHARS) + TRUNCATION_NOTE : text
}

/** Argument keys consulted per known tool name, in order. */
const SUMMARY_KEYS: Record<string, string[]> = {
  bash: ['command'],
  read: ['path'],
  write: ['path'],
  edit: ['path'],
  ls: ['path'],
  grep: ['pattern', 'path'],
  find: ['pattern', 'path']
}

const MAX_SUMMARY_CHARS = 120

/**
 * One-line human summary of a tool call's arguments for the collapsed card
 * row, e.g. `npm test` for bash or `TODO in src` for grep. Empty when the
 * arguments carry nothing displayable.
 */
export function toolSummary(name: string, args: Record<string, unknown>): string {
  const keys = SUMMARY_KEYS[name] ?? []
  const parts = keys
    .map((key) => args[key])
    .filter((value): value is string => typeof value === 'string' && value.length > 0)

  let summary: string
  if (parts.length > 0) {
    summary = parts.length === 2 ? `${parts[0]} in ${parts[1]}` : parts[0]
  } else if (!Array.isArray(args) && typeof args === 'object' && args !== null) {
    const firstString = Object.values(args).find((value) => typeof value === 'string' && value.length > 0)
    if (typeof firstString === 'string') {
      summary = firstString
    } else {
      // Drop empty-string values so `{ command: '' }` summarizes to nothing.
      const meaningful = Object.fromEntries(Object.entries(args).filter(([, v]) => v !== ''))
      if (Object.keys(meaningful).length === 0) {
        summary = ''
      } else {
        try {
          summary = JSON.stringify(meaningful) ?? ''
        } catch {
          summary = ''
        }
      }
    }
  } else {
    summary = ''
  }

  return summary.length > MAX_SUMMARY_CHARS ? summary.slice(0, MAX_SUMMARY_CHARS - 1) + '…' : summary
}
