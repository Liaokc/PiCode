/**
 * t117 probe — ticket 117 evidence collector (compositionupdate × dance ×
 * native scroll competition; pre-fix and post-fix runs alike).
 *
 * Boot the app first, e.g. from the worktree root:
 *   PICODE_SESSION_DIR=$(mktemp -d) PICODE_PI_AGENT_DIR=$(mktemp -d) \
 *     npx electron . --remote-debugging-port=9231 > /tmp/t117-app.log 2>&1 &
 * then: node t117-probe.mjs [--port 9231] [--out <prefix>]
 *
 * Pure CDP over Node's built-in WebSocket — no new dependencies.
 */
import { writeFileSync } from 'node:fs'

const PORT = Number(process.argv.includes('--port') ? process.argv[process.argv.indexOf('--port') + 1] : 9231)
const outIdx = process.argv.indexOf('--out')
const OUT = (outIdx >= 0 ? process.argv[outIdx + 1] : 't117-evidence').replace(/\.json$/, '')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function findPageTarget() {
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      const targets = await res.json()
      const page = targets.find((t) => t.type === 'page' && !/^devtools/i.test(t.url))
      if (page) return page
    } catch {}
    await sleep(500)
  }
  throw new Error('no CDP page target')
}

class Cdp {
  constructor(ws) { this.ws = ws; this.seq = 0; this.pending = new Map() }
  static async connect(url) {
    const ws = new WebSocket(url)
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
    const cdp = new Cdp(ws)
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id !== undefined && cdp.pending.has(msg.id)) {
        const { resolve, reject } = cdp.pending.get(msg.id)
        cdp.pending.delete(msg.id)
        if (msg.error) reject(new Error(`${msg.error.message} ${msg.error.data ?? ''}`))
        else resolve(msg.result)
      }
    }
    return cdp
  }
  send(method, params = {}) {
    const id = ++this.seq
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }
  async eval(expression, awaitPromise = false) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true })
    if (r.exceptionDetails) throw new Error(`eval failed: ${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description ?? ''}`)
    return r.result.value
  }
}

// ---------- page-side helpers (all selector-parameterized) ----------

const q = (sel) => `document.querySelector(${JSON.stringify(sel)})`

/** Mirror measurement of the caret's visual-line top in FLOW coordinates
 *  (line 0's top = padTop). Independent copy for the probe. */
function mirrorJs(sel) {
  return `(() => {
    const el = ${q(sel)}
    if (!(el instanceof HTMLTextAreaElement)) return null
    const cs = getComputedStyle(el)
    const padL = parseFloat(cs.paddingLeft), padR = parseFloat(cs.paddingRight), padT = parseFloat(cs.paddingTop)
    const lh = parseFloat(cs.lineHeight)
    if (!(el.parentNode instanceof Node)) return null
    const mirror = document.createElement('div')
    for (const p of cs) mirror.style.setProperty(p, cs.getPropertyValue(p))
    mirror.style.cssText += 'position:absolute;visibility:hidden;padding:0;box-sizing:content-box;height:auto;'
    mirror.style.width = (el.clientWidth - padL - padR) + 'px'
    mirror.textContent = el.value.slice(0, el.selectionEnd ?? el.value.length)
    const marker = document.createElement('span')
    marker.style.cssText = 'display:inline-block;width:0;vertical-align:top;height:' + lh + 'px'
    mirror.appendChild(marker)
    el.parentNode.insertBefore(mirror, el.nextSibling)
    const top = marker.getBoundingClientRect().top - mirror.getBoundingClientRect().top + padT
    mirror.remove()
    return { top, lh, padT, caret: el.selectionEnd }
  })()`
}

/** Full geometry sample of a textarea. */
function sampleJs(sel) {
  return `(() => {
    const el = ${q(sel)}
    if (!(el instanceof HTMLTextAreaElement)) return null
    const cs = getComputedStyle(el)
    const lh = parseFloat(cs.lineHeight), padT = parseFloat(cs.paddingTop), padB = parseFloat(cs.paddingBottom)
    return {
      valueLen: el.value.length,
      hardLines: el.value.split('\\n').length,
      visualLines: Math.round((el.scrollHeight - padT - padB) / lh),
      lh, padT, padB,
      scrollTop: el.scrollTop, clientH: el.clientHeight, scrollH: el.scrollHeight,
      selStart: el.selectionStart, selEnd: el.selectionEnd,
      oldMathLineTop: padT + (el.value.slice(0, el.selectionStart ?? 0).split('\\n').length - 1) * lh
    }
  })()`
}

