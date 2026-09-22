const PORT = 9231
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
const page = targets.find((t) => t.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r) => ws.onopen = r)
let seq = 0; const pending = new Map()
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id !== undefined && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result) } }
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })) })
const evalp = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result.value

const edge = async (text, caret) => {
  await evalp(`(() => {
    const el = document.querySelector('textarea.composer-input')
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
    setter.call(el, ${JSON.stringify(text)})
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.focus()
    el.setSelectionRange(${caret}, ${caret})
    return true
  })()`)
  await sleep(120)
  return evalp(`(() => {
    const el = document.querySelector('textarea.composer-input')
    const cs = getComputedStyle(el)
    const lh = parseFloat(cs.lineHeight), padT = parseFloat(cs.paddingTop), padL = parseFloat(cs.paddingLeft), padR = parseFloat(cs.paddingRight)
    const mirror = document.createElement('div')
    for (const p of cs) mirror.style.setProperty(p, cs.getPropertyValue(p))
    mirror.style.cssText += 'position:absolute;visibility:hidden;padding:0;box-sizing:content-box;height:auto;'
    mirror.style.width = (el.clientWidth - padL - padR) + 'px'
    mirror.textContent = el.value.slice(0, el.selectionEnd)
    const marker = document.createElement('span')
    marker.style.cssText = 'display:inline-block;width:0;vertical-align:top;height:' + lh + 'px'
    mirror.appendChild(marker)
    el.parentNode.insertBefore(mirror, el.nextSibling)
    const top = marker.getBoundingClientRect().top - mirror.getBoundingClientRect().top + padT
    mirror.remove()
    return { caret: el.selectionEnd, top, line: +((top - padT) / lh).toFixed(2), lh, padT, hardLines: el.value.split('\\n').length, scrollH: el.scrollHeight, clientH: el.clientHeight }
  })()`)
}

console.log('caret after trailing newline (a\\n caret 2):', JSON.stringify(await edge('a\n', 2)))
console.log('caret 40 of 40 CJK (end):', JSON.stringify(await edge('一二三四五六七八九十'.repeat(4), 40)))
console.log('caret 41 (one past, wraps):', JSON.stringify(await edge('一二三四五六七八九十'.repeat(4) + '五', 41)))
console.log('caret 0 empty:', JSON.stringify(await edge('', 0)))
console.log('caret 0 on abc:', JSON.stringify(await edge('abc', 0)))
console.log('caret 2 on a\\n\\nb (empty middle line):', JSON.stringify(await edge('a\n\nb', 2)))
process.exit(0)
