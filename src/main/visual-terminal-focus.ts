/**
 * Terminal-focus visual harness (ticket 105). Enabled with PICODE_VISUAL=1
 * plus PICODE_VISUAL_TERMINAL_FOCUS=1. The smoke's boolean probe proves the
 * caret LANDS in the shell; the thing only eyes can judge is the xterm
 * focus state itself — a focused terminal paints a SOLID block cursor,
 * an unfocused one a hollow outline. The harness captures the pair:
 *
 *   c105-a-cmdj-focus    — ONE synthetic ⌘J (the keymap resolver only reads
 *                          code+modifiers; the focus move is programmatic)
 *                          opens the dock: the caret is in the shell with no
 *                          click into the terminal (asserted), the cursor
 *                          solid. The frame the operator asked for: open =
 *                          type, no extra click.
 *   c105-b-blur-contrast — a REAL trusted click into the composer moves the
 *                          caret out: the dock stays open, the cursor turns
 *                          hollow. The contrast frame that makes A legible.
 *
 * Seeding: throwaway userData + a backdated seeded session with a real
 * project dir (the shell needs a workspace), like every harness that
 * drives prefs-adjacent UI.
 */

import { mkdirSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { app, type BrowserWindow } from 'electron'
import { visualOutDir } from './visual'
import { ensureVisualProjectDir, ensureVisualStore, writeVisualSession } from './visual-store'

/** Exclusive gate of the terminal-focus harness — every other visual
 * harness stands down when it is set. */
export function terminalFocusVisualEnabled(): boolean {
  return process.env['PICODE_VISUAL_TERMINAL_FOCUS'] === '1'
}

/** Throwaway userData, like every harness that drives real prefs-adjacent
 * UI. Called from index.ts at module scope, BEFORE app.whenReady reads
 * userData. */
export function isolateTerminalFocusUserData(): void {
  if (!terminalFocusVisualEnabled()) return
  app.setPath('userData', path.join(tmpdir(), `picode-visual-terminal-focus-userdata-${process.pid}`))
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

/** The xterm cursor cell blinks while focused (1s step-end, ~50% duty) —
 * poll until the block paints (background non-transparent) so the capture
 * lands on the ON phase and the solid-vs-hollow contrast is unambiguous. */
async function captureCursorOn(win: BrowserWindow, name: string, state: string): Promise<void> {
  const cursorOn = `(() => {
    const c = document.querySelector('.terminal-dock .xterm-rows .xterm-cursor')
    if (c === null) return false
    return getComputedStyle(c).backgroundColor !== 'rgba(0, 0, 0, 0)'
  })()`
  for (let waited = 0; waited < 3_000; waited += 60) {
    if ((await win.webContents.executeJavaScript(cursorOn).catch(() => false)) === true) break
    await sleep(60)
  }
  await capture(win, name, state)
}

/** A REAL (trusted) click at the center of the element the snippet
 * returns — trusted events are what move focus (ticket-98 rule). The
 * window must HOLD focus or the events land nowhere (the ticket-44 class
 * — re-steal before every attempt). */
async function realClick(win: BrowserWindow, elJs: string): Promise<boolean> {
  let focused = false
  for (let waited = 0; waited < 5_000; waited += 100) {
    if ((await win.webContents.executeJavaScript('document.hasFocus()').catch(() => false)) === true) {
      focused = true
      break
    }
    if (!win.isFocused()) app.focus({ steal: true })
    await sleep(100)
  }
  if (!focused) return false
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

export function startTerminalFocusVisualIfEnabled(getWindow: () => BrowserWindow | null): void {
  if (!terminalFocusVisualEnabled()) return

  // Seeding must precede the session index construction (it reads
  // PICODE_SESSION_DIR once) — same constraint as the other store harnesses.
  const store = ensureVisualStore()
  const file = writeVisualSession(store, {
    id: 'terminal-focus-105',
    cwd: ensureVisualProjectDir('terminal-focus-demo'),
    userText: 'Terminal focus review scene'
  })
  // Backdate: a fresh mtime would take the Live Follow path (no composer —
  // frame B needs the composer to click into).
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
      if (!win) throw new Error('terminal-focus visual: no window')
      win.show()
      win.focus()
      app.focus({ steal: true })
      await waitFor(getWindow, `document.documentElement.dataset['chatSubscribed'] === 'true'`, 15_000)
      await sleep(500)

      // Open the seeded session by a real sidebar-row click (expand
      // precedent). The launch dock state is closed — assert it so frame A
      // below is honestly "⌘J FROM CLOSED".
      const rowExpr = `document.querySelector('[data-file="${file}"]')`
      if (!(await waitFor(getWindow, `${rowExpr} !== null`, 20_000))) {
        throw new Error('terminal-focus visual: the seeded session never reached the sidebar')
      }
      await win.webContents.executeJavaScript(
        `${rowExpr}?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`
      )
      const chatTa = `document.querySelector('.chat-dock textarea.composer-input')`
      if (!(await waitFor(getWindow, `${chatTa} !== null`, 10_000))) {
        throw new Error('terminal-focus visual: the chat view composer never appeared')
      }
      const DOCK_STATE = `(() => {
        const dock = document.querySelector('.terminal-dock')
        if (!dock || dock.hasAttribute('data-closed')) return 'closed'
        const panels = Array.from(document.querySelectorAll('.dock-panel'))
        if (panels[0]?.style.display !== 'none') return 'terminal'
        if (panels[1]?.style.display !== 'none') return 'bridge'
        return 'unknown'
      })()`
      if ((await win.webContents.executeJavaScript(DOCK_STATE).catch(() => 'probe-failed')) !== 'closed') {
        throw new Error('terminal-focus visual: the dock did not start closed')
      }

      // ---- frame A: ONE ⌘J from closed — the dock opens and the caret is
      // ALREADY in the shell. No click into the terminal happened; the
      // assertion is the focus probe itself, the frame is the human check.
      const pressCmdJ = `window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyJ', metaKey: true, bubbles: true })); true`
      const shellFocused = `document.activeElement !== null && document.activeElement.classList.contains('xterm-helper-textarea')`
      let opened = false
      for (let attempt = 0; attempt < 3 && !opened; attempt++) {
        await win.webContents.executeJavaScript(pressCmdJ)
        opened = await waitFor(
          getWindow,
          `${DOCK_STATE} === 'terminal' && ${shellFocused} && document.querySelector('.terminal-dock .xterm').classList.contains('focus')`,
          5_000
        )
      }
      check(opened, 'one ⌘J from closed opens the dock with the caret already in the shell (no click into the terminal)')
      // The shell spawns on the first open — wait for its prompt so the
      // frame shows a live shell, not a blank pane.
      const promptUp = `(document.querySelector('.terminal-dock .xterm-rows')?.textContent ?? '').trim().length > 0`
      if (!(await waitFor(getWindow, promptUp, 20_000))) {
        throw new Error('terminal-focus visual: the shell prompt never rendered')
      }
      await sleep(700)
      await captureCursorOn(win, 'c105-a-cmdj-focus', 'one ⌘J from closed: dock open, caret in the shell with zero clicks, solid block cursor')

      // ---- frame B: the contrast. A REAL trusted click into the composer
      // moves the caret out — the dock stays open and the xterm blurs
      // (focus class drops, cursor turns hollow outline). Retried like
      // every trusted leg (a stolen event lands nowhere).
      const composerFocused = `document.activeElement === ${chatTa}`
      const xtermBlurred = `document.querySelector('.terminal-dock .xterm') !== null && !document.querySelector('.terminal-dock .xterm').classList.contains('focus')`
      let blurred = false
      for (let attempt = 0; attempt < 3 && !blurred; attempt++) {
        blurred = await realClick(win, chatTa)
        if (blurred) {
          blurred = await waitFor(getWindow, `${composerFocused} && ${xtermBlurred}`, 3_000)
        }
      }
      check(blurred, 'a real click into the composer takes the caret back and blurs the terminal (dock stays open)')
      await sleep(300)
      await capture(win, 'c105-b-blur-contrast', 'contrast frame: caret on the composer, terminal cursor hollow (unfocused), dock still open')

      if (failures.length > 0) {
        console.error(`VISUAL terminal-focus done with ${failures.length} failure(s)`)
        app.exit(1)
      } else {
        console.log('VISUAL terminal-focus done — all checks green')
        app.exit(0)
      }
    } catch (err) {
      console.error('VISUAL terminal-focus FAIL', err)
      app.exit(1)
    }
  })()
}
