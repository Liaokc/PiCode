#!/usr/bin/env node
/**
 * Flamegraph driver (ticket 30). Boots the built app with PICODE_PERF=1 and
 * `--remote-debugging-port`, then over Chrome DevTools Protocol:
 *
 *   Profiler.start → scenario (scroll / drag-panel / drag-dock) → Profiler.stop
 *
 * archiving a `.cpuprofile` flamegraph + a numeric `summary.json` per run so
 * the before/after comparison is pinned in the ticket (gatekeeper numbers).
 *
 * Usage:
 *   node scripts/perf/flame.mjs --scenario scroll|drag-panel|drag-dock \
 *        --label before|after [--out <dir>] [--sections 80]
 *
 * Requires a prior `npm run build` with PICODE_PERF=1 (unminified renderer,
 * so profile samples attribute to real function names):
 *   PICODE_PERF=1 npm run build
 *
 * Dev-app serialization: fixed CDP port 9333; one instance at a time.
 */

import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const CDP_PORT = 9333
const ROOT = path.resolve(new URL('..', import.meta.url).pathname, '..')
const SCENARIOS = new Set(['scroll', 'scroll-preview', 'drag-panel', 'drag-dock'])

function parseArgs(argv) {
  const args = { scenario: null, label: null, out: null, sections: 80 }
  for (let i = 2; i < argv.length; i++) {
    let key = null
    let value = null
    const inline = /^--([a-z-]+)=(.+)$/.exec(argv[i])
    if (inline) {
      key = inline[1]
      value = inline[2]
    } else if (/^--([a-z-]+)$/.test(argv[i])) {
      key = /^--([a-z-]+)$/.exec(argv[i])[1]
      value = argv[++i]
      if (value === undefined) throw new Error(`--${key} needs a value`)
    } else {
      throw new Error(`bad arg ${argv[i]}`)
    }
    if (key === 'scenario') args.scenario = value
    else if (key === 'label') args.label = value
    else if (key === 'out') args.out = value
    else if (key === 'sections') args.sections = Number.parseInt(value, 10)
    else throw new Error(`unknown arg --${key}`)
  }
  if (!SCENARIOS.has(args.scenario)) throw new Error(`--scenario must be one of ${[...SCENARIOS].join('|')}`)
  if (args.label !== 'before' && args.label !== 'after') throw new Error('--label must be before|after')
  return args
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

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

function bootElectron(sections) {
  const child = spawn(
    path.join(ROOT, 'node_modules', '.bin', 'electron'),
    ['.', `--remote-debugging-port=${CDP_PORT}`],
    {
      cwd: ROOT,
      env: { ...process.env, PICODE_PERF: '1', PICODE_PERF_SECTIONS: String(sections) },
      stdio: ['ignore', 'pipe', 'pipe']
    }
  )
  const pipe = (stream, tag) => {
    let buffer = ''
    stream.on('data', (chunk) => {
      buffer += chunk.toString()
      let index
      while ((index = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, index)
        buffer = buffer.slice(index + 1)
        if (line.trim() !== '') console.log(`[app ${tag}] ${line}`)
      }
    })
  }
  pipe(child.stdout, 'out')
  pipe(child.stderr, 'err')
  return child
}

async function waitForReady(cdp) {
  for (let waited = 0; waited < 60_000; waited += 250) {
    try {
      if ((await cdp.evaluate(`document.body.dataset['perfReady'] === '1'`)) === true) return
    } catch {
      // renderer not up yet
    }
    await sleep(250)
  }
  throw new Error('perf harness never reported ready')
}

// ---- metrics instrumentation ------------------------------------------------

const INSTRUMENT = `(() => {
  window.__perf = { frames: 0, long: [] }
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) window.__perf.long.push(entry.duration)
  })
  observer.observe({ entryTypes: ['longtask'] })
  const loop = () => { window.__perf.frames++; requestAnimationFrame(loop) }
  requestAnimationFrame(loop)
  return true
})()`

const FETCH_METRICS = `JSON.stringify({
  frames: window.__perf.frames,
  long: window.__perf.long
})`

async function rectOf(cdp, selector) {
  const rect = await cdp.evaluate(
    `(() => {
      const el = document.querySelector(${JSON.stringify(selector)})
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { x: r.x, y: r.y, width: r.width, height: r.height }
    })()`
  )
  if (!rect || rect.width === 0 || rect.height === 0) throw new Error(`no rect for ${selector}`)
  return rect
}

async function sizeOf(cdp, selector, prop) {
  return cdp.evaluate(`document.querySelector(${JSON.stringify(selector)})?.${prop} ?? null`)
}

async function runScenario(cdp, scenario) {
  if (scenario === 'scroll') {
    const chat = await rectOf(cdp, '.chat-scroll')
    // The chat auto-pins to the bottom after seeding — start the read from
    // the top so the 200 wheel ticks have 69k px of transcript to traverse.
    await cdp.evaluate(`document.querySelector('.chat-scroll').scrollTop = 0`)
    await sleep(300)
    const before = await cdp.evaluate(`document.querySelector('.chat-scroll')?.scrollTop ?? -1`)
    const events = 200
    for (let i = 0; i < events; i++) {
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseWheel',
        x: Math.round(chat.x + chat.width / 2),
        y: Math.round(chat.y + Math.min(320, chat.height / 2)),
        deltaX: 0,
        deltaY: 120
      })
      await sleep(25)
    }
    const after = await cdp.evaluate(`document.querySelector('.chat-scroll')?.scrollTop ?? -1`)
    if (after - before < 5000) throw new Error(`scroll scenario: scrollTop only moved ${after - before}px`)
    return { scrollTopDelta: after - before, wheelEvents: events }
  }

  if (scenario === 'scroll-preview') {
    const preview = await rectOf(cdp, '.preview-body')
    await cdp.evaluate(`document.querySelector('.preview-body').scrollTop = 0`)
    await sleep(300)
    const before = await cdp.evaluate(`document.querySelector('.preview-body')?.scrollTop ?? -1`)
    const events = 200
    for (let i = 0; i < events; i++) {
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseWheel',
        x: Math.round(preview.x + preview.width / 2),
        y: Math.round(preview.y + Math.min(320, preview.height / 2)),
        deltaX: 0,
        deltaY: 120
      })
      await sleep(25)
    }
    const after = await cdp.evaluate(`document.querySelector('.preview-body')?.scrollTop ?? -1`)
    if (after - before < 5000) throw new Error(`scroll-preview: scrollTop only moved ${after - before}px`)
    return { scrollTopDelta: after - before, wheelEvents: events }
  }

  if (scenario === 'drag-panel') {
    const resizer = await rectOf(cdp, '.panel-resizer')
    const startX = Math.round(resizer.x + resizer.width / 2)
    const y = Math.round(resizer.y + resizer.height / 2)
    const startWidth = await sizeOf(cdp, '.side-panel', 'offsetWidth')
    const moves = 90
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: startX, y, button: 'left', buttons: 1, clickCount: 1 })
    await sleep(60)
    let x = startX
    for (let i = 0; i < moves; i++) {
      x -= 8
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1 })
      await sleep(25)
    }
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 1, clickCount: 1 })
    await sleep(200)
    const endWidth = await sizeOf(cdp, '.side-panel', 'offsetWidth')
    if (endWidth - startWidth < 200) {
      throw new Error(`drag-panel: width only grew ${endWidth - startWidth}px (${startWidth}→${endWidth})`)
    }
    return { startWidth, endWidth, moves }
  }

  // drag-dock
  const resizer = await rectOf(cdp, '.terminal-dock-resizer')
  const startY = Math.round(resizer.y + resizer.height / 2)
  const x = Math.round(resizer.x + resizer.width / 2)
  const startHeight = await sizeOf(cdp, '.terminal-dock', 'offsetHeight')
  const moves = 80
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y: startY, button: 'left', buttons: 1, clickCount: 1 })
  await sleep(60)
  let y = startY
  for (let i = 0; i < moves; i++) {
    y -= 6
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1 })
    await sleep(25)
  }
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 1, clickCount: 1 })
  await sleep(200)
  const endHeight = await sizeOf(cdp, '.terminal-dock', 'offsetHeight')
  if (endHeight - startHeight < 200) {
    throw new Error(`drag-dock: height only grew ${endHeight - startHeight}px (${startHeight}→${endHeight})`)
  }
  return { startHeight, endHeight, moves }
}

