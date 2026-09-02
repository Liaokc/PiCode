/**
 * Terminal + Bridge dock visual-QA harness (tickets 08/18 + feedback
 * rounds). Enabled with PICODE_VISUAL=1 plus PICODE_VISUAL_TERMINAL=1.
 * Both panels live in ONE bottom dock frame: the harness opens the terminal
 * (⌘J entry), then swaps the bridge panel in at the SAME position (⌥⌘J
 * entry since ticket 27), injects a bash sequence into the contract stream,
 * and exercises the tool-card deep link. Captures PNGs for the human
 * visual pass:
 *
 *   terminal-1 — dock showing the terminal: shell prompt, ZCode tab strip
 *   bridge-1   — same dock, bridge panel swapped in, command mid-run
 *   bridge-2   — feed settled (✓ done / ✗ failed cards)
 *   terminal-2 — swapped back to the terminal in place (panel switch proof)
 *   terminal-3 — user-pane input proof (pasted command echoed by the shell)
 *
 * PNGs land in the visual out dir (default <cwd>/.scratch/visual/). Not part
 * of `npm test`.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { app, type BrowserWindow } from 'electron'
import { emitContractEvent, visualOutDir } from './visual'

export function terminalVisualEnabled(): boolean {
  return process.env['PICODE_VISUAL_TERMINAL'] === '1'
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

async function waitForChatSubscription(getWindow: () => BrowserWindow | null): Promise<BrowserWindow | null> {
  for (let waited = 0; waited < 15_000; waited += 100) {
    const win = getWindow()
    if (win) {
      const ready = await win.webContents
        .executeJavaScript("document.documentElement.dataset['chatSubscribed'] === 'true'")
        .catch(() => false)
      if (ready === true) return win
    }
    await sleep(100)
  }
  return getWindow()
}

async function probe(win: BrowserWindow, expression: string): Promise<unknown> {
  return win.webContents.executeJavaScript(expression).catch(() => null)
}

async function capture(win: BrowserWindow, name: string): Promise<void> {
  const png = await win.webContents.capturePage()
  const file = path.join(visualOutDir(), `${name}.png`)
  writeFileSync(file, png.toPNG())
  console.log(`VISUAL captured ${file}`)
}

/** Click a titlebar toggle button by aria-label (the real entry point). */
async function clickToggle(win: BrowserWindow, ariaLabel: string): Promise<boolean> {
  const clicked = await probe(
    win,
    `(() => {
      const toggle = document.querySelector('button[aria-label="${ariaLabel}"]')
      if (!toggle) return false
      toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      return true
    })()`
  )
  return clicked === true
}

