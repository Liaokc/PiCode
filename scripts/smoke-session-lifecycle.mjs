#!/usr/bin/env node
/**
 * Real-SDK end-to-end: session lifecycle (ticket 05).
 *
 * Forks `src/child/host.ts` exactly as SessionService does, then drives the
 * lifecycle: new → one prompt → fork, and asserts:
 *   - new yields a `session-switched` (reason=new) with a fresh session
 *   - a prompt runs and `done`s on that session
 *   - fork yields a `session-switched` (reason=fork) pointing at a NEW file
 *   - the original (source) session file is byte-identical before/after the fork
 *     (fork never mutates the original — the hard read-only constraint)
 *   - a clean shutdown leaves no orphan process
 *
 * This is a plain .mjs driver (no TS build) exercising the real TS host via
 * Node 24 type-stripping, mirroring the Electron main process.
 */
import { fork } from "node:child_process";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";

const HERE = dirname(fileURLToPath(import.meta.url));
const HOST = resolve(HERE, "..", "src", "child", "host.ts");
const CWD = process.argv[2] ?? resolve(HERE, "..");
const WATCHDOG_MS = 150_000;

// Read the SDK's SessionManager (read-only) to locate a forkable user entry.
const SDK = pathToFileURL(
  resolve(HERE, "..", "node_modules", "@earendil-works", "pi-coding-agent", "dist", "index.js"),
).href;

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

let finished = false;
let step = "boot";
let originalPath = null;
let originalHash = null;
let forkPath = null;
let textDeltas = 0;
let newSeen = false;
let forkSeen = false;
let promptDone = false;

const child = fork(HOST, [CWD], {
  execPath: process.env.NODE ?? "node",
  stdio: ["inherit", "inherit", "inherit", "ipc"],
});

const watchdog = setTimeout(() => {
  console.error(`[lifecycle] WATCHDOG: no completion in ${WATCHDOG_MS}ms — killing host`);
  child.kill("SIGKILL");
}, WATCHDOG_MS);

function finish(code, success, message) {
  if (finished) return;
  finished = true;
  clearTimeout(watchdog);
  report(code, success, message);
  process.exit(success ? 0 : 1);
}

async function issueFork() {
  // Scan the active session file (read-only) for its latest user-message entry.
  const { SessionManager } = await import(SDK);
  const sm = SessionManager.open(originalPath);
  let entryId = null;
  for (const e of sm.getEntries()) {
    if (e.type === "message" && e.message?.role === "user") entryId = e.id;
  }
  if (!entryId) {
    finish(1, false, `no user entry found in ${originalPath} to fork from`);
    return;
  }
  console.log(`[lifecycle] forking ${originalPath} from entry ${entryId}`);
  child.send({
    kind: "session-command",
    command: "fork",
    sessionPath: originalPath,
    forkEntryId: entryId,
  });
}

child.on("message", async (raw) => {
  const m = raw;
  switch (m.kind) {
    case "ready":
      console.log(`[lifecycle] boot ready: session=${m.sessionId} cwd=${m.cwd}`);
      step = "new";
      child.send({ kind: "session-command", command: "new" });
      break;

    case "session-switched": {
      console.log(`[lifecycle] ${m.reason}: session=${m.sessionId} path=${m.sessionPath ?? "(mem)"}`);
      if (m.reason === "new") {
        newSeen = true;
        originalPath = m.sessionPath;
        // A fresh persisted session should have a file path.
        if (!originalPath) finish(1, false, "new session has no file path");
        step = "prompt";
        child.send({ kind: "prompt", text: "Reply with exactly the word: hello" });
      } else if (m.reason === "fork") {
        forkSeen = true;
        forkPath = m.sessionPath;
        const after = readFileSync(originalPath, "utf8");
        const afterHash = sha256(after);
        const unchanged = afterHash === originalHash;
        console.log(`[lifecycle] original unchanged after fork: ${unchanged} (${afterHash === originalHash ? "yes" : "NO"})`);
        if (!unchanged) {
          finish(1, false, "fork mutated the original session file!");
          return;
        }
        console.log(`[lifecycle] fork created new file (differs from original): ${forkPath !== originalPath}`);
        child.send({ kind: "shutdown" });
      }
      break;
    }

    case "event": {
      const e = m.event;
      if (e.type === "message_update" && e.assistantMessageEvent?.type === "text_delta") textDeltas++;
      break;
    }

    case "approvalRequest":
      console.log(`[lifecycle] ⟳ approval for ${m.toolName}; allowing`);
      child.send({ kind: "approvalResponse", requestId: m.requestId, decision: "allow" });
      break;

    case "done":
      console.log(`[lifecycle] prompt done (textDeltas=${textDeltas})`);
      promptDone = true;
      // Snapshot the original file before forking.
      originalHash = sha256(readFileSync(originalPath, "utf8"));
      console.log(`[lifecycle] original snapshot sha256=${originalHash}`);
      await issueFork();
      break;

    case "shutdown":
      console.log(`[lifecycle] host confirmed clean shutdown (code ${m.code})`);
      finish(0, true, null);
      break;

    case "log":
      console.log(`[host:${m.level}] ${m.message}`);
      break;
  }
});

child.on("error", (err) => {
  console.error("[lifecycle] host process error:", err.message);
  finish(1, false, err.message);
});

child.on("exit", (code, signal) => {
  console.log(`[lifecycle] host exited (code=${code}, signal=${signal ?? "none"})`);
  if (!finished) finish(code ?? 1, false, `unexpected exit`);
});

function report(code, success, message) {
  console.log("\n=== ticket 05 session-lifecycle smoke report ===");
  console.log(`new seen         : ${newSeen}`);
  console.log(`prompt done      : ${promptDone}`);
  console.log(`text deltas      : ${textDeltas}`);
  console.log(`fork seen        : ${forkSeen}`);
  console.log(`original→fork file changed: ${forkPath !== originalPath}`);
  console.log(`host exit code   : ${code}`);

  if (message) console.log(`failure          : ${message}`);

  try {
    const orphans = execFileSync("pgrep", ["-lf", "pi-coding-agent"])
      .toString()
      .split("\n")
      .filter((l) => l.trim().length > 0);
    console.log(`lingering pi-coding-agent procs: ${orphans.length ? orphans.join(" | ") : "none"}`);
  } catch {
    console.log("lingering pi-coding-agent procs: none (pgrep found none)");
  }

  const ok =
    newSeen && promptDone && forkSeen && textDeltas > 0 && forkPath !== originalPath && !!success;
  console.log(`RESULT : ${ok ? "ALL GREEN" : "FAIL"}`);
}
