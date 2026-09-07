#!/usr/bin/env node
/**
 * Pane open/close motion captures (ticket 40). Boots the BUILT app against
 * throwaway userData (PICODE_LAYOUT_SMOKE_USER_DATA) and verifies — with
 * REAL pointer/keyboard input over CDP — the motion grammar the ticket
 * pins, then photographs the acceptance end states:
 *
 *   closed end state     size 0 + opacity 0 + pointer-events none
 *   motion grammar       size + opacity (+ visibility) transition,
 *                        200ms ease-out (ZCode-calibrated)
 *   dual-variable mode   the pinned content wrapper keeps the pane's REAL
 *                        size while the pane edge animates (clip, not
 *                        reflow — the xterm contract)
 *   drag rule            during a resizer drag the size transition is OFF
 *                        and the width tracks the pointer 1:1 (ticket 30)
 *   reduced motion       prefers-reduced-motion cuts the animation to
 *                        instant
 *
 *   1-boot-default.png          launch baseline
 *   2-panel-open.png            side panel open (⌥⌘B), settled
 *   3-panel-closed.png          side panel closed again, settled
 *   4-dock-open.png             bottom dock open (⌘J), settled
 *   5-dock-closed.png           dock closed again, settled
 *   6-sidebar-closed.png        sidebar closed (⌘B), settled
 *   7-sidebar-reopened.png      sidebar back, settled
 *   8-drag-1to1-mid-drag.png    mid-drag record (1:1, animation disabled)
 *   9-reduced-motion-closed.png reduced-motion instant close, settled
 *
 * Usage: npm run build && npm run visual:pane-motion
 * Dev-app serialization: fixed CDP port 9348; one instance at a time.
 */

import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const CDP_PORT = 9348;
const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const OUT_DIR = path.join(
  ROOT,
  ".scratch",
  "picode-1-3",
  "issues",
  "40-panel-open-animations",
  "captures",
);

const SIDEBAR_DEFAULT = 320;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function fail(message) {
  throw new Error(message);
}

// ---- CDP session over one WebSocket ---------------------------------------

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error)
          reject(new Error(`${msg.error.message} (${msg.error.code})`));
        else resolve(msg.result);
      }
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
    });
    if (result.exceptionDetails)
      throw new Error(
        `evaluate failed: ${JSON.stringify(result.exceptionDetails)}`,
      );
    return result.result.value;
  }
}

async function connectCdp() {
  for (let waited = 0; waited < 30_000; waited += 250) {
    try {
      const list = await (
        await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)
      ).json();
      const page = list.find(
        (t) =>
          t.type === "page" &&
          (t.title === "PiCode" || t.url.includes("index.html")),
      );
      if (page) {
        const ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => {
          ws.addEventListener("open", resolve, { once: true });
          ws.addEventListener("error", reject, { once: true });
        });
        return new Cdp(ws);
      }
    } catch {
      // debugger endpoint not up yet
    }
    await sleep(250);
  }
  throw new Error("CDP endpoint never appeared");
}