// ---- profile analysis -------------------------------------------------------

const MD_RE =
  /remark|rehype|micromark|mdast|unified|highlight|hljs|hast|unist|vfile|markdown|commonmark|property-information|space-separated|comma-separated|character-entities|decode-named|trim-lines|zwitch|longest-streak|markdown-table|bail|devlop|ccount|parse5/i
const REACT_RE =
  /react|fiber|beginWork|completeWork|commitWork|commitRoot|performUnitOfWork|renderRoot|renderWithHooks|reconcile|dispatchSetState|appendChild|removeChild|insertBefore|setTextContent|commitMutation|commitLayout|passiveEffect|flushSync|scheduleUpdate/i

function analyzeProfile(profile, samplingIntervalUs) {
  const nodesById = new Map(profile.nodes.map((n) => [n.id, n]))
  const selfUs = new Map()
  if (Array.isArray(profile.samples) && Array.isArray(profile.timeDeltas) && profile.timeDeltas.length === profile.samples.length) {
    for (let i = 0; i < profile.samples.length; i++) {
      const id = profile.samples[i]
      selfUs.set(id, (selfUs.get(id) ?? 0) + (profile.timeDeltas[i] ?? 0))
    }
  } else {
    for (const node of profile.nodes) {
      if (node.hitCount > 0) selfUs.set(node.id, node.hitCount * samplingIntervalUs)
    }
  }

  const categories = { md: 0, react: 0, other: 0 }
  const functions = new Map()
  let totalUs = 0
  for (const [id, us] of selfUs) {
    const node = nodesById.get(id)
    if (!node) continue
    const name = node.callFrame.functionName || '(anonymous)'
    const url = node.callFrame.url || ''
    const label = `${name} @ ${url.split('/').pop() || 'bundled'}`
    totalUs += us
    if (MD_RE.test(name) || MD_RE.test(url)) categories.md += us
    else if (REACT_RE.test(name) || REACT_RE.test(url)) categories.react += us
    else categories.other += us
    const fn = functions.get(label) ?? { name, url, selfMs: 0 }
    fn.selfMs += us / 1000
    functions.set(label, fn)
  }

  const top = [...functions.values()].sort((a, b) => b.selfMs - a.selfMs).slice(0, 14)
  return {
    durationMs: Math.round((profile.endTime - profile.startTime) / 1000),
    scriptSelfMs: Math.round(totalUs / 1000),
    mdSelfMs: Math.round(categories.md / 1000),
    reactSelfMs: Math.round(categories.react / 1000),
    otherSelfMs: Math.round(categories.other / 1000),
    topFunctions: top.map((f) => ({ name: f.name, selfMs: Math.round(f.selfMs * 10) / 10 }))
  }
}

