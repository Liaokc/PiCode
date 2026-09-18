/**
 * The subagent directory projection (ticket 90) — a pure Seam-1 model over:
 *
 *  1. PRIMARY SOURCE — subagent tool-call records replayed from the parent
 *     session transcript (ADR-0002 spirit: the session record is the single
 *     source of truth; reopening a session rebuilds the whole directory).
 *  2. LIVE AUGMENTATION — async-run states the host bridge forwards (read
 *     from the runs' status.json artifacts + the lifecycle events). The
 *     tmpdir artifacts get cleaned up, so they are never a historical
 *     source: a run with no artifact and no recorded completion projects as
 *     `lost`, never invented.
 *
 * Seven-state badge vocabulary (ZCode subagentDirectory), mapping finalized
 * in ticket 90:
 *
 *   source state                        → badge
 *   -----------------------------------+-----------
 *   call open (no result yet)           → Running
 *   artifact running / live child       → Running
 *   artifact queued                     → Waiting
 *   artifact paused / child paused      → Blocked
 *   artifact complete / child completed → Completed
 *   artifact failed·partial·rejected,
 *   child failed, errored result        → Failed
 *   artifact stopped / child stopped    → Cancelled
 *   async launch recorded, artifact
 *   gone, no completion evidence        → Lost
 *   child detached                      → Running (the child keeps working —
 *     a live sibling never lets the row claim Completed; documented
 *     ticket-90 deviation from pi's own completed>detached precedence)
 *
 * Child-status precedence follows pi's resolveGroupedStatus:
 * failed > stopped > paused > (detached > completed, the honest twist).
 */

import type { ChatEntry, ToolEntry } from '../chat-reducer'
import { clampInlineText } from './format'
import type { SubagentCallInfo, SubagentChildStatus, SubagentRowState, SubagentRunState } from './types'

/** The Ended section's initial visible row count (ZCode: "Show 20 more"). */
export const ENDED_VISIBLE_INITIAL = 20
/** One "Show 20 more" click reveals this many more ended rows. */
export const ENDED_PAGE_STEP = 20

/** The directory row's preview clamp (one line of result text). */
const PREVIEW_MAX_CHARS = 160

/** The title clamp (task text; the view truncates visually too). */
const TITLE_MAX_CHARS = 120

/**
 * Derive one foreground child's terminal status from its recorded fields —
 * a faithful mirror of pi-subagents' resolveSubagentResultStatus precedence:
 * detached → stopped → paused(interrupted) → exitCode 0 vs otherwise.
 * `status` (the async-results shape) wins when present.
 */
export function mapChildStatus(child: {
  status?: string
  exitCode?: number
  detached?: boolean
  interrupted?: boolean
  stopped?: boolean
  timedOut?: boolean
}): SubagentChildStatus {
  if (child.status === 'completed') return 'completed'
  if (child.status === 'detached') return 'detached'
  if (child.status === 'paused') return 'paused'
  if (child.status === 'stopped') return 'stopped'
  if (child.status === 'failed') return 'failed'
  if (child.detached) return 'detached'
  if (child.stopped) return 'stopped'
  if (child.interrupted) return 'paused'
  return typeof child.exitCode === 'number' && child.exitCode === 0 ? 'completed' : 'failed'
}

/** One artifact state → badge word (the mapping table's live half). */
export function mapArtifactState(
  state: SubagentRunState['state']
): Exclude<SubagentRowState, 'lost'> {
  switch (state) {
    case 'running':
      return 'running'
    case 'queued':
      return 'waiting'
    case 'paused':
      return 'blocked'
    case 'complete':
      return 'completed'
    case 'stopped':
      return 'cancelled'
    // partial = some children failed; rejected = the launch never happened.
    // Both are honest failures — the badge vocabulary has no finer word.
    case 'failed':
    case 'partial':
    case 'rejected':
      return 'failed'
  }
}