export function startTerminalVisualIfEnabled(getWindow: () => BrowserWindow | null): void {
  if (!terminalVisualEnabled()) return

  void (async () => {
    try {
      mkdirSync(visualOutDir(), { recursive: true })
      const win = await waitForChatSubscription(getWindow)
      if (!win) throw new Error('terminal visual harness: no window')

      // A session gives the Terminal tab its working directory (the user pty
      // really spawns in the tmpdir for the capture).
      emitContractEvent({
        type: 'session_created',
        sessionId: 'terminal-visual-session',
        cwd: tmpdir(),
        model: 'claude-opus-4-5'
      })

      // ---- terminal dock: open through the titlebar toggle (⌘J entry) ----
      if (!(await clickToggle(win, 'Toggle terminal'))) throw new Error('terminal dock toggle not found')
      await sleep(2500) // login shell prompt lands in the user pane

      const mounted = await probe(
        win,
        `(() => ({
          xterms: document.querySelectorAll('.terminal-tab .xterm').length,
          userPanes: document.querySelectorAll('.terminal-user').length,
          dockTitle: document.querySelector('.dock-panel .terminal-dock-title')?.textContent ?? null,
          shellChip: document.querySelector('.terminal-dock-chip')?.textContent ?? null,
          sessionChip: document.querySelector('.terminal-dock-session-chip .terminal-dock-chip-label')?.textContent ?? null,
          bridgeEntries: document.querySelectorAll('.bridge-entry').length
        }))()`
      )
      console.log(`VISUAL terminal probe ${JSON.stringify(mounted)}`)
      await capture(win, 'terminal-1')

      // ---- bridge panel: swap in at the SAME position (⌥⌘J entry) ----
      if (!(await clickToggle(win, 'Toggle agent bridge'))) throw new Error('bridge dock toggle not found')
      await sleep(300)

      // Bridge sequence 1: a passing bash call with live partial output.
      emitContractEvent({ type: 'agent_start' })
      emitContractEvent({ type: 'tool_start', toolCallId: 'tb-1', name: 'bash', args: { command: 'npm test -- src/routes' } })
      await sleep(400)
      emitContractEvent({ type: 'tool_update', toolCallId: 'tb-1', partial: '→ Running vitest…\n' })
      await sleep(500)
      emitContractEvent({
        type: 'tool_update',
        toolCallId: 'tb-1',
        partial: 'PASS src/routes/register.test.ts\n  ✓ validates email (4 ms)\n  ✓ hashes password (6 ms)\n'
      })
      await sleep(900)

      const bridgeProbe = await probe(
        win,
        `(() => ({
          status: document.querySelector('.bridge-status')?.textContent ?? null,
          entries: Array.from(document.querySelectorAll('.bridge-entry')).map((e) => ({
            cmd: e.querySelector('.bridge-entry-cmd')?.textContent ?? null,
            mark: e.querySelector('.bridge-entry-mark')?.textContent ?? null,
            hasOutput: e.querySelector('.bridge-entry-output') !== null
          }))
        }))()`
      )
      console.log(`VISUAL bridge probe ${JSON.stringify(bridgeProbe)}`)
      await capture(win, 'bridge-1')

      emitContractEvent({
        type: 'tool_end',
        toolCallId: 'tb-1',
        output:
          'PASS src/routes/register.test.ts\n  ✓ validates email (4 ms)\n  ✓ hashes password (6 ms)\n\nTest Files  1 passed (1)\n     Tests  2 passed (2)',
        isError: false
      })
      await sleep(400)

      // Bridge sequence 2: a failing bash call (error tail + failed status).
      emitContractEvent({ type: 'tool_start', toolCallId: 'tb-2', name: 'bash', args: { command: 'npm run lint' } })
      emitContractEvent({ type: 'tool_update', toolCallId: 'tb-2', partial: 'Linting 128 files…\n' })
      await sleep(600)
      emitContractEvent({
        type: 'tool_end',
        toolCallId: 'tb-2',
        output: 'Linting 128 files…\nerror: 2 problems in src/routes/register.ts\n',
        isError: true
      })
      await sleep(700)
      await capture(win, 'bridge-2')

      // ---- panel switch proof: ⌘J swaps back to the terminal in place,
      // then the tool card's Bridge chip deep-links into the feed again.
      if (!(await clickToggle(win, 'Toggle terminal'))) throw new Error('terminal dock toggle not found')
      await sleep(400)
      await capture(win, 'terminal-2')

      await probe(
        win,
        `(() => {
          const chip = document.querySelector('.tool-card-preview-link[aria-label="Show in Agent Bridge"]')
          if (!chip) return false
          chip.dispatchEvent(new MouseEvent('click', { bubbles: true }))
          return true
        })()`
      )
      await sleep(500)
      const deepLinkState = await probe(
        win,
        `(() => ({
          bridgeVisible: document.querySelector('.dock-panel:nth-child(3)')?.style.display !== 'none',
          flashed: document.querySelector('.bridge-entry-flash') !== null
        }))()`
      )
      console.log(`VISUAL deep-link probe ${JSON.stringify(deepLinkState)}`)

      // ---- input-path proof on the terminal panel ----
      if (!(await clickToggle(win, 'Toggle terminal'))) throw new Error('terminal dock toggle not found')
      await sleep(300)
      const pasted = await probe(
        win,
        `(() => {
          const ta = document.querySelector('.terminal-user textarea')
          if (!ta) return false
          ta.focus()
          const dt = new DataTransfer()
          dt.setData('text/plain', 'echo PICODE_TYPED_OK')
          ta.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
          const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
          Object.defineProperty(enter, 'keyCode', { get: () => 13 })
          ta.dispatchEvent(enter)
          return true
        })()`
      )
      if (!pasted) throw new Error('could not paste into the user terminal')
      await sleep(1500)
      await capture(win, 'terminal-3')

      console.log('VISUAL terminal done')
      app.exit(0)
    } catch (err) {
      console.error('VISUAL TERMINAL FAIL', err)
      app.exit(1)
    }
  })()
}
