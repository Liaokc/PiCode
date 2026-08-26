#!/usr/bin/env node
/**
 * Real-SDK end-to-end for the tool-execution cards (ticket 04 e2e).
 *
 * Forks the TS host exactly as the Electron main's SessionService does (system
 * Node, cwd as spawn arg), drives one prompt that should trigger several tools,
 * and feeds every real AgentSessionEvent through the ACTUAL `reduce` reducer
 * (the same pure function the renderer uses). It then asserts the reducer's
 * derived card state — order and terminal running→done/error — matches the raw
 * event sequence, and confirms the `tool_execution_start` events actually carry
 * `args` so the card can display them.
 *
 * No install is modified: the host and the reducer are only consumed read-only.
 */
import { fork } from "node:child_process";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const HOST = resolve(HERE, "..", "src", "child", "host.ts");
const REDUCER = resolve(HERE, "..", "src", "shared", "chatReduce.ts");
const CWD = process.argv[2] ?? resolve(HERE, "..");
const PROMPT =
  "List the files in this directory, then create and write a small scratch file " +
  "named picode-e2e-tool.txt, then print its contents. Use the ls, write and cat tools.";
const WATCHDOG_MS = 180_000;

// Import the real reducer via Node type-stripping (same logic the renderer runs).
const { initialState, reduce } = await import(REDUCER);

let textDeltas = 0;
let state = initialState;
let finished = false;
const seen = []; // raw event order for cross-checking

const child = fork(HOST, [CWD], {
  execPath: process.env.NODE ?? "node",
  stdio: ["inherit", "inherit", "inherit", "ipc"],
});

const watchdog = setTimeout(() => {
  console.error(`[e2e] WATCHDOG: no completion in ${WATCHDOG_MS}ms — killing host`);
  child.kill("SIGKILL");
}, WATCHDOG_MS);

function finish(code, ok) {
  if (finished) return;
  finished = true;
  clearTimeout(watchdog);
  child.kill("SIGKILL"); // ensure no orphan even though the host already shut down
  console.log(`RESULT : ${ok ? "ALL GREEN" : "FAIL"}`);
  process.exit(ok ? 0 : 1);
}

child.on("message", (raw) => {
  const m = raw;
  switch (m.kind) {
    case "ready":
      console.log(`[e2e] host ready: cwd=${m.cwd} session=${m.sessionId}`);
      child.send({ kind: "prompt", text: PROMPT });
      break;
    case "event": {
      const e = m.event;
      // Fold through the real reducer as the renderer's App does.
      state = reduce(state, { kind: "event", event: e });
      if (e.type === "message_update") {
        const ae = e.assistantMessageEvent;
        if (ae.type === "text_delta") textDeltas++;
      } else if (
        e.type === "tool_execution_start" ||
        e.type === "tool_execution_end"
      ) {
        seen.push({ seq: seen.length, event: e });
      }
      break;
    }
    case "approvalRequest":
      // Stand in for the human as the smoke driver does; allow so tools actually run.
      console.log(`[e2e] ⟳ approval for ${m.toolName}; allowing`);
      child.send({ kind: "approvalResponse", requestId: m.requestId, decision: "allow" });
      break;
    case "done":
      console.log("[e2e] prompt finished; requesting clean shutdown");
      child.send({ kind: "shutdown" });
      break;
    case "shutdown":
      console.log(`[e2e] host confirmed clean shutdown (code ${m.code})`);
      finish(0, verify());
      break;
    case "log":
      console.log(`[host:${m.level}] ${m.message}`);
      break;
  }
});

child.on("error", (err) => {
  console.error("[e2e] host process error:", err.message);
  finish(1, false);
});

child.on("exit", (code, signal) => {
  console.log(`[e2e] host exited (code=${code}, signal=${signal ?? "none"})`);
  if (!finished) finish(code ?? 1, false);
});

function verify() {
  let ok = true;
  const check = (label, cond) => {
    console.log(`  ${cond ? "✓" : "✗"} ${label}`);
    if (!cond) ok = false;
  };

  console.log("\n=== ticket 04 real-SDK tool-card e2e report ===");
  console.log(`streamed text deltas : ${textDeltas}`);
  console.log(`tool events seen     : ${seen.length}`);
  for (const { seq, event } of seen)
    console.log(
      `   #${seq} ${event.type} ${event.toolName} args=${JSON.stringify(event.args ?? null)}`,
    );

  console.log("--- reducer-derived card state (order + terminal) ---");
  state.tools.forEach((t, i) => {
    console.log(
      `   card[${i}] ${t.toolName} status=${t.status} args=${JSON.stringify(t.args)} err=${JSON.stringify(t.error ?? null)}`,
    );
  });

  let toolEvents = seen.filter((s) => s.event.type !== "tool_execution_update");
  check("prompt streamed text", textDeltas > 0);
  check(
    "multiple tools ran (" + new Set(state.tools.map((t) => t.toolCallId)).size + ")",
    state.tools.length >= 2,
  );

  // Every tool_start carries args in the real stream, so cards can show them.
  const starts = seen.filter((s) => s.event.type === "tool_execution_start");
  check(
    `every tool_execution_start ships args (${starts.length})`,
    starts.length > 0 && starts.every((s) => s.event.args != null),
  );

  // Card order matches raw start order (a stable transcript, not shuffled).
  const cardOrder = state.tools.map((t) => t.toolCallId);
  const startOrder = starts.map((s) => s.event.toolCallId);
  check("card order == tool start order", JSON.stringify(cardOrder) === JSON.stringify(startOrder));

  // Every tool that ended resolves to a terminal state (done/error); none stuck running.
  const endsById = new Map(seen.filter((s) => s.event.type === "tool_execution_end").map((s) => [s.event.toolCallId, s.event]));
  const stuck = state.tools.filter((t) => t.status === "running");
  check("no card left running after done", stuck.length === 0);

  for (const t of state.tools) {
    const end = endsById.get(t.toolCallId);
    if (end) {
      const expected = end.isError ? "error" : "done";
      check(`card ${t.toolName} terminal ${t.status} matches isError=${end.isError}`, t.status === expected);
    }
  }

  return ok;
}
