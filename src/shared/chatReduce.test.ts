/**
 * Reducer tests driven by a fake host fixture.
 *
 * The single test seam (spec.md): a sequence of contract messages — as the
 * child host would emit them — folded through `reduce` produces the intended UI
 * state. No Electron, no renderer, no real SDK: the fixture stands in for the
 * host so we can assert streaming text accumulation, status transitions and the
 * tool lifecycle deterministically.
 */
import { describe, expect, it } from "vitest";
import {
  initialState,
  reduce,
  type ChatAction,
  type ChatState,
} from "./chatReduce";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";

/** Build a fake `text_delta` message_update event. */
function textDelta(delta: string, id = "msg-1"): AgentSessionEvent {
  return {
    type: "message_update",
    message: { id },
    assistantMessageEvent: { type: "text_delta", delta },
  } as unknown as AgentSessionEvent;
}

function toolStart(
  toolCallId: string,
  toolName: string,
  args: Record<string, unknown> = {},
): AgentSessionEvent {
  return {
    type: "tool_execution_start",
    toolCallId,
    toolName,
    args,
  } as unknown as AgentSessionEvent;
}

function toolUpdate(toolCallId: string, partialResult: string): AgentSessionEvent {
  return {
    type: "tool_execution_update",
    toolCallId,
    toolName: "bash",
    partialResult,
  } as unknown as AgentSessionEvent;
}

function toolEnd(toolCallId: string, isError: boolean): AgentSessionEvent {
  return {
    type: "tool_execution_end",
    toolCallId,
    toolName: "bash",
    result: { exitCode: isError ? 1 : 0 },
    isError,
  } as unknown as AgentSessionEvent;
}

/** An `end` event with editable tool details, mirroring Pi's edit tool shape. */
function editEnd(
  toolCallId: string,
  isError: boolean,
  details?: { patch?: string; diff?: string },
): AgentSessionEvent {
  return {
    type: "tool_execution_end",
    toolCallId,
    toolName: "edit",
    result: { content: [], details },
    isError,
  } as unknown as AgentSessionEvent;
}

/** Fold a list of actions into a single state (the fake-host driver). */
function run(actions: ChatAction[]): ChatState {
  return actions.reduce(reduce, initialState);
}

