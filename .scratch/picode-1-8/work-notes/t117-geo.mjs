/** Quick geometry query against the app on 9231. */
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
const page = await findPageTarget()
const cdp = await Cdp.connect(page.webSocketDebuggerUrl)
const r = await cdp.eval(`(() => {
  const ta = document.querySelector('textarea.composer-input')
  const dock = document.querySelector('.chat-dock')
  const cs = ta ? getComputedStyle(ta) : null
  return JSON.stringify({
    url: location.href.slice(0, 60),
    innerW: window.innerWidth, innerH: window.innerHeight,
    taW: ta ? ta.clientWidth : null, taH: ta ? ta.clientHeight : null,
    taFontSize: cs ? cs.fontSize : null, taFontFamily: cs ? cs.fontFamily.slice(0, 30) : null,
    hasDock: !!dock, valueLen: ta ? ta.value.length : null,
    bodyClasses: document.body.className
  })
})()`)
console.log(r)
process.exit(0)
