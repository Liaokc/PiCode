/**
 * The retired-slash send gate (ticket 38, spec R10): six built-in slash
 * commands that PiCode supersedes with dedicated UI (`/new` `/tree` `/name`
 * `/copy` `/model` `/thinking`) no longer appear in the `/` menu — and
 * typing them by hand would otherwise flow to the model as an unknown
 * command and burn a garbage round (the send path has no slash handling of
 * its own). The composer consults this table before dispatching: a hit
 * yields the pointer-toast hint and nothing is sent; `/compact` (the one
 * retained built-in) and every prompt template / skill pass untouched.
 *
 * Table-driven pure function (Seam-1, keymap.ts precedent): text →
 * { hint } | null. The hint is the full toast line — `/model — use the
 * Select Model picker` — pointing at the control that owns the job.
 */

/** Retired command → the UI surface that replaces it (English, per the
 * all-English copy rule). Keys are the command names without the slash. */
export const RETIRED_SLASH_GUIDANCE: Readonly<Record<string, string>> = {
  new: 'use ⌘N or the New Task chip',
  tree: 'use the History button above the transcript',
  name: 'use the Rename task button in the chat header',
  copy: 'use the Copy action under the assistant reply',
  model: 'use the Select Model picker',
  thinking: 'use the Thinking dropdown'
}

/** `/new`, `/tree`, … at the START of the text only, bare or followed by
 * whitespace (args or a newline). A lookahead — not \b — so `/modelx` and
 * `/model-x` stay unknown commands that pass through untouched. */
const RETIRED_SLASH_PATTERN = new RegExp(
  `^/(${Object.keys(RETIRED_SLASH_GUIDANCE).join('|')})(?=\\s|$)`
)

export interface SlashGateDecision {
  /** Full toast line: the command plus where to go instead. */
  hint: string
}

/** The send-gate decision for one composer text. Pure. */
export function gateSlashCommand(text: string): SlashGateDecision | null {
  const match = RETIRED_SLASH_PATTERN.exec(text.trim())
  if (!match) return null
  const name = match[1]!
  return { hint: `/${name} — ${RETIRED_SLASH_GUIDANCE[name]}` }
}