describe("chatReduce over the agent-host contract", () => {
  it("tracks ready and reflects session identity", () => {
    const state = run([
      { kind: "ready", sessionId: "s-1", cwd: "/c", model: "provider/model" },
    ]);
    expect(state.status).toBe("ready");
    expect(state.sessionId).toBe("s-1");
    expect(state.model).toBe("provider/model");
  });

  it("streams assistant text word by word from text deltas", () => {
    const state = run([
      { kind: "ready", sessionId: "s-1", cwd: "/c" },
      { kind: "user-submitted", text: "hi" },
      { kind: "event", event: textDelta("Hello ") },
      { kind: "event", event: textDelta("there ") },
      { kind: "event", event: textDelta("world") },
      { kind: "done" },
    ]);

    expect(state.entries).toHaveLength(2);
    expect(state.entries[0]).toMatchObject({ role: "user", text: "hi" });
    expect(state.entries[1].role).toBe("assistant");
    // The deltas accumulate into ONE assistant entry, not three messages.
    expect(state.entries[1].text).toBe("Hello there world");
    // Streaming is visible across multiple deltas, not a final wall of text.
    expect(state.status).toBe("done");
  });

  it("scopes the transcript to the working directory", () => {
    const state = run([
      { kind: "ready", sessionId: "s-2", cwd: "/projects/foo", model: "m" },
      { kind: "user-submitted", text: "ls" },
    ]);
    expect(state.cwd).toBe("/projects/foo");
    expect(state.sessionId).toBe("s-2");
  });

  it("tracks a tool lifecycle start → update → done across the boundary", () => {
    const state = run([
      { kind: "ready", sessionId: "s-1", cwd: "/c" },
      { kind: "user-submitted", text: "list files" },
      {
        kind: "event",
        event: toolStart("call-1", "bash", { command: "ls -la" }),
      },
      { kind: "event", event: toolUpdate("call-1", "file1.txt") },
      { kind: "event", event: toolUpdate("call-1", "\nfile2.txt") },
      { kind: "event", event: toolEnd("call-1", false) },
      { kind: "done" },
    ]);

    expect(state.tools).toHaveLength(1);
    expect(state.tools[0]).toMatchObject({
      toolCallId: "call-1",
      toolName: "bash",
      status: "done",
      // Args captured verbatim from the start event, so the card can show them.
      args: { command: "ls -la" },
    });
    // The partial result is accumulated during execution.
    expect(state.tools[0].partialResult).toBe("file1.txt\nfile2.txt");
    // A successful tool carries no error detail.
    expect(state.tools[0].error).toBeUndefined();
  });

  it("marks a tool as error and surfaces a reason when its execution failed", () => {
    const state = run([
      { kind: "user-submitted", text: "run" },
      { kind: "event", event: toolStart("call-9", "edit") },
      { kind: "event", event: toolEnd("call-9", true) },
    ]);
    expect(state.tools[0].status).toBe("error");
    expect(state.tools[0].error).toBeDefined();
    expect(state.tools[0].args).toEqual({});
  });

  it("keeps a card running until its end event, then flips to done", () => {
    const state = run([
      { kind: "event", event: toolStart("c-1", "bash", { command: "x" }) },
    ]);
    expect(state.tools[0].status).toBe("running");
    // Live update while running keeps status running.
    const mid = reduce(state, {
      kind: "event",
      event: toolUpdate("c-1", "partial\n"),
    });
    expect(mid.tools[0].status).toBe("running");
    const done = reduce(mid, { kind: "event", event: toolEnd("c-1", false) });
    expect(done.tools[0].status).toBe("done");
    // done is terminal — further updates must not resurrect it.
    const late = reduce(done, { kind: "event", event: toolUpdate("c-1", "late") });
    expect(late.tools[0].status).toBe("done");
  });

  it("renders multiple tools in execution order for a long turn", () => {
    const state = run([
      { kind: "event", event: toolStart("a", "bash", { command: "ls" }) },
      { kind: "event", event: toolEnd("a", false) },
      { kind: "event", event: toolStart("b", "edit", { path: "/x", content: "hi" }) },
      { kind: "event", event: toolEnd("b", false) },
      { kind: "event", event: toolStart("c", "write", { path: "/y" }) },
    ]);
    expect(state.tools.map((t) => t.toolCallId)).toEqual(["a", "b", "c"]);
    expect(state.tools.map((t) => t.status)).toEqual(["done", "done", "running"]);
    // args ride along on each card for the collapsed/expanded view.
    expect(state.tools[1].args).toEqual({ path: "/x", content: "hi" });
  });

  it("surfaces a host error log to the UI error status", () => {
    const state = run([{ kind: "log", level: "error", message: "provider down" }]);
    expect(state.status).toBe("error");
    expect(state.error).toBe("provider down");
  });

  it("marks an aborted turn as aborted rather than clean done", () => {
    const state = run([
      { kind: "user-submitted", text: "long task" },
      { kind: "event", event: textDelta("partial ") },
      { kind: "user-aborted" },
      { kind: "done" },
    ]);
    // It ended because the user aborted, not because it completed.
    expect(state.abortRequested).toBe(true);
    expect(state.status).toBe("aborted");
  });

  it("resets the abort flag when a new prompt starts", () => {
    const state = run([
      { kind: "user-submitted", text: "a" },
      { kind: "user-aborted" },
      { kind: "done" },
      { kind: "user-submitted", text: "b" },
      { kind: "event", event: textDelta("ok") },
      { kind: "done" },
    ]);
    expect(state.abortRequested).toBe(false);
    expect(state.status).toBe("done");
  });

  it("reflects a clean shutdown", () => {
    const state = run([{ kind: "shutdown", code: 0 }]);
    expect(state.status).toBe("shutdown");
  });
});

