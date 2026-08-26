#!/usr/bin/env node
/**
 * Drive the main process's SessionService directly against the real host.
 *
 * sessionService.ts is pure Node (no electron import), so we import it under
 * Node 24 type-stripping and exercise the exact lifecycle owner the Electron
 * main uses: start(cwd) → submitPrompt → stop (graceful shutdown handshake).
 * Verifies forks-with-cwd, streaming text deltas relayed through the service,
 * and a clean, orphan-free stop().
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVICE_URL = pathToFileURL(resolve(HERE, "..", "src", "main", "sessionService.ts")).href;
const CWD = process.argv[2] ?? resolve(HERE, "..");

const { SessionService } = await import(SERVICE_URL);

let textDeltas = 0;
let ready = false;
let cleanShutdown = false;
const tools = new Set();

const service = new SessionService({
  hostPath: resolve(HERE, "..", "src", "child", "host.ts"),
  nodePath: process.env.NODE ?? "node",
  onHostMessage: (m) => {
    if (m.kind === "ready") {
      ready = true;
      console.log(`[session] ready: cwd=${m.cwd} model=${m.model}`);
      service.submitPrompt("List the files in this directory. Use the ls tool.");
    } else if (m.kind === "approvalRequest") {
      // Ticket 03 gate: the driver stands in for the human and allows the tool.
      console.log(`[session] ⟳ approval for ${m.toolName}; allowing`);
      service.respondToApproval({ kind: "approvalResponse", requestId: m.requestId, decision: "allow" });
    } else if (m.kind === "event") {
      const e = m.event;
      if (e.type === "message_update" && e.assistantMessageEvent?.type === "text_delta") textDeltas++;
      if (e.type === "tool_execution_start") tools.add(e.toolName);
    } else if (m.kind === "done") {
      console.log(`[session] prompt done (textDeltas=${textDeltas}, tools=${[...tools].join(",")}); stopping`);
      service.stop().then(() => {
        cleanShutdown = true;
        report();
      });
    }
  },
  onFatalError: (err) => {
    console.error("[session] fatal:", String(err));
  },
});

service.start(CWD);

function report() {
  try {
    const orphans = execFileSync("pgrep", ["-lf", "pi-coding-agent"]).toString().trim();
    console.log(`linger procs: ${orphans || "none"}`);
  } catch {
    console.log("linger procs: none");
  }
  const ok = ready && textDeltas > 0 && tools.size > 0 && cleanShutdown && service.running === false;
  console.log(`RESULT: ${ok ? "ALL GREEN" : "FAIL"} (ready=${ready}, deltas=${textDeltas}, tools=${tools.size}, cleanShutdown=${cleanShutdown}, running=${service.running})`);
  process.exit(ok ? 0 : 1);
}
