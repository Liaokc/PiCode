/**
 * Subagent bridge vocabulary (ticket 90): the PiCode-local DTOs the host's
 * inline extension bridge forwards from pi-subagents' in-process RPC and
 * lifecycle events, plus the seven-state directory vocabulary. Everything
 * here is JSON-serializable and SDK-free (Seam-1): the renderer consumes
 * these shapes without importing Pi.
 *
 * Epistemology (ADR-0002 spirit): the parent session record is the single
 * source of truth for WHAT ran (replayed subagent tool calls); the async
 * run artifacts (status.json, tmpdir) are LIVE augmentation only — they get
 * cleaned up, so they are never a historical source. A run whose artifacts
 * are gone and whose completion was never recorded projects as `lost`.
 */

// ---- the seven-state badge vocabulary (ZCode subagentDirectory) ----------

/**
 * The directory's status badge vocabulary, fixed to ZCode's seven states.
 * The mapping from pi-subagents run states is table-driven in
 * `./directory.ts` (finalized in ticket 90 and archived there).
 */
export type SubagentRowState =
  | 'running'
  | 'waiting'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'lost'

// ---- one subagent tool call's structured identity (primary source) -------

/** pi-subagents' own terminal status for one child result
 * (resolveSubagentResultStatus: detached → stopped(signal) → paused →
 * completed → failed; exitCode 0 vs otherwise as the fallback). */
export type SubagentChildStatus = 'completed' | 'failed' | 'paused' | 'stopped' | 'detached'

/** One child of a subagent run, projected from the tool result's recorded
 * details (or the live result). Statuses pi adds later ride through the
 * loose `status` string — unknown values map to Failed in the directory
 * model (honest: an unrecognized terminal state is not success). Foreground
 * SingleResult children record no `status` — the terminal fields project
 * instead and the model derives the status (pi's own precedence). */
export interface SubagentCallChild {
  agent?: string
  status?: string
  /** The child's recorded final output — clamped by the projection site. */
  finalOutput?: string
  error?: string
  exitCode?: number
  detached?: boolean
  interrupted?: boolean
  stopped?: boolean
  timedOut?: boolean
}

/**
 * Ticket 90 (additive projection, reported into the host-contract smoke):
 * pi-subagents structured run identity for ONE `subagent` tool call, read
 * from the toolResult's recorded `details` (replay) or the live SDK result
 * (`tool_end`). Rides the tool item / tool_end event as the optional
 * `subagent` field — ABSENT on every other tool and on pre-90 payloads;
 * consumers must treat absence as "not a subagent call (or an old
 * payload)", never default it.
 */
export interface SubagentCallInfo {
  /** pi-subagents execution mode: single / parallel / chain / workflow. */
  mode?: string
  /** Foreground run id (details.runId). */
  runId?: string
  /** Async run id (details.asyncId) — present on async launches. */
  asyncId?: string
  /** Async run artifact dir (details.asyncDir) — the live status.json root. */
  asyncDir?: string
  /** Per-child outcomes recorded in details.results. */
  children?: SubagentCallChild[]
}

// ---- live augmentation DTOs (bridge-forwarded) ----------------------------

/**
 * One live async run's state, read from its status.json artifact by the
 * host bridge (or refined by a forwarded lifecycle event). The artifact is
 * LIVE augmentation only — a run whose artifact is gone and whose completion
 * was never forwarded stays unknown (`lost`), never invented.
 */
export interface SubagentRunState {
  runId: string
  /** pi-subagents artifact state (AsyncStatus.state). */
  state: 'queued' | 'running' | 'complete' | 'failed' | 'partial' | 'paused' | 'stopped' | 'rejected'
  startedAt?: number
  endedAt?: number
  mode?: string
  agents?: string[]
  currentTool?: string
  activityState?: string
  /** Nested children count (top-level display only — the folded count). */
  nestedCount?: number
  /** Terminal one-line summary from a forwarded completion event. */
  summary?: string
}

/** One entry of pi-subagents' fleet DTO (bounded, current-session display
 * record with an opaque reconciliation key — never a run id). */
export interface SubagentFleetEntryDTO {
  key: string
  agent: string
  role?: string
  model?: string
  effort?: string
  startedAt: number
  tokens: { input: number; output: number; total: number }
  goal?: string
}

/** pi-subagents' fleet DTO projection (opaque keys, bounded entries). */
export interface SubagentFleetDTO {
  entries: SubagentFleetEntryDTO[]
  totalActive: number
  omitted: number
}
