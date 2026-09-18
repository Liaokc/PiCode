/**
 * Turn-collapse model (ticket 23, split rules revised by tickets 53 and 56,
 * container permanence by ticket 55, live chronology by ticket 82): the
 * transcript folds each turn's work — thinking rows, tool cards, approval
 * pills, skill marker and (settled only) interim narration — into a single
 * "Working · Ns" / "Worked · Ns" container row. ZCode-evidence behavior with
 * ONE operator-approved deviation (ticket 55):
 *
 *   - turn boundary = the user message; everything after it (thinking, tools,
 *     approvals, assistant text) belongs to that turn;
 *   - a LIVE turn (ticket 82, revising the tickets-53/56 live semantics)
 *     renders as a pure chronological single stream: every assistant text
 *     block is an inline stream item between the tool/thinking/approval rows
 *     in transcript order, streaming with the expanded container. NOTHING is
 *     promoted to a temporary answer below the container, there is no
 *     always-visible segment while live, and NOTHING re-splits while
 *     streaming — a new text block appends where it happens (no demotion
 *     carousel). A pending approval parks in the stream at the very slot its
 *     tool card will occupy; the reducer converts the pill in place, so the
 *     two states share one slot — zero jump;
 *   - a SETTLED turn's ANSWER is its LAST text part — a positional rule, not
 *     a semantic one (ticket 53, ZCode `latestAssistantTextRow` alignment).
 *     Earlier text parts are INTERIM NARRATION and fold into the container.
 *     The split runs in one move at settle (agent_end) and never changes
 *     afterwards;
 *   - in a SETTLED turn every row after the answer — tool, thinking or
 *     approval — joins the always-visible after-answer segment (常显段) below
 *     the answer, in transcript order (ticket 56 revises ticket 53's
 *     tools-only Q11a cut to the ZCode `assistantFollowingRows` shape);
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
import { aggregateTurnFiles, type TurnFileChange } from './turn-files'

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

/** One item inside the container: a thinking part, an inline stream text
 * block (LIVE only, ticket 82), an interim narration text block (SETTLED
 * only, ticket 53), a tool card or an approval pill, in transcript order. */
export type TurnWorkItem =
  | { kind: 'thinking'; key: string; part: ThinkingPart }
  | { kind: 'text'; key: string; entryId: string; text: string; streaming: boolean }
  | { kind: 'narration'; key: string; entryId: string; text: string }
  | { kind: 'tool'; key: string; entry: ToolEntry }
  | { kind: 'approval'; key: string; entry: ApprovalEntry }

/** The turn's answer (ticket 53): exactly the turn's LAST text part — a
 * SETTLED-state concept only (ticket 82: live turns promote nothing). The
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
  /** Thinking rows, tool cards and approval pills, plus the turn's text
   * blocks — whose shape depends on the turn's state (ticket 82): LIVE turns
   * carry inline stream `text` items here (the whole turn in one
   * chronological stream); SETTLED turns carry earlier text parts as
   * `narration` (hidden while collapsed, ticket 56: post-answer rows no
   * longer fold here; they join the after-answer segment). */
  work: TurnWorkItem[]
  /** The turn's answer: its last text part, or null when the turn produced
   * no assistant text. At most one — 有且仅有一个 (ticket 53). SETTLED-STATE
   * ONLY (ticket 82): null while the turn is live — nothing streams below
   * the container; at agent_end the last text part lifts out as the answer.
   */
  answer: TurnAnswerPart | null
  /** The always-visible AFTER-ANSWER SEGMENT (常显段, ticket 56): every
   * non-text row that came after the answer — tools, thinking, approvals —
   * in transcript order, rendered below the answer. SETTLED-STATE ONLY
   * (ticket 82): empty while live — every row streams inside the container's
   * chronological single stream instead. The settled pending approval parks
   * here at the slot its tool card will convert into (zero jump); while live
   * the pill parks inline in the stream at the same slot. */
  afterAnswer: TurnWorkItem[]
  /** The turn's aggregated file changes (ticket 78): every settled edit/write
   * call in the TURN — fold body and after-answer segment alike — folded into
   * per-file rows for the "N files changed +X −Y" bar. Empty when the turn
   * changed no files (无更改回合不出条). SETTLED-STATE ONLY (ticket 92): a
   * live turn carries NO fileChanges — the bar never renders while the turn
   * streams, and the aggregate lands in one move at agent_end, in place
   * (below the answer / after the container, composition unchanged). A
   * turn_error or a user Stop settles through the same path (settle(state,
   * false)), so its bar still shows — file changes are a fact projection,
   * unrelated to how the turn ended. Pure projection of `work` +
   * `afterAnswer`'s tool entries. */
  fileChanges: TurnFileChange[]
  /** The turn currently streaming: container renders expanded and ticking. */
  live: boolean
  /** A pending approval inside the container keeps it open (auto-open). A
   * pending pill in a settled turn's after-answer segment never forces the
   * fold: it is already visible below the answer, and opening the fold for
   * it would slam it shut again the moment the decision resolves — a jump
   * across the very slot the pill↔card pair must share (ticket 56). While
   * live (ticket 82) every pill is inside the stream, so a gate ask always
   * re-engages the open — even over a manual mid-stream collapse. */
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

