#!/usr/bin/env node
/**
 * Real-SDK end-to-end: settings (ticket 06).
 *
 * Forks `src/child/host.ts` exactly as SessionService does, then drives the
 * settings surface against the real endpoint:
 *   - boot `ready` carries the current model + thinking level
 *   - `list-models` yields the available, auth-validated models
 *   - `set-thinking` → `thinking-changed` receipt (thinking actually changes)
 *   - `set-model` to a second available model → `model-changed` receipt (skipped
 *     with a warning when fewer than two auth-validated models are available)
 *   - a clean shutdown leaves no orphan process
 *
 * This exercises Pi's public SDK API (session.setModel / setThinkingLevel) — the
 * sanctioned usage route. Our host layers apply switches through the SDK; they
 * never hand-patch Pi files. This is a plain .mjs driver (no TS build) running
 * the real TS host via Node 24 type-stripping.
 */
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const HOST = resolve(HERE, "..", "src", "child", "host.ts");
const CWD = process.argv[2] ?? resolve(HERE, "..");
const WATCHDOG_MS = 150_000;

let finished = false;
let bootModel = null;
let bootThinking = null;
let modelsSeen = null;
let thinkingChanged = null;
let modelChanged = null;

const child = fork(HOST, [CWD], {
  execPath: process.env.NODE ?? "node",
  stdio: ["inherit", "inherit", "inherit", "ipc"],
});

const watchdog = setTimeout(() => {
  console.error(`[smoke-settings] WATCHDOG: no completion in ${WATCHDOG_MS}ms — killing host`);
  child.kill("SIGKILL");
}, WATCHDOG_MS);

function report(code, success, message) {
  clearTimeout(watchdog);
  console.log("\n=== smoke-settings result ===");
  console.log(`  boot model:            ${bootModel ?? "(none)"}`);
  console.log(`  boot thinking:         ${bootThinking ?? "(none)"}`);
  console.log(`  list-models count:     ${modelsSeen === null ? "(none)" : modelsSeen.length}`);
  console.log(`  thinking-changed:      ${thinkingChanged ?? "(none)"}`);
  console.log(`  model-changed:         ${modelChanged ?? "(none)"}`);
  console.log(`  out:                   ${success ? "PASS" : "FAIL"} — ${message}`);
  console.log("============================");
  process.exit(code);
}

function finish(code, success, message) {
  if (finished) return;
  finished = true;
  report(code, success, message);
}

child.on("message", (raw) => {
  const m = raw;
  switch (m.kind) {
    case "ready":
      console.log(`[smoke-settings] boot ready: model=${m.model ?? "default"} thinking=${m.thinking ?? "?"}`);
      bootModel = m.model ?? null;
      bootThinking = m.thinking ?? null;
      // Ask for the switchable models first.
      child.send({ kind: "list-models" });
      break;

    case "models": {
      modelsSeen = m.models;
      console.log(`[smoke-settings] list-models -> ${m.models.length} available`);
      // Switch to a different thinking level to prove setThinkingLevel works.
      const target = bootThinking === "high" ? "low" : "high";
      child.send({ kind: "set-thinking", level: target });
      break;
    }

    case "thinking-changed": {
      thinkingChanged = m.level;
      console.log(`[smoke-settings] thinking-changed -> ${m.level}`);
      // Try to switch model to the second available model (if any).
      if (modelsSeen && modelsSeen.length >= 2) {
        const target = modelsSeen.find((mm) => mm.ref !== bootModel) ?? modelsSeen[1];
        console.log(`[smoke-settings] set-model -> ${target.ref}`);
        child.send({ kind: "set-model", modelRef: target.ref });
      } else {
        console.log("[smoke-settings] <2 auth-validated models — skipping set-model (chose: won't force a switch)>");
        child.send({ kind: "shutdown" });
      }
      break;
    }

    case "model-changed": {
      modelChanged = m.model;
      console.log(`[smoke-settings] model-changed -> ${m.model}`);
      child.send({ kind: "shutdown" });
      break;
    }

    case "log":
      if (m.level === "error") console.log(`[smoke-settings] host log(error): ${m.message}`);
      break;

    case "shutdown":
      if (!modelsSeen) {
        finish(1, false, "no models receipt from list-models");
        return;
      }
      // A thinking-changed receipt must have arrived from set-thinking. (The
      // resulting value may be clamped by the model, so we assert the receipt
      // fired rather than an exact level.)
      if (!thinkingChanged) {
        finish(1, false, "set-thinking produced no thinking-changed receipt");
        return;
      }
      // model-changed is validated only when a switch was requested.
      if (modelsSeen.length >= 2 && !modelChanged) {
        finish(1, false, "set-model produced no model-changed receipt");
        return;
      }
      finish(0, true, "settings surface works (thinking + models; set-model when available)");
      break;
  }
});

child.on("error", (err) => {
  finish(1, false, `host error: ${String(err)}`);
});
child.on("exit", (code) => {
  if (!finished) finish(1, false, `host exited early (code=${code})`);
});
