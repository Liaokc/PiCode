/**
 * t117 mirror verification — the textarea-clone mirror vs the div mirror vs
 * the REAL textarea geometry, across widths, on the rebuilt app. The
 * textarea clone must always match the real caret line; the div mirror is
 * expected to diverge at some width (the smoke's taW-793 lesson).
 */
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
        if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result)
      }
    }
    return cdp
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
    return r.result.value
  }
  send(method, params = {}) {
    const id = ++this.seq
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.ws.send(JSON.stringify({ id, method, params })) })
  }
}
const EN = 'Today we are examining a long standing defect in the composer scroll behavior when a draft grows past the visible area and the operator keeps typing at the bottom every single keystroke triggers the full height remeasure dance and if the caret line positioning only counts hard line breaks then any soft wrapped paragraph is mistaken for the first line and the viewport snaps back to the top which is exactly the upward jump the operator reported The soft wrapped paragraph keeps flowing with many more words that wrap by whole words instead of single characters which means the under estimation of the caret line is smaller than the CJK case but the defect is exactly the same one and the fix must treat both languages identically by measuring the visual line where the caret actually sits rather than counting hard line breaks that were never typed by the operator'

const page = await findPageTarget()
const cdp = await Cdp.connect(page.webSocketDebuggerUrl)
console.log('[verify] connected')
const SEL = `document.querySelector('.chat-dock textarea.composer-input')`
const HAS_DOCK = await cdp.eval(`${SEL} !== null`)
console.log('[verify] dock:', HAS_DOCK)

const COMPARE = `(() => {
  const el = ${SEL}
  if (!(el instanceof HTMLTextAreaElement) || !(el.parentNode instanceof Node)) return null
  const cs = getComputedStyle(el)
  const lh = parseFloat(cs.lineHeight), padT = parseFloat(cs.paddingTop), padB = parseFloat(cs.paddingBottom)
  const padL = parseFloat(cs.paddingLeft), padR = parseFloat(cs.paddingRight)
  // (a) div mirror (the OLD technique)
  const div = document.createElement('div')
  for (const p of cs) div.style.setProperty(p, cs.getPropertyValue(p))
  div.style.cssText += 'position:absolute;visibility:hidden;padding:0;box-sizing:content-box;height:auto;'
  div.style.width = (el.clientWidth - padL - padR) + 'px'
  div.textContent = el.value.slice(0, el.selectionEnd ?? el.value.length)
  const marker = document.createElement('span')
  marker.style.cssText = 'display:inline-block;width:0;vertical-align:top;height:' + lh + 'px'
  div.appendChild(marker)
  el.parentNode.insertBefore(div, el.nextSibling)
  const divTop = marker.getBoundingClientRect().top - div.getBoundingClientRect().top + padT
  div.remove()
  // (b) textarea-clone mirror (the NEW technique)
  const clone = el.cloneNode(false)
  clone.removeAttribute('data-expand-anim')
  clone.style.position = 'absolute'; clone.style.visibility = 'hidden'; clone.style.height = '0px'; clone.style.transition = 'none'
  clone.value = el.value.slice(0, el.selectionEnd ?? el.value.length)
  el.parentNode.insertBefore(clone, el.nextSibling)
  const cloneLines = Math.max(1, Math.round((clone.scrollHeight - padT - padB) / lh))
  const cloneTop = padT + (cloneLines - 1) * lh
  clone.remove()
  // (c) real geometry: the caret is at the end; the real last line top
  const realLines = Math.round((el.scrollHeight - padT - padB) / lh)
  const realLastTop = padT + (realLines - 1) * lh
  return JSON.stringify({ taW: el.clientWidth, valueLen: el.value.length, selEnd: el.selectionEnd,
    scrollH: el.scrollHeight, realLines, realLastTop,
    divTop: +divTop.toFixed(1), divOff: +(divTop - realLastTop).toFixed(1),
    cloneTop: +cloneTop.toFixed(1), cloneOff: +(cloneTop - realLastTop).toFixed(1) })
})()`

// Stage EN at each width, caret at end, compare.
for (const inner of [1150, 1200, 1250, 1300, 1400]) {
  await cdp.eval(`window.resizeTo(${inner}, 900)`)
  await sleep(400)
  await cdp.eval(`(() => {
    const el = ${SEL}
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
    setter.call(el, ${JSON.stringify(EN)})
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.focus()
    el.setSelectionRange(${EN.length}, ${EN.length})
    return true
  })()`)
  await sleep(250)
  const r = JSON.parse(await cdp.eval(COMPARE))
  console.log(`[verify] inner=${inner} taW=${r.taW} lines=${r.realLines} | div off=${r.divOff} clone off=${r.cloneOff}`)
}
process.exit(0)
