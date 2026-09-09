/**
 * Turn-collapse model (ticket 23, split rules revised by ticket 53): the
 * settled transcript folds each turn's work — thinking rows, interim
 * narration, tool cards, approval pills, skill marker — into a single
 * "Working · Ns" container row. ZCode-evidence behavior:
 *
 *   - turn boundary = the user message; everything after it (thinking, tools,
 *     approvals, assistant text) belongs to that turn;
 *   - the turn's ANSWER is its LAST text part — a positional rule, not a
 *     semantic one (ticket 53, ZCode `latestAssistantTextRow` alignment).
 *     Earlier text parts are INTERIM NARRATION and fold into the container;
 *   - tools that ran AFTER the answer stay visible below it, in transcript
 *     order (ticket 53, Q11a) — they never fold. Post-answer thinking and
 *     approvals stay container content (ticket 23 behavior unchanged);
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

/** One item inside the collapsed container: a thinking part, an interim
 * narration text block (ticket 53), a tool card or an approval pill, in
 * transcript order. */
export type TurnWorkItem =
  | { kind: 'thinking'; key: string; part: ThinkingPart }
  | { kind: 'narration'; key: string; entryId: string; text: string }
  | { kind: 'tool'; key: string; entry: ToolEntry }
  | { kind: 'approval'; key: string; entry: ApprovalEntry }

/** The turn's answer (ticket 53): exactly the turn's LAST text part. The
 * entry id is the fork anchor (ticket 16) — the last text-bearing entry, the
 * same anchor the pre-53 "all texts are the answer" shape produced. */
export interface TurnAnswerPart {
  key: string
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
  /** Thinking rows, interim narration, tool cards and approval pills —
   * hidden while collapsed. Post-answer thinking/approvals fold here too:
   * only TOOLS leave the container after the answer (ticket 53). */
  work: TurnWorkItem[]
  /** The turn's answer: its last text part, or null when the turn produced
   * no assistant text. At most one — 有且仅有一个 (ticket 53). */
  answer: TurnAnswerPart | null
  /** Tool cards that ran after the answer — always visible below it, in
   * transcript order (ticket 53, ZCode rule). */
  afterAnswer: TurnWorkItem[]
  /** The turn currently streaming: container renders expanded and ticking. */
  live: boolean
  /** A pending approval inside this turn keeps the container open. */
  pendingApproval: boolean
  /** The container row renders at all only when there is something to fold
   * (skill marker or foldable work — after-answer rows don't count: they
   * render without the container). */
  hasWork: boolean
}

/** One transcript item before the positional split — the raw material the
 * decision table (last text block / narration / post-answer tools) cuts into
 * work / answer / afterAnswer. */
type RawItem =
  | { kind: 'thinking'; key: string; part: ThinkingPart }
  | { kind: 'text'; key: string; entryId: string; text: string; streaming: boolean }
  | { kind: 'tool'; key: string; entry: ToolEntry }
  | { kind: 'approval'; key: string; entry: ApprovalEntry }

interface TurnDraft {
  id: string
  user: UserEntry | null
  skillName: string | null
  userText: string
  raw: RawItem[]
  pendingApproval: boolean
  /** Ordinal for the next assistant part inside this turn. Part keys are
   * POSITIONAL (turn id + ordinal), never the owning entry's id: the
   * ticket-51 real-id backfill rewrites an assistant entry's id at
   * message_end, and an id-derived key would remount the streamed subtree
   * mid-session. Parts only ever append, so ordinals are stable from first
   * render through the answer↔narration split. */
  nextPartIndex: number
}

/**
 * The ticket-53 split decision table, applied to one turn's raw items in
 * transcript order. The LAST text item becomes the answer; earlier text
 * items become narration work; tools after that text become the
 * always-visible afterAnswer segment; everything else (thinking, approvals,
 * pre-answer tools) stays foldable work — including thinking that streamed
 * after the answer (only tool rows are the 常显 segment, per spec Q11a).
 */
function splitTurn(raw: RawItem[]): Pick<TurnGroup, 'work' | 'answer' | 'afterAnswer'> {
  const lastText = raw.findLastIndex((item) => item.kind === 'text')
  const work: TurnWorkItem[] = []
  const afterAnswer: TurnWorkItem[] = []
  let answer: TurnAnswerPart | null = null
  raw.forEach((item, index) => {
    if (item.kind === 'text') {
      if (index === lastText) {
        answer = { key: item.key, entryId: item.entryId, text: item.text, streaming: item.streaming }
      } else {
        work.push({ kind: 'narration', key: item.key, entryId: item.entryId, text: item.text })
      }
      return
    }
    // lastText === -1 (no text at all) leaves everything in the fold —
    // afterAnswer is defined only relative to an existing answer.
    if (lastText !== -1 && index > lastText && item.kind === 'tool') {
      afterAnswer.push(item)
      return
    }
    work.push(item)
  })
  return { work, answer, afterAnswer }
}

/**
 * Group the flat transcript into turns. `agentRunning` marks the last group
 * live (the run may still stream into it). Pure — no time, no I/O.
 */
export function groupTurns(entries: ChatEntry[], agentRunning: boolean): TurnGroup[] {
  const drafts: TurnDraft[] = []
  let current: TurnDraft | null = null

  for (const entry of entries) {
    if (entry.role === 'user') {
      current = {
        id: entry.id,
        user: entry,
        skillName: entry.skillName,
        userText: stripSkillPrologue(entry.text, entry.skillName),
        raw: [],
        pendingApproval: false,
        nextPartIndex: 0
      }
      drafts.push(current)
      continue
    }
    if (current === null) {
      current = {
        id: HEAD_TURN_ID,
        user: null,
        skillName: null,
        userText: '',
        raw: [],
        pendingApproval: false,
        nextPartIndex: 0
      }
      drafts.push(current)
    }
    const draft: TurnDraft = current
    switch (entry.role) {
      case 'assistant':
        entry.parts.forEach((part) => {
          const key = `${draft.id}-p${draft.nextPartIndex++}`
          if (part.kind === 'thinking') {
            draft.raw.push({ kind: 'thinking', key, part })
          } else {
            const last = entry.parts[entry.parts.length - 1]
            draft.raw.push({
              kind: 'text',
              key,
              entryId: entry.id,
              text: part.text,
              streaming: entry.streaming && part === last && last.kind === 'text'
            })
          }
        })
        break
      case 'tool':
        draft.raw.push({ kind: 'tool', key: entry.id, entry })
        break
      case 'approval':
        draft.raw.push({ kind: 'approval', key: entry.id, entry })
        if (entry.state === 'pending') draft.pendingApproval = true
        break
    }
  }

  const groups = drafts.map((draft) => {
    const { work, answer, afterAnswer } = splitTurn(draft.raw)
    return {
      id: draft.id,
      user: draft.user,
      skillName: draft.skillName,
      userText: draft.userText,
      work,
      answer,
      afterAnswer,
      live: false,
      pendingApproval: draft.pendingApproval,
      hasWork: draft.skillName !== null || work.length > 0
    }
  })
  if (agentRunning && groups.length > 0) groups[groups.length - 1].live = true
  return groups
}