describe("session lifecycle over the agent-host contract (ticket 05)", () => {
  const ready = { kind: "ready", sessionId: "s-1", cwd: "/c" } as const;

  it("converges to a fresh session on new-session switch", () => {
    const state = run([
      ready,
      { kind: "user-submitted", text: "old msg" },
      { kind: "event", event: textDelta("old reply") },
      { kind: "done" },
      {
        kind: "session-switched",
        sessionId: "s-2",
        sessionPath: "/c/s2.jsonl",
        reason: "new",
      },
    ]);
    expect(state.status).toBe("ready");
    expect(state.sessionId).toBe("s-2");
    expect(state.sessionPath).toBe("/c/s2.jsonl");
    // A new active session starts with a clean transcript.
    expect(state.entries).toHaveLength(0);
    expect(state.tools).toHaveLength(0);
  });

  it("updates the active marker on resume without losing the scope", () => {
    const state = run([
      ready,
      {
        kind: "session-switched",
        sessionId: "s-3",
        sessionPath: "/c/historical.jsonl",
        reason: "resume",
      },
    ]);
    expect(state.sessionId).toBe("s-3");
    // The working-directory scope is preserved across a session switch.
    expect(state.cwd).toBe("/c");
    expect(state.status).toBe("ready");
  });

  it("tracks a fork as a new active session while keeping pre-fork approvals cleared", () => {
    const state = run([
      ready,
      { kind: "user-submitted", text: "go" },
      { kind: "approvalRequest", requestId: "ap-9", toolName: "bash", args: {} },
      {
        kind: "session-switched",
        sessionId: "s-4",
        sessionPath: "/c/forked.jsonl",
        reason: "fork",
      },
    ]);
    expect(state.sessionId).toBe("s-4");
    expect(state.pendingApproval).toBeUndefined();
    expect(state.resolvedApprovals).toHaveLength(0);
    // The fork becomes the active branch.
    expect(JSON.stringify(state)).toContain("s-4");
  });

  it("lets the user continue the switched session with a new prompt", () => {
    const state = run([
      ready,
      { kind: "session-switched", sessionId: "s-9", sessionPath: "/c/a.jsonl", reason: "resume" },
      { kind: "user-submitted", text: "continue here" },
      { kind: "event", event: textDelta("resumed ") },
      { kind: "done" },
    ]);
    expect(state.sessionId).toBe("s-9");
    expect(state.entries.map((e) => e.text)).toEqual(["continue here", "resumed "]);
    expect(state.status).toBe("done");
  });
});

describe("tool approval gate over the agent-host contract", () => {
  const ready = { kind: "ready", sessionId: "s-1", cwd: "/c" } as const;

  it("suspends a tool into a pending approval before it runs", () => {
    const state = run([
      ready,
      { kind: "user-submitted", text: "run it" },
      {
        kind: "approvalRequest",
        requestId: "ap-1",
        toolName: "bash",
        args: { command: "rm -rf /tmp/x" },
      },
    ]);
    expect(state.status).toBe("streaming");
    expect(state.pendingApproval).toEqual({
      requestId: "ap-1",
      toolName: "bash",
      args: { command: "rm -rf /tmp/x" },
    });
  });

  it("lets an approved tool run and records the allow outcome", () => {
    const state = run([
      ready,
      { kind: "user-submitted", text: "run it" },
      { kind: "approvalRequest", requestId: "ap-1", toolName: "bash", args: {} },
      { kind: "approval-resolved", requestId: "ap-1", toolName: "bash", decision: "allow" },
    ]);
    expect(state.pendingApproval).toBeUndefined();
    expect(state.resolvedApprovals).toContainEqual({
      requestId: "ap-1",
      toolName: "bash",
      decision: "allow",
    });
  });

  it("clears a denied tool and records the deny outcome", () => {
    const state = run([
      ready,
      { kind: "user-submitted", text: "run it" },
      { kind: "approvalRequest", requestId: "ap-2", toolName: "edit", args: {} },
      { kind: "approval-resolved", requestId: "ap-2", toolName: "edit", decision: "deny" },
    ]);
    expect(state.pendingApproval).toBeUndefined();
    expect(state.resolvedApprovals).toContainEqual({
      requestId: "ap-2",
      toolName: "edit",
      decision: "deny",
    });
  });

  it("leaves an unrelated pending approval alone when another resolves", () => {
    const state = run([
      ready,
      { kind: "user-submitted", text: "go" },
      { kind: "approvalRequest", requestId: "ap-1", toolName: "bash", args: {} },
      { kind: "approvalRequest", requestId: "ap-2", toolName: "write", args: {} },
      { kind: "approval-resolved", requestId: "ap-1", toolName: "bash", decision: "allow" },
    ]);
    // Only the matching request is cleared; ap-2 still awaits the user.
    expect(state.pendingApproval?.requestId).toBe("ap-2");
    expect(state.resolvedApprovals).toHaveLength(1);
  });
});