/** One transcript item before the state split — the raw material the state
 * decides between: the live turn streams it verbatim as the chronological
 * single stream (ticket 82), the settled decision table (last text block /
 * narration / post-answer rows) cuts it into work / answer / afterAnswer. */
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
 * The SETTLED split decision table (ticket 53, revised by ticket 56), applied
 * to one turn's raw items in transcript order. The LAST text item becomes the
 * answer; earlier text items become narration work; EVERY non-text row after
 * that text — tool, thinking or approval — joins the always-visible
 * after-answer segment (常显段, ZCode assistantFollowingRows shape — ticket 56
 * widens ticket 53's tools-only Q11a cut); everything before it stays
 * foldable work.
 *
 * Ticket 82 moves this table out of the streaming path: it applies exactly
 * ONCE, at settle (agent_end) — the promotion/demotion re-split it used to
 * perform on every new text block is retired. While the turn streams,
 * chronologicalTurn keeps everything inline in time order.
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
 * The LIVE stream (ticket 82): pure chronological single stream. Every raw
 * item — thinking, text, tool, approval — stays in transcript order as
 * container content; text blocks become inline `text` stream items (the
 * same markdown the settled answer renders), never gray narration. No
 * answer is promoted below the container, no after-answer segment exists,
 * and the stream is append-only: a new text block lands where it happens,
 * so nothing ever jumps. The settled re-split (splitTurn) runs once at
 * settle and produces the final answer + segment in one move.
 */
function chronologicalTurn(raw: readonly RawItem[]): Pick<TurnGroup, 'work' | 'answer' | 'afterAnswer'> {
  // RawItem's members are structurally the TurnWorkItem shapes — the `text`
  // member becomes the inline stream block verbatim.
  const work: TurnWorkItem[] = [...raw]
  return { work, answer: null, afterAnswer: [] }
}

/**
 * Group the flat transcript into turns. `agentRunning` marks the last group
 * live (the run may still stream into it): the live turn takes the pure
 * chronological single stream (ticket 82), settled turns take the positional
 * split (ticket 53/56) unchanged. Pure — no time, no I/O.
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

  const groups = drafts.map((draft, index) => {
    // Liveness is known BEFORE the split (ticket 82): the last turn streams
    // while the agent runs. The live turn renders the pure chronological
    // single stream — no answer promotion, no segment, no re-split while
    // streaming; settled turns keep the ticket-53/56 split byte-identical.
    const live = agentRunning && index === drafts.length - 1
    const { work, answer, afterAnswer } = live ? chronologicalTurn(draft.raw) : splitTurn(draft.raw)
    // Ticket 78: the whole turn's tool entries in transcript order — fold
    // body and after-answer segment alike — feed the file change aggregation.
    // splitTurn reorders nothing within each list. Ticket 92 gates the bar on
    // settle: a live turn carries NO fileChanges (the bar would be a moving
    // distractor), the aggregate lands in one move at agent_end; stop/error
    // turns settle too, so theirs still show.
    const fileChanges = live
      ? []
      : aggregateTurnFiles([...work, ...afterAnswer].flatMap((item) => (item.kind === 'tool' ? [item.entry] : [])))
    return {
      id: draft.id,
      user: draft.user,
      skillName: draft.skillName,
      userText: draft.userText,
      work,
      answer,
      afterAnswer,
      fileChanges,
      live,
      // Ticket 56/82: only a pill inside the fold keeps it open. While live
      // every pill IS inside the fold (the whole stream is), so a gate ask
      // always re-engages the open — even over a manual mid-stream collapse.
      // A settled pending pill below the answer renders without the fold and
      // must not force the container (otherwise the fold opened for it would
      // slam shut on the decision, jumping the two-state slot).
      pendingApproval: work.some((item) => item.kind === 'approval' && item.entry.state === 'pending'),
      hasWork: draft.skillName !== null || work.length > 0,
      hasContainer: draft.user !== null || draft.skillName !== null || work.length > 0 || live
    }
  })
  return groups
}
