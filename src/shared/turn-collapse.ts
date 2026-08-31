/**
 * Turn-collapse model (ticket 23): the settled transcript folds each turn's
 * work — thinking rows, tool cards, approval pills, skill marker — into a
 * single "Working · Ns" container row, leaving only the user's messages and
 * the agent's answers visible. ZCode-evidence behavior:
 *
 *   - turn boundary = the user message; everything after it (thinking, tools,
 *     approvals, assistant text) belongs to that turn;
 *   - the live turn streams expanded with real-time scroll and auto-collapses
 *     when the run settles (auto-collapse on agent_end);
 *   - a turn that ended in `turn_error` stays expanded (exception);
 *   - expansion is never remembered across session switches / re-replays
 *     (memory rule — resume always starts fully collapsed).
 *
 * Expansion itself is state folded by the chat reducer (see ChatState
 * `expandedTurns` / `erroredTurns`); this module owns the pure grouping of
 * the flat entry list into renderable turns.
 */

import type { ApprovalEntry, ChatEntry, ThinkingPart, ToolEntry, UserEntry } from './chat-reducer'

/** Turn id for entries that arrive before any user message (defensive — the
 * live path always echoes the user message before run content). */
export const HEAD_TURN_ID = 'head'

/** The injected skill prologue: `<skill name="…" location="…">…</skill>`. */
const SKILL_PROLOGUE = new RegExp('^<skill name="[^"]+" location="[^"]*">[\\r\\n]+[\\s\\S]*?</skill>[\\r\\n]*')

/**
 * Display text for the user bubble: the raw message minus the sniffed skill
 * injection prologue — the container's skill marker row carries that story,
 * so the bubble shows only what the user actually typed (ZCode evidence:
 * clean bubbles). Defensive: any mismatch leaves the raw text untouched.
 */
export function stripSkillPrologue(text: string, skillName: string | null): string {
  if (skillName === null) return text
  const stripped = text.replace(SKILL_PROLOGUE, '')
  return stripped === text ? text : stripped.replace(/^[\r\n]+/, '')
}

/** One item inside the collapsed container: a thinking part, a tool card or
 * an approval pill, in transcript order. */
export type TurnWorkItem =
  | { kind: 'thinking'; key: string; part: ThinkingPart }
  | { kind: 'tool'; key: string; entry: ToolEntry }
  | { kind: 'approval'; key: string; entry: ApprovalEntry }

/** One assistant text part of the answer — always rendered outside the
 * container (the settled transcript shows messages and answers). */
export interface TurnAnswerPart {
  key: string
  /** The assistant entry this text part came from — the fork anchor pool
   * (ticket 16: fork branches at an entry id). */
  entryId: string
  text: string
  /** True while this part is the streaming tail of the live turn. */
  streaming: boolean
}

export interface TurnGroup {
  /** Stable turn id — the boundary user entry's id (HEAD_TURN_ID for the
   * defensive head segment). React key + expansion-set key. */
  id: string
  /** The boundary user message; null only for the head segment. */
  user: UserEntry | null
  /** Skill name sniffed from the user message's injected `<skill>` prologue;
   * rendered as the marker row inside the container. */
  skillName: string | null
  /** Bubble display text: the raw user message with the skill prologue
   * stripped (raw text stays on the entry — display-only derivation). */
  userText: string
  /** Thinking rows, tool cards and approval pills — hidden while collapsed. */
  work: TurnWorkItem[]
  /** Assistant text parts in order — the visible answer. */
  answer: TurnAnswerPart[]
  /** The turn currently streaming: container renders expanded and ticking. */
  live: boolean
  /** A pending approval inside this turn keeps the container open. */
  pendingApproval: boolean
  /** The container row renders at all only when there is something to fold. */
  hasWork: boolean
}

/**
 * Group the flat transcript into turns. `agentRunning` marks the last group
 * live (the run may still stream into it). Pure — no time, no I/O.
 */
export function groupTurns(entries: ChatEntry[], agentRunning: boolean): TurnGroup[] {
  const groups: TurnGroup[] = []
  let current: TurnGroup | null = null

  for (const entry of entries) {
    if (entry.role === 'user') {
      current = {
        id: entry.id,
        user: entry,
        skillName: entry.skillName,
        userText: stripSkillPrologue(entry.text, entry.skillName),
        work: [],
        answer: [],
        live: false,
        pendingApproval: false,
        hasWork: entry.skillName !== null
      }
      groups.push(current)
      continue
    }
    if (current === null) {
      current = {
        id: HEAD_TURN_ID,
        user: null,
        skillName: null,
        userText: '',
        work: [],
        answer: [],
        live: false,
        pendingApproval: false,
        hasWork: false
      }
      groups.push(current)
    }
    const group: TurnGroup = current
    switch (entry.role) {
      case 'assistant':
        entry.parts.forEach((part, index) => {
          const key = `${entry.id}-p${index}`
          if (part.kind === 'thinking') {
            group.work.push({ kind: 'thinking', key, part })
            group.hasWork = true
          } else {
            const last = entry.parts[entry.parts.length - 1]
            group.answer.push({
              key,
              entryId: entry.id,
              text: part.text,
              streaming: entry.streaming && part === last && last.kind === 'text'
            })
          }
        })
        break
      case 'tool':
        group.work.push({ kind: 'tool', key: entry.id, entry })
        group.hasWork = true
        break
      case 'approval':
        group.work.push({ kind: 'approval', key: entry.id, entry })
        group.hasWork = true
        if (entry.state === 'pending') group.pendingApproval = true
        break
    }
  }

  if (agentRunning && groups.length > 0) groups[groups.length - 1].live = true
  return groups
}
