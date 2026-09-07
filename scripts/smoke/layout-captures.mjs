#!/usr/bin/env node
/**
 * Layout capture driver (ticket 29): boots the BUILT app against throwaway
 * userData (PICODE_LAYOUT_SMOKE_USER_DATA) and photographs the acceptance
 * states the assertions in layout-persist-smoke.mjs verify —
 *
 *   1-default-sidebar-320.png          launch baseline
 *   2-sidebar-max-520.png              sidebar at its 520px ceiling
 *   3-floor-sidebar400-panel560.png    the 420px main-zone floor: compact composer,
 *                                      their bounds, compact composer,
 *                                      quick-start chips hidden
 *
 * Usage: npm run build && npm run visual:layout
 * Dev-app serialization: fixed CDP port 9346; one instance at a time.
 */

import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const CDP_PORT = 9346
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const OUT_DIR = path.join(ROOT, '.scratch', 'picode-1-2', 'issues', '29-sidebar-resize-persist', 'captures')

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
  const child = spawn(
    path.join(ROOT, 'node_modules', '.bin', 'electron'),
    ['.', `--remote-debugging-port=${CDP_PORT}`],
    {
      cwd: ROOT,
      env: { ...process.env, PICODE_LAYOUT_SMOKE_USER_DATA: userDataDir },
      stdio: 'ignore'
    }
  )
  return child
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

async function waitForWidth(cdp, selector, expected, label) {
  await waitForProbe(cdp, `document.querySelector(${JSON.stringify(selector)})?.offsetWidth === ${expected}`, 8_000, label)
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

async function drag(cdp, selector, dx) {
  const start = await rectCenter(cdp, selector)
  let x = Math.round(start.x)
  const y = Math.round(start.y)
  const steps = 20
  const stepX = dx / steps
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 })
  await sleep(60)
  for (let i = 0; i < steps; i++) {
    x = Math.round(start.x + stepX * (i + 1))
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1 })
    await sleep(20)
  }
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 1, clickCount: 1 })
  await sleep(300)
}

async function pressAltCmdB(cdp) {
  await cdp.evaluate(
    `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', code: 'KeyB', altKey: true, metaKey: true, bubbles: true }))`
  )
}

async function capture(cdp, outDir, name) {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(path.join(outDir, name), Buffer.from(data, 'base64'))
  console.log(`CAPTURED ${name}`)
}

// ---- main --------------------------------------------------------------------

const userDataDir = mkdtempSync(path.join(os.tmpdir(), 'picode-layout-captures-'))
mkdirSync(OUT_DIR, { recursive: true })
console.log(`CAPTURES isolated userData: ${userDataDir}`)
console.log(`CAPTURES out: ${OUT_DIR}`)
let child = null
let exitCode = 0

try {
  child = bootElectron(userDataDir)
  const cdp = await connectCdp()
  await cdp.send('Runtime.enable')
  await cdp.send('Page.enable')
  await waitForProbe(cdp, `(() => { const el = document.querySelector('.sidebar'); return el !== null && !el.hasAttribute('data-closed') })()`, 30_000, 'sidebar never mounted')

  // 1 — the launch baseline: sidebar at its 320px default, panel closed.
  await waitForWidth(cdp, '.sidebar', 320, 'sidebar default width')
  await sleep(500)
  await capture(cdp, OUT_DIR, '1-default-sidebar-320.png')

  // 2 — the sidebar dragged to its 520px ceiling.
  await drag(cdp, '.sidebar-resizer', 200)
  await waitForWidth(cdp, '.sidebar', 520, 'sidebar max width')
  await sleep(300)
  await capture(cdp, OUT_DIR, '2-sidebar-max-520.png')

  // 3 — the round-2 main-zone floor: sidebar 400 + panel 560 (the tightest
  //     layout a 1440 window allows) — panes at their bounds, compact
  //     composer, quick-start chips hidden.
  await drag(cdp, '.sidebar-resizer', -120)
  await waitForWidth(cdp, '.sidebar', 400, 'sidebar 400')
  await pressAltCmdB(cdp)
  await waitForProbe(cdp, `(() => { const el = document.querySelector('.side-panel'); return el !== null && !el.hasAttribute('data-closed') })()`, 8_000, 'side panel never opened')
  await waitForWidth(cdp, '.side-panel', 420, 'side panel default width')
  await drag(cdp, '.panel-resizer', -140)
  await waitForWidth(cdp, '.side-panel', 560, 'panel 560')
  await waitForProbe(cdp, `document.querySelector('.composer .cmp-think-bar') !== null`, 8_000, 'think bar never appeared')
  await sleep(500)
  await capture(cdp, OUT_DIR, '3-floor-sidebar400-panel560.png')

  console.log('CAPTURES done')
} catch (err) {
  console.error('CAPTURES FAIL', err instanceof Error ? err.message : String(err))
  exitCode = 1
} finally {
  if (child !== null) await stopElectron(child)
  rmSync(userDataDir, { recursive: true, force: true })
}
process.exit(exitCode)
