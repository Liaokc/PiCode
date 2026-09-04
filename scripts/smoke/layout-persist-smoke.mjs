#!/usr/bin/env node
/**
 * Layout persistence smoke (ticket 29). Boots the BUILT app twice against a
 * throwaway userData dir (PICODE_LAYOUT_SMOKE_USER_DATA) and, over Chrome
 * DevTools Protocol with real pointer input:
 *
 *   boot 1  sidebar width starts at the 320px default
 *           → drag the sidebar resizer (+80 → 400, then past both clamps)
 *           → double-click resets to 320
 *           → final drag to 400; open the side panel, drag it to 560
 *           → picode-settings.json carries sidebarWidth 400 + panelWidth 560
 *   boot 2  sidebar comes back at 400; the reopened panel at 560
 *           → double-click resets the sidebar to 320 again
 *
 * Any missed step exits non-zero. Not part of `npm test`; run standalone:
 *   npm run build && node scripts/smoke/layout-persist-smoke.mjs
 *
 * Dev-app serialization: fixed CDP port 9344; one instance at a time.
 */

import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

const CDP_PORT = 9344
const ROOT = path.resolve(new URL('..', import.meta.url).pathname, '..')
const SIDEBAR_DEFAULT = 320
const SIDEBAR_COMPACT = 400
let SIDEBAR_FINAL = 400 // overwritten at runtime: the floor-clamped bound at panel 560
const SIDEBAR_MIN = 240
const SIDEBAR_MAX = 520
const PANEL_DEFAULT = 420
const PANEL_FINAL = 560 // comfortably inside the floor bound at every window width

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function fail(message) {
  throw new Error(message)
}

// ---- CDP session over one WebSocket ---------------------------------------

class Cdp {
  constructor(ws) {
    this.ws = ws
    this.nextId = 1
    this.pending = new Map()
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data)
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        if (msg.error) reject(new Error(`${msg.error.message} (${msg.error.code})`))
        else resolve(msg.result)
      }
    })
  }

  send(method, params = {}) {
    const id = this.nextId++
    const payload = JSON.stringify({ id, method, params })
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(payload)
    })
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true })
    if (result.exceptionDetails) throw new Error(`evaluate failed: ${JSON.stringify(result.exceptionDetails)}`)
    return result.result.value
  }
}

async function connectCdp() {
  for (let waited = 0; waited < 30_000; waited += 250) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json()
      const page = list.find((t) => t.type === 'page' && (t.title === 'PiCode' || t.url.includes('index.html')))
      if (page) {
        const ws = new WebSocket(page.webSocketDebuggerUrl)
        await new Promise((resolve, reject) => {
          ws.addEventListener('open', resolve, { once: true })
          ws.addEventListener('error', reject, { once: true })
        })
        return new Cdp(ws)
      }
    } catch {
      // debugger endpoint not up yet
    }
    await sleep(250)
  }
  throw new Error('CDP endpoint never appeared')
}

// ---- electron lifecycle ----------------------------------------------------

function bootElectron(userDataDir) {
  const child = spawn(
    path.join(ROOT, 'node_modules', '.bin', 'electron'),
    ['.', `--remote-debugging-port=${CDP_PORT}`],
    {
      cwd: ROOT,
      env: { ...process.env, PICODE_LAYOUT_SMOKE_USER_DATA: userDataDir },
      stdio: ['ignore', 'pipe', 'pipe']
    }
  )
  child.stdout.on('data', (chunk) => {
    for (const line of chunk.toString().split('\n')) if (line.trim() !== '') console.log(`[app] ${line}`)
  })
  child.stderr.on('data', (chunk) => {
    for (const line of chunk.toString().split('\n')) if (line.trim() !== '') console.log(`[app:err] ${line}`)
  })
  return child
}

async function stopElectron(child) {
  child.kill('SIGTERM')
  const killTimer = setTimeout(() => child.kill('SIGKILL'), 3000)
  await new Promise((resolve) => child.once('exit', resolve))
  clearTimeout(killTimer)
}

// ---- probes + input --------------------------------------------------------

async function waitForProbe(cdp, probe, budgetMs, label) {
  for (let waited = 0; waited < budgetMs; waited += 100) {
    try {
      if ((await cdp.evaluate(probe)) === true) return true
    } catch {
      // renderer not up yet
    }
    await sleep(100)
  }
  throw new Error(`${label} timed out after ${budgetMs}ms`)
}

async function widthOf(cdp, selector) {
  return cdp.evaluate(`document.querySelector(${JSON.stringify(selector)})?.offsetWidth ?? -1`)
}