// ---- main --------------------------------------------------------------------

const args = parseArgs(process.argv)
const outDir = args.out ?? path.join(ROOT, '.scratch', 'picode-1-2', 'issues', '30-panel-interaction-perf', 'flame')
mkdirSync(outDir, { recursive: true })

console.log(`FLAME scenario=${args.scenario} label=${args.label} sections=${args.sections} out=${outDir}`)
const child = bootElectron(args.sections)
let exitCode = 0
try {
  const cdp = await connectCdp()
  await cdp.send('Runtime.enable')
  await waitForReady(cdp)
  await cdp.evaluate(INSTRUMENT)

  await cdp.send('Profiler.enable')
  await cdp.send('Profiler.setSamplingInterval', { interval: 500 })
  await cdp.send('Profiler.start')
  const t0 = Date.now()
  const scenarioInfo = await runScenario(cdp, args.scenario)
  const wallMs = Date.now() - t0
  const metrics = JSON.parse(await cdp.evaluate(FETCH_METRICS))
  const { profile } = await cdp.send('Profiler.stop')
  const analysis = analyzeProfile(profile, 500)

  const summary = {
    scenario: args.scenario,
    label: args.label,
    sections: args.sections,
    wallMs,
    frames: metrics.frames,
    expectedFrames: Math.round(analysis.durationMs / 16.67),
    longTaskCount: metrics.long.length,
    longTaskMaxMs: metrics.long.length > 0 ? Math.round(Math.max(...metrics.long)) : 0,
    longTaskTotalMs: Math.round(metrics.long.reduce((a, b) => a + b, 0)),
    ...analysis,
    scenarioInfo
  }
  const base = path.join(outDir, `${args.scenario}-${args.label}`)
  writeFileSync(`${base}.cpuprofile`, JSON.stringify(profile))
  writeFileSync(`${base}.summary.json`, JSON.stringify(summary, null, 2))
  console.log('FLAME summary', JSON.stringify(summary, null, 2))
} catch (err) {
  console.error('FLAME FAIL', err)
  exitCode = 1
} finally {
  child.kill('SIGTERM')
  const killTimer = setTimeout(() => child.kill('SIGKILL'), 3000)
  await new Promise((resolve) => child.once('exit', resolve))
  clearTimeout(killTimer)
}
process.exit(exitCode)
