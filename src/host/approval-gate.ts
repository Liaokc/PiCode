/**
 * The PiCode approval gate (host side, one instance per host process = per
 * Session). Tiers come from the Access Mode presets (shared/composer/access);
 * a `tool_call` decision of "ask" parks a waiter keyed by tool call id and
 * emits `approval_required` to the renderer — the inline approve/deny-with-
 * reason pill. `remember` rules attach to the tier that earned them and
 * survive tier switches within the session.
 *
 * This module is SDK-free and timing-free; the extension that calls it lives
 * in gate-extension.ts, and the host process answers `approve_tool` /
 * `deny_tool` commands through `resolve`.
 */

import type { AccessMode, HostToParent } from '../shared/contract'
import {
  DEFAULT_ACCESS_MODE,
  decideGate,
  emptyRules,
  rememberRule,
  rulesForMode,
  type RulesByMode
} from '../shared/composer/access'

export interface GateAsk {
  toolCallId: string
  toolName: string
  args: Record<string, unknown>
}

export interface GateAnswer {
  approved: boolean
  reason: string
  remember: boolean
}

/** The one event kind the gate emits. */
type ApprovalRequiredEvent = Extract<HostToParent, { type: 'approval_required' }>

export class ApprovalGate {
  private mode: AccessMode = DEFAULT_ACCESS_MODE
  private rules: RulesByMode = emptyRules()
  private waiters = new Map<string, (answer: GateAnswer) => void>()

  getMode(): AccessMode {
    return this.mode
  }

  setMode(mode: AccessMode): void {
    this.mode = mode
  }

  /** The gate decision for a tool call under the current tier + its rules. */
  decide(toolName: string): 'allow' | 'ask' | 'deny' {
    return decideGate(this.mode, toolName, rulesForMode(this.rules, this.mode))
  }

  /** Why a tier auto-denies (fed back to the agent as the blocked reason). */
  denialReason(toolName: string): string {
    return `Denied by the approval gate: Access Mode "Read Only" does not allow "${toolName}". Switch Access Mode to run it.`
  }

  /** Park a decision waiter and emit the pill to the renderer. */
  request(ask: GateAsk, emit: (event: ApprovalRequiredEvent) => void): Promise<GateAnswer> {
    // A stale waiter with the same id (should not happen) resolves denied.
    this.waiters.get(ask.toolCallId)?.({ approved: false, reason: 'Superseded.', remember: false })
    return new Promise<GateAnswer>((resolve) => {
      this.waiters.set(ask.toolCallId, resolve)
      emit({ type: 'approval_required', toolCallId: ask.toolCallId, toolName: ask.toolName, args: ask.args })
    })
  }

  /** Deliver the renderer's answer; false when no waiter matches the id. */
  resolve(toolCallId: string, answer: GateAnswer): boolean {
    const waiter = this.waiters.get(toolCallId)
    if (!waiter) return false
    this.waiters.delete(toolCallId)
    waiter(answer)
    return true
  }

  /** Store a same-tool approve rule under the CURRENT tier. */
  remember(toolName: string): void {
    this.rules = rememberRule(this.rules, this.mode, toolName)
  }

  /** Resolve every pending pill as denied (abort / turn end / shutdown). */
  cancelAll(reason: string): void {
    for (const [id, waiter] of this.waiters) {
      waiter({ approved: false, reason, remember: false })
      this.waiters.delete(id)
    }
  }

  pendingIds(): string[] {
    return [...this.waiters.keys()]
  }
}
