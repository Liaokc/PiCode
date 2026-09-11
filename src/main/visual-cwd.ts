/**
 * Ghost-cwd visual-QA harness (ticket 54). Enabled with PICODE_VISUAL=1
 * plus PICODE_VISUAL_CWD=1. Like the context-menu harness it ASSERTS its
 * probes (exit 1 on any violation) and captures the frames:
 *
 *   cwd1-dimmed-row     — the sidebar's gray row (dimmed + "cwd missing"
 *                         meta) next to an alive control row
 *   cwd2-gray-row-menu  — the gray row's context menu: the four harmless
 *                         entries only, no open-type action
 *   cwd3-restored       — the same row after its directory reappears:
 *                         dimming and meta gone, no manual step
 *   cwd4-restored-menu  — the restored row's menu back to the FULL nine
 *                         entries (the menu rides the same projection)
 *
 * Seeding: an isolated session store (PICODE_SESSION_DIR tmpdir) with one
 * ALIVE project and one DOOMED project (created, seeded, then deleted — the
 * death happens before the first scan sees the directory, the restart
 * scenario).
 *
 * NOT part of `npm test`.
 */

import { mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { app, type BrowserWindow } from 'electron'
import { visualOutDir } from './visual'
import { ensureVisualProjectDir, ensureVisualStore, writeVisualSession } from './visual-store'

export function cwdVisualEnabled(): boolean {
  return process.env['PICODE_VISUAL_CWD'] === '1'
}

/** The harness captures only (no preference writes), but the throwaway
 * userData keeps the run as isolated as the other store harnesses. Called
 * from index.ts at module scope, BEFORE app.whenReady reads userData. */
export function isolateCwdVisualUserData(): void {
  if (!cwdVisualEnabled()) return
  app.setPath('userData', path.join(tmpdir(), `picode-visual-cwd-userdata-${process.pid}`))
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const ALIVE_TITLE = 'PICODE_CWD_ALIVE control task'
const DOOMED_TITLE = 'PICODE_CWD_DOOMED ghost task'

const MENU_PROBE = `(() => {
  const menu = document.querySelector('.sb-context-menu')
  if (!menu) return null
  return [...menu.querySelectorAll('.sb-context-item')].map((el) => el.textContent)
})()`

const EXPECTED_GRAY_MENU = ['Archive task', 'Copy task path', 'Copy session file path', 'Copy session ID']

/** The ordinary row menu (ticket 35): what the restored row's menu must be
 * back to after recovery — the same render-time projection, flipped back. */
const EXPECTED_FULL_MENU = [
  'Pin task',
  'Rename task',
  'Archive task',
  'Mark as Unread',
  'Reveal in Finder',
  'Copy task path',
  'Copy session file path',
  'Copy session ID',
  'View call trace'
]

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

async function measure<T>(getWindow: () => BrowserWindow | null, probe: string): Promise<T | null> {
  const win = getWindow()
  if (!win) return null
  return (await win.webContents.executeJavaScript(probe).catch(() => null)) as T | null
}

async function capture(win: BrowserWindow, name: string): Promise<void> {
  const png = await win.webContents.capturePage()
  const file = path.join(visualOutDir(), `${name}.png`)
  writeFileSync(file, png.toPNG())
  console.log(`VISUAL captured ${file}`)
}

function rightClick(win: BrowserWindow, x: number, y: number): void {
  win.webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'right', clickCount: 1 })
  win.webContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'right', clickCount: 1 })
}

async function pointOf(win: BrowserWindow, selector: string): Promise<{ x: number; y: number } | null> {
  return win.webContents
    .executeJavaScript(
      `(() => {
        const el = document.querySelector('${selector}')
        if (!(el instanceof Element)) return null
        const r = el.getBoundingClientRect()
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
      })()`
    )
    .catch(() => null)
}

function assert(cond: boolean, what: string): void {
  if (!cond) throw new Error(`cwd visual: ${what}`)
}

