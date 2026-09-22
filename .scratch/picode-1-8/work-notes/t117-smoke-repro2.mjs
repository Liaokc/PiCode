/**
 * t117 smoke-repro2 — replicate the smoke's en/bottom leg against the REAL
 * ChatView dock composer (a live session, window resized to the smoke's
 * 1440x900): stage EN_117, caret at end, view at bottom, six inserts at the
 * stage's 140ms pacing, with event tap + scrollTop write interceptor.
 */
import { writeFileSync } from 'node:fs'

const PORT = 9231
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function findPageTarget() {
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      const page = (await res.json()).find((t) => t.type === 'page' && !/^devtools/i.test(t.url))
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
        if (msg.error) reject(new Error(msg.error.message))
        else resolve(msg.result)
      }
    }
    return cdp
  }
  send(method, params = {}) {
    const id = ++this.seq
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.ws.send(JSON.stringify({ id, method, params })) })
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
    return r.result.value
  }
}

const EN_117 = 'Today we are examining a long standing defect in the composer scroll behavior when a draft grows past the visible area and the operator keeps typing at the bottom every single keystroke triggers the full height remeasure dance and if the caret line positioning only counts hard line breaks then any soft wrapped paragraph is mistaken for the first line and the viewport snaps back to the top which is exactly the upward jump the operator reported The soft wrapped paragraph keeps flowing with many more words that wrap by whole words instead of single characters which means the under estimation of the caret line is smaller than the CJK case but the defect is exactly the same one and the fix must treat both languages identically by measuring the visual line where the caret actually sits rather than counting hard line breaks that were never typed by the operator'
const STEPS = ['more ', 'words ', 'here ', 'to ', 'type ', 'now ']
const SEL = `document.querySelector('.chat-dock textarea.composer-input')`

const page = await findPageTarget()
const cdp = await Cdp.connect(page.webSocketDebuggerUrl)
console.log('[repro2] connected:', page.url)

// 1. Resize to the smoke window.
console.log('[repro2] resize:', await cdp.eval(`window.resizeTo(1440, 900); [window.innerWidth, window.innerHeight]`))
await sleep(400)

// 2. Create a live session: type a short prompt in the empty-state composer + Enter.
const typed = await cdp.eval(`(() => {
  const el = document.querySelector('textarea.composer-input')
  if (!(el instanceof HTMLTextAreaElement)) return 'no-composer'
  el.focus()
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
  setter.call(el, 'Reply with exactly: REPRO_117_DONE')
  el.dispatchEvent(new Event('input', { bubbles: true }))
  return 'typed'
})()`)
console.log('[repro2] prompt staged:', typed)
await sleep(200)
await cdp.send('Input.dispatchKeyEvent', { type: 'char', text: '\r' })
await sleep(200)
await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 })
await sleep(300)

// 3. Wait for the ChatView dock composer.
let docked = false
for (let i = 0; i < 60; i++) {
  if (await cdp.eval(`${SEL} !== null`)) { docked = true; break }
  await sleep(500)
}
console.log('[repro2] dock composer:', docked)
if (!docked) { console.log('[repro2] FAILED to reach the ChatView'); process.exit(1) }
await sleep(1500) // let the reply stream settle

const geo = await cdp.eval(`(() => { const el = ${SEL}; const cs = getComputedStyle(el); return JSON.stringify({ innerW: window.innerWidth, taW: el.clientWidth, taH: el.clientHeight, font: cs.fontSize }) })()`)
console.log('[repro2] geometry:', geo)

