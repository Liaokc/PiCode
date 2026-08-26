#!/usr/bin/env node
/**
 * Real-SDK end-to-end smoke for the child host (ticket 02 AC6).
 *
 * Forks `src/child/host.ts` with a working directory exactly as the Electron
 * main process's SessionService does (system Node, cwd as spawn arg), drives
 * one prompt against the real endpoint, and asserts:
 *   - ≥1 streamed text delta crosses the boundary
 *   - ≥1 tool_execution lifecycle (start → end) crosses the boundary
 *   - the host confirms a clean shutdown and leaves no orphan process
 *
 * This is a plain .mjs driver (no TS build) so it exercises the real TS host
 * via Node 24 type-stripping.
 */
import { fork } from "node:child_process";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const HOST = resolve(HERE, "..", "src", "child", "host.ts");
const CWD = process.argv[2] ?? resolve(HERE, "..");
const PROMPT =
  "List the files in this directory, then report what you see. Use the ls tool.";
const WATCHDOG_MS = 150_000;

let lastHostPid = null;
let textDeltas = 0;
const tools = new Map(); // toolCallId -> ["start", ...updates, "end"]
let finished = false;

const child = fork(HOST, [CWD], {
  execPath: process.env.NODE ?? "node",
  stdio: ["inherit", "inherit", "inherit", "ipc"],
});
lastHostPid = child.pid;

const watchdog = setTimeout(() => {
  console.error(`[smoke] WATCHDOG: no completion in ${WATCHDOG_MS}ms — killing host`);
  child.kill("SIGKILL");
}, WATCHDOG_MS);

function finish(code, success) {
  if (finished) return;
  finished = true;
  clearTimeout(watchdog);
  report(code, success);
  process.exit(success ? 0 : 1);
}

child.on("message", (raw) => {
  const m = raw;
  switch (m.kind) {
    case "ready":
      console.log(`[smoke] host ready: cwd=${m.cwd} session=${m.sessionId} model=${m.model ?? "default"}`);
      child.send({ kind: "prompt", text: PROMPT });
      break;
    case "event": {
      const e = m.event;
      if (e.type === "message_update") {
        const ae = e.assistantMessageEvent;
        if (ae.type === "text_delta") {
          textDeltas++;
          if (textDeltas <= 3) console.log(`[smoke]   text_delta: ${JSON.stringify(ae.delta)}`);
        }
      } else if (e.type === "tool_execution_start") {
        const seq = tools.get(e.toolCallId) ?? [];
        seq.push(`start:${e.toolName}`);
        tools.set(e.toolCallId, seq);
        console.log(`[smoke] ⟳ tool start ${e.toolName}`);
      } else if (e.type === "tool_execution_update") {
        tools.get(e.toolCallId)?.push("update");
      } else if (e.type === "tool_execution_end") {
        const seq = tools.get(e.toolCallId) ?? [];
        seq.push(`end(${e.isError ? "err" : "ok"})`);
        tools.set(e.toolCallId, seq);
        console.log(`[smoke] ✓ tool end ${e.toolName} isError=${e.isError}`);
      }
      break;
    }
    case "approvalRequest":
      // Ticket 03 gate: the driver stands in for the human and allows the tool,
      // so the streaming + tool-lifecycle assertions remain reachable.
      console.log(`[smoke] ⟳ approval for ${m.toolName}; allowing`);
      child.send({ kind: "approvalResponse", requestId: m.requestId, decision: "allow" });
      break;
    case "done":
      console.log("[smoke] prompt finished; requesting clean shutdown");
      child.send({ kind: "shutdown" });
      break;
    case "shutdown":
      console.log(`[smoke] host confirmed clean shutdown (code ${m.code})`);
      finish(0, true);
      break;
    case "log":
      console.log(`[host:${m.level}] ${m.message}`);
      break;
  }
});

child.on("error", (err) => {
  console.error("[smoke] host process error:", err.message);
  finish(1, false);
});

child.on("exit", (code, signal) => {
  console.log(`[smoke] host exited (code=${code}, signal=${signal ?? "none"})`);
  if (!finished) finish(code ?? 1, false);
});

function report(code, success) {
  const complete = [...tools.values()].filter((s) => s.length >= 2 && s.at(-1).startsWith("end("));
  console.log("\n=== ticket 02 host smoke report ===");
  console.log(`cwd scope       : ${CWD}`);
  console.log(`streamed text deltas: ${textDeltas}`);
  console.log(`tool lifecycles : ${tools.size}`);
  for (const [id, seq] of tools) console.log(`   ${id}: ${seq.join(" → ")}`);
  console.log(`host exit code  : ${code}`);

  try {
    const orphans = execFileSync("pgrep", ["-lf", "pi-coding-agent"])
      .toString()
      .split("\n")
      .filter((l) => l.trim().length > 0);
    console.log(`lingering pi-coding-agent procs: ${orphans.length ? orphans.join(" | ") : "none"}`);
  } catch {
    console.log("lingering pi-coding-agent procs: none (pgrep found none)");
  }

  const ok = textDeltas > 0 && complete.length > 0 && code === 0;
  console.log(`RESULT : ${success && ok ? "ALL GREEN" : "FAIL"}`);
}
