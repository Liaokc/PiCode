/**
 * File-browser real-time refresh + pinned-row View files visual-QA harness
 * (ticket 107). Enabled with PICODE_VISUAL=1 plus PICODE_VISUAL_FB107=1.
 * NOT part of `npm test` — but like the preview harness it ASSERTS its probe
 * results (exit 1 on any violation).
 *
 * The frames (completion-report evidence):
 *
 *   1. s107-pinned-hover — a REAL mouse hover (sendInputEvent, the ticket-35
 *      precedent) over a PINNED session row: the hover cluster shows the
 *      archive button (dot slot), the NEW View files entry over the vacated
 *      time slot (ticket 107) and the pin — the row grid never shifts;
 *   2. s107-browser-open — one click on that entry opened the project file
 *      browser (the same setBrowserTarget path as the group header);
 *   3. s107-live-refresh — with the browser OPEN, a file created on disk by
 *      the harness appears in the tree WITHOUT re-entering: the real
 *      recursive watcher → coalesced IPC push → silent re-read path
 *      (the smoke stage owns the delete/rename legs).
 *
 * Seeding: an isolated store gets two fake rows in the SAME project (one to
 * pin, one keeps the group renderable), whose cwd is a REAL fixture dir
 * (ensureVisualProjectDir — real files on disk). Throwaway userData keeps
 * the run off the operator's preferences.
 */

import { tmpdir } from 'node:os'
import path from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import { app, type BrowserWindow } from 'electron'
import { visualOutDir } from './visual'
import { ensureVisualProjectDir, ensureVisualStore, writeVisualSession } from './visual-store'

/** Exclusive gate (PICODE_VISUAL_FB107=1 alongside PICODE_VISUAL=1) — every
 * other visual harness stands down. */
export function fb107VisualEnabled(): boolean {
  return process.env['PICODE_VISUAL_FB107'] === '1'
}

/** Throwaway userData (no-op unless PICODE_VISUAL_FB107=1). Called from
 * index.ts at module scope, BEFORE app.whenReady reads userData. */
