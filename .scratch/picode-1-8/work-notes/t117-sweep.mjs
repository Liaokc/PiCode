/**
 * t117 width sweep — find the composer width where the smoke's en/bottom
 * failure config appears (8 lines at staging + a wrap mid-steps leaving the
 * caret line cut). Reuses the live session's dock composer; resizes the
 * window to sweep the composer's clientWidth, runs the stage's exact
 * staging + six inserts per width, taps everything.
 */
import { writeFileSync } from 'node:fs'

const PORT = 9231
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function findPageTarget() {
  for (let i = 0; i < 60; i++) {
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

const EN_117 = 'Today we are examining a long standing defect in the composer scroll behavior when a draft grows past the visible area and the operator keeps typing at the bottom every single keystroke triggers the full height remeasure dance and if the caret line positioning only counts hard line breaks then any soft wrapped paragraph is mistaken for the first line and the viewport snaps back to the top which is exactly the upward jump the operator reported The soft wrapped paragraph keeps flowing with many more words that wrap by whole characters instead of single characters which means the under estimation of the caret line is smaller than the CJK case but the defect is exactly the same one and the fix must treat both languages identically by measuring the visual line where the caret actually sits rather than counting hard line breaks that were never typed by the operator'
const STEPS = ['more ', 'words ', 'here ', 'to ', 'type ', 'now ']
const SEL = `document.querySelector('.chat-dock textarea.composer-input')`

const page = await findPageTarget()
const cdp = await Cdp.connect(page.webSocketDebuggerUrl)
console.log('[sweep] connected')

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
  return { valueLen: el.value.length, scrollTop: +scrollTop.toFixed(2), clientH: el.clientHeight,
    scrollH: el.scrollHeight, taW: el.clientWidth, lh,
    selEnd: el.selectionEnd, caretTop: +caretTop.toFixed(2),
    caretVisible: caretTop >= scrollTop - 1 && caretTop + lh <= scrollTop + el.clientHeight + 1 }
})()`

const results = []
// Sweep window widths → composer widths. The window resize maps ~1:1 to the
// dock composer width (sidebar fixed).
for (const targetInner of [1150, 1200, 1250, 1300, 1350, 1400]) {
  await cdp.eval(`window.resizeTo(${targetInner}, 900)`)
  await sleep(450)
  // Stage the draft fresh.
  await cdp.eval(`(() => {
    const el = ${SEL}
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
    setter.call(el, ${JSON.stringify(EN_117)})
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.focus()
    return true
  })()`)
  await sleep(250)
  await cdp.eval(`(() => { const el = ${SEL}; el.setSelectionRange(${EN_117.length}, ${EN_117.length}); el.scrollTop = Math.max(0, Math.min(el.scrollHeight, el.scrollHeight - el.clientHeight)); return true })()`)
  await sleep(120)
  const placed = await cdp.eval(SAMPLE)
  const steps = []
  for (let i = 0; i < STEPS.length; i++) {
    await cdp.send('Input.insertText', { text: STEPS[i] })
    await sleep(140)
    steps.push({ step: i, ...(await cdp.eval(SAMPLE)) })
  }
  const bad = steps.filter((s) => !s.caretVisible)
  console.log(`[sweep] inner=${targetInner} taW=${placed.taW} lines=${((placed.scrollH - 20) / 21).toFixed(1)} placed(st=${placed.scrollTop},caret=${placed.caretTop}) bad=${bad.length}`,
    bad.length ? ' FAIL steps: ' + JSON.stringify(bad) : ' all-visible')
  results.push({ targetInner, placed, steps, bad: bad.length })
  // Clear for the next sweep.
  await cdp.eval(`(() => { const el = ${SEL}; const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; setter.call(el, ''); el.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
  await sleep(150)
}
writeFileSync(new URL('./t117-sweep.json', import.meta.url), JSON.stringify(results, null, 2))
console.log('[sweep] done')
process.exit(0)
