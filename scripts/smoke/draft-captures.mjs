#!/usr/bin/env node
/**
 * Composer-draft capture driver (ticket 74): boots the BUILT app against a
 * throwaway session store + throwaway userData and photographs the
 * acceptance states the draft-preservation smoke stage asserts —
 *
 *   1-newtask-draft-typed.png                    New Task draft typed (BEFORE any switch)
 *   2-newtask-draft-restored-after-switch.png    same view AFTER the session round trip
 *   3-session-a-draft-text-plus-image.png        A: text draft + pasted-image thumbnail
 *   4-session-b-draft-independent.png            B: its own draft, zero A bleed
 *   5-session-a-draft-restored.png               A again: text + thumbnail restored
 *
 * Sessions are seeded as read-only copies of the operator's newest real
 * session file (the ticket-73 "proven to open" resume shape) with rewritten
 * ids and a throwaway cwd; resume replays history, so the whole run makes
 * ZERO model calls. Every shot is preceded by the same DOM assertion the
 * smoke stage uses (composer value / attachment count), so the pictures are
 * backed by the working code path, not staged DOM.
 *
 * Usage: npm run build && node scripts/smoke/draft-captures.mjs
 * Dev-app serialization: fixed CDP port 9346; one instance at a time.
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const CDP_PORT = 9346
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const OUT_DIR = path.join(ROOT, '.scratch', 'picode-1-6', 'issues', '74-composer-draft-preservation', 'captures')

const DRAFT_A = 'PICODE_74 draft A — remember to water the plants'
const DRAFT_B = 'PICODE_74 draft B — feed the cat'
const NEWTASK_DRAFT = 'PICODE_74 New Task draft — plan the garden'

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

function bootElectron(userDataDir, sessionsDir) {
  return spawn(
    path.join(ROOT, 'node_modules', '.bin', 'electron'),
    ['.', `--remote-debugging-port=${CDP_PORT}`],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        PICODE_LAYOUT_SMOKE_USER_DATA: userDataDir,
        PICODE_SESSION_DIR: sessionsDir
      },
      stdio: 'ignore'
    }
  )
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

async function capture(cdp, outDir, name) {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(path.join(outDir, name), Buffer.from(data, 'base64'))
  console.log(`CAPTURED ${name}`)
}

/** The smoke's composer type/clear drivers: React-controlled textarea, so
 * set the value through the native setter and dispatch a real input event. */
const typeJs = (text) => `(() => {
  const ta = document.querySelector('.composer-input')
  if (!(ta instanceof HTMLTextAreaElement)) return false
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
  setter.call(ta, ${JSON.stringify(text)})
  ta.dispatchEvent(new Event('input', { bubbles: true }))
  ta.focus()
  return true
})()`

const pasteImageJs = `(() => {
  const ta = document.querySelector('.chat-dock textarea.composer-input')
  if (!(ta instanceof HTMLTextAreaElement)) return false
  const dt = new DataTransfer()
  dt.items.add(new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], 'picode74.png', { type: 'image/png' }))
  ta.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  return true
})()`

const chatValue = `(document.querySelector('.chat-dock textarea.composer-input')?.value ?? 'missing')`
const emptyValue = `(document.querySelector('.empty-state textarea.composer-input')?.value ?? 'missing')`
const chatAttachCount = `(document.querySelectorAll('.chat-dock .composer-attachment').length)`

async function clickRow(cdp, row) {
  await cdp.evaluate(`document.querySelector(${JSON.stringify(row)})?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`)
}

async function openNewTask(cdp) {
  await cdp.evaluate(
    `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', code: 'KeyN', metaKey: true, bubbles: true })); true`
  )
  await waitForProbe(cdp, `document.querySelector('.empty-state') !== null`, 8_000, '⌘N never opened the empty state')
}

/** Seed two resume targets: read-only copies of the operator's newest real
 * session file (the proven-openable shape) with distinct ids and a throwaway
 * cwd, backdated to quiet. Zero Pi data is modified. */
function seedSessions(storeDir) {
  const realStore = path.join(homedir(), '.pi', 'agent', 'sessions')
  const candidates = []
  const walk = (dir) => {
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.jsonl')) candidates.push(full)
    }
  }
  walk(realStore)
  candidates.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
  if (candidates.length === 0) throw new Error(`no real session file to seed from in ${realStore}`)
  const templatePath = candidates[0]
  const text = readFileSync(templatePath, 'utf8')
  const projectDir = mkdtempSync(path.join(tmpdir(), 'picode-draft-captures-'))
  const seed = (name, seedText) => {
    const lines = text.split('\n')
    const header = JSON.parse(lines[0] ?? '{}')
    header.id = randomUUID()
    header.cwd = projectDir
    lines[0] = JSON.stringify(header)
    lines.push(
      JSON.stringify({
        type: 'message',
        id: `cap74-${randomUUID().slice(0, 8)}`,
        parentId: null,
        timestamp: new Date().toISOString(),
        message: { role: 'user', content: [{ type: 'text', text: seedText }] }
      })
    )
    const file = path.join(storeDir, name)
    writeFileSync(file, lines.join('\n'))
    const quiet = new Date(Date.now() - 30 * 60_000)
    utimesSync(file, quiet, quiet)
    return file
  }
  return { projectDir, fileA: seed('draft-capture-a.jsonl', 'PICODE_74 capture seed A'), fileB: seed('draft-capture-b.jsonl', 'PICODE_74 capture seed B') }
}

// ---- main --------------------------------------------------------------------