export function startCwdVisualIfEnabled(getWindow: () => BrowserWindow | null): void {
  if (!cwdVisualEnabled()) return

  // Seeding must precede the session index construction (it reads
  // PICODE_SESSION_DIR once) — same constraint as the other store harnesses.
  const store = ensureVisualStore()
  const aliveCwd = ensureVisualProjectDir('cwd-alive')
  const doomedCwd = ensureVisualProjectDir('cwd-doomed')
  const aliveFile = writeVisualSession(store, { id: 'cwd-alive', cwd: aliveCwd, userText: ALIVE_TITLE })
  const doomedFile = writeVisualSession(store, { id: 'cwd-doomed', cwd: doomedCwd, userText: DOOMED_TITLE })
  // Settled rows: backdate both so no live-state dot noise.
  for (const file of [aliveFile, doomedFile]) {
    const then = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000)
    utimesSync(file, then, then)
  }
  // The death happens BEFORE any scan sees the directory (the restart
  // scenario: the app opens onto an already-dead cwd).
  rmSync(doomedCwd, { recursive: true, force: true })

  void (async () => {
    try {
      mkdirSync(visualOutDir(), { recursive: true })
      for (let waited = 0; waited < 15_000; waited += 100) {
        if (getWindow()) break
        await sleep(100)
      }
      const win = getWindow()
      if (!win) throw new Error('cwd visual: no window')

      // The doomed row must reach the sidebar as a GRAY row (index poll
      // cadence ~2s): dimmed, with the "cwd missing" meta note.
      const doomedSel = `[data-file="${doomedFile}"]`
      const grayShown = await waitFor(
        getWindow,
        `document.querySelector('${doomedSel}.sb-task-dimmed') !== null &&
         document.querySelector('${doomedSel} .sb-task-cwd-meta')?.textContent === 'cwd missing'`,
        20_000
      )
      assert(grayShown, 'the dead-cwd session never appeared as a dimmed row with the cwd-missing meta')
      const controlSel = `[data-file="${aliveFile}"]`
      const controlNormal = await waitFor(
        getWindow,
        `document.querySelector('${controlSel}') !== null &&
         !document.querySelector('${controlSel}').classList.contains('sb-task-dimmed')`,
        10_000
      )
      assert(controlNormal, 'the alive control row must stay a normal row')
      const titles = await measure<string[]>(getWindow, `[...document.querySelectorAll('.sb-task-title')].map((el) => el.textContent)`)
      assert(titles?.includes(ALIVE_TITLE) === true, 'the control row must carry its own title')
      assert(titles?.includes(DOOMED_TITLE) === true, 'the gray row must carry its own title')
      await capture(win, 'cwd1-dimmed-row')

      // Right-click the gray row: exactly the four harmless entries.
      const rowPoint = await pointOf(win, doomedSel)
      assert(rowPoint !== null, 'the gray row is not clickable')
      rightClick(win, rowPoint!.x, rowPoint!.y)
      let menu: string[] | null = null
      for (let waited = 0; waited < 5_000; waited += 120) {
        menu = await measure<string[]>(getWindow, MENU_PROBE)
        if (menu !== null) break
        await sleep(120)
      }
      assert(menu !== null, 'right-click never opened the gray row menu')
      assert(
        JSON.stringify(menu) === JSON.stringify(EXPECTED_GRAY_MENU),
        `the gray row menu must carry only the harmless entries (got ${JSON.stringify(menu)})`
      )
      await capture(win, 'cwd2-gray-row-menu')

      // RECOVERY: the directory reappearing restores the row — dimming and
      // meta gone on the next scan, no manual step.
      mkdirSync(doomedCwd, { recursive: true })
      const restored = await waitFor(
        getWindow,
        `(() => { const row = document.querySelector('${doomedSel}');
          return row !== null && !row.classList.contains('sb-task-dimmed') && row.querySelector('.sb-task-cwd-meta') === null })()`,
        15_000
      )
      assert(restored, 'the gray row never restored to normal when its directory reappeared')
      await capture(win, 'cwd3-restored')

      // The restored row's menu must be back to the FULL nine entries — the
      // menu rides the same render-time projection as the row, so recovery
      // restores it too (no stale harmless-only menu).
      const restoredPoint = await pointOf(win, doomedSel)
      assert(restoredPoint !== null, 'the restored row is not clickable')
      rightClick(win, restoredPoint!.x, restoredPoint!.y)
      let restoredMenu: string[] | null = null
      for (let waited = 0; waited < 5_000; waited += 120) {
        restoredMenu = await measure<string[]>(getWindow, MENU_PROBE)
        if (restoredMenu !== null) break
        await sleep(120)
      }
      assert(restoredMenu !== null, 'right-click never opened the restored row menu')
      assert(
        JSON.stringify(restoredMenu) === JSON.stringify(EXPECTED_FULL_MENU),
        `the restored row menu must be the full nine entries (got ${JSON.stringify(restoredMenu)})`
      )
      await capture(win, 'cwd4-restored-menu')

      console.log('VISUAL cwd done — all invariants held')
      app.exit(0)
    } catch (err) {
      console.error('VISUAL cwd FAIL', err)
      app.exit(1)
    }
  })()
}