function bootElectron(userDataDir) {
  const child = spawn(
    path.join(ROOT, "node_modules", ".bin", "electron"),
    [".", `--remote-debugging-port=${CDP_PORT}`],
    {
      cwd: ROOT,
      env: { ...process.env, PICODE_LAYOUT_SMOKE_USER_DATA: userDataDir },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stdout.on("data", (chunk) => {
    for (const line of chunk.toString().split("\n"))
      if (line.trim() !== "") console.log(`[app] ${line}`);
  });
  child.stderr.on("data", (chunk) => {
    for (const line of chunk.toString().split("\n"))
      if (line.trim() !== "") console.log(`[app:err] ${line}`);
  });
  return child;
}

async function stopElectron(child) {
  child.kill("SIGTERM");
  const killTimer = setTimeout(() => child.kill("SIGKILL"), 3000);
  await new Promise((resolve) => child.once("exit", resolve));
  clearTimeout(killTimer);
}

async function waitForProbe(cdp, probe, budgetMs, label) {
  for (let waited = 0; waited < budgetMs; waited += 50) {
    try {
      if ((await cdp.evaluate(probe)) === true) return true;
    } catch {
      // renderer not up yet
    }
    await sleep(50);
  }
  throw new Error(`${label} timed out after ${budgetMs}ms`);
}

// ---- pane probes -----------------------------------------------------------

/** Open-state probe: panes stay mounted while closed (ticket 40) — the
 * [data-closed] attribute is the closed end state, not absence. */
const paneOpen = (selector) =>
  `(() => { const el = document.querySelector('${selector}'); return el !== null && !el.hasAttribute('data-closed') })()`;

const pressKey = (cdp, code, alt) =>
  cdp.evaluate(
    `window.dispatchEvent(new KeyboardEvent('keydown', { key: '${code === "KeyB" ? "b" : "j"}', code: '${code}', altKey: ${alt}, metaKey: true, bubbles: true })); true`,
  );

const pressAltCmdB = (cdp) => pressKey(cdp, "KeyB", true);
const pressCmdB = (cdp) => pressKey(cdp, "KeyB", false);
const pressCmdJ = (cdp) => pressKey(cdp, "KeyJ", false);

/** Wait until the pane's real size settles on its App-projected open/close
 * variable (the animation's target) — the honest "end state" for captures. */
async function waitForSettled(cdp, selector, sizeProp, varName, label) {
  await waitForProbe(
    cdp,
    `(() => {
      const el = document.querySelector('${selector}')
      if (!el) return false
      const target = parseFloat(getComputedStyle(document.querySelector('.app-shell')).getPropertyValue('${varName}'))
      return Math.abs(el.getBoundingClientRect()[${JSON.stringify(sizeProp)}] - target) < 0.5
    })()`,
    8_000,
    label,
  );
}

/** The full motion-grammar probe (shared shape with electron-smoke's
 * ticket-40 assertions): transition property/duration/timing + closed end
 * state + the pinned content wrapper's real size. */
const paneMotion = (cdp) =>
  cdp
    .evaluate(
      `(() => {
      const pane = (sel, sizeProp, varName, pinSel, pinProp) => {
        const el = document.querySelector(sel)
        if (!el) return null
        const cs = getComputedStyle(el)
        const pin = document.querySelector(pinSel)
        return {
          closed: el.hasAttribute('data-closed'),
          size: el.getBoundingClientRect()[sizeProp],
          target: parseFloat(getComputedStyle(document.querySelector('.app-shell')).getPropertyValue(varName)),
          transitionProperty: cs.transitionProperty,
          transitionDuration: cs.transitionDuration,
          transitionTimingFunction: cs.transitionTimingFunction,
          opacity: Number(cs.opacity),
          pointerEvents: cs.pointerEvents,
          pinSize: pin === null ? -1 : pin.getBoundingClientRect()[pinProp]
        }
      }
      return JSON.stringify({
        sidebar: pane('.sidebar', 'width', '--sidebar-w', '.sidebar-pin', 'width'),
        panel: pane('.side-panel', 'width', '--panel-w', '.panel-pin', 'width'),
        dock: pane('.terminal-dock', 'height', '--dock-h', '.dock-pin', 'height')
      })
    })()`,
    )
    .then((raw) => JSON.parse(raw));

function assertMotionGrammar(name, pane) {
  const sizeProp = name === "dock" ? "height" : "width";
  if (
    !pane.transitionProperty.includes(sizeProp) ||
    !pane.transitionProperty.includes("opacity") ||
    !pane.transitionProperty.includes("visibility")
  ) {
    fail(
      `ticket 40: ${name} transition grammar missing size/opacity/visibility: ${pane.transitionProperty}`,
    );
  }
  if (!pane.transitionDuration.split(", ").every((d) => d === "0.2s")) {
    fail(
      `ticket 40: ${name} transition duration is not the calibrated 200ms: ${pane.transitionDuration}`,
    );
  }
  if (
    !pane.transitionTimingFunction
      .split(", ")
      .every((t) => t.includes("ease-out"))
  ) {
    fail(
      `ticket 40: ${name} transition timing is not ease-out: ${pane.transitionTimingFunction}`,
    );
  }
  if (pane.closed) {
    if (
      Math.round(pane.size) !== 0 ||
      pane.opacity !== 0 ||
      pane.pointerEvents !== "none"
    ) {
      fail(
        `ticket 40: closed ${name} end state wrong (size ${pane.size}, opacity ${pane.opacity}, pointer-events ${pane.pointerEvents})`,
      );
    }
  } else if (pane.opacity !== 1) {
    fail(
      `ticket 40: open ${name} must be fully opaque at rest: ${pane.opacity}`,
    );
  }
}

async function capture(cdp, outDir, name) {
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
  writeFileSync(path.join(outDir, name), Buffer.from(data, "base64"));
  console.log(`CAPTURED ${name}`);
}

async function rectCenter(cdp, selector) {
  const rect = await cdp.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })()`);
  if (!rect) throw new Error(`no rect for ${selector}`);
  return rect;
}

// ---- main --------------------------------------------------------------------

const userDataDir = mkdtempSync(
  path.join(os.tmpdir(), "picode-pane-motion-captures-"),
);
mkdirSync(OUT_DIR, { recursive: true });
console.log(`CAPTURES isolated userData: ${userDataDir}`);
console.log(`CAPTURES out: ${OUT_DIR}`);
let child = null;
let exitCode = 0;

try {
  child = bootElectron(userDataDir);
  const cdp = await connectCdp();
  await cdp.send("Runtime.enable");
  await cdp.send("Page.enable");
  await waitForProbe(
    cdp,
    paneOpen(".sidebar"),
    30_000,
    "sidebar never mounted",
  );
  // The boot gate arms pane transitions one double-rAF after the settings
  // snapshot has seeded + painted; the motion grammar below is only honest
  // once it has (before that, transition is deliberately 'none').
  await waitForProbe(
    cdp,
    `document.querySelector('.app-shell')?.hasAttribute('data-pane-motion-armed') === true`,
    30_000,
    "pane motion never armed after boot",
  );

  // Motion grammar must be armed in every resting state below.
  const assertAll = async (label) => {
    const motion = await paneMotion(cdp);
    for (const [name, pane] of Object.entries(motion)) {
      if (pane === null) fail(`${label}: pane ${name} missing from the DOM`);
      assertMotionGrammar(name, pane);
    }
    return motion;
  };

  // 1 — boot baseline: sidebar open at 320, panel + dock closed. The boot
  //     seed must have painted WITHOUT animating (transitions arm after).
  await waitForSettled(
    cdp,
    ".sidebar",
    "width",
    "--sidebar-w",
    "sidebar default width",
  );
  const boot = await assertAll("boot");
  if (
    boot.sidebar.closed ||
    Math.round(boot.sidebar.size) !== SIDEBAR_DEFAULT
  ) {
    fail(
      `boot sidebar expected open at ${SIDEBAR_DEFAULT}, got ${boot.sidebar.size} (closed: ${boot.sidebar.closed})`,
    );
  }
  if (!boot.panel.closed || !boot.dock.closed)
    fail("boot expected the side panel and dock closed");
  await sleep(400);
  await capture(cdp, OUT_DIR, "1-boot-default.png");

  // 2 — side panel opens from its right dock edge (⌥⌘B); dual-variable
  //     assertion: while the pane edge animates, the pinned wrapper holds
  //     the panel's REAL width (clip, not reflow).
  await pressAltCmdB(cdp);
  const panelPinSamples = [];
  for (let i = 0; i < 12; i++) {
    panelPinSamples.push(
      await cdp.evaluate(
        `(() => {
          const el = document.querySelector('.side-panel')
          const pin = document.querySelector('.panel-pin')
          return { aside: el?.getBoundingClientRect().width ?? -1, pin: pin?.getBoundingClientRect().width ?? -1 }
        })()`,
      ),
    );
    await sleep(15);
  }
  const panelPins = new Set(panelPinSamples.map((s) => Math.round(s.pin)));
  if (panelPins.size !== 1)
    fail(
      `panel content reflowed during the open animation: ${JSON.stringify(panelPinSamples)}`,
    );
  if (!panelPinSamples.some((s) => s.aside > 0.5 && s.aside < s.pin - 1)) {
    fail(
      `the panel never appeared to animate (edge never inside its pinned content): ${JSON.stringify(panelPinSamples)}`,
    );
  }
  await waitForSettled(
    cdp,
    ".side-panel",
    "width",
    "--panel-w",
    "side panel open settle",
  );
  await assertAll("panel open");
  await sleep(350);
  await capture(cdp, OUT_DIR, "2-panel-open.png");

  // 3 — side panel closes as the exact reverse (⌥⌘B again); the pinned
  //     content must hold its width through the close run too, and the end
  //     state must be size 0 + opacity 0 + pointer-events none.
  await pressAltCmdB(cdp);
  const closeSamples = [];
  for (let i = 0; i < 12; i++) {
    closeSamples.push(
      await cdp.evaluate(
        `(() => {
          const el = document.querySelector('.side-panel')
          const pin = document.querySelector('.panel-pin')
          return { aside: el?.getBoundingClientRect().width ?? -1, pin: pin?.getBoundingClientRect().width ?? -1 }
        })()`,
      ),
    );
    await sleep(15);
  }
  const closePins = new Set(closeSamples.map((s) => Math.round(s.pin)));
  if (closePins.size !== 1)
    fail(
      `panel content reflowed during the close animation: ${JSON.stringify(closeSamples)}`,
    );
  await waitForSettled(
    cdp,
    ".side-panel",
    "width",
    "--panel-w",
    "side panel close settle",
  );
  const panelClosed = await assertAll("panel closed");
  if (!panelClosed.panel.closed)
    fail("side panel never reached its closed end state");
  await sleep(150);
  await capture(cdp, OUT_DIR, "3-panel-closed.png");

  // 4 — bottom dock opens from its bottom edge (⌘J); the pinned dock
  //     content keeps its height (the TerminalDock root never participates
  //     in a per-frame reflow — the xterm contract).
  await pressCmdJ(cdp);
  const dockPinSamples = [];
  for (let i = 0; i < 12; i++) {
    dockPinSamples.push(
      await cdp.evaluate(
        `(() => {
          const el = document.querySelector('.terminal-dock')
          const pin = document.querySelector('.dock-pin')
          return { dock: el?.getBoundingClientRect().height ?? -1, pin: pin?.getBoundingClientRect().height ?? -1 }
        })()`,
      ),
    );
    await sleep(15);
  }
  const dockPins = new Set(dockPinSamples.map((s) => Math.round(s.pin)));
  if (dockPins.size !== 1)
    fail(
      `dock content reflowed during the open animation: ${JSON.stringify(dockPinSamples)}`,
    );
  await waitForSettled(
    cdp,
    ".terminal-dock",
    "height",
    "--dock-h",
    "dock open settle",
  );
  await assertAll("dock open");
  await sleep(350);
  await capture(cdp, OUT_DIR, "4-dock-open.png");

  // 5 — dock closes (⌘J), reverse run, end state asserted.
  await pressCmdJ(cdp);
  await waitForSettled(
    cdp,
    ".terminal-dock",
    "height",
    "--dock-h",
    "dock close settle",
  );
  const dockClosed = await assertAll("dock closed");
  if (!dockClosed.dock.closed) fail("dock never reached its closed end state");
  await sleep(150);
  await capture(cdp, OUT_DIR, "5-dock-closed.png");

  // 6 — sidebar closes from its left dock edge (⌘B); same dual-variable
  //     assertion on the sidebar's pin.
  await pressCmdB(cdp);
  const sidebarCloseSamples = [];
  for (let i = 0; i < 12; i++) {
    sidebarCloseSamples.push(
      await cdp.evaluate(
        `(() => {
          const el = document.querySelector('.sidebar')
          const pin = document.querySelector('.sidebar-pin')
          return { aside: el?.getBoundingClientRect().width ?? -1, pin: pin?.getBoundingClientRect().width ?? -1 }
        })()`,
      ),
    );
    await sleep(15);
  }
  const sidebarPins = new Set(
    sidebarCloseSamples.map((s) => Math.round(s.pin)),
  );
  if (sidebarPins.size !== 1)
    fail(
      `sidebar content reflowed during the close animation: ${JSON.stringify(sidebarCloseSamples)}`,
    );
  await waitForSettled(
    cdp,
    ".sidebar",
    "width",
    "--sidebar-w",
    "sidebar close settle",
  );
  const sidebarClosed = await assertAll("sidebar closed");
  if (!sidebarClosed.sidebar.closed)
    fail("sidebar never reached its closed end state");
  await sleep(150);
  await capture(cdp, OUT_DIR, "6-sidebar-closed.png");

  // 7 — sidebar reopens (⌘B), settled.
  await pressCmdB(cdp);
  await waitForSettled(
    cdp,
    ".sidebar",
    "width",
    "--sidebar-w",
    "sidebar reopen settle",
  );
  await assertAll("sidebar reopened");
  await sleep(350);
  await capture(cdp, OUT_DIR, "7-sidebar-reopened.png");

  // 8 — drag rule (ticket 30 feel must not regress): during a real resizer
  //     drag the size transition is OFF and the width tracks the pointer
  //     1:1 — no tween lag between a pointer move and the pane edge.
  const dragStart = await rectCenter(cdp, ".sidebar-resizer");
  let x = Math.round(dragStart.x);
  const y = Math.round(dragStart.y);
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button: "left",
    buttons: 1,
    clickCount: 1,
  });
  await sleep(60);
  // Move +60 in a few steps; the pane edge must match the pointer 1:1.
  for (const dx of [20, 40, 60]) {
    x = Math.round(dragStart.x + dx);
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x,
      y,
      button: "left",
      buttons: 1,
    });
    await sleep(80);
    const mid = await cdp.evaluate(
      `(() => {
        const el = document.querySelector('.sidebar')
        const cs = getComputedStyle(el)
        return JSON.stringify({
          width: el.getBoundingClientRect().width,
          resizing: el.hasAttribute('data-resizing'),
          transitionProperty: cs.transitionProperty,
          expected: ${SIDEBAR_DEFAULT} + ${dx}
        })
      })()`,
    );
    const midState = JSON.parse(mid);
    if (!midState.resizing)
      fail("the sidebar drag never set its data-resizing marker");
    if (midState.transitionProperty.includes("width")) {
      fail(
        `the size transition stayed armed during the drag: ${midState.transitionProperty}`,
      );
    }
    if (Math.abs(midState.width - midState.expected) > 1) {
      fail(
        `drag is not 1:1: width ${midState.width} vs pointer target ${midState.expected}`,
      );
    }
    if (dx === 40) await capture(cdp, OUT_DIR, "8-drag-1to1-mid-drag.png");
  }
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x,
    y,
    button: "left",
    buttons: 1,
    clickCount: 1,
  });
  await sleep(120);
  const afterDrag = await cdp.evaluate(
    `(() => {
      const el = document.querySelector('.sidebar')
      return JSON.stringify({ width: el.getBoundingClientRect().width, resizing: el.hasAttribute('data-resizing') })
    })()`,
  );
  const after = JSON.parse(afterDrag);
  if (after.resizing)
    fail("data-resizing never cleared after the drag released");
  if (Math.round(after.width) !== SIDEBAR_DEFAULT + 60) {
    fail(
      `the drag commit never landed: width ${after.width}, expected ${SIDEBAR_DEFAULT + 60}`,
    );
  }
  console.log("SMOKE drag_1to1_ok", `320→${SIDEBAR_DEFAULT + 60}`);
  await waitForSettled(
    cdp,
    ".sidebar",
    "width",
    "--sidebar-w",
    "sidebar post-drag settle",
  );
  await assertAll("post-drag");

  // 9 — prefers-reduced-motion cuts the animation to instant: emulate the
  //     media feature, close the sidebar, and the end state must be reached
  //     immediately (no 200ms run).
  await cdp.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  await sleep(120);
  await pressCmdB(cdp);
  await sleep(60); // far inside the 200ms a real run would need
  const reduced = await cdp.evaluate(
    `(() => {
      const el = document.querySelector('.sidebar')
      const cs = getComputedStyle(el)
      return JSON.stringify({ width: el.getBoundingClientRect().width, transitionDuration: cs.transitionDuration })
    })()`,
  );
  const reducedState = JSON.parse(reduced);
  if (reducedState.transitionDuration.split(", ").some((d) => d !== "0s")) {
    fail(
      `prefers-reduced-motion must cut the transition to none: ${reducedState.transitionDuration}`,
    );
  }
  if (Math.round(reducedState.width) !== 0) {
    fail(
      `prefers-reduced-motion must cut straight to the end state: width ${reducedState.width} after 60ms`,
    );
  }
  await waitForSettled(
    cdp,
    ".sidebar",
    "width",
    "--sidebar-w",
    "reduced-motion close settle",
  );
  await sleep(150);
  await capture(cdp, OUT_DIR, "9-reduced-motion-closed.png");
  await cdp.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "no-preference" }],
  });
  // Reopen for a clean final state.
  await pressCmdB(cdp);
  await waitForSettled(
    cdp,
    ".sidebar",
    "width",
    "--sidebar-w",
    "final sidebar settle",
  );

  console.log("CAPTURES done");
} catch (err) {
  console.error(
    "CAPTURES FAIL",
    err instanceof Error ? err.message : String(err),
  );
  exitCode = 1;
} finally {
  if (child !== null) await stopElectron(child);
  rmSync(userDataDir, { recursive: true, force: true });
}
process.exit(exitCode);