/** Selection-API caret geometry probe (candidate mechanism). */
function selectionJs(sel) {
  return `(() => {
    const el = ${q(sel)}
    if (!(el instanceof HTMLTextAreaElement)) return null
    const sel2 = document.getSelection()
    const out = { rangeCount: sel2 ? sel2.rangeCount : -1, rects: [], bounding: null, collapsed: null }
    if (sel2 && sel2.rangeCount > 0) {
      const range = sel2.getRangeAt(0)
      out.collapsed = range.collapsed
      for (const r of range.getClientRects()) out.rects.push({ x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) })
      const b = range.getBoundingClientRect()
      out.bounding = { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) }
      out.elRectTop = +el.getBoundingClientRect().top.toFixed(1)
      out.scrollTop = el.scrollTop
      out.expectedMirrorTop = +(out.bounding.y - out.elRectTop + el.scrollTop).toFixed(1)
    }
    return out
  })()`
}

/** Set a draft (native setter + input event = the React onChange path). */
function stageJs(sel, text) {
  return `(() => {
    const el = ${q(sel)}
    if (!(el instanceof HTMLTextAreaElement)) return false
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
    setter.call(el, ${JSON.stringify(text)})
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.focus()
    return true
  })()`
}

/** Place the caret + set the scroll; returns the caret's mirror line top. */
function placeCaretJs(sel, offset, mode) {
  return `(() => {
    const el = ${q(sel)}
    if (!(el instanceof HTMLTextAreaElement)) return null
    el.focus()
    el.setSelectionRange(${offset}, ${offset})
    const cs = getComputedStyle(el)
    const lh = parseFloat(cs.lineHeight), padT = parseFloat(cs.paddingTop)
    const mirror = document.createElement('div')
    for (const p of cs) mirror.style.setProperty(p, cs.getPropertyValue(p))
    mirror.style.cssText += 'position:absolute;visibility:hidden;padding:0;box-sizing:content-box;height:auto;'
    mirror.style.width = (el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) + 'px'
    mirror.textContent = el.value.slice(0, el.selectionEnd)
    const marker = document.createElement('span')
    marker.style.cssText = 'display:inline-block;width:0;vertical-align:top;height:' + lh + 'px'
    mirror.appendChild(marker)
    el.parentNode.insertBefore(mirror, el.nextSibling)
    const lineTop = marker.getBoundingClientRect().top - mirror.getBoundingClientRect().top + padT
    mirror.remove()
    let st
    if (${JSON.stringify(mode)} === 'bottom') st = el.scrollHeight
    else if (${JSON.stringify(mode)} === 'caretBottom') st = lineTop + lh - el.clientHeight
    else st = lineTop + lh - el.clientHeight + 2 * lh
    el.scrollTop = Math.max(0, Math.min(st, el.scrollHeight - el.clientHeight))
    return { scrollTop: +el.scrollTop.toFixed(2), lineTop: +lineTop.toFixed(2), lh, clientH: el.clientHeight }
  })()`
}

/** Event tap (compositionstart/update/end, input, scroll) on a textarea. */
function tapJs(sel) {
  return `(() => {
    const el = ${q(sel)}
    if (!(el instanceof HTMLTextAreaElement)) return false
    if (window.__t117off) window.__t117off()
    const kinds = ['compositionstart', 'compositionupdate', 'compositionend', 'input', 'scroll']
    const handler = (e) => {
      const t = e.target
      window.__t117tap.push({
        kind: e.type, t: Math.round(performance.now()),
        composing: e.type.startsWith('composition') || e.isComposing === true,
        data: e.data, valueLen: t.value.length,
        scrollTop: +t.scrollTop.toFixed(2), selStart: t.selectionStart, selEnd: t.selectionEnd
      })
    }
    // scrollTop write interceptor: JS writes (the dance) land here; native
    // scrolls bypass the JS setter and appear only as scroll events.
    const protoDesc = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop')
    if (protoDesc && protoDesc.set && !el.__t117patched) {
      el.__t117patched = true
      Object.defineProperty(el, 'scrollTop', {
        configurable: true,
        get: protoDesc.get,
        set: (v) => { window.__t117tap.push({ kind: 'JS scrollTop=', t: Math.round(performance.now()), write: +v.toFixed(2), scrollTop: +protoDesc.get.call(el).toFixed(2) }); protoDesc.set.call(el, v) }
      })
    }
    for (const k of kinds) el.addEventListener(k, handler)
    window.__t117off = () => { for (const k of kinds) el.removeEventListener(k, handler) }
    window.__t117tap = []
    return true
  })()`
}