describe("settings over the agent-host contract (ticket 06)", () => {
  it("surfaces the boot thinking level alongside the model", () => {
    const state = run([
      { kind: "ready", sessionId: "s-1", cwd: "/c", model: "provider/model", thinking: "medium" },
    ]);
    expect(state.model).toBe("provider/model");
    expect(state.thinking).toBe("medium");
  });

  it("converges the model from a set-model receipt", () => {
    const state = run([
      { kind: "ready", sessionId: "s-1", cwd: "/c", model: "old/o", thinking: "medium" },
      { kind: "model-changed", model: "new/n" },
    ]);
    expect(state.model).toBe("new/n");
    // The header keeps showing model; thinking is untouched by a model switch.
    expect(state.thinking).toBe("medium");
  });

  it("converges the thinking level from a set-thinking receipt", () => {
    const state = run([
      { kind: "ready", sessionId: "s-1", cwd: "/c", thinking: "low" },
      { kind: "thinking-changed", level: "high" },
    ]);
    expect(state.thinking).toBe("high");
  });

  it("fills the settings panel with available models from the host", () => {
    const state = run([
      { kind: "ready", sessionId: "s-1", cwd: "/c" },
      {
        kind: "models",
        models: [
          { ref: "anthropic/claude-opus-4-5", provider: "anthropic", id: "claude-opus-4-5" },
          { ref: "openai/gpt-5", provider: "openai", id: "gpt-5" },
        ],
      },
    ]);
    expect(state.models).toHaveLength(2);
    expect(state.models[0].ref).toBe("anthropic/claude-opus-4-5");
  });
});

describe("file-change diff view over the agent-host contract (ticket 06)", () => {
  const ready = { kind: "ready", sessionId: "s-1", cwd: "/c" } as const;

  it("folds an edit into a modified-file change carrying the lossless patch", () => {
    const state = run([
      ready,
      { kind: "user-submitted", text: "refactor" },
      {
        kind: "event",
        event: toolStart("call-1", "edit", { path: "/c/a.ts", edits: [{ oldText: "x", newText: "y" }] }),
      },
      {
        kind: "event",
        event: editEnd("call-1", false, { patch: "--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-x\n+y\n" }),
      },
    ]);
    expect(state.fileChanges).toHaveLength(1);
    expect(state.fileChanges[0]).toEqual({
      path: "/c/a.ts",
      kind: "modified",
      diffText: "--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-x\n+y\n",
    });
  });

  it("folds a write into an added-file change rendered from its content", () => {
    const state = run([
      ready,
      { kind: "user-submitted", text: "create" },
      {
        kind: "event",
        event: toolStart("call-2", "write", { path: "/c/new.txt", content: "hello\nworld\n" }),
      },
      { kind: "event", event: toolEnd("call-2", false) },
    ]);
    expect(state.fileChanges).toHaveLength(1);
    expect(state.fileChanges[0]).toEqual({
      path: "/c/new.txt",
      kind: "added",
      diffText: "hello\nworld\n",
    });
  });

  it("does not record a change when the edit/write tool failed", () => {
    const state = run([
      ready,
      { kind: "user-submitted", text: "go" },
      {
        kind: "event",
        event: toolStart("call-3", "write", { path: "/c/x", content: "c" }),
      },
      { kind: "event", event: editEnd("call-3", true) },
    ]);
    expect(state.fileChanges).toHaveLength(0);
  });

  it("merges repeated edits to the same file into one list entry without losing hunks", () => {
    const state = run([
      ready,
      { kind: "user-submitted", text: "edit twice" },
      { kind: "event", event: toolStart("a", "edit", { path: "/c/f.txt", edits: [] }) },
      { kind: "event", event: editEnd("a", false, { patch: "@@ h1" }) },
      { kind: "event", event: toolStart("b", "edit", { path: "/c/f.txt", edits: [] }) },
      { kind: "event", event: editEnd("b", false, { patch: "@@ h2" }) },
    ]);
    expect(state.fileChanges).toHaveLength(1);
    expect(state.fileChanges[0].diffText).toBe("@@ h1\n@@ h2");
  });

  it("lists distinct files for a multi-file turn in execution order", () => {
    const state = run([
      ready,
      { kind: "user-submitted", text: "multi" },
      { kind: "event", event: toolStart("a", "write", { path: "/c/one", content: "1" }) },
      { kind: "event", event: toolEnd("a", false) },
      { kind: "event", event: toolStart("b", "edit", { path: "/c/two", edits: [] }) },
      { kind: "event", event: editEnd("b", false, { patch: "@@ p" }) },
    ]);
    expect(state.fileChanges.map((f) => f.path)).toEqual(["/c/one", "/c/two"]);
    expect(state.fileChanges.map((f) => f.kind)).toEqual(["added", "modified"]);
  });

  it("scopes the diff list to the current turn (files reset on a new prompt)", () => {
    const state = run([
      ready,
      { kind: "user-submitted", text: "turn one" },
      { kind: "event", event: toolStart("a", "write", { path: "/c/one", content: "1" }) },
      { kind: "event", event: toolEnd("a", false) },
      {
        kind: "event",
        event: toolStart("b", "edit", { path: "/c/one", edits: [{ oldText: "1", newText: "2" }] }),
      },
      { kind: "event", event: editEnd("b", false, { patch: "@@ one" }) },
      { kind: "user-submitted", text: "turn two" },
    ]);
    // A fresh prompt starts a new review scope: the previous turn's changes are
    // cleared so files are not misattributed to the pending turn.
    expect(state.fileChanges).toHaveLength(0);
  });

  it("clears the diff list when the session changes to a different one", () => {
    const state = run([
      ready,
      { kind: "user-submitted", text: "go" },
      { kind: "event", event: toolStart("a", "edit", { path: "/c/f", edits: [] }) },
      { kind: "event", event: editEnd("a", false, { patch: "@@ h" }) },
      {
        kind: "session-switched",
        sessionId: "s-2",
        sessionPath: "/c/s2.jsonl",
        reason: "new",
      },
    ]);
    expect(state.sessionId).toBe("s-2");
    // Another session's changes must never leak into the new active session.
    expect(state.fileChanges).toHaveLength(0);
  });
});