/** The row's badge state for one call: the live run state (when one exists)
 * wins over the replay projection; otherwise the transcript evidence rules. */
export function projectDirectoryRowState(
  info: SubagentCallInfo,
  toolState: 'running' | 'done' | 'error',
  resultIsError: boolean,
  runs: Readonly<Record<string, SubagentRunState>> | undefined
): SubagentRowState {
  const runId = info.asyncId ?? info.runId
  const live = runId !== undefined ? runs?.[runId] : undefined
  if (live !== undefined) return mapArtifactState(live.state)
  // The call is still open — the run is in flight (artifact states may
  // refine it later, but the transcript alone already proves Running).
  if (toolState === 'running') return 'running'
  // A closed async launch (the receipt's details name asyncId — real launch
  // receipts carry runId too, so asyncId is THE discriminator): without a
  // live artifact or a forwarded completion the run's fate is unknowable
  // (artifacts get cleaned) — Lost.
  if (info.asyncId !== undefined) return 'lost'
  // A closed foreground call: project its recorded children.
  const children = info.children ?? []
  if (children.length === 0) {
    // No structured children at all (pre-90 payload or a degenerate
    // result): the result's own error flag is the only honest evidence.
    return toolState === 'error' || resultIsError ? 'failed' : 'completed'
  }
  const statuses = children.map(mapChildStatus)
  if (statuses.includes('failed')) return 'failed'
  if (statuses.includes('stopped')) return 'cancelled'
  if (statuses.includes('paused')) return 'blocked'
  // Ticket-90 deviation from pi's own grouped precedence (completed >
  // detached): a detached child is still working — the row stays Running.
  if (statuses.includes('detached')) return 'running'
  return 'completed'
}

/** One projected directory row. */
export interface SubagentDirectoryRow {
  /** The parent tool call id — the stable row identity. */
  id: string
  /** Agent name (single) / first-task agent / the mode label. */
  agent: string
  /** Title: the task text (first task for parallel), else the agent, else
   * the mode label. */
  title: string
  state: SubagentRowState
  /** Epoch ms of the call's start (transcript receipt or replay timestamp). */
  startedAtMs: number
  /** Epoch ms of the recorded end when terminal — from the live artifact or
   * the completion event; null while the row is live-only evidence. */
  endedAtMs: number | null
  /** One-line result preview (ended rows): the first child's final output
   * or the completion event's summary; null when none was recorded. */
  preview: string | null
  /** Current tool of a live async run (Running rows only). */
  currentTool: string | null
  /** Nested subagents folded into this row (top-level display only). */
  nestedCount: number
  /** The async run id when the row is an async run (correlation key). */
  asyncId: string | null
  /** Number of recorded children (parallel/chain fan-out size). */
  childCount: number
}

/** The projected directory: two fixed sections + the paging state. */
export interface SubagentDirectoryModel {
  rows: SubagentDirectoryRow[]
  /** Live rows (Running/Waiting/Blocked), newest start first, unpaged. */
  running: SubagentDirectoryRow[]
  /** Terminal rows (Completed/Failed/Cancelled/Lost), newest start first,
   * visible slice. */
  ended: SubagentDirectoryRow[]
  endedTotal: number
  endedShown: number
  endedHidden: number
  showMoreVisible: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function argString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key]
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

/** The row title: first task → agent → mode → fallback. */
function rowTitle(args: Record<string, unknown>, info: SubagentCallInfo | undefined): { title: string; agent: string } {
  const tasks = args['tasks']
  const firstTask = Array.isArray(tasks) ? tasks.find((t) => isRecord(t)) : undefined
  const taskText =
    argString(args, 'task') ??
    (isRecord(firstTask) ? argString(firstTask, 'task') : undefined) ??
    argString(args, 'goal')
  const agent =
    argString(args, 'agent') ??
    (isRecord(firstTask) ? argString(firstTask, 'agent') : undefined) ??
    (Array.isArray(tasks) && tasks.length > 1 ? `${tasks.length} tasks` : undefined)
  const mode = info?.mode ?? 'subagent'
  const title = clampInlineText(taskText, TITLE_MAX_CHARS) ?? agent ?? mode
  return { title, agent: agent ?? mode }
}

