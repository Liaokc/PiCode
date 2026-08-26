#!/usr/bin/env node
/**
 * Real-SDK end-to-end smoke for the tool-approval gate (ticket 03).
 *
 * Forks the real child host and drives two prompts:
 *   - Prompt 1: the FIRST approval is held open for a short window while we
 *     assert NO tool execution *completes* (execution is genuinely suspended
 *     until the decision), then it is allowed — the tool then runs to
 *     `tool_execution_end` with `isError:false`.
 *   - Prompt 2: the FIRST approval is denied with a reason — the tool is
 *     blocked, emitting `tool_execution_end` with `isError:true` and no real
 *     side-effect run, then Pi continues and the prompt still completes.
 *
 * The driver stands in for the human (this is the automated proxy for the
 * renderer's allow/deny). Asserts the gate fires, the suspension holds, allow
 * runs / deny blocks, and the host shuts down cleanly with no orphan.
 */
import { fork } from "node:child_process";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const HOST = resolve(HERE, "..", "src", "child", "host.ts");
const CWD = process.argv[2] ?? resolve(HERE, "..");
const SUSPEND_WINDOW_MS = 700;
const WATCHDOG_MS = 180_000;

// Prompts chosen so the model reliably drives a shell tool in each phase.
const PROMPT_1 = "List the files in this directory. Use the ls tool.";
const PROMPT_2 = "Use the ls tool to list the files in this directory again.";

const child = fork(HOST, [CWD], {
  execPath: process.env.NODE ?? "node",
  stdio: ["inherit", "inherit", "inherit", "ipc"],
});

const watchdog = setTimeout(() => {
  console.error(`[smoke-approval] WATCHDOG: no completion in ${WATCHDOG_MS}ms — killing host`);
  child.kill("SIGKILL");
}, WATCHDOG_MS);

// ---- verdict accumulation ----
const report = {
  approvalRequests: 0,
  suspended: false, // no tool completed during the held-open window
  allowedOk: 0, // tool_execution_end isError=false (an allowed tool ran)
  blockedDenied: 0, // tool_execution_end isError=true right after a deny
  completedDuringHold: false,
  cleanShutdown: false,
};

let phase = 1; // 1 = allow-first prompt, 2 = deny-first prompt
let firstApprovalThisPhase = true;
let holding = false; // we are holding the first approval of this phase open
let denyRequestId = null;
let finished = false;

function finish(code, success) {
  if (finished) return;
  finished = true;
  clearTimeout(watchdog);
  reportReport(code, success);
  process.exit(success ? 0 : 1);
}

child.on("message", (raw) => {
  const m = raw;
  switch (m.kind) {
    case "ready":
      console.log(`[smoke-approval] host ready: cwd=${m.cwd} session=${m.sessionId}`);
      child.send({ kind: "prompt", text: PROMPT_1 });
      break;

    case "approvalRequest": {
      report.approvalRequests++;
      console.log(
        `[smoke-approval] [phase ${phase}] ⟳ approval ${m.requestId} tool=${m.toolName} args=${JSON.stringify(m.args)}`,
      );
      if (phase === 1 && firstApprovalThisPhase) {
        // Hold the first approval open and assert nothing completes while pending.
        holding = true;
        firstApprovalThisPhase = false;
        setTimeout(() => {
          holding = false;
          console.log(`[smoke-approval] [phase 1] suspension held (${SUSPEND_WINDOW_MS}ms); allowing`);
          child.send({ kind: "approvalResponse", requestId: m.requestId, decision: "allow" });
        }, SUSPEND_WINDOW_MS);
        return;
      }
      if (phase === 2 && firstApprovalThisPhase) {
        firstApprovalThisPhase = false;
        denyRequestId = m.requestId;
        console.log(`[smoke-approval] [phase 2] denying with reason`);
        child.send({
          kind: "approvalResponse",
          requestId: m.requestId,
          decision: "deny",
          reason: "smoke-approval: block this tool to verify the deny path",
        });
        return;
      }
      // Subsequent approvals in the phase: allow.
      child.send({ kind: "approvalResponse", requestId: m.requestId, decision: "allow" });
      break;
    }

    case "event": {
      const e = m.event;
      if (e.type === "tool_execution_end") {
        if (holding) report.completedDuringHold = true; // completion before decision — bad
        if (denyRequestId && phase === 2 && e.isError) report.blockedDenied++;
        if (e.isError === false && phase === 1) report.allowedOk++;
      }
      break;
    }

    case "done":
      if (phase === 1) {
        console.log("[smoke-approval] [phase 1] done; starting phase 2 (deny path)");
        phase = 2;
        firstApprovalThisPhase = true;
        denyRequestId = null;
        child.send({ kind: "prompt", text: PROMPT_2 });
      } else {
        console.log("[smoke-approval] [phase 2] done; requesting clean shutdown");
        child.send({ kind: "shutdown" });
      }
      break;

    case "shutdown":
      report.cleanShutdown = true;
      finish(0, true);
      break;

    case "log":
      console.log(`[host:${m.level}] ${m.message}`);
      break;
  }
});

child.on("error", (err) => {
  console.error("[smoke-approval] host process error:", err.message);
  finish(1, false);
});

child.on("exit", (code, signal) => {
  console.log(`[smoke-approval] host exited (code=${code}, signal=${signal ?? "none"})`);
  if (!finished) finish(code ?? 1, false);
});

function reportReport(code, success) {
  report.suspended = report.approvalRequests > 0 && !report.completedDuringHold;
  console.log("\n=== ticket 03 approval-gate smoke report ===");
  console.log(`approval requests surfaced : ${report.approvalRequests}`);
  console.log(`suspension held (no completion while pending): ${report.suspended}`);
  console.log(`allowed tool ran (end isError=false): ${report.allowedOk}`);
  console.log(`denied tool blocked (end isError=true): ${report.blockedDenied}`);
  console.log(`clean shutdown               : ${report.cleanShutdown}`);
  try {
    const orphans = execFileSync("pgrep", ["-lf", "pi-coding-agent"]).toString().trim();
    console.log(`lingering pi-coding-agent procs: ${orphans || "none"}`);
  } catch {
    console.log("lingering pi-coding-agent procs: none");
  }

  const ok =
    report.approvalRequests > 0 &&
    report.suspended &&
    report.allowedOk > 0 &&
    report.blockedDenied > 0 &&
    report.cleanShutdown &&
    code === 0;
  console.log(`RESULT: ${ok ? "ALL GREEN" : "FAIL"}`);
}
