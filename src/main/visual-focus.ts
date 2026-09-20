/**
 * Focus-discipline visual harness (ticket 98, spec R16). Enabled with
 * PICODE_VISUAL=1 plus PICODE_VISUAL_FOCUS=1. Like every harness it
 * ASSERTS its probe results (exit 1 on any violation) and captures the
 * review frames:
 *
 *   c98-a-tab-ring   — after a REAL trusted Tab out of the composer input:
 *                      the focused control wears the orange :focus-visible
 *                      ring (Q19: Tab navigation keeps its ring — the
 *                      human-legible check the smoke's boolean probe can't
 *                      make)
 *   c98-b-mouse-noring— after a REAL trusted click on the + attach button
 *                      (the chat:pick-images stub answers an empty pick):
 *                      the caret rests on the ringless composer input and
 *                      no control keeps focus (the R16 end state — mouse
 *                      flows never show rings)
 *
 * The trusted-event point matters: synthetic dispatches never move focus,
 * so both frames are driven through webContents.sendInputEvent.
 *
 * Seeding: throwaway userData (like every harness that drives real
 * prefs-adjacent UI) keeps the default view.
 */

import { mkdirSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { app, type BrowserWindow } from 'electron'
import { visualOutDir } from './visual'
import { ensureVisualProjectDir, ensureVisualStore, writeVisualSession } from './visual-store'

/** Exclusive gate of the focus harness — every other visual harness stands
 * down when it is set. */
export function focusVisualEnabled(): boolean {
  return process.env['PICODE_VISUAL_FOCUS'] === '1'
}

/** Throwaway userData, like every harness that drives real prefs-adjacent
 * UI. Called from index.ts at module scope, BEFORE app.whenReady reads
 * userData. */
export function isolateFocusUserData(): void {
  if (!focusVisualEnabled()) return
  app.setPath('userData', path.join(tmpdir(), `picode-visual-focus-userdata-${process.pid}`))
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

async function waitFor(getWindow: () => BrowserWindow | null, probe: string, budgetMs: number): Promise<boolean> {
  for (let waited = 0; waited < budgetMs; waited += 100) {
    const win = getWindow()
    if (win && (await win.webContents.executeJavaScript(probe).catch(() => false))) return true
    await sleep(100)
  }
  return false
}

async function capture(win: BrowserWindow, name: string, state: string): Promise<void> {
  const png = await win.webContents.capturePage()
  writeFileSync(path.join(visualOutDir(), `${name}.png`), png.toPNG())
  console.log(`VISUAL captured ${name}.png state=${state}`)
}

/** A REAL (trusted) click at the center of the element the snippet
 * returns — trusted events are what move focus, the exact thing R16
 * decides about. The window must HOLD focus or the events land nowhere
 * (the ticket-44 class — re-steal before every leg). Returns false when
 * the element is missing or focus never returned. */
async function ensureFocus(win: BrowserWindow): Promise<boolean> {
  for (let waited = 0; waited < 5_000; waited += 100) {
    if ((await win.webContents.executeJavaScript('document.hasFocus()').catch(() => false)) === true) return true
    if (!win.isFocused()) app.focus({ steal: true })
    await sleep(100)
  }
  return false
}

async function realClick(win: BrowserWindow, elJs: string): Promise<boolean> {
  if (!(await ensureFocus(win))) return false
  const point = JSON.parse(
    String(
      await win.webContents.executeJavaScript(`(() => {
        const el = ${elJs}
        if (!(el instanceof HTMLElement)) return null
        const r = el.getBoundingClientRect()
        return JSON.stringify({ x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) })
      })()`).catch(() => 'null')
    )
  ) as { x: number; y: number } | null
  if (point === null) return false
  win.webContents.sendInputEvent({ type: 'mouseDown', x: point.x, y: point.y, button: 'left', clickCount: 1 })
  await sleep(60)
  win.webContents.sendInputEvent({ type: 'mouseUp', x: point.x, y: point.y, button: 'left', clickCount: 1 })
  return true
}

/** A REAL (trusted) input action — a click or a keystroke — retried until
 * `probeJs` confirms the action's effect (or the attempts run out): the
 * operator's machine steals activation at any moment (the ticket-44
 * environmental class), and a stolen event lands nowhere. Each attempt
 * re-steals focus first; every action below is idempotent under retry
 * (an empty picker pick, an idempotent menu pick, a toggle re-click).
 * The ASSERTION stays the caller's strict probe; this only re-drives
 * input the OS dropped. */
async function trustedUntil(
  win: BrowserWindow,
  action: () => Promise<boolean>,
  probeJs: string,
  attempts = 3
): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (!(await action())) return false
    const deadline = Date.now() + 1_200
    while (Date.now() < deadline) {
      if ((await win.webContents.executeJavaScript(probeJs).catch(() => false)) === true) return true
      await sleep(100)
    }
  }
  return (await win.webContents.executeJavaScript(probeJs).catch(() => false)) === true
}

/** A REAL (trusted) click, retried until `probeJs` confirms the click's
 * effect. */