describe("inject/queue state over the agent-host contract (ticket 08)", () => {
  const ready = { kind: "ready", sessionId: "s-1", cwd: "/c" } as const;

  /** A queue_update event with the pending steering/followUp text. */
  function queueUpdate(steering: string[], followUp: string[]): ChatAction {
    return {
      kind: "event",
      event: { type: "queue_update", steering, followUp } as unknown as AgentSessionEvent,
    };
  }

  it("starts with an empty queue", () => {
    const state = run([ready]);
    expect(state.queue).toEqual({ steering: [], followUp: [] });
  });

  it("folds a queue_update into the queue state", () => {
    const state = run([
      ready,
      queueUpdate(["inject me"], ["later me"]),
    ]);
    expect(state.queue).toEqual({ steering: ["inject me"], followUp: ["later me"] });
  });

  it("mirrors the latest queue_update as queued messages are consumed", () => {
    // After Pi injects the steering message, it emits a reduced queue_update.
    const state = run([
      ready,
      queueUpdate(["a", "b"], ["f"]),
      queueUpdate(["b"], ["f"]),
    ]);
    expect(state.queue.steering).toEqual(["b"]);
    expect(state.queue.followUp).toEqual(["f"]);
  });

  it("resets the queue on a session switch so no cross-session leak", () => {
    const state = run([
      ready,
      queueUpdate(["a"], ["f"]),
      { kind: "session-switched", sessionId: "s-2", sessionPath: "/c/s2.jsonl", reason: "resume" },
    ]);
    expect(state.queue).toEqual({ steering: [], followUp: [] });
  });

  it("leaves the queue untouched by an unrelated event", () => {
    const state = run([
      ready,
      queueUpdate(["a"], []),
      { kind: "user-submitted", text: "hi" },
    ]);
    expect(state.queue.steering).toEqual(["a"]);
  });

  it("returns to done after a followUp turn drains, not stuck streaming (ticket 08 regression)", () => {
    // A followUp is queued while the original turn streams. The SDK drains it in
    // the same run, then the host emits a single `done` (on `agent_settled`).
    // The reducer must converge to done — never stay parked at "streaming".
    const mid = run([
      ready,
      { kind: "user-submitted", text: "original" },
      // followUp gets queued mid-turn (the user picked 注入/排队 → 排队).
      queueUpdate([], ["follow-up request"]),
      // The original turn keeps streaming its answer.
      { kind: "event", event: textDelta("original answer ") },
      // The queue drains (SDK consumed the followUp text) and its turn streams.
      queueUpdate([], []),
      { kind: "event", event: textDelta("follow-up answer") },
    ]);
    // While the queued followUp runs, the UI stays streaming.
    expect(mid.status).toBe("streaming");
    expect(mid.queue.followUp).toEqual([]);

    // The run settles → host emits done → status returns to done.
    const settled = reduce(mid, { kind: "done" });
    expect(settled.status).toBe("done");
    // Both turns' text is on the transcript.
    expect(settled.entries.map((e) => e.text)).toEqual([
      "original",
      "original answer follow-up answer",
    ]);
  });
});