async function waitForWidth(cdp, selector, expected, label) {
  try {
    await waitForProbe(
      cdp,
      `document.querySelector(${JSON.stringify(selector)})?.offsetWidth === ${expected}`,
      8_000,
      label
    )
  } catch {
    const diag = (await cdp.evaluate(
      `JSON.stringify({
        width: document.querySelector(${JSON.stringify(selector)})?.offsetWidth,
        inline: document.querySelector(${JSON.stringify(selector)})?.style.width,
        computed: getComputedStyle(document.querySelector(${JSON.stringify(selector)})).width,
        maxWidth: getComputedStyle(document.querySelector(${JSON.stringify(selector)})).maxWidth,
        minWidth: getComputedStyle(document.querySelector(${JSON.stringify(selector)})).minWidth
      })`
    ).catch(() => 'unavailable'))
    throw new Error(`${label} timed out; state: ${diag}`)
  }
}

async function rectCenter(cdp, selector) {
  const rect = await cdp.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })()`)
  if (!rect) throw new Error(`no rect for ${selector}`)
  return rect
}

/** Press-and-move-release drag with real pointer input (pointer events +
 * pointer capture fire exactly like a user's drag). */
async function drag(cdp, selector, dx, dy) {
  const start = await rectCenter(cdp, selector)
  let x = Math.round(start.x)
  let y = Math.round(start.y)
  const steps = 20
  const stepX = dx / steps
  const stepY = dy / steps
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 })
  await sleep(60)
  for (let i = 0; i < steps; i++) {
    x = Math.round(start.x + stepX * (i + 1))
    y = Math.round(start.y + stepY * (i + 1))
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1 })
    await sleep(20)
  }
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 1, clickCount: 1 })
  await sleep(250)
}

/** Two clicks in place with clickCount 1 then 2 → the browser synthesizes dblclick. */
async function doubleClick(cdp, selector) {
  const { x, y } = await rectCenter(cdp, selector)
  for (const clickCount of [1, 2]) {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount })
    await sleep(40)
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 1, clickCount })
    await sleep(120)
  }
  await sleep(250)
}

/** The keymap reads code + modifiers only (ticket 27), so a synthetic
 * physical-code event toggles the side panel exactly like ⌥⌘B. */
async function pressAltCmdB(cdp) {
  await cdp.evaluate(
    `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', code: 'KeyB', altKey: true, metaKey: true, bubbles: true }))`
  )
}

/** Composer density probes (ZCode staged label degradation). The model chip
 * is the cleanest marker: compact keeps its text label, minimal replaces it
 * with the cube icon. */
const MODEL_CHIP_TEXT = `document.querySelector('.composer .cmp-chip.cmp-muted')?.textContent?.trim() ?? ''`
const CARET_COUNT = `document.querySelectorAll('.composer .cmp-caret').length`

// ---- persisted-document assertions -----------------------------------------

function readWidths(userDataDir) {
  try {
    const doc = JSON.parse(readFileSync(path.join(userDataDir, 'picode-settings.json'), 'utf8'))
    return {
      sidebarWidth: doc.preferences?.sidebarWidth ?? null,
      panelWidth: doc.preferences?.panelWidth ?? null
    }
  } catch {
    return { sidebarWidth: null, panelWidth: null }
  }
}

async function waitForPersistedWidths(userDataDir, wantSidebar, wantPanel) {
  for (let waited = 0; waited < 10_000; waited += 200) {
    const got = readWidths(userDataDir)
    if (got.sidebarWidth === wantSidebar && got.panelWidth === wantPanel) return got
    await sleep(200)
  }
  throw new Error(
    `settings file never reached sidebarWidth ${wantSidebar}/panelWidth ${wantPanel}; got ${JSON.stringify(readWidths(userDataDir))}`
  )
}

// ---- main --------------------------------------------------------------------

const userDataDir = mkdtempSync(path.join(os.tmpdir(), 'picode-layout-smoke-'))
console.log(`SMOKE isolated userData: ${userDataDir}`)
let child = null
let exitCode = 0