/** The plain (no React) scratch textarea styled exactly like the composer. */
const SCRATCH_SETUP = `(() => {
  let s = document.getElementById('t117scratch')
  if (s) s.remove()
  const src = document.querySelector('textarea.composer-input')
  if (!(src instanceof HTMLTextAreaElement)) return false
  s = document.createElement('textarea')
  s.id = 't117scratch'
  const cs = getComputedStyle(src)
  for (const prop of cs) s.style.setProperty(prop, cs.getPropertyValue(prop))
  s.style.cssText += 'position:fixed;top:8px;left:8px;z-index:99999;width:' + src.clientWidth + 'px;height:160px;'
  document.body.appendChild(s)
  const sc = getComputedStyle(s)
  return { srcW: src.clientWidth, scratchW: s.clientWidth, font: sc.fontSize + ' ' + sc.fontFamily.slice(0, 40), whiteSpace: sc.whiteSpace, overflowWrap: sc.overflowWrap, boxSizing: sc.boxSizing }
})()`

// ---------- drafts ----------

const CJK_LONG = ('今天我们要讨论一个很长的话题关于输入法编辑器在文本框里的滚动行为当内容超过可视区域的时候用户在底部继续输入中文每一个汉字都会触发一次组合输入事件而受控组件会同步执行高度重测与滚动恢复这一系列动作如果光标行定位算法只统计硬换行那么软换行的段落会被误判为第一行于是视口会被强行拉回顶部这就是操作者观察到的大幅上移现象我们需要用视觉行定位来修复这个问题使输入不再改变光标位置' + '在软件工程实践中输入法的组合输入与文本框的受控更新之间存在一个微妙的竞争关系浏览器会尽力把光标行滚动到可视区域内而应用层的高度重测也会写入滚动位置两个写入者意见不一致的时候视口就会来回跳动操作者把这个现象描述为舞步抖动修复的关键在于让应用层的写入与浏览器原生滚动收敛到同一个位置也就是光标真实所在的视觉行行顶只有这样输入才不会改变光标位置这个准则对中文和英文一视同仁对硬换行与软换行一视同仁')
const EN_LONG = 'Today we are examining a long standing defect in the composer scroll behavior when a draft grows past the visible area and the operator keeps typing at the bottom every single keystroke triggers the full height remeasure dance and if the caret line positioning only counts hard line breaks then any soft wrapped paragraph is mistaken for the first line and the viewport snaps back to the top which is exactly the upward jump the operator reported. The soft wrapped paragraph keeps flowing with many more words that wrap by whole words instead of single characters which means the under estimation of the caret line is smaller than the CJK case but the defect is exactly the same one and the fix must treat both languages identically by measuring the visual line where the caret actually sits rather than counting hard line breaks that were never typed by the operator.'
const EN_HARD = Array.from({ length: 14 }, (_, i) => `Hard line ${i + 1} of the draft with plain words that mostly fit.`).join('\n')

const LANGS = [
  { name: 'cjk', text: CJK_LONG, mode: 'ime', steps: ['今', '今天', '今天天', '今天天气', '今天天气很', '今天天气很好'], commit: '今天天气很好' },
  { name: 'en', text: EN_LONG, mode: 'insert', steps: ['more ', 'words ', 'here ', 'to ', 'type ', 'now '] },
  { name: 'en_hard', text: EN_HARD, mode: 'insert', steps: ['more ', 'words ', 'here ', 'to ', 'type ', 'now '] }
]

const SCENARIOS = [
  { name: 'A_bottom', line: 'end', scroll: 'bottom' },
  { name: 'B_second_last', line: 'secondLast', scroll: 'caretBottom' },
  { name: 'C_mid_lower', line: 'sixtyPercent', scroll: 'caretLower' }
]

// ---------- run ----------

const page = await findPageTarget()
const cdp = await Cdp.connect(page.webSocketDebuggerUrl)
console.log(`[t117] connected: ${page.url}`)

for (let i = 0; i < 120; i++) {
  if (await cdp.eval(`document.querySelector('textarea.composer-input') !== null`)) break
  await sleep(500)
}

const evidence = { sections: {} }
const note = (name, data) => { evidence.sections[name] = { t: new Date().toISOString(), ...data }; console.log(`[t117] ${name}: ${JSON.stringify(data).slice(0, 300)}`) }

