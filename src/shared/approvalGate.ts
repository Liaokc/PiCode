/**
 * The tool-approval gate (ticket 03), held by the child host.
 *
 * Pure and dependency-injected so the host-side behaviours — per-tool default
 * caching, suspension of a tool until the user's decision, resumption on
 * `approvalResponse`, and the abort/shutdown rejection that prevents deadlock —
 * are unit-testable without a real SDK or process boundary.
 *
 * The host injects `emit` (to surface an `approvalRequest` to the parent) and
 * `isChild` (standalone runs auto-allow so a manual dev smoke completes).
 */
import type { ApprovalResponse } from "./contract";

/** The resolved outcome of a tool approval for the host side. */
export interface ApprovalOutcome {
  allow: boolean;
  reason?: string;
}

/** The parameters the host must supply for the gate to talk to its parent. */
export interface ApprovalGateDeps {
  /** Surface an approval request to the parent (the renderer). */
  emit: (request: {
    kind: "approvalRequest";
    requestId: string;
    toolName: string;
    args: Record<string, unknown>;
  }) => void;
  /** Standalone runs (no parent) auto-allow so a dev smoke still completes. */
  isChild: boolean;
}

export interface ApprovalGate {
  requestApproval: (toolName: string, args: Record<string, unknown>) => Promise<ApprovalOutcome>;
  respond: (response: ApprovalResponse) => void;
  rejectAll: (reason: string) => void;
  /** Defaults decided so far (exposed for tests / diagnostics). */
  readonly defaults: Map<string, "allow" | "deny">;
}

export function createApprovalGate(deps: ApprovalGateDeps): ApprovalGate {
  const pending = new Map<string, (response: ApprovalResponse) => void>();
  const defaults = new Map<string, "allow" | "deny">();
  let requestCounter = 0;

  function requestApproval(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<ApprovalOutcome> {
    // Standalone runs (no parent to answer) auto-allow so a manual dev smoke of
    // the host still completes; the real app and the forked smokes have a parent.
    if (!deps.isChild) return Promise.resolve({ allow: true });

    // A saved default short-circuits the renderer round-trip.
    const remembered = defaults.get(toolName);
    if (remembered) {
      return Promise.resolve({
        allow: remembered === "allow",
        reason: remembered === "deny" ? `blocked by saved default for ${toolName}` : undefined,
      });
    }

    const requestId = `ap-${++requestCounter}`;
    return new Promise<ApprovalOutcome>((resolve) => {
      pending.set(requestId, (response) => {
        if (response.remember) defaults.set(toolName, response.decision);
        resolve({
          allow: response.decision === "allow",
          reason: response.decision === "deny" ? response.reason : undefined,
        });
      });
      deps.emit({ kind: "approvalRequest", requestId, toolName, args });
    });
  }

  function respond(response: ApprovalResponse): void {
    // The real response always carries a requestId; a synthesized one from
    // rejectAll passes the caller-provided id.
    const resolver = pending.get(response.requestId);
    if (!resolver) return;
    pending.delete(response.requestId);
    resolver(response);
  }

  /** Resolve every suspended tool as a deny (on abort/shutdown) — no deadlock. */
  function rejectAll(reason: string): void {
    for (const [requestId, resolver] of pending) {
      resolver({ kind: "approvalResponse", requestId, decision: "deny", reason });
      pending.delete(requestId);
    }
  }

  return { requestApproval, respond, rejectAll, defaults };
}
