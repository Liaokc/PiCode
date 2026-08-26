/**
 * Unit tests for the tool-approval gate (ticket 03).
 *
 * The gate is dependency-injected and pure, so this is the deterministic seam
 * for the host-side contract: a tool is suspended until the user's decision,
 * allow resumes it, deny blocks it (with a reason), a saved per-tool default
 * short-circuits the round-trip, and rejectAll (abort/shutdown) unblocks every
 * suspended tool so nothing deadlocks.
 */
import { describe, expect, it } from "vitest";
import { createApprovalGate } from "./approvalGate";

/** A fake host: records emitted approval requests, `isChild: true` (has parent). */
function makeGate() {
  const emitted: { requestId: string; toolName: string; args: Record<string, unknown> }[] = [];
  const gate = createApprovalGate({
    isChild: true,
    emit: (request) => emitted.push(request),
  });
  return { gate, emitted };
}

describe("tool-approval gate (host contract)", () => {
  it("suspends a tool and emits an approval request before it runs", async () => {
    const { gate, emitted } = makeGate();
    // Drive the pending request without resolving its promise yet.
    const outcomeP = gate.requestApproval("bash", { command: "ls" });
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({ toolName: "bash", args: { command: "ls" } });

    // No resolution yet while the renderer hasn't decided.
    const settled = await Promise.race([
      outcomeP.then(() => true),
      new Promise<false>((r) => setTimeout(() => r(false), 20)),
    ]);
    expect(settled).toBe(false);

    const response = { kind: "approvalResponse" as const, requestId: emitted[0].requestId, decision: "allow" as const };
    gate.respond(response);
    await expect(outcomeP).resolves.toEqual({ allow: true });
  });

  it("blocks a denied tool with the user's reason reaching the handler", async () => {
    const { gate, emitted } = makeGate();
    const outcomeP = gate.requestApproval("write", { path: "/tmp/x" });
    gate.respond({
      kind: "approvalResponse",
      requestId: emitted[0].requestId,
      decision: "deny",
      reason: "don't touch that file",
    });
    await expect(outcomeP).resolves.toEqual({ allow: false, reason: "don't touch that file" });
  });

  it("remembers a saved default so a safe tool is not re-asked", async () => {
    const { gate, emitted } = makeGate();
    // Allow `ls` and remember it.
    const first = gate.requestApproval("ls", {});
    gate.respond({ kind: "approvalResponse", requestId: emitted[0].requestId, decision: "allow", remember: true });
    await expect(first).resolves.toEqual({ allow: true });

    // Second call short-circuits: no request emitted, auto-allowed.
    const second = gate.requestApproval("ls", { path: "." });
    expect(emitted).toHaveLength(1);
    await expect(second).resolves.toEqual({ allow: true });
  });

  it("applies a remembered deny default and blocks without prompting again", async () => {
    const { gate, emitted } = makeGate();
    const first = gate.requestApproval("edit", {});
    gate.respond({ kind: "approvalResponse", requestId: emitted[0].requestId, decision: "deny", remember: true });
    await expect(first).resolves.toMatchObject({ allow: false });

    const second = gate.requestApproval("edit", {});
    expect(emitted).toHaveLength(1); // no re-prompt
    await expect(second).resolves.toEqual({
      allow: false,
      reason: "blocked by saved default for edit",
    });
  });

  it("resolves every suspended tool as deny on rejectAll (abort/shutdown) — no deadlock", async () => {
    const { gate, emitted } = makeGate();
    const a = gate.requestApproval("bash", {});
    const b = gate.requestApproval("write", {});
    expect(emitted).toHaveLength(2);

    gate.rejectAll("aborted");
    await expect(a).resolves.toEqual({ allow: false, reason: "aborted" });
    await expect(b).resolves.toEqual({ allow: false, reason: "aborted" });
  });

  it("auto-allows in standalone mode with no parent to answer", async () => {
    const emitted: unknown[] = [];
    const gate = createApprovalGate({
      isChild: false,
      emit: (r) => emitted.push(r),
    });
    await expect(gate.requestApproval("bash", {})).resolves.toEqual({ allow: true });
    expect(emitted).toHaveLength(0);
  });
});