/** True for a tool entry that IS a subagent call (the tool name is the
 * identity — the info field is optional on pre-90 payloads). */
function isSubagentCall(entry: ToolEntry): boolean {
  return entry.name === 'subagent'
}

/** The row's live correlation id: async runs correlate by asyncId (the
 * artifact key); foreground runs by their runId (completion events). */
function correlationId(info: SubagentCallInfo | undefined): string | null {
  return info?.asyncId ?? info?.runId ?? null
}

function projectRow(entry: ToolEntry, runs: Readonly<Record<string, SubagentRunState>> | undefined): SubagentDirectoryRow {
  const info = entry.subagent
  const state = projectDirectoryRowState(info ?? {}, entry.state, entry.state === 'error', runs)
  const { title, agent } = rowTitle(entry.args, info)
  const runId = correlationId(info)
  const live = runId !== null ? runs?.[runId] : undefined
  const firstWithOutput = info?.children?.find((child) => typeof child.finalOutput === 'string' && child.finalOutput.trim() !== '')
  const preview =
    live?.summary !== undefined
      ? clampInlineText(live.summary, PREVIEW_MAX_CHARS)
      : firstWithOutput !== undefined
        ? clampInlineText(firstWithOutput.finalOutput, PREVIEW_MAX_CHARS)
        : null
  const endedAtMs = live !== undefined && isTerminalBadge(state) && live.endedAt !== undefined ? live.endedAt : null
  return {
    id: entry.id,
    agent,
    title,
    state,
    startedAtMs: entry.startedAtMs ?? 0,
    endedAtMs,
    preview,
    currentTool: live !== undefined && !isTerminalBadge(state) ? (live.currentTool ?? null) : null,
    nestedCount: live?.nestedCount ?? 0,
    asyncId: info?.asyncId ?? null,
    childCount: info?.children?.length ?? 0
  }
}

function isTerminalBadge(state: SubagentRowState): boolean {
  return state === 'completed' || state === 'failed' || state === 'cancelled' || state === 'lost'
}

const BADGE_ORDER: Record<SubagentRowState, number> = {
  running: 0,
  waiting: 1,
  blocked: 2,
  completed: 3,
  failed: 4,
  cancelled: 5,
  lost: 6
}

/**
 * Project the directory from the session view's chat entries (the replayed
 * transcript IS the live transcript — the same entry stream) plus the live
 * run states the bridge forwards. `visibleEnded` carries the Show-20-more
 * step (component state; starts at ENDED_VISIBLE_INITIAL).
 */
export function subagentDirectoryFromEntries(
  entries: readonly ChatEntry[],
  runs: Readonly<Record<string, SubagentRunState>> | undefined,
  visibleEnded: number = ENDED_VISIBLE_INITIAL
): SubagentDirectoryModel {
  const rows: SubagentDirectoryRow[] = []
  for (const entry of entries) {
    if (entry.role !== 'tool' || !isSubagentCall(entry)) continue
    rows.push(projectRow(entry, runs))
  }
  const running = rows
    .filter((row) => !isTerminalBadge(row.state))
    .sort((a, b) => b.startedAtMs - a.startedAtMs || BADGE_ORDER[a.state] - BADGE_ORDER[b.state])
  const endedAll = rows
    .filter((row) => isTerminalBadge(row.state))
    .sort((a, b) => b.startedAtMs - a.startedAtMs)
  const endedShown = Math.min(endedAll.length, Math.max(0, visibleEnded))
  return {
    rows,
    running,
    ended: endedAll.slice(0, endedShown),
    endedTotal: endedAll.length,
    endedShown,
    endedHidden: endedAll.length - endedShown,
    showMoreVisible: endedAll.length > endedShown
  }
}