const userDataDir = mkdtempSync(path.join(tmpdir(), 'picode-draft-captures-user-'))
const sessionsDir = mkdtempSync(path.join(tmpdir(), 'picode-draft-captures-store-'))
mkdirSync(OUT_DIR, { recursive: true })
console.log(`CAPTURES isolated userData: ${userDataDir}`)
console.log(`CAPTURES isolated session store: ${sessionsDir}`)
console.log(`CAPTURES out: ${OUT_DIR}`)
let child = null
let exitCode = 0

try {
  const { projectDir, fileA, fileB } = seedSessions(sessionsDir)
  child = bootElectron(userDataDir, sessionsDir)
  const cdp = await connectCdp()
  await cdp.send('Runtime.enable')
  await cdp.send('Page.enable')
  await waitForProbe(cdp, `(() => { const el = document.querySelector('.sidebar'); return el !== null && !el.hasAttribute('data-closed') })()`, 30_000, 'sidebar never mounted')
  await sleep(1_000)

  const rowA = `[data-file="${fileA}"]`
  const rowB = `[data-file="${fileB}"]`
  const viewOn = (row, marker) =>
    `document.querySelector('.empty-state') === null &&
     [...document.querySelectorAll('.main-zone .msg-user')].some((n) => (n.textContent ?? '').includes(${JSON.stringify(marker)})) &&
     (document.querySelector('${row}')?.classList.contains('sb-task-active') ?? false)`

  // Resume A and B (replay only — no model calls).
  await waitForProbe(cdp, `document.querySelector('${rowA}') !== null && document.querySelector('${rowB}') !== null`, 20_000, 'seeded rows never reached the sidebar')
  await clickRow(cdp, rowA)
  await waitForProbe(cdp, viewOn(rowA, 'capture seed A'), 20_000, 'resume A never took the main zone')
  await clickRow(cdp, rowB)
  await waitForProbe(cdp, viewOn(rowB, 'capture seed B'), 20_000, 'resume B never took the main zone')
  console.log('CAPTURES sessions resumed')

  // 3 — session A: text draft + pasted-image thumbnail.
  await clickRow(cdp, rowA)
  await waitForProbe(cdp, viewOn(rowA, 'capture seed A'), 10_000, 'switch back to A never landed')
  if ((await cdp.evaluate(typeJs(DRAFT_A))) !== true) throw new Error('chat composer missing for draft A')
  if ((await cdp.evaluate(pasteImageJs)) !== true) throw new Error('chat composer missing for the paste')
  await waitForProbe(cdp, `${chatAttachCount} === 1`, 10_000, 'the pasted image never rendered an attachment card')
  await sleep(500)
  await capture(cdp, OUT_DIR, '3-session-a-draft-text-plus-image.png')

  // 4 — session B: its own draft, zero A bleed (the composer value must be
  // empty on arrival — the per-session slot + view-key leak lock).
  await clickRow(cdp, rowB)
  if (
    (await waitForProbe(cdp, `${viewOn(rowB, 'capture seed B')} && ${chatValue} === ''`, 10_000, 'B never took the view').catch(() => false)) === false
  ) {
    throw new Error(`B's composer should arrive empty, saw ${String(await cdp.evaluate(chatValue))}`)
  }
  if ((await cdp.evaluate(typeJs(DRAFT_B))) !== true) throw new Error('chat composer missing for draft B')
  await sleep(500)
  await capture(cdp, OUT_DIR, '4-session-b-draft-independent.png')

  // 5 — back to A: text + thumbnail restored from ITS slot.
  await clickRow(cdp, rowA)
  if (
    (await waitForProbe(
      cdp,
      `${viewOn(rowA, 'capture seed A')} && ${chatValue} === ${JSON.stringify(DRAFT_A)} && ${chatAttachCount} === 1`,
      10_000,
      'A never restored'
    ).catch(() => false)) === false
  ) {
    throw new Error(`A's draft did not round-trip (value ${String(await cdp.evaluate(chatValue))})`)
  }
  await sleep(500)
  await capture(cdp, OUT_DIR, '5-session-a-draft-restored.png')

  // 1 — New Task: the single-slot draft typed (BEFORE any switch).
  await openNewTask(cdp)
  if ((await cdp.evaluate(typeJs(NEWTASK_DRAFT))) !== true) throw new Error('empty-state composer missing')
  await sleep(500)
  await capture(cdp, OUT_DIR, '1-newtask-draft-typed.png')

  // 2 — switch away to A, come back: the New Task draft survives the round
  // trip (and A's own view stayed untouched in between — asserted above).
  await clickRow(cdp, rowA)
  await waitForProbe(
    cdp,
    `${viewOn(rowA, 'capture seed A')} && ${chatValue} === ${JSON.stringify(DRAFT_A)} && ${chatAttachCount} === 1`,
    10_000,
    'A never re-took the view after the New Task leg'
  )
  await openNewTask(cdp)
  if (
    (await waitForProbe(cdp, `${emptyValue} === ${JSON.stringify(NEWTASK_DRAFT)}`, 10_000, 'New Task draft never restored').catch(() => false)) === false
  ) {
    throw new Error(`New Task draft lost on the round trip (saw ${String(await cdp.evaluate(emptyValue))})`)
  }
  await sleep(500)
  await capture(cdp, OUT_DIR, '2-newtask-draft-restored-after-switch.png')

  console.log('CAPTURES done')
} catch (err) {
  console.error('CAPTURES FAIL', err instanceof Error ? err.message : String(err))
  exitCode = 1
} finally {
  if (child !== null) await stopElectron(child)
  rmSync(userDataDir, { recursive: true, force: true })
  rmSync(sessionsDir, { recursive: true, force: true })
}
process.exit(exitCode)