export function isolateFb107UserData(): void {
  if (!fb107VisualEnabled()) return
  app.setPath('userData', path.join(tmpdir(), `picode-visual-fb107-userdata-${process.pid}`))
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const js = (win: BrowserWindow, script: string): Promise<unknown> => win.webContents.executeJavaScript(script)

async function waitFor(win: BrowserWindow, probe: string, budgetMs: number): Promise<boolean> {
  for (let waited = 0; waited < budgetMs; waited += 100) {
    const ok = (await js(win, probe).catch(() => false)) as boolean
    if (ok) return true
    await sleep(100)
  }
  return false
}

async function capture(win: BrowserWindow, name: string): Promise<void> {
  const png = await win.webContents.capturePage()
  writeFileSync(path.join(visualOutDir(), `${name}.png`), png.toPNG())
  console.log(`VISUAL captured ${name}.png`)
}

export function startFb107VisualIfEnabled(getWindow: () => BrowserWindow | null): void {
  if (!fb107VisualEnabled()) return

  // Isolated store BEFORE the index constructs (same rule as the other store
  // harnesses); seeded rows point at a REAL fixture directory.
  const store = ensureVisualStore()
  const projectDir = ensureVisualProjectDir('fb107')
  writeFileSync(path.join(projectDir, 'alpha.txt'), 'alpha 107')
  writeFileSync(path.join(projectDir, 'beta.md'), 'beta 107')
  mkdirSync(path.join(projectDir, 'sub'), { recursive: true })
  writeFileSync(path.join(projectDir, 'sub', 'inner.txt'), 'inner 107')
  writeVisualSession(store, { id: 'fb107-pin', cwd: projectDir, userText: 'PICODE_FB107 pinned task' })

  void (async () => {
    try {
      mkdirSync(visualOutDir(), { recursive: true })
      for (let waited = 0; waited < 15_000; waited += 100) {
        if (getWindow()) break
        await sleep(100)
      }
      const win = getWindow()
      if (!win) throw new Error('fb107 visual: no window')
      await waitFor(win, `document.documentElement.dataset['chatSubscribed'] === 'true'`, 15_000)
      await sleep(500)
      win.webContents.setBackgroundThrottling(false)

      const problems: string[] = []
      const pinnedRow = `document.querySelector('.sb-task[data-file$="visual-fb107-pin.jsonl"]')`

      // The pinned section needs the row PINNED first (local preference —
      // throwaway userData keeps it out of the operator's preferences).
      await js(win, `(() => { const row = ${pinnedRow}; if (!(row instanceof Element)) return false; const b = row.querySelector('.sb-pin-btn'); if (!(b instanceof HTMLElement)) return false; b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true })()`)
      if (!(await waitFor(win, `document.querySelector('.sb-scroll > .sb-task[data-file$="visual-fb107-pin.jsonl"]') !== null`, 10_000))) {
        problems.push('the seeded row never moved into the pinned section')
      }

      // Frame 1 — REAL hover over the pinned row (CSS :hover needs trusted
      // mouse movement; synthetic MouseEvent dispatch cannot do this).
      const rowPoint = (await js(win, `(() => {
        const row = ${pinnedRow}
        if (!(row instanceof Element)) return null
        const r = row.getBoundingClientRect()
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
      })()`)) as { x: number; y: number } | null
      if (!rowPoint) problems.push('could not locate the pinned row for the hover')
      else {
        win.webContents.sendInputEvent({ type: 'mouseMove', x: rowPoint.x, y: rowPoint.y })
        await sleep(150)
        win.webContents.sendInputEvent({ type: 'mouseMove', x: rowPoint.x, y: rowPoint.y })
        const hoverVisible = await waitFor(
          win,
          `(() => {
            const btn = document.querySelector('.sb-scroll > .sb-task[data-file$="visual-fb107-pin.jsonl"] .sb-files-btn')
            if (!btn) return false
            const s = getComputedStyle(btn)
            return s.visibility === 'visible' && Number(s.opacity) > 0.9
          })()`,
          5_000
        )
        if (!hoverVisible) problems.push('the pinned row View files entry never faded in on hover')
        await sleep(350)
        await capture(win, 's107-pinned-hover')
      }

      // Frame 2 — click the entry: the browser opens over the project cwd.
      await js(win, `(() => { const row = ${pinnedRow}; const b = row?.querySelector('.sb-files-btn'); if (!(b instanceof HTMLElement)) return false; b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true })()`)
      const browserOpen = await waitFor(win, `document.querySelector('.fb-browser[data-browser-cwd="${projectDir}"]') !== null`, 10_000)
      if (!browserOpen) problems.push('the pinned-row View files entry never opened the browser')
      if (!(await waitFor(win, `[...document.querySelectorAll('.fb-row .fb-row-name')].some((n) => n.textContent === 'inner.txt') === false && document.querySelectorAll('.fb-row').length >= 3`, 10_000))) {
        problems.push('the browser root listing never rendered')
      }
      await capture(win, 's107-browser-open')

      // Frame 3 — REAL-TIME refresh: create a file on disk while the browser
      // is open; the row must appear without re-entering (watch push).
      writeFileSync(path.join(projectDir, 'live-created.txt'), 'created by the harness mid-view')
      if (!(await waitFor(win, `[...document.querySelectorAll('.fb-row .fb-row-name')].some((n) => n.textContent === 'live-created.txt')`, 20_000))) {
        problems.push('the created file never appeared in the open tree')
      }
      await capture(win, 's107-live-refresh')

      if (problems.length > 0) {
        console.error(`VISUAL fb107 FAILED: ${problems.join('; ')}`)
        app.exit(1)
        return
      }
      console.log('VISUAL fb107 ok')
      app.exit(0)
    } catch (err) {
      console.error('VISUAL fb107 error:', err)
      app.exit(1)
    }
  })()
}
