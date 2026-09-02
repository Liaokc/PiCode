#!/usr/bin/env node
/**
 * Trace performance-budget driver (ticket 36). Generates a LARGE synthetic
 * session jsonl in a throwaway store, boots the built app against it, and
 * measures — over CDP, driving the real UI:
 *
 *   1. builder + IPC: `sessions.trace(file)` round-trip × 3 (pure host work)
 *   2. open-to-rendered: right-click → View call trace → first entry on screen
 *   3. DOM mass: element count under .trace-list
 *   4. long tasks (>50ms) observed while the trace opens + a jump-scroll
 *
 * The numbers land in the ticket's Comments (acceptance gate: no windowing /
 * lazy expansion needed unless these blow the budget).
 *
 * Usage:
 *   npm run build && node scripts/perf/trace-budget.mjs [--calls 250] [--keep]
 *
 * Dev-app serialization: fixed CDP port 9333; one instance at a time.
 */

import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

const CDP_PORT = 9333
const ROOT = path.resolve(new URL('..', import.meta.url).pathname, '..')

function parseArgs(argv) {
  const args = { calls: 250, keep: false }
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--calls') args.calls = Number.parseInt(argv[++i], 10)
    else if (argv[i] === '--keep') args.keep = true
    else throw new Error(`unknown arg ${argv[i]}`)
  }
  return args
}

const args = parseArgs(process.argv)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// ---- synthetic session ------------------------------------------------------

const filler = (n, seed) => {
  let out = ''
  while (out.length < n) out += `line ${out.length / 40} of block ${seed} — the quick brown fox inspects the sidebar layout and files a ticket about it. `
  return out.slice(0, n)
}

/** One full call cycle: user → assistant(thinking+text+toolCall) → toolResult. */
function callCycle(index, big) {
  const ts = (s) => new Date(Date.UTC(2026, 8, 1, 10, 0, 0) + s * 1000).toISOString()
  const msgTs = (s) => Date.parse(ts(s))
  const pad = String(index).padStart(4, '0')
  const callId = `call_${pad}_synthetic`
  const lines = [
    JSON.stringify({
      type: 'message', id: `u${pad}`, parentId: index === 0 ? null : `t${String(index - 1).padStart(4, '0')}`,
      timestamp: ts(index * 30),
      message: { role: 'user', content: [{ type: 'text', text: `Synthetic question ${index}: ${filler(big ? 300 : 150, index)}` }], timestamp: msgTs(index * 30) }
    }),
    JSON.stringify({
      type: 'message', id: `a${pad}`, parentId: `u${pad}`,
      timestamp: ts(index * 30 + 5),
      message: {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: filler(big ? 900 : 400, index), thinkingSignature: 'sig' },
          { type: 'text', text: filler(big ? 1600 : 600, index) },
          { type: 'toolCall', id: callId, name: 'bash', arguments: { command: `echo step-${index}`, timeout: 60 } }
        ],
        timestamp: msgTs(index * 30 + 5) - 4_830,
        model: 'GLM-5.3-flash',
        usage: { input: 3_600 + index, output: 120 + index, cacheRead: 0, cacheWrite: 0, totalTokens: 3_720 + 2 * index, cost: { total: 0.0015 } },
        stopReason: 'toolUse'
      }
    }),
    JSON.stringify({
      type: 'message', id: `t${pad}`, parentId: `a${pad}`,
      timestamp: ts(index * 30 + 8),
      message: { role: 'toolResult', toolCallId: callId, toolName: 'bash', content: [{ type: 'text', text: filler(big ? 2_200 : 500, index) }], isError: false, timestamp: msgTs(index * 30 + 8) }
    })
  ]
  return lines
}

function generateSession(store, calls) {
  const project = path.join(store, '--tmp-perf--')
  mkdirSync(project, { recursive: true })
  const file = path.join(project, '2026-09-01T10-00-00-000Z_perf-trace.jsonl')
  const big = calls >= 100
  const lines = [JSON.stringify({ type: 'session', version: 3, id: 'perf-trace-session', timestamp: '2026-09-01T10:00:00.000Z', cwd: '/tmp/perf' })]
  for (let i = 0; i < calls; i++) lines.push(...callCycle(i, big))
  writeFileSync(file, `${lines.join('\n')}\n`)
  return file
}

// ---- CDP --------------------------------------------------------------------

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
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
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

// ---- run --------------------------------------------------------------------

const store = mkdtempSync(path.join(tmpdir(), 'picode-trace-perf-store-'))
const userData = mkdtempSync(path.join(tmpdir(), 'picode-trace-perf-user-'))
const sessionFile = generateSession(store, args.calls)
const sizeMb = (statSync(sessionFile).size / 1024 / 1024).toFixed(2)

