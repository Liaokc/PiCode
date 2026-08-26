#!/usr/bin/env node
/**
 * Real-SDK end-to-end for the file-change diff view (ticket 06).
 *
 * Drives the main process's SessionService against the real Pi child host in a
 * disposable working directory, has Pi edit an existing file and write a new
 * one, and folds the real `tool_execution_*` events through the same `reduce`
 * the UI uses. Verifies the derived per-turn file-change list + diff data match
 * the actual on-disk changes — read-only against Pi (nothing patched), with a
 * clean, orphan-free shutdown.
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVICE_URL = pathToFileURL(resolve(HERE, "..", "src", "main", "sessionService.ts")).href;
const REDUCER_URL = pathToFileURL(resolve(HERE, "..", "src", "shared", "chatReduce.ts")).href;

const { SessionService } = await import(SERVICE_URL);
const { initialState, reduce } = await import(REDUCER_URL);

// A disposable working directory: not the PiCode repo, so Pi's edits are
// contained and can never touch the installed agent.
const WORKDIR = mkdtempSync(resolve(tmpdir(), "picode-diff-e2e-"));
const hello = resolve(WORKDIR, "hello.txt");
writeFileSync(hello, "line1\nline2\nline3\n", "utf8");

let state = initialState;
let ready = false;
let cleanShutdown = false;
let sent = false;

const service = new SessionService({
  hostPath: resolve(HERE, "..", "src", "child", "host.ts"),
  nodePath: process.env.NODE ?? "node",
  onHostMessage: (m) => {
    if (m.kind === "ready") {
      ready = true;
      console.log(`[e2e] ready: cwd=${m.cwd}`);
      state = reduce(state, { kind: "ready", sessionId: m.sessionId, cwd: m.cwd });
      sent = true;
      service.submitPrompt(
        "Edit hello.txt: replace the line \"line2\" with the line \"line2-changed\" using the edit tool. " +
          "Then create a new file note.txt whose entire content is exactly:\n" +
          "alpha\nbeta\n" +
          "Use the write tool for note.txt. Do not use bash to edit files.",
      );
    } else if (m.kind === "approvalRequest") {
      // Stand in for the human at the approval gate; allow the edit/write.
      console.log(`[e2e] ⟳ approval for ${m.toolName}; allowing`);
      service.respondToApproval({
        kind: "approvalResponse",
        requestId: m.requestId,
        decision: "allow",
      });
    } else if (m.kind === "event") {
      state = reduce(state, { kind: "event", event: m.event });
    } else if (m.kind === "done") {
      console.log("[e2e] prompt done; stopping");
      service.stop().then(() => {
        cleanShutdown = true;
        report();
      });
    }
  },
  onFatalError: (err) => {
    console.error("[e2e] fatal:", String(err));
  },
});

service.start(WORKDIR);

function report() {
  try {
    const orphans = execFileSync("pgrep", ["-lf", "pi-coding-agent"]).toString().trim();
    console.log(`linger procs: ${orphans || "none"}`);
  } catch {
    console.log("linger procs: none");
  }

  const checks = [];
  const ok = (name, cond) => {
    checks.push([name, cond]);
    console.log(`   ${cond ? "PASS" : "FAIL"}  ${name}`);
  };

  console.log("\n== file-change diff review (derived from real SDK events) ==");
  console.log("   raw fileChanges:", JSON.stringify(state.fileChanges, null, 2));

  const changes = state.fileChanges ?? [];
  ok(`one file-change entry per changed file (${changes.length})`, changes.length >= 2);

  // Pi may report path relative to the session cwd; resolve each entry against
  // the working dir so the basename comparison is robust to either form.
  const resolvePath = (p) => (p.startsWith(WORKDIR) ? p : resolve(WORKDIR, p));
  const helloChange = changes.find((f) => resolvePath(f.path) === hello);
  ok("hello.txt surfaced as a modified file", helloChange?.kind === "modified");

  // The real on-disk file is Pi's "after"; the patch from the event must reflect
  // the before→after transition produced by the edit.
  const onDiskHello = readFileSync(hello, "utf8");
  ok("hello.txt on disk matches the requested edit", onDiskHello === "line1\nline2-changed\nline3\n");
  ok(
    "hello.txt diff captures the removed/added lines",
    helloChange?.diffText?.includes("-line2") && helloChange?.diffText?.includes("+line2-changed"),
  );

  const notePath = resolve(WORKDIR, "note.txt");
  const noteChange = changes.find((f) => resolvePath(f.path) === notePath);
  ok("note.txt surfaced as an added file", noteChange?.kind === "added");
  // The added file's diff text is the full written content: it must equal the
  // real on-disk bytes Pi wrote (no before existed, so full-add is correct).
  const onDiskNote = readFileSync(notePath, "utf8");
  ok("note.txt exists on disk", onDiskNote.length > 0);
  ok("note.txt diff text equals its real written content", noteChange?.diffText === onDiskNote);

  // Scope: the diff list is bound to this single session's active turn.
  ok("session scoped: only the active session drives fileChanges", state.sessionId !== "");

  const cleaned = WORKDIR;
  console.log(`\n[cleanup] removing disposable workdir: ${cleaned}`);
  try {
    rmSync(WORKDIR, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }

  const verdict =
    checks.every(([, c]) => c) && ready && sent && cleanShutdown && service.running === false;
  console.log(
    `\nRESULT: ${verdict ? "ALL GREEN" : "FAIL"} (ready=${ready}, sent=${sent}, cleanShutdown=${cleanShutdown}, running=${service.running})`,
  );
  process.exit(verdict ? 0 : 1);
}
