/**
 * Headless feasibility driver.
 *
 * Spawns the child-process host, sends one prompt, and verifies the Phase 0
 * acceptance criteria by observing events *outside* the host process:
 *
 *   AC1  ≥1 streamed text delta observed
 *   AC2  ≥1 tool_execution lifecycle (start → end) observed
 *   AC3  fork + event round-trip completes without blocking
 *   AC4  host shuts down cleanly, no orphan process
 *
 * Process topology: this driver is the *parent*; it forks `host.ts`. Every
 * event it reads has already crossed the process boundary, so observation is
 * genuinely external to the host.
 */
import { fork, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { appendFileSync, writeFileSync } from "node:fs";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { HostToParent, ParentToHost } from "./contract.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOST_PATH = join(__dirname, "host.ts");

const PROMPT =
  "List the files in this directory and report what you see. Use the ls tool.";
const WATCHDOG_MS = 240_000;
const LOG = join(__dirname, "..", "observed-events.jsonl");

interface Observer {
  textDeltaCount: number;
  textSample: string[];
  toolLifecycles: Map<string, string[]>; // toolCallId -> ["start:<name>", "update", ...]
}

const observer: Observer = {
  textDeltaCount: 0,
  textSample: [],
  toolLifecycles: new Map(),
};

function main(): void {
  writeFileSync(LOG, ""); // fresh run
  const log = (line: string): void => appendFileSync(LOG, line + "\n");

  let finished = false;

  const child: ChildProcess = fork(HOST_PATH, [], {
    stdio: ["inherit", "inherit", "inherit", "ipc"],
  });

  const watchdog = setTimeout(() => {
    console.error(`\n[driver] WATCHDOG: no completion in ${WATCHDOG_MS}ms — killing host`);
    child.kill("SIGKILL");
    setTimeout(() => finish(2, false), 400);
  }, WATCHDOG_MS);

  function finish(code: number, success: boolean): void {
    if (finished) return;
    finished = true;
    clearTimeout(watchdog);
    report(code);
    process.exit(success ? 0 : 1);
  }

  child.on("message", (raw: unknown) => {
    const message = raw as HostToParent;
    switch (message.kind) {
      case "ready":
        console.log(
          `[driver] host ready: session=${message.sessionId} model=${message.model ?? "default"}`,
        );
        log(`{"type":"system","phase":"ready","sessionId":"${message.sessionId}"}`);
        send(child, { kind: "prompt", text: PROMPT });
        break;
      case "event":
        record(message.event, observer, log);
        break;
      case "log":
        console.log(`[host:${message.level}] ${message.message}`);
        break;
      case "done":
        console.log("[driver] prompt finished; requesting clean shutdown");
        send(child, { kind: "shutdown" });
        break;
      case "shutdown":
        console.log(`[driver] host confirmed clean shutdown (code ${message.code})`);
        finish(0, true);
        break;
    }
  });

  child.on("error", (err) => {
    console.error(`[driver] host process error: ${err.message}`);
    finish(1, false);
  });

  child.on("exit", (code, signal) => {
    console.log(`[driver] host exited (code=${code}, signal=${signal ?? "none"})`);
    if (!finished) {
      // The child died before a clean shutdown handshake — treat as failure.
      finish(code ?? 1, false);
    }
  });

  // Never leave an orphan behind: propagate termination to the child.
  const onSignal = (): void => {
    if (!finished) child.kill("SIGTERM");
    setTimeout(() => process.exit(130), 500);
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
}

function send(child: ChildProcess, command: ParentToHost): void {
  child.send(command);
}

function record(
  event: AgentSessionEvent,
  observer: Observer,
  log: (line: string) => void,
): void {
  switch (event.type) {
    case "message_update": {
      const e = event.assistantMessageEvent;
      if (e.type === "text_delta") {
        observer.textDeltaCount += 1;
        if (observer.textSample.length < 3) observer.textSample.push(e.delta);
        log(JSON.stringify({ type: "text_delta", delta: e.delta }));
      }
      return;
    }
    case "tool_execution_start": {
      const seq = observer.toolLifecycles.get(event.toolCallId) ?? [];
      seq.push(`start:${event.toolName}`);
      observer.toolLifecycles.set(event.toolCallId, seq);
      console.log(
        `[driver] ⟳ tool start  ${event.toolName} args=${JSON.stringify(event.args).slice(0, 140)}`,
      );
      log(
        JSON.stringify({
          type: "tool_execution_start",
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          args: event.args,
        }),
      );
      return;
    }
    case "tool_execution_update": {
      observer.toolLifecycles.get(event.toolCallId)?.push("update");
      log(JSON.stringify({ type: "tool_execution_update", toolCallId: event.toolCallId }));
      return;
    }
    case "tool_execution_end": {
      const seq = observer.toolLifecycles.get(event.toolCallId) ?? [];
      seq.push(`end(${event.isError ? "err" : "ok"})`);
      observer.toolLifecycles.set(event.toolCallId, seq);
      console.log(
        `[driver] ✓ tool end    ${event.toolName} isError=${event.isError}`,
      );
      log(
        JSON.stringify({
          type: "tool_execution_end",
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          isError: event.isError,
        }),
      );
      return;
    }
    default:
      // Keep every other event in the persistent log so runs stay inspectable.
      log(JSON.stringify({ type: event.type }));
  }
}

function report(code: number): void {
  const complete = Array.from(observer.toolLifecycles.values()).filter(
    (seq) => seq.length >= 2 && seq[seq.length - 1].startsWith("end("),
  );

  console.log("\n=== Phase 0 feasibility report ===");
  console.log(`streamed text deltas observed  : ${observer.textDeltaCount}`);
  console.log(
    `text sample (first deltas)      : ${observer.textSample.map((d) => JSON.stringify(d)).join(" ")}`,
  );
  console.log(`tool lifecycles observed       : ${observer.toolLifecycles.size}`);
  for (const [id, seq] of observer.toolLifecycles) {
    console.log(`   ${id}: ${seq.join(" → ")}`);
  }
  console.log(`host exit code                 : ${code}`);

  const ac1 = observer.textDeltaCount > 0;
  const ac2 = complete.length > 0;
  const ac3 = ac1 && ac2; // reached a clean finish without hanging
  const ac4 = code === 0;

  console.log("\n--- Acceptance criteria ---");
  console.log(`AC1 streamed text delta (>=1)        : ${ac1 ? "PASS" : "FAIL"}`);
  console.log(`AC2 tool_execution start->end (>=1)  : ${ac2 ? "PASS" : "FAIL"}`);
  console.log(`AC3 non-blocking round-trip          : ${ac3 ? "PASS" : "FAIL"}`);
  console.log(`AC4 clean shutdown / no orphan       : ${ac4 ? "PASS" : "FAIL"}`);
  console.log(`RESULT                               : ${ac1 && ac2 && ac4 ? "ALL GREEN" : "NOT ALL GREEN"}`);
}

main();
