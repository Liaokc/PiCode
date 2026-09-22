/**
 * t117 smoke-repro — replicate the smoke stage's failing en/bottom leg
 * exactly (EN_117 staged via the React path, caret at the end, view at the
 * bottom, six CDP Input.insertText steps at the stage's 140ms pacing) with
 * a full event tap + scrollTop write interceptor, to see who leaves the
 * caret's line 17px cut (scrollTop 28, caretTop 184, lh 21).
 *
 * Boot the app first:
 *   PICODE_SESSION_DIR=$(mktemp -d) PICODE_PI_AGENT_DIR=$(mktemp -d) \
 *     npx electron . --remote-debugging-port=9231 > /tmp/t117-app.log 2>&1 &
 * then: node t117-smoke-repro.mjs
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
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true })
    if (r.exceptionDetails) throw new Error(`eval failed: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`)
    return r.result.value
  }
}

const EN_117 = 'Today we are examining a long standing defect in the composer scroll behavior when a draft grows past the visible area and the operator keeps typing at the bottom every single keystroke triggers the full height remeasure dance and if the caret line positioning only counts hard line breaks then any soft wrapped paragraph is mistaken for the first line and the viewport snaps back to the top which is exactly the upward jump the operator reported The soft wrapped paragraph keeps flowing with many more words that wrap by whole words instead of single characters which means the under estimation of the caret line is smaller than the CJK case but the defect is exactly the same one and the fix must treat both languages identically by measuring the visual line where the caret actually sits rather than counting hard line breaks that were never typed by the operator'
const STEPS = ['more ', 'words ', 'here ', 'to ', 'type ', 'now ']

/** Tap + intercept (same technique as t117-probe). */
const TAP = `(() => {
  const el = document.querySelector('textarea.composer-input')
  if (!(el instanceof HTMLTextAreaElement)) return false
  if (window.__r117off) window.__r117off()
  const kinds = ['compositionstart', 'compositionupdate', 'compositionend', 'input', 'scroll', 'selectionchange']
  const handler = (e) => {
    const t = e.target
    window.__r117tap.push({ kind: e.type, t: Math.round(performance.now()),
      target: t === el ? 'ta' : (t && t.id) || (t && t.tagName) || '?',
      data: e.data ?? null, valueLen: el.value.length,
      scrollTop: +el.scrollTop.toFixed(2), selEnd: el.selectionEnd })
  }
  const protoDesc = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop')
  if (protoDesc && protoDesc.set) {
    Object.defineProperty(el, 'scrollTop', {
      configurable: true,
      get: protoDesc.get,
      set: (v) => {
        const stack = (new Error().stack ?? '').split('\\n').slice(2, 5).join(' | ').slice(0, 220)
        window.__r117tap.push({ kind: 'JS scrollTop=', t: Math.round(performance.now()),
          write: +v.toFixed(2), was: +protoDesc.get.call(el).toFixed(2), stack })
        protoDesc.set.call(el, v)
      }
    })
  }
  for (const k of kinds) {
    el.addEventListener(k, handler)
    document.addEventListener(k, handler)
  }
  window.__r117off = () => { for (const k of kinds) { el.removeEventListener(k, handler); document.removeEventListener(k, handler) } }
  window.__r117tap = []
  return true
})()`

/** Geometry sample: the textarea numbers + the caret's mirror line top. */
const SAMPLE = `(() => {
  const el = document.querySelector('textarea.composer-input')
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
    lh, padT, padB, selEnd: el.selectionEnd, selStart: el.selectionStart,
    caretTop: +caretTop.toFixed(2),
    caretVisible: caretTop >= scrollTop - 1 && caretTop + lh <= scrollTop + el.clientHeight + 1,
    lastLineTop: +(el.scrollHeight - padB - lh).toFixed(2) }
})()`

const STAGE = `(() => {
  const el = document.querySelector('textarea.composer-input')
  if (!(el instanceof HTMLTextAreaElement)) return false
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
  setter.call(el, ${JSON.stringify(EN_117)})
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.focus()
  return true
})()`

const PLACE_END_BOTTOM = `(() => {
  const el = document.querySelector('textarea.composer-input')
  if (!(el instanceof HTMLTextAreaElement)) return null
  el.focus()
  el.setSelectionRange(${EN_117.length}, ${EN_117.length})
  el.scrollTop = el.scrollHeight
  return { scrollTop: +el.scrollTop.toFixed(2) }
})()`

const page = await findPageTarget()
const cdp = await Cdp.connect(page.webSocketDebuggerUrl)
console.log('[repro] connected:', page.url)
for (let i = 0; i < 120; i++) {
  if (await cdp.eval(`document.querySelector('textarea.composer-input') !== null`)) break
  await sleep(500)
}

const out = { steps: [], tap: [], start: null, placed: null }

await cdp.eval(STAGE)
await sleep(250)
await cdp.eval(PLACE_END_BOTTOM)
await sleep(120)
out.placed = await cdp.eval(SAMPLE)
console.log('[repro] placed:', JSON.stringify(out.placed))

await cdp.eval(TAP)

for (let i = 0; i < STEPS.length; i++) {
  await cdp.send('Input.insertText', { text: STEPS[i] })
  await sleep(140)
  const s = await cdp.eval(SAMPLE)
  out.steps.push({ step: i, text: STEPS[i], ...s })
  console.log(`[repro] step ${i} (${JSON.stringify(STEPS[i])}):`, JSON.stringify(s))
}

out.tap = await cdp.eval(`window.__r117tap`)
await cdp.eval(`window.__r117off && window.__r117off()`)
writeFileSync(new URL('./t117-smoke-repro.json', import.meta.url), JSON.stringify(out, null, 2))
console.log('[repro] tap entries:', out.tap.length)
for (const e of out.tap) console.log(' ', JSON.stringify(e).slice(0, 260))
