#!/usr/bin/env node
/**
 * Ticket 86 capture + verify driver: boots the BUILT app against throwaway
 * userData, then walks the zero-tabs auto-collapse story end to end and
 * photographs each state —
 *
 *   1-reopen-picker.png     zero tabs, panel reopened (⌥⌘B): picker page
 *   2-review-tab-open.png   Review tab open from the picker card
 *   3-last-close-collapsed  (probed, then) the auto-collapsed shell
 *   3-last-close-collapsed.png  — no empty picker shell residue
 *
 * Every probe doubles as a behavioral assertion; the script exits non-zero
 * if the linkage breaks, so it is also the fast manual regression check for
 * this ticket (the in-app electron smoke carries the same assertions as the
 * `panel_collapse_86` stage).
 *
 * Usage: node node_modules/electron-vite/bin/electron-vite.js build && node .scratch/picode-1-7/issues/86-panel-empty-autocollapse/captures/capture-86.mjs
 * Dev-app serialization: fixed CDP port 9346; one instance at a time.
 */

import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const CDP_PORT = 9346
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..')
const OUT_DIR = path.dirname(fileURLToPath(import.meta.url))

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

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
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
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

function bootElectron(userDataDir) {
  // This session's tool shell carries ELECTRON_RUN_AS_NODE=1 (the pi agent
  // runs inside Electron-as-node) — inherited by a child Electron it would
  // force plain-Node mode and the main bundle would crash on electron.app.
  // Unset it explicitly (the operator terminal never has it set).
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  return spawn(path.join(ROOT, 'node_modules', '.bin', 'electron'), ['.', `--remote-debugging-port=${CDP_PORT}`], {
    cwd: ROOT,
    env: { ...env, PICODE_LAYOUT_SMOKE_USER_DATA: userDataDir },
    stdio: 'ignore'
  })
}

async function stopElectron(child) {
  child.kill('SIGTERM')
  const killTimer = setTimeout(() => child.kill('SIGKILL'), 3000)
  await new Promise((resolve) => child.once('exit', resolve))
  clearTimeout(killTimer)
}

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

async function capture(cdp, name) {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(path.join(OUT_DIR, name), Buffer.from(data, 'base64'))
  console.log(`CAPTURED ${name}`)
}

// ---- probes ----------------------------------------------------------------

const PANEL_OPEN = `(() => { const p = document.querySelector('.side-panel'); return p !== null && !p.hasAttribute('data-closed') })()`
const PANEL_CLOSED = `(() => { const p = document.querySelector('.side-panel'); return p !== null && p.hasAttribute('data-closed') })()`
const TAB_COUNT = `document.querySelectorAll('.panel-tab-label span').length`
// The picker page shown by an OPEN, actually-visible shell. (getClientRects
// is useless here: visibility:hidden panes keep layout boxes, so rects stay
// non-empty — the computed shell state is the truth.) This is exactly the
// "empty shell residue" this ticket removes.
const PICKER_SHOWN = `(() => {
  const panel = document.querySelector('.side-panel')
  const picker = document.querySelector('.panel-empty')
  if (!panel || !picker) return false
  if (panel.hasAttribute('data-closed')) return false
  const cs = getComputedStyle(panel)
  return cs.visibility === 'visible' && cs.opacity !== '0' && panel.offsetWidth > 0
})()`
const CLOSE_FIRST_TAB = `(() => {
  const closeBtn = document.querySelector('.panel-tab .panel-tab-close')
  if (closeBtn instanceof HTMLElement) { closeBtn.click(); return true }
  return false
})()`
const PRESS_ALT_CMD_B = `window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyB', altKey: true, metaKey: true, bubbles: true })); true`

// ---- main --------------------------------------------------------------------

const userDataDir = mkdtempSync(path.join(os.tmpdir(), 'picode-t86-captures-'))
let child = null
let exitCode = 0

try {
  child = bootElectron(userDataDir)
  const cdp = await connectCdp()
  await cdp.send('Runtime.enable')
  await cdp.send('Page.enable')
  await waitForProbe(cdp, `document.querySelector('.sidebar') !== null`, 30_000, 'sidebar never mounted')
  await sleep(500)

  // Frame 1 — the launch baseline: panel closed, zero tabs.
  if ((await cdp.evaluate(PANEL_CLOSED)) !== true) throw new Error('boot: the panel must launch closed')
  if ((await cdp.evaluate(TAB_COUNT)) !== 0) throw new Error('boot: zero tabs expected')

  // Frame 2 — ⌥⌘B reopen with zero tabs: the picker page (the empty state
  // that used to linger uninvited; now it only shows on explicit reopen).
  await cdp.evaluate(PRESS_ALT_CMD_B)
  await waitForProbe(cdp, PANEL_OPEN, 5_000, 'panel never reopened')
  await waitForProbe(cdp, PICKER_SHOWN, 5_000, 'zero-tab picker page never showed')
  console.log('ASSERT OK  reopen with zero tabs shows the picker page')
  await capture(cdp, '1-reopen-picker.png')

  // Frame 3 — open the Review tab from the picker card.
  await cdp.evaluate(`document.querySelector('.panel-tab-card[aria-label="Open Review tab"]')?.click(); true`)
  await waitForProbe(cdp, `(${TAB_COUNT}) === 1`, 5_000, 'Review tab never opened from the picker')
  await waitForProbe(cdp, `${PICKER_SHOWN} === false`, 5_000, 'picker never yielded to the tab')
  console.log('ASSERT OK  picker card opened the Review tab')
  await sleep(300)
  await capture(cdp, '2-review-tab-open.png')

  // Frame 4 — close the LAST tab: the panel must auto-collapse and leave NO
  // visible picker shell behind.
  await waitForProbe(cdp, CLOSE_FIRST_TAB, 5_000, 'tab close button never rendered')
  await waitForProbe(cdp, PANEL_CLOSED, 5_000, 'panel never auto-collapsed after the last close')
  if ((await cdp.evaluate(PICKER_SHOWN)) === true) throw new Error('empty picker shell still visible after the collapse')
  if ((await cdp.evaluate(TAB_COUNT)) !== 0) throw new Error('strip not empty after the last close')
  console.log('ASSERT OK  last close auto-collapsed the panel, no empty shell residue')
  await sleep(500)
  await capture(cdp, '3-last-close-collapsed.png')

  // Reopen once more: the picker page returns (deep links would expand too).
  await cdp.evaluate(PRESS_ALT_CMD_B)
  await waitForProbe(cdp, PANEL_OPEN, 5_000, 'panel never reopened after the collapse')
  await waitForProbe(cdp, PICKER_SHOWN, 5_000, 'picker page never returned')
  console.log('ASSERT OK  reopen path intact after the auto-collapse')

  console.log('CAPTURES done')
} catch (err) {
  console.error('CAPTURES FAIL', err instanceof Error ? err.message : String(err))
  exitCode = 1
} finally {
  if (child !== null) await stopElectron(child)
  rmSync(userDataDir, { recursive: true, force: true })
}
process.exit(exitCode)
