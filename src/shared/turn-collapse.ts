/**
 * Turn-collapse model (ticket 23, split rules revised by tickets 53 and 56,
 * container permanence by ticket 55): the transcript folds each turn's
 * pre-answer work — thinking rows, interim narration, tool cards, approval
 * pills, skill marker — into a single "Working · Ns" / "Worked · Ns"
 * container row. ZCode-evidence behavior with ONE operator-approved deviation
 * (ticket 55):
 *
 *   - turn boundary = the user message; everything after it (thinking, tools,
 *     approvals, assistant text) belongs to that turn;
 *   - the turn's ANSWER is its LAST text part — a positional rule, not a
 *     semantic one (ticket 53, ZCode `latestAssistantTextRow` alignment).
 *     Earlier text parts are INTERIM NARRATION and fold into the container;
 *   - EVERY row after the answer — tool, thinking or approval — joins the
 *     always-visible after-answer segment (常显段) below the answer, in
 *     transcript order, live and settled at the same position (ticket 56
 *     revises ticket 53's tools-only Q11a cut to the ZCode
 *     `assistantFollowingRows` shape). The pending approval parks in the
 *     segment at the very slot its tool card will occupy; the reducer
 *     converts the pill in place, so the two states share one slot — zero
 *     jump. A new text block re-splits: the old answer demotes to narration,
 *     segment rows roll back into the container, the segment clears
 *     (中途的正文不能是最后的正文 — ticket 53 rule, operator reaffirmed);
 *   - EVERY turn with a user bubble owns its container row — live
 *     "Working · Ns" from the silent period on, settled "Worked · Ns",
 *     replayed "Worked" (ticket 14 rule). ZCode drops the row for zero-work
 *     turns (bundle `u ? … : null`); the operator ruled the row permanent —
 *     the answer text itself counts as the work phase. A zero-work turn's
 *     container body is EMPTY and NOT expandable (可展开 ⇔ 体非空, Q12 = A);
 *   - the head segment (entries before the first user message) keeps the
 *     ticket-23 status quo: renders only with foldable work or while live;
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
  /** Thinking rows, interim narration, tool cards and approval pills that
   * precede the answer — hidden while collapsed (ticket 56: post-answer rows
   * no longer fold here; they join the after-answer segment). */
  work: TurnWorkItem[]
  /** The turn's answer: its last text part, or null when the turn produced
   * no assistant text. At most one — 有且仅有一个 (ticket 53). */
  answer: TurnAnswerPart | null
  /** The always-visible AFTER-ANSWER SEGMENT (常显段, ticket 56): every
   * non-text row that came after the answer — tools, thinking, approvals —
   * in transcript order, rendered below the answer, live and settled at the
   * same position. The pending approval parks here at the slot its tool
   * card will convert into (zero jump). Empty when the turn ends on its
   * answer or produces no text at all. */
  afterAnswer: TurnWorkItem[]
  /** The turn currently streaming: container renders expanded and ticking. */
  live: boolean
  /** A pending approval INSIDE the container body keeps it open (auto-open).
   * A pending pill in the after-answer segment never forces the fold: it is
   * already visible below the answer, and opening the fold for it would slam
   * it shut again the moment the decision resolves — a jump across the very
   * slot the pill↔card pair must share (ticket 56). */
  pendingApproval: boolean
  /** The container BODY holds foldable content: the skill marker or at least
   * one work item (after-answer rows don't count — they render without the
   * container, ticket 56). Doubles as the ticket-55 empty-body flag: 可展开 ⇔ hasWork
   * — a zero-work turn's container is a bare, non-expandable row. */
  hasWork: boolean
  /** The container ROW renders at all (ticket 55, operator-approved ZCode
   * deviation — ZCode drops the row for zero-work turns, the operator ruled
   * the row permanent: "正文输出也算 work 阶段"). EVERY turn with a user
   * bubble owns one; the defensive head segment keeps the ticket-23 status
   * quo (renders only with foldable work or while live). */
  hasContainer: boolean
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
  /** Ordinal for the next assistant part inside this turn. Part keys are
   * POSITIONAL (turn id + ordinal), never the owning entry's id: the
   * ticket-51 real-id backfill rewrites an assistant entry's id at
   * message_end, and an id-derived key would remount the streamed subtree
   * mid-session. Parts only ever append, so ordinals are stable from first
   * render through the answer↔narration split. */
  nextPartIndex: number
}

/**
 * The split decision table (ticket 53, revised by ticket 56), applied to one
 * turn's raw items in transcript order. The LAST text item becomes the
 * answer; earlier text items become narration work; EVERY non-text row after
 * that text — tool, thinking or approval — joins the always-visible
 * after-answer segment (常显段, ZCode assistantFollowingRows shape — ticket 56
 * widens ticket 53's tools-only Q11a cut); everything before it stays
 * foldable work.
 *
 * The table re-splits on every call, which IS the demotion rule (ticket 53,
 * reaffirmed by the operator): the moment a new text block starts streaming,
 * lastText moves to it — the old answer becomes narration, rows that had
 * entered the segment roll back into the container, and the segment itself
 * clears (nothing trails the new, still-streaming tail). 中途的正文不能是
 * 最后的正文 — time order holds at every instant.
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
    if (lastText !== -1 && index > lastText) {
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
      // Ticket 56: only a pill INSIDE the fold keeps it open. A pending pill
      // in the after-answer segment renders below the answer and must not
      // force the container — otherwise the fold (opened for the pill) would
      // slam shut the moment the decision resolves, jumping the very slot
      // the two-state pill↔card pair must share.
      pendingApproval: work.some((item) => item.kind === 'approval' && item.entry.state === 'pending'),
      hasWork: draft.skillName !== null || work.length > 0,
      hasContainer: draft.user !== null || draft.skillName !== null || work.length > 0
    }
  })
  if (agentRunning && groups.length > 0) {
    const last = groups[groups.length - 1]
    last.live = true
    // A streaming turn keeps its container row even when nothing has streamed
    // into it yet — the head segment included (ticket-23 live shell stands).
    last.hasContainer = true
  }
  return groups
}