// ===== Section 1: mechanism probes (caret at end of the CJK draft) =====
{
  await cdp.eval(stageJs('textarea.composer-input', CJK_LONG))
  await sleep(250)
  await cdp.eval(placeCaretJs('textarea.composer-input', CJK_LONG.length, 'bottom'))
  await sleep(120)
  const sample = await cdp.eval(sampleJs('textarea.composer-input'))
  const mirror = await cdp.eval(mirrorJs('textarea.composer-input'))
  const sel = await cdp.eval(selectionJs('textarea.composer-input'))
  note('mechanism_cjk_end', {
    sample,
    mirror,
    selectionApi: sel,
    expectedLastLineTop: +(sample.scrollH - sample.padB - sample.lh).toFixed(2)
  })
}

// ===== Section 1b: mechanism probe at a mid-draft caret =====
{
  const mid = Math.floor(CJK_LONG.length / 2)
  await cdp.eval(placeCaretJs('textarea.composer-input', mid, 'bottom'))
  await sleep(120)
  const mirror = await cdp.eval(mirrorJs('textarea.composer-input'))
  const sel = await cdp.eval(selectionJs('textarea.composer-input'))
  note('mechanism_cjk_mid', { mid, mirror, selectionApi: sel })
}

// ---------- scenario legs ----------

async function findOffset(sel, targetLine) {
  const len = await cdp.eval(`(${q(sel)}).value.length`)
  const padT = await cdp.eval(`parseFloat(getComputedStyle(${q(sel)}).paddingTop)`)
  let lo = 0, hi = len, best = 0
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2)
    const m = await cdp.eval(placeCaretJs(sel, mid, 'bottom'))
    const lineIdx = Math.round((m.lineTop - padT) / m.lh)
    if (lineIdx < targetLine) { best = mid; lo = mid + 1 } else hi = mid - 1
  }
  return Math.min(best + 1, len)
}

async function scenarioLeg(lang, scenario, sel) {
  await cdp.eval(stageJs(sel, lang.text))
  await sleep(250)
  const s0 = await cdp.eval(sampleJs(sel))
  const totalLines = s0.visualLines
  let targetLine, caretOffset
  if (scenario.line === 'end') { targetLine = totalLines - 1; caretOffset = lang.text.length }
  else if (scenario.line === 'secondLast') { targetLine = totalLines - 2; caretOffset = await findOffset(sel, targetLine) }
  else { targetLine = Math.max(1, Math.round(totalLines * 0.6)); caretOffset = await findOffset(sel, targetLine) }
  const start = await cdp.eval(placeCaretJs(sel, caretOffset, scenario.scroll))
  await cdp.eval(tapJs(sel))

  const steps = []
  let before = start.scrollTop
  for (let i = 0; i < lang.steps.length; i++) {
    const step = lang.steps[i]
    if (lang.mode === 'ime') {
      await cdp.send('Input.imeSetComposition', { text: step, selectionStart: step.length, selectionEnd: step.length })
    } else {
      await cdp.send('Input.insertText', { text: step })
    }
    await sleep(160)
    const after = await cdp.eval(sampleJs(sel))
    const mirror = await cdp.eval(mirrorJs(sel))
    steps.push({
      step: i, ins: step.slice(0, 10),
      scrollTopBefore: before, scrollTopAfter: +after.scrollTop.toFixed(2),
      delta: +(after.scrollTop - before).toFixed(2),
      caretLineTop: mirror ? +mirror.top.toFixed(2) : null,
      oldMathLineTop: +after.oldMathLineTop.toFixed(2),
      caretVisible: mirror ? (mirror.top >= after.scrollTop - 1 && mirror.top + mirror.lh <= after.scrollTop + after.clientH + 1) : null,
      selStart: after.selStart, selEnd: after.selEnd, valueLen: after.valueLen,
      hardLines: after.hardLines, visualLines: after.visualLines
    })
    before = after.scrollTop
  }
  if (lang.mode === 'ime' && lang.commit != null) {
    await cdp.send('Input.insertText', { text: lang.commit })
    await sleep(160)
    const after = await cdp.eval(sampleJs(sel))
    const mirror = await cdp.eval(mirrorJs(sel))
    steps.push({
      step: 'commit', ins: lang.commit,
      scrollTopBefore: before, scrollTopAfter: +after.scrollTop.toFixed(2),
      delta: +(after.scrollTop - before).toFixed(2),
      caretLineTop: mirror ? +mirror.top.toFixed(2) : null,
      oldMathLineTop: +after.oldMathLineTop.toFixed(2),
      caretVisible: mirror ? (mirror.top >= after.scrollTop - 1 && mirror.top + mirror.lh <= after.scrollTop + after.clientH + 1) : null,
      selStart: after.selStart, selEnd: after.selEnd, valueLen: after.valueLen
    })
  }
  const tap = await cdp.eval(`window.__t117tap.slice()`)
  await cdp.eval(`window.__t117off && window.__t117off(); true`)
  return {
    lang: lang.name, scenario: scenario.name, sel,
    totalLines, targetLine, caretOffset,
    start: { scrollTop: start.scrollTop, lineTop: start.lineTop, lh: start.lh, clientH: start.clientH },
    steps,
    events: tap.map((e) => ({ kind: e.kind, composing: e.composing, scrollTop: e.scrollTop, write: e.write, valueLen: e.valueLen }))
  }
}