// 4. Tap + intercept on the dock composer.
console.log('[repro2] tap:', await cdp.eval(`(() => {
  const el = ${SEL}
  if (!(el instanceof HTMLTextAreaElement)) return false
  if (window.__r117off) window.__r117off()
  const kinds = ['compositionstart', 'compositionupdate', 'compositionend', 'input', 'scroll', 'selectionchange']
  const handler = (e) => {
    window.__r117tap.push({ kind: e.type, t: Math.round(performance.now()),
      data: e.data ?? null, valueLen: el.value.length,
      scrollTop: +el.scrollTop.toFixed(2), selEnd: el.selectionEnd })
  }
  const protoDesc = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop')
  if (protoDesc && protoDesc.set) {
    Object.defineProperty(el, 'scrollTop', {
      configurable: true,
      get: protoDesc.get,
      set: (v) => {
        const stack = (new Error().stack ?? '').split('\\n').slice(2, 4).join(' | ').slice(0, 200)
        window.__r117tap.push({ kind: 'JS scrollTop=', t: Math.round(performance.now()),
          write: +v.toFixed(2), was: +protoDesc.get.call(el).toFixed(2), stack })
        protoDesc.set.call(el, v)
      }
    })
  }
  for (const k of kinds) el.addEventListener(k, handler)
  window.__r117off = () => { for (const k of kinds) el.removeEventListener(k, handler) }
  window.__r117tap = []
  return true
})()`))

// 5. Stage EN_117 via the React path, place the caret at the end, bottom scroll.
await cdp.eval(`(() => {
  const el = ${SEL}
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
  setter.call(el, ${JSON.stringify(EN_117)})
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.focus()
  return true
})()`)
await sleep(250)
await cdp.eval(`(() => { const el = ${SEL}; el.setSelectionRange(${EN_117.length}, ${EN_117.length}); el.scrollTop = el.scrollHeight; return true })()`)
await sleep(120)

const SAMPLE = `(() => {
  const el = ${SEL}
  if (!(el instanceof HTMLTextAreaElement) || !(el.parentNode instanceof Node)) return null
  const cs = getComputedStyle(el)
  const lh = parseFloat(cs.lineHeight)
  const padT = parseFloat(cs.paddingTop), padB = parseFloat(cs.paddingBottom)
  const padL = parseFloat(cs.paddingLeft), padR = parseFloat(cs.paddingRight)
  const mirror = document.createElement('div')
  for (const p of cs) mirror.style.setProperty(p, cs.getPropertyValue(p))
  mirror.style.cssText += 'position:absolute;visibility:hidden;padding:0;box-sizing:content-box;height:auto;'
  mirror.style.width = (el.clientWidth - padL - padR) + 'px'
  mirror.textContent = el.value.slice(0, el.selectionEnd ?? el.value.length)
  const marker = document.createElement('span')
  marker.style.cssText = 'display:inline-block;width:0;vertical-align:top;height:' + lh + 'px'
  mirror.appendChild(marker)
  el.parentNode.insertBefore(mirror, el.nextSibling)
  const caretTop = marker.getBoundingClientRect().top - mirror.getBoundingClientRect().top + padT
  mirror.remove()
  const scrollTop = el.scrollTop
  return { t: Math.round(performance.now()), valueLen: el.value.length,
    scrollTop: +scrollTop.toFixed(2), clientH: el.clientHeight, scrollH: el.scrollHeight,
    taW: el.clientWidth, lh, padT, padB, selEnd: el.selectionEnd,
    caretTop: +caretTop.toFixed(2),
    caretVisible: caretTop >= scrollTop - 1 && caretTop + lh <= scrollTop + el.clientHeight + 1 }
})()`

const out = { geometry: geo, placed: await cdp.eval(SAMPLE), steps: [], tap: [] }
console.log('[repro2] placed:', JSON.stringify(out.placed))

// 6. Drive the six inserts at the stage's pacing.
for (let i = 0; i < STEPS.length; i++) {
  await cdp.send('Input.insertText', { text: STEPS[i] })
  await sleep(140)
  const s = await cdp.eval(SAMPLE)
  out.steps.push({ step: i, text: STEPS[i], ...s })
  console.log(`[repro2] step ${i} (${JSON.stringify(STEPS[i])}):`, JSON.stringify(s))
}

out.tap = await cdp.eval(`window.__r117tap`)
await cdp.eval(`window.__r117off && window.__r117off()`)
writeFileSync(new URL('./t117-smoke-repro2.json', import.meta.url), JSON.stringify(out, null, 2))
console.log('[repro2] tap entries:', out.tap.length)
for (const e of out.tap) console.log(' ', JSON.stringify(e).slice(0, 240))
process.exit(0)