try {
  // ---- boot 1: default → drag → clamp → double-click reset → commit ----
  child = bootElectron(userDataDir)
  const cdp = await connectCdp()
  await cdp.send('Runtime.enable')
  await waitForProbe(cdp, `(() => { const el = document.querySelector('.sidebar'); return el !== null && !el.hasAttribute('data-closed') })()`, 30_000, 'sidebar never mounted')
  console.log('SMOKE boot1_sidebar_mounted')

  await waitForWidth(cdp, '.sidebar', SIDEBAR_DEFAULT, 'sidebar never reached its 320px default')
  console.log('SMOKE sidebar_default_ok', String(SIDEBAR_DEFAULT))

  if ((await widthOf(cdp, '.sidebar-resizer')) <= 0) throw new Error('.sidebar-resizer never mounted')
  console.log('SMOKE sidebar_resizer_present')

  // Drag right +80 → 400.
  await drag(cdp, '.sidebar-resizer', 80, 0)
  await waitForWidth(cdp, '.sidebar', 400, 'dragging the resizer right never widened the sidebar to 400')
  console.log('SMOKE sidebar_drag_widen_ok', '320→400')

  // Drag far past both clamps: +800 clamps at 520, then -800 clamps at 240.
  await drag(cdp, '.sidebar-resizer', 800, 0)
  await waitForWidth(cdp, '.sidebar', SIDEBAR_MAX, 'sidebar width never clamped at the 520px ceiling')
  console.log('SMOKE sidebar_clamp_max_ok', String(SIDEBAR_MAX))
  await drag(cdp, '.sidebar-resizer', -800, 0)
  await waitForWidth(cdp, '.sidebar', SIDEBAR_MIN, 'sidebar width never clamped at the 240px floor')
  console.log('SMOKE sidebar_clamp_min_ok', String(SIDEBAR_MIN))

  // Double-click the handle → reset to the default.
  await doubleClick(cdp, '.sidebar-resizer')
  await waitForWidth(cdp, '.sidebar', SIDEBAR_DEFAULT, 'double-clicking the resizer never reset the width to 320')
  console.log('SMOKE sidebar_dblclick_reset_ok', String(SIDEBAR_DEFAULT))

  // Commit the width the restart assertion will look for, then squeeze the
  // main zone: sidebar 400 + panel 560 → the composer enters the compact
  // stage (text label on the model chip, fewer carets).
  await drag(cdp, '.sidebar-resizer', SIDEBAR_COMPACT - SIDEBAR_DEFAULT, 0)
  await waitForWidth(cdp, '.sidebar', SIDEBAR_COMPACT, 'final sidebar drag never landed on 400')
  console.log('SMOKE sidebar_compact_width_ok', String(SIDEBAR_COMPACT))

  // The side panel: open it, drag its resizer -140 → 560 (same commit path).
  await pressAltCmdB(cdp)
  await waitForProbe(cdp, `(() => { const el = document.querySelector('.side-panel'); return el !== null && !el.hasAttribute('data-closed') })()`, 8_000, 'side panel never opened')
  await waitForWidth(cdp, '.side-panel', PANEL_DEFAULT, 'side panel never opened at its 420px default')
  await drag(cdp, '.panel-resizer', -140, 0)
  await waitForWidth(cdp, '.side-panel', PANEL_FINAL, 'panel drag never landed on 560')
  console.log('SMOKE panel_drag_ok', `${PANEL_DEFAULT}→${PANEL_FINAL}`)

  // ZCode drag rule: BOTH panes hold their widths — the main zone absorbs.
  // With sidebar 400 + panel 560 the composer (~356px) is in the compact
  // stage: the access chip sheds its text, the model chip keeps a label.
  const compactState = await cdp.evaluate(
    `JSON.stringify({
      sidebar: document.querySelector('.sidebar')?.offsetWidth,
      panel: document.querySelector('.side-panel')?.offsetWidth,
      accessText: document.querySelector('.composer .cmp-chip.cmp-access')?.textContent?.trim() ?? '',
      modelText: (${MODEL_CHIP_TEXT}).length,
      carets: ${CARET_COUNT}
    })`
  )
  const compact = JSON.parse(compactState)
  if (compact.sidebar !== SIDEBAR_COMPACT || compact.panel !== PANEL_FINAL) {
    fail(`panes did not hold their widths under compression: ${compactState}`)
  }
  if (compact.accessText !== '⌄' || compact.modelText === 0 || compact.carets < 2) {
    fail(`composer never reached the compact stage: ${compactState}`)
  }
  if (await waitForProbe(cdp, `document.querySelector('.composer .cmp-think-bar') !== null`, 5_000, 'think bar')) {
    console.log('SMOKE composer_think_bar_ok')
  }
  console.log('SMOKE panes_hold_ok', `sidebar=${compact.sidebar} panel=${compact.panel}`)
  console.log('SMOKE composer_compact_ok', compactState)

  // Round-2 floor: push the sidebar toward its 520 ceiling with the panel at
  // 560 — the commit clamps at window − panel − 420 (computed live: the
  // viewport can differ a few px from the nominal window size), the panel
  // must not move (ZCode rule), the main zone holds its floor, and the
  // empty state degrades (chips hidden, greeting still one line) instead of
  // overflowing.
  const floorBound = await cdp.evaluate(
    `Math.max(240, window.innerWidth - document.querySelector('.side-panel').offsetWidth - 420)`
  )
  SIDEBAR_FINAL = floorBound
  await drag(cdp, '.sidebar-resizer', SIDEBAR_MAX - SIDEBAR_COMPACT, 0)
  await waitForWidth(cdp, '.sidebar', floorBound, 'sidebar never clamped at the main-zone floor bound')
  const floorState = await cdp.evaluate(
    `JSON.stringify({
      sidebar: document.querySelector('.sidebar')?.offsetWidth,
      panel: document.querySelector('.side-panel')?.offsetWidth,
      main: document.querySelector('.main-zone')?.offsetWidth,
      chipsHidden: getComputedStyle(document.querySelector('.quick-chips')).visibility === 'hidden',
      greetingOneLine: (document.querySelector('.empty-greeting')?.getBoundingClientRect().height ?? 999) < 50,
      greetingWidth: document.querySelector('.empty-greeting')?.getBoundingClientRect().width ?? -1,
      greetingFontPx: document.querySelector('.empty-greeting')?.style.fontSize ?? '',
      composerInner: document.querySelector('.composer')?.clientWidth ?? -1,
      greetingFits: (document.querySelector('.empty-greeting')?.getBoundingClientRect().width ?? 9999) <= (document.querySelector('.composer')?.clientWidth ?? 0)
    })`
  )
  const floor = JSON.parse(floorState)
  if (floor.panel !== PANEL_FINAL) fail(`the panel moved while the sidebar was being dragged: ${floorState}`)
  if (floor.main < 420) fail(`main-zone floor (420px) violated: ${floorState}`)
  if (!floor.chipsHidden) fail(`quick-start chips never hid at the floor: ${floorState}`)
  if (!floor.greetingOneLine || !floor.greetingFits) fail(`greeting never fit one line within the composer: ${floorState}`)
  console.log('SMOKE main_floor_ok', floorState)

  // The preferences document on disk must carry BOTH widths (persistence).
  await waitForPersistedWidths(userDataDir, SIDEBAR_FINAL, PANEL_FINAL)
  console.log('SMOKE preferences_persisted_ok', `sidebarWidth=${SIDEBAR_FINAL} panelWidth=${PANEL_FINAL}`)
  await stopElectron(child)
  child = null

  // ---- boot 2: both widths restore, double-click still resets ----
  child = bootElectron(userDataDir)
  const cdp2 = await connectCdp()
  await cdp2.send('Runtime.enable')
  await waitForProbe(cdp2, `(() => { const el = document.querySelector('.sidebar'); return el !== null && !el.hasAttribute('data-closed') })()`, 30_000, 'sidebar never mounted (boot 2)')

  await waitForWidth(cdp2, '.sidebar', SIDEBAR_FINAL, 'sidebar did not restore its persisted 400px width after restart')
  console.log('SMOKE sidebar_persisted_after_restart_ok', String(SIDEBAR_FINAL))

  await pressAltCmdB(cdp2)
  await waitForProbe(cdp2, `(() => { const el = document.querySelector('.side-panel'); return el !== null && !el.hasAttribute('data-closed') })()`, 8_000, 'side panel never opened (boot 2)')
  await waitForWidth(cdp2, '.side-panel', PANEL_FINAL, 'side panel did not restore its persisted 560px width after restart')
  console.log('SMOKE panel_persisted_after_restart_ok', String(PANEL_FINAL))

  await doubleClick(cdp2, '.sidebar-resizer')
  await waitForWidth(cdp2, '.sidebar', SIDEBAR_DEFAULT, 'double-click reset stopped working after restart')
  console.log('SMOKE sidebar_dblclick_reset_after_restart_ok', String(SIDEBAR_DEFAULT))

  await waitForPersistedWidths(userDataDir, SIDEBAR_DEFAULT, PANEL_FINAL)
  console.log('SMOKE reset_persisted_ok', `sidebarWidth=${SIDEBAR_DEFAULT} panelWidth=${PANEL_FINAL}`)
  console.log('SMOKE done')
} catch (err) {
  console.error('SMOKE FAIL', err instanceof Error ? err.message : String(err))
  exitCode = 1
} finally {
  if (child !== null) await stopElectron(child)
  rmSync(userDataDir, { recursive: true, force: true })
}
process.exit(exitCode)