// ===== Section 2: the matrix on the REAL composer =====
const matrix = { composer: [], scratch: [] }
for (const lang of LANGS) {
  for (const scenario of SCENARIOS) {
    matrix.composer.push(await scenarioLeg(lang, scenario, 'textarea.composer-input'))
  }
}

// ===== Section 3: the scratch textarea — native-only baseline =====
const scratchGeom = await cdp.eval(SCRATCH_SETUP)
note('scratch_setup', { scratchGeom, composerGeom: await cdp.eval(`(() => { const el = document.querySelector('textarea.composer-input'); const cs = getComputedStyle(el); return { clientW: el.clientWidth, font: cs.fontSize + ' ' + cs.fontFamily.slice(0, 40), whiteSpace: cs.whiteSpace, overflowWrap: cs.overflowWrap, boxSizing: cs.boxSizing } })()`) })
for (const lang of LANGS) {
  for (const scenario of SCENARIOS) {
    matrix.scratch.push(await scenarioLeg(lang, scenario, '#t117scratch'))
  }
}
await cdp.eval(`document.getElementById('t117scratch')?.remove(); true`)

// ===== Section 4: PREFILL_EVENT viewport (P21) =====
{
  const LONG = Array.from({ length: 16 }, (_, i) => `Prefilled line ${i + 1}: the queue-edit prefill draft continues with more words to push the content past the cap.`).join(' ')
  await cdp.eval(stageJs('textarea.composer-input', ''))
  await sleep(150)
  await cdp.eval(`window.dispatchEvent(new CustomEvent('picode:composer-prefill', { detail: { text: ${JSON.stringify(LONG)}, images: [] } }))`)
  await sleep(400)
  const sample = await cdp.eval(sampleJs('textarea.composer-input'))
  const mirror = await cdp.eval(mirrorJs('textarea.composer-input'))
  note('prefill_viewport', {
    sample,
    caretLineTop: mirror ? mirror.top : null,
    caretVisible: mirror ? (mirror.top >= sample.scrollTop - 1 && mirror.top + mirror.lh <= sample.scrollTop + sample.clientH + 1) : null,
    scrolledToEnd: sample.scrollTop >= sample.scrollH - sample.clientH - 1
  })
  await cdp.eval(stageJs('textarea.composer-input', ''))
}

// ===== Section 5: evidence screenshot =====
{
  await cdp.eval(stageJs('textarea.composer-input', CJK_LONG))
  await sleep(200)
  await cdp.eval(placeCaretJs('textarea.composer-input', CJK_LONG.length, 'bottom'))
  await sleep(120)
  await cdp.send('Input.imeSetComposition', { text: '尾', selectionStart: 1, selectionEnd: 1 })
  await sleep(120)
  await cdp.send('Input.insertText', { text: '尾' })
  await sleep(250)
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(`${OUT}-composer.png`, Buffer.from(shot.data, 'base64'))
  console.log(`[t117] screenshot → ${OUT}-composer.png`)
}

// ---------- write + summarize ----------
evidence.sections.matrix = { composer: matrix.composer, scratch: matrix.scratch }
writeFileSync(`${OUT}.json`, JSON.stringify(evidence, null, 2))
console.log(`[t117] evidence → ${OUT}.json`)

for (const surface of ['composer', 'scratch']) {
  for (const leg of matrix[surface]) {
    const deltas = leg.steps.map((s) => s.delta)
    const worstUp = Math.min(...deltas)
    const invisible = leg.steps.filter((s) => s.caretVisible === false).length
    const composing = leg.events.filter((e) => e.kind === 'compositionupdate').length
    console.log(`[t117] ${surface.padEnd(8)} ${leg.lang.padEnd(8)} ${leg.scenario.padEnd(16)} lines=${String(leg.totalLines).padStart(2)} target=${String(leg.targetLine).padStart(2)} startScroll=${String(leg.start.scrollTop.toFixed(0)).padStart(3)} worstUp=${worstUp.toFixed(1).padStart(7)} invisible=${invisible}/${leg.steps.length} compUpdates=${composing}`)
  }
}
process.exit(0)