async function trustedClickUntil(
  win: BrowserWindow,
  elJs: string,
  probeJs: string,
  attempts = 3
): Promise<boolean> {
  return trustedUntil(win, () => realClick(win, elJs), probeJs, attempts)
}

/** A REAL (trusted) key press on whatever holds focus. */
async function realKey(win: BrowserWindow, keyCode: string): Promise<void> {
  if (!(await ensureFocus(win))) return
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode })
  await sleep(40)
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode })
}

export function startFocusVisualIfEnabled(getWindow: () => BrowserWindow | null): void {
  if (!focusVisualEnabled()) return

  // Seeding must precede the session index construction (it reads
  // PICODE_SESSION_DIR once) — same constraint as the other store harnesses.
  const store = ensureVisualStore()
  const file = writeVisualSession(store, {
    id: 'focus-discipline-98',
    cwd: ensureVisualProjectDir('focus-discipline-demo'),
    userText: 'Focus discipline review scene'
  })
  // Backdate: a fresh mtime would take the Live Follow path (no composer).
  const then = new Date(Date.now() - 60 * 60 * 1_000)
  utimesSync(file, then, then)

  void (async () => {
    const failures: string[] = []
    const check = (ok: boolean, message: string): void => {
      if (ok) console.log(`VISUAL ok: ${message}`)
      else {
        console.error(`VISUAL FAIL: ${message}`)
        failures.push(message)
      }
    }
    try {
      mkdirSync(visualOutDir(), { recursive: true })
      for (let waited = 0; waited < 15_000; waited += 100) {
        if (getWindow()) break
        await sleep(100)
      }
      const win = getWindow()
      if (!win) throw new Error('focus visual: no window')
      win.show()
      win.focus()
      // The trusted-event legs are only honest when the window HOLDS focus
      // (the ticket-44 harness-robustness class — macOS denies a focus
      // steal while the operator is typing elsewhere; re-request every
      // poll tick so the steal lands the moment that interaction pauses).
      app.focus({ steal: true })
      let focused = false
      for (let waited = 0; waited < 10_000 && !focused; waited += 100) {
        focused = (await win.webContents.executeJavaScript('document.hasFocus()').catch(() => false)) === true
        if (!focused) {
          if (!win.isFocused()) app.focus({ steal: true })
          await sleep(100)
        }
      }
      if (!focused) throw new Error('focus visual: the window never took focus for the trusted-event legs')
      // Wait for the renderer's Seam-1 subscription (same marker as the smoke).
      await waitFor(getWindow, `document.documentElement.dataset['chatSubscribed'] === 'true'`, 15_000)
      await sleep(500)

      // Open the seeded session by a real sidebar-row click (expand precedent).
      const rowExpr = `document.querySelector('[data-file="${file}"]')`
      if (!(await waitFor(getWindow, `${rowExpr} !== null`, 20_000))) {
        throw new Error('focus visual: the seeded session never reached the sidebar')
      }
      await win.webContents.executeJavaScript(
        `${rowExpr}?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`
      )
      const chatTa = `document.querySelector('.chat-dock textarea.composer-input')`
      if (!(await waitFor(getWindow, `${chatTa} !== null && ${chatTa}.clientHeight === 74`, 10_000))) {
        throw new Error('focus visual: the chat view composer never settled at the 74px floor')
      }

      // ---- frame A: the Q19 keyboard ring. Park the caret on the input,
      // then a REAL Tab: the next control (the composer expand button)
      // takes focus and MUST match :focus-visible — the app's orange ring.
      // Every trusted leg runs through trustedUntil: the operator's machine
      // steals activation at any moment, so a dropped event is re-driven
      // (idempotently) rather than flaking the frame.
      const ringProbe = `document.activeElement !== ${chatTa} && document.activeElement?.matches?.(':focus-visible') === true`
      const ringOn = await trustedUntil(
        win,
        async () => {
          await win.webContents.executeJavaScript(`${chatTa}?.focus(); true`)
          await realKey(win, 'Tab')
          return true
        },
        ringProbe
      )
      check(ringOn, 'a real Tab matches :focus-visible on the focused control (the Q19 keyboard ring)')
      await sleep(200)
      await capture(win, 'c98-a-tab-ring', 'orange :focus-visible ring on the Tab-focused control (composer expand button), Q19 ring retained')

      // ---- frame B: the mouse end state. A REAL click on the + attach
      // button — the acceptance's own control. The chat:pick-images stub
      // answers an empty pick in this harness too (no native dialog), and
      // the caret must rest on the ringless input. Re-clicking + is
      // idempotent (the stub adds nothing), so the retry is safe.
      const plusBtn = `document.querySelector('.chat-dock .cmp-icon-btn[aria-label="Attach images"]')`
      const caretBack = await trustedClickUntil(
        win,
        plusBtn,
        // The user-visible fact: the caret rests on the input AND no ring is
        // painted (the input's ring is suppressed by rule — outline none).
        // (:focus-visible MATCHING on the textarea is not the ring — after a
        // keyboard interaction the script-focus heuristic can match while
        // the CSS still suppresses the outline.)
        `document.activeElement === ${chatTa} && getComputedStyle(document.activeElement).outlineStyle === 'none'`
      )
      check(caretBack, 'a real click on + hands the caret back to the ringless composer input (the R16 end state)')
      await sleep(200)
      await capture(win, 'c98-b-mouse-noring', 'after a real click on +: caret on the composer input, no focus ring anywhere (mouse flow)')

      // ---- the gated-Enter probe: with the caret parked on the input by
      // the discipline, a REAL trusted Enter must run the composer's send
      // path — proven with the retired-command gate ('/tree' → the History
      // hint toast; zero host traffic, the slash-gate stage's probe). The
      // trailing space is load-bearing: it moves the caret out of the
      // leading token so the trigger surface closes the / menu (a bare
      // '/tree' fuzzily matches other commands and the Enter would pick a
      // row instead of reaching the gate) — the keystroke lands on the
      // bare dispatch, exactly the path a real send takes. A retry just
      // re-presses Enter on the same gated text.
      await win.webContents.executeJavaScript(`(() => {
        const ta = document.querySelector('.composer-input')
        if (!(ta instanceof HTMLTextAreaElement)) return false
        ta.focus()
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
        setter.call(ta, '/tree ')
        ta.dispatchEvent(new Event('input', { bubbles: true }))
        return true
      })()`)
      const gated = await trustedUntil(
        win,
        async () => {
          await realKey(win, 'Enter')
          return true
        },
        `[...document.querySelectorAll('.toast-message')].some((el) => el.textContent?.includes('/tree'))`
      )
      check(gated, 'a real trusted Enter on the refocused input runs the composer send path (the /tree gate toast fired)')
      // The gate toast anchors over the composer footer's right side — wait
      // for it to expire before any leg clicks a control underneath it.
      await waitFor(getWindow, `document.querySelectorAll('.toast-message').length === 0`, 10_000)

      // ---- the menu legs (visual mode fakes the provider catalog — the
      // 4b-model-menu precedent): a real click on the model chip must open
      // the cascade WITH the keyboard capture on the selected row (real
      // keys reach flatMenuKey through it), a real click on the CHECKED
      // model row (idempotent pick) must close the menu and land the caret
      // back on the input with the model unchanged.
      const modelChip = `document.querySelector('.cmp-chip[aria-label^="Model:"]')`
      const modelBefore = (await win.webContents.executeJavaScript(
        `${modelChip}?.getAttribute('aria-label') ?? 'missing'`
      )) as string
      // The open probe INCLUDES the capture state: the popover mounts with
      // the keyboard on the selected row — the capture and the open are one
      // R16 fact, asserted in the same tight window (retries re-toggle the
      // chip, which self-corrects a stolen click).
      const cascadeOpened = await trustedClickUntil(
        win,
        modelChip,
        `document.querySelector('.cmp-popover .cmp-cascade') !== null && document.activeElement?.closest?.('.cmp-popover') !== null && document.activeElement.getAttribute('aria-selected') === 'true'`
      )
      if (!cascadeOpened) {
        const dump = (await win.webContents.executeJavaScript(`JSON.stringify({
          popover: document.querySelector('.cmp-popover') !== null,
          cascade: document.querySelector('.cmp-popover .cmp-cascade') !== null,
          active: String(document.activeElement?.tagName ?? 'none') + '#' + String(document.activeElement?.className ?? ''),
          selected: document.activeElement?.getAttribute?.('aria-selected') ?? null,
          rows: document.querySelectorAll('.cmp-popover .cmp-menu-row').length
        })`).catch(() => 'cascade-dump-failed')) as string
        console.log(`VISUAL focus cascade-capture dump: ${dump}`)
      }
      check(cascadeOpened, 'the real chip click opened the model cascade with the keyboard capture on the selected row')
      const checkedRow = `(() => {
        const col = document.querySelectorAll('.cmp-popover .cmp-cascade-col')[1]
        if (!col) return null
        return [...col.querySelectorAll('.cmp-menu-row')].find((r) => r.querySelector('.cmp-menu-check') !== null) ?? null
      })()`
      const picked = await trustedClickUntil(
        win,
        checkedRow,
        `document.querySelector('.cmp-popover') === null && document.activeElement === ${chatTa}`
      )
      check(picked, 'the checked-row pick closed the menu and returned the caret to the composer input')
      const modelAfter = (await win.webContents.executeJavaScript(
        `${modelChip}?.getAttribute('aria-label') ?? 'missing'`
      )) as string
      check(modelBefore === modelAfter, `the idempotent model pick left the model unchanged (${modelBefore})`)

      if (failures.length > 0) {
        console.error(`VISUAL focus done with ${failures.length} failure(s)`)
        app.exit(1)
      } else {
        console.log('VISUAL focus done — all checks green')
        app.exit(0)
      }
    } catch (err) {
      console.error('VISUAL focus FAIL', err)
      app.exit(1)
    }
  })()
}
