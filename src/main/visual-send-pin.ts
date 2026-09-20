/**
 * Send-pin visual-QA harness (ticket 93, spec R13 — 发送落底). Enabled with
 * PICODE_VISUAL=1 plus PICODE_VISUAL_SEND_PIN=1. NOT part of `npm test` —
 * it ASSERTS its probe results (exit 1 on any violation) and CAPTURES the
 * landing composition frames, so it can run unattended.
 *
 * One REAL send drives the whole harness — the send latch is armed in the
 * renderer by the real composer gesture (ChatView.withPin), which contract
 * injection cannot reach: an isolated store seeds a backdated session whose
 * single user message is the ticket-45 count prompt with 100 blank lines
 * (the pre-wrap bubble is ~2500px tall — the transcript is scrollable no
 * matter how the reply renders), a real sidebar-row click opens it (normal
 * ChatView with a live host on the seeded file), the view is scrolled to
 * mid-transcript (reader-held-away), and the composer types + Enters a
 * short prompt — one real model call. The echo must land the view at the
 * bottom with the live Working container as the bottom-most element above
 * the composer (操作者原话: 输入框上最下面的应该是 agent 的 worked 内容).
 *
 * Captures (PNGs land in the visual out dir):
 *   c93-a-scrolled-away — the reading position mid-transcript, the jump
 *                         button faded in past the stick threshold
 *   c93-b-send-landed   — after the send: bottom-landed, the live Working
 *                         container bottom-most (the acceptance frame)
 */

import { mkdirSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { app, type BrowserWindow } from 'electron'
import { visualOutDir } from './visual'
import { ensureVisualProjectDir, ensureVisualStore, writeVisualSession } from './visual-store'

/** Exclusive gate of the send-pin harness (PICODE_VISUAL_SEND_PIN=1
 * alongside PICODE_VISUAL=1) — every other visual harness stands down. */
export function sendPinVisualEnabled(): boolean {
  return process.env['PICODE_VISUAL_SEND_PIN'] === '1'
}

/** Throwaway userData (no-op unless PICODE_VISUAL_SEND_PIN=1). Called from
 * index.ts at module scope, BEFORE app.whenReady reads userData. */
export function isolateSendPinUserData(): void {
  if (!sendPinVisualEnabled()) return
  app.setPath('userData', path.join(tmpdir(), `picode-visual-send-pin-userdata-${process.pid}`))
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

async function waitFor(getWindow: () => BrowserWindow | null, probe: string, budgetMs: number): Promise<boolean> {
  const win = getWindow()
  if (!win) return false
  for (let waited = 0; waited < budgetMs; waited += 100) {
    const ok = (await win.webContents.executeJavaScript(probe).catch(() => false)) as boolean
    if (ok) return true
    await sleep(100)
  }
  return false
}

async function capture(win: BrowserWindow, name: string, note: string): Promise<void> {
  const { writeFileSync } = await import('node:fs')
  const png = await win.webContents.capturePage()
  writeFileSync(path.join(visualOutDir(), `${name}.png`), png.toPNG())
  console.log(`VISUAL captured ${name}.png — ${note}`)
}

/** Bottom-distance probe on the transcript scroll container (< 40px). */
const AT_BOTTOM = `(() => { const el = document.querySelector('.chat-scroll'); return el !== null && el.scrollHeight - el.scrollTop - el.clientHeight < 40 })()`
/** Jump button faded in (the reader sits past the stick threshold). */
const JUMP_VISIBLE = `(() => {
  const btn = document.querySelector('.chat-jump-btn')
  return btn !== null && btn.classList.contains('chat-jump-btn-visible') && Number(getComputedStyle(btn).opacity) > 0.9
})()`
/** The live turn's container row is the bottom-most element: 'Working'
 * label and its bottom edge inside the scroll viewport. */
const WORKING_BOTTOMMOST = `(() => {
  const sc = document.querySelector('.chat-scroll')
  const rows = [...document.querySelectorAll('.turn-container')]
  const last = rows[rows.length - 1]
  if (sc === null || last === undefined) return false
  const label = last.querySelector('.turn-container-label')?.textContent ?? ''
  if (label !== 'Working') return false
  return last.getBoundingClientRect().bottom <= sc.getBoundingClientRect().bottom + 1
})()`
const SCROLL_DIAG = `JSON.stringify({
  scrollTop: document.querySelector('.chat-scroll')?.scrollTop ?? null,
  scrollH: document.querySelector('.chat-scroll')?.scrollHeight ?? null,
  clientH: document.querySelector('.chat-scroll')?.clientHeight ?? null
})`

export function startSendPinVisualIfEnabled(getWindow: () => BrowserWindow | null): void {
  if (!sendPinVisualEnabled()) return

  // Seeding must precede the session index construction (it reads
  // PICODE_SESSION_DIR once) — same constraint as the other store harnesses.
  const store = ensureVisualStore()
  const file = writeVisualSession(store, {
    id: 'send-pin-93',
    cwd: ensureVisualProjectDir('send-pin-93'),
    // The blank-line block makes the replayed bubble ~2500px tall: the
    // transcript is scrollable before the send (the ticket-45 smoke trick —
    // the seed needs no assistant message).
    userText:
      'PICODE_93_SEED: Count from 1 to 120 for the reading scene. Output each number on its own line.\n' +
      '\n'.repeat(100)
  })
  // Backdate: a fresh mtime would take the Live Follow path (no composer).
  const then = new Date(Date.now() - 60 * 60 * 1_000)
  utimesSync(file, then, then)

  void (async () => {
    try {
      mkdirSync(visualOutDir(), { recursive: true })
      for (let waited = 0; waited < 15_000; waited += 100) {
        if (getWindow()) break
        await sleep(100)
      }
      const win = getWindow()
      if (!win) throw new Error('send-pin visual: no window')
      win.show()
      win.focus()
      await waitFor(getWindow, `document.documentElement.dataset['chatSubscribed'] === 'true'`, 15_000)
      await sleep(500)

      // Open the seeded session by a real sidebar-row click (t81 precedent).
      const rowExpr = `document.querySelector('[data-file="${file}"]')`
      if (!(await waitFor(getWindow, `${rowExpr} !== null`, 20_000))) {
        throw new Error('send-pin visual: the seeded session never reached the sidebar')
      }
      await win.webContents.executeJavaScript(
        `${rowExpr}?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`
      )
      const chatTa = `document.querySelector('.chat-dock textarea.composer-input')`
      if (!(await waitFor(getWindow, `${chatTa} !== null`, 10_000))) {
        throw new Error('send-pin visual: the chat view composer never mounted')
      }
      if (
        !(await waitFor(
          getWindow,
          `(document.querySelector('.chat-thread')?.textContent ?? '').includes('PICODE_93_SEED')`,
          15_000
        ))
      ) {
        throw new Error('send-pin visual: the seeded transcript never replayed into the chat view')
      }
      await sleep(500) // the arrival pin settles

      // ---- frame a: the reading position — scrolled mid-transcript, the
      // jump button faded in (the reader-held-away state before the send) ----
      await win.webContents.executeJavaScript(
        `(() => { const el = document.querySelector('.chat-scroll'); el.scrollTop = Math.floor(el.scrollHeight / 2); return true })(); true`
      )
      if (!(await waitFor(getWindow, JUMP_VISIBLE, 5_000))) {
        throw new Error(`send-pin visual: the jump button never faded in for the scrolled-away reader; DOM: ${await win.webContents.executeJavaScript(SCROLL_DIAG)}`)
      }
      await sleep(300)
      await capture(win, 'c93-a-scrolled-away', 'mid-transcript reading position, jump button visible')

      // ---- the REAL send: type + Enter on the live composer (the gesture
      // arms the send latch), then the landing probes ----
      const typed = (await win.webContents.executeJavaScript(`(() => {
        const ta = document.querySelector('.chat-dock textarea.composer-input')
        if (!(ta instanceof HTMLTextAreaElement)) return false
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
        setter.call(ta, 'Reply with exactly: PICODE_93_LAND')
        ta.dispatchEvent(new Event('input', { bubbles: true }))
        ta.focus()
        return true
      })()`)) as boolean
      if (!typed) throw new Error('send-pin visual: the composer textarea is missing for the send')
      await win.webContents.executeJavaScript(`(() => {
        const ta = document.querySelector('.chat-dock textarea.composer-input')
        ta?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
        return true
      })()`)

      // The echo lands the bottom with the live Working container
      // bottom-most — the acceptance composition (probe, not eyeball).
      const landed = await waitFor(
        getWindow,
        `(document.querySelector('.chat-thread')?.textContent ?? '').includes('PICODE_93_LAND') && (${AT_BOTTOM}) && (${WORKING_BOTTOMMOST})`,
        60_000
      )
      if (!landed) {
        throw new Error(
          `send-pin visual: the send never landed the bottom with the Working container bottom-most; DOM: ${await win.webContents.executeJavaScript(SCROLL_DIAG)}`
        )
      }
      await sleep(400) // the streamed shell settles into the frame
      await capture(win, 'c93-b-send-landed', 'after the send: bottom-landed, live Working container bottom-most above the composer')

      console.log('VISUAL send-pin done — landing composition green')
      app.exit(0)
    } catch (err) {
      console.error('VISUAL send-pin FAIL', err)
      app.exit(1)
    }
  })()
}
