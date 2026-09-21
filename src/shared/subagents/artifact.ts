/**
 * The pi-subagents async-run artifact envelope parsers — shared and PURE
 * (ticket 99). The status.json artifacts are LIVE augmentation only
 * (ADR-0002 spirit): they get cleaned up, so they are never a historical
 * source. Two tables sit on the same envelope:
 *
 *   - parseRunStateEnvelope — the directory's live badge state (the host
 *     bridge's status reads; ticket-90 semantics byte-identical).
 *   - parseTranscriptSourceEnvelope — the conversation tab's transcript
 *     source (ticket 99): WHICH child session file one run's tab should
 *     follow. The child is a real Pi session (the runner mirrors its
 *     events into the artifact, but the session file is the transcript).
 *
 * The file reads live node-side (host bridge / main sessions service) —
 * this module stays environment-free like every shared file. Absent or
 * corrupt artifacts resolve null at the read sites — no live evidence, no
 * invention.
 */

import type { SubagentRunState } from './types'

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function optString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

function finiteMs(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : undefined
}

const VALID_STATES: readonly string[] = ['queued', 'running', 'complete', 'failed', 'partial', 'paused', 'stopped', 'rejected']

function envelopeIdentity(raw: Record<string, unknown>): { runId: string; state: SubagentRunState['state'] } | null {
  const runId = optString(raw['runId']) ?? optString(raw['id'])
  const state = raw['state']
  if (runId === undefined) return null
  if (typeof state !== 'string' || !VALID_STATES.includes(state)) return null
  return { runId, state: state as SubagentRunState['state'] }
}

/**
 * The directory's live badge state from one status.json envelope (the
 * fields pi-subagents' runner writes; unknown fields ignored). Null for
 * envelopes without a usable run identity + state.
 */
export function parseRunStateEnvelope(raw: unknown): SubagentRunState | null {
  if (!isRecord(raw)) return null
  const identity = envelopeIdentity(raw)
  if (identity === null) return null
  const agents = Array.isArray(raw['agents']) ? raw['agents'].filter((a): a is string => typeof a === 'string') : undefined
  const nestedChildren = Array.isArray(raw['nestedChildren']) ? raw['nestedChildren'].filter(isRecord).length : 0
  return {
    runId: identity.runId,
    state: identity.state,
    ...(finiteMs(raw['startedAt']) !== undefined ? { startedAt: finiteMs(raw['startedAt']) } : {}),
    ...(finiteMs(raw['endedAt']) !== undefined ? { endedAt: finiteMs(raw['endedAt']) } : {}),
    ...(optString(raw['mode']) !== undefined ? { mode: optString(raw['mode']) } : {}),
    ...(agents !== undefined && agents.length > 0 ? { agents } : {}),
    ...(optString(raw['currentTool']) !== undefined ? { currentTool: optString(raw['currentTool']) } : {}),
    ...(optString(raw['activityState']) !== undefined ? { activityState: optString(raw['activityState']) } : {}),
    ...(nestedChildren > 0 ? { nestedCount: nestedChildren } : {})
  }
}

/**
 * Digs a nested record path (…keys) through unknown values — an EMPTY record
 * at the first non-record hop. The bridge's RPC reply reads and the
 * ticket-111 probe's reply digging share this guard cascade (the standards
 * review's dig finding) so the two never drift.
 */
export function digRecord(value: unknown, ...keys: string[]): Record<string, unknown> {
  let current: unknown = value
  for (const key of keys) {
    if (!isRecord(current)) return {}
    current = current[key]
  }
  return isRecord(current) ? current : {}
}

/** What the conversation tab needs from one run's artifact: the child
 * session file to follow (top-level, else the first step that records one —
 * chain/parallel runs keep per-step files), the run's state, and the step
 * count (multi-step context for the honest first-step note). */
export interface SubagentTranscriptSource {
  sessionFile: string | null
  state: SubagentRunState['state']
  steps: number
}

/**
 * The conversation tab's transcript source from one status.json envelope.
 * Null for envelopes without a usable run identity + state (the read site
 * turns a missing/corrupt FILE into the same honest null).
 */
export function parseTranscriptSourceEnvelope(raw: unknown): SubagentTranscriptSource | null {
  if (!isRecord(raw)) return null
  const identity = envelopeIdentity(raw)
  if (identity === null) return null
  const steps = Array.isArray(raw['steps']) ? raw['steps'] : []
  const stepFile = steps
    .filter(isRecord)
    .map((step) => optString(step['sessionFile']))
    .find((file) => file !== undefined)
  return {
    sessionFile: optString(raw['sessionFile']) ?? stepFile ?? null,
    state: identity.state,
    steps: steps.length
  }
}