const child = spawn(
  path.join(ROOT, 'node_modules', '.bin', 'electron'),
  ['.', `--remote-debugging-port=${CDP_PORT}`],
  {
    cwd: ROOT,
    env: { ...process.env, PICODE_SESSION_DIR: store, PICODE_LAYOUT_SMOKE_USER_DATA: userData },
    stdio: ['ignore', 'ignore', 'pipe']
  }
)
let failed = false
child.stderr.on('data', (chunk) => console.error(`[app err] ${chunk.toString().trimEnd()}`))

try {
  const cdp = await connectCdp()
  // Wait for the sidebar to index the synthetic file.
  const rowSel = `[data-file="${sessionFile}"]`
  for (let waited = 0; waited < 20_000; waited += 250) {
    if ((await cdp.evaluate(`document.querySelector(${JSON.stringify(rowSel)}) !== null`)) === true) break
    await sleep(250)
  }
  if ((await cdp.evaluate(`document.querySelector(${JSON.stringify(rowSel)}) !== null`)) !== true) {
    throw new Error('synthetic session row never reached the sidebar')
  }
  await cdp.evaluate(`(() => {
    window.__perfLong = []
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.__perfLong.push(entry.duration)
    }).observe({ entryTypes: ['longtask'] })
    return true
  })()`)

  // 1. builder + IPC round-trip × 3 (no rendering involved).
  const ipcTimings = []
  for (let i = 0; i < 3; i++) {
    ipcTimings.push(
      await cdp.evaluate(`(async () => {
        const t0 = performance.now()
        const payload = await window.picode.sessions.trace(${JSON.stringify(sessionFile)})
        return { ms: performance.now() - t0, calls: payload?.calls.length ?? 0 }
      })()`)
    )
    await sleep(200)
  }

  // 2. open-to-rendered through the real menu path.
  const openScript = `(() => {
    const row = document.querySelector(${JSON.stringify(rowSel)})
    const r = row.getBoundingClientRect()
    row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 60, clientY: r.top + 10 }))
    return true
  })()`
  await cdp.evaluate(openScript)
  await cdp.evaluate(`(() => {
    const item = [...document.querySelectorAll('.sb-context-item')].find((el) => el.textContent === 'View call trace')
    if (!item) return false
    item.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    window.__traceT0 = performance.now()
    return true
  })()`)
  let renderedMs = null
  for (let waited = 0; waited < 30_000; waited += 50) {
    const probe = await cdp.evaluate(`(() => {
      const el = document.querySelector('.trace-call')
      if (!el) return null
      return performance.now() - window.__traceT0
    })()`)
    if (probe !== null) { renderedMs = probe; break }
    await sleep(50)
  }
  if (renderedMs === null) throw new Error('trace never rendered')

  // 3. DOM mass + settled long tasks.
  const dom = await cdp.evaluate(`JSON.stringify({
    elements: document.querySelectorAll('.trace-list *').length,
    entries: document.querySelectorAll('.trace-call').length,
    blocks: document.querySelectorAll('.trace-block').length,
    listHeight: document.querySelector('.trace-list')?.scrollHeight ?? 0,
    listClient: document.querySelector('.trace-list')?.clientHeight ?? 0,
    sampleTextLen: document.querySelector('.trace-block-text')?.textContent.length ?? 0,
    sampleTextHeight: document.querySelector('.trace-block-text')?.getBoundingClientRect().height ?? 0,
    sampleEntryHeight: document.querySelector('.trace-call')?.getBoundingClientRect().height ?? 0,
    viewHeight: document.querySelector('.trace-view')?.getBoundingClientRect().height ?? 0
  })`)

  // 4. jump-scroll: bottom → top → bottom, then collect long tasks.
  await cdp.evaluate(`(() => {
    const list = document.querySelector('.trace-list')
    list.scrollTop = list.scrollHeight
    return true
  })()`)
  await sleep(400)
  await cdp.evaluate(`(() => {
    const list = document.querySelector('.trace-list')
    list.scrollTop = 0
    return true
  })()`)
  await sleep(400)
  await cdp.evaluate(`(() => {
    const list = document.querySelector('.trace-list')
    list.scrollTop = list.scrollHeight
    return true
  })()`)
  await sleep(600)
  const longTasks = await cdp.evaluate(`JSON.stringify(window.__perfLong)`)

  const summary = {
    file: path.basename(sessionFile),
    sizeMb: Number(sizeMb),
    calls: args.calls,
    ipcBuildMs: ipcTimings.map((t) => Number(t.ms.toFixed(1))),
    ipcCalls: ipcTimings[0]?.calls ?? null,
    openToRenderedMs: Number(renderedMs.toFixed(0)),
    longTasks: JSON.parse(longTasks),
    dom: JSON.parse(dom)
  }
  console.log('TRACE-BUDGET ' + JSON.stringify(summary, null, 2))
} catch (err) {
  failed = true
  console.error(`TRACE-BUDGET FAIL ${err.message}`)
} finally {
  child.kill('SIGKILL')
  await sleep(300)
  if (!args.keep) {
    rmSync(store, { recursive: true, force: true })
    rmSync(userData, { recursive: true, force: true })
  }
}
process.exit(failed ? 1 : 0)
