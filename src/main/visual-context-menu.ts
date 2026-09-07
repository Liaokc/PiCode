/**
 * Context-menu + archive visual-QA harness (ticket 35). Enabled with
 * PICODE_VISUAL=1 plus PICODE_VISUAL_CONTEXT_MENU=1. NOT part of `npm test`
 * — but like the row-geometry harness it ASSERTS its probe results (exit 1
 * on any violation): the archive hover button's placement is geometry, and
 * geometry is measurable, not eyeballable.
 *
 * The invariants under test (grilling Q6①-i — the hover archive button
 * temporarily REPLACES the dot slot):
 *
 *   1. At rest the dot slot shows its state dot; the archive button is
 *      invisible (reserved slot only).
 *   2. On REAL hover the button fades in and the dot fades out — never both
 *      visible, and the swap happens inside the same slot anchor (button
 *      center x == dot center x).
 *   3. Zero displacement: the title's left edge (and the whole row grid)
 *      is identical at rest and on hover.
 *   4. Zero overlap: the visible button never covers the title text (its
 *      right edge stays left of the title).
 *   5. The right-click menu carries the nine entries in ZCode order, in
 *      three groups with hairlines between.
 *   6. Archiving hides the row from the sidebar; the trash button's archive
 *      view lists it; restore brings the row back.
 *
 * Seeding: an isolated session store (PICODE_SESSION_DIR tmpdir) with one
 * three-session project group, all backdated so every row is settled.
 *
 * Captures (PNGs land in the visual out dir):
 *   cm1-context-menu   — the nine-item menu open at a row
 *   cm2-archived-row   — sidebar after archiving (row gone, toast visible)
 *   cm3-archive-view   — the trash button's archive list + restore button
 *   cm4-restored       — the row back in the task list
 *
 * Plus cm-context-menu.json — the raw measurement dump (density-probe
 * convention).
 */

import { mkdirSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { app, type BrowserWindow } from 'electron'
import { visualOutDir } from './visual'
import { ensureVisualProjectDir, ensureVisualStore, writeVisualSession } from './visual-store'

export function contextMenuVisualEnabled(): boolean {
  return process.env['PICODE_VISUAL_CONTEXT_MENU'] === '1'
}

/** The harness archives/restores through the REAL preferences channel —
 * throwaway userData, exactly like the row-geometry harness (its captures
 * pin through the real button). Called from index.ts at module scope,
 * BEFORE app.whenReady reads userData. */
export function isolateContextMenuUserData(): void {
  if (!contextMenuVisualEnabled()) return
  app.setPath('userData', path.join(tmpdir(), `picode-visual-cm-userdata-${process.pid}`))
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** REAL tmpdir dir (ticket 42): the cwd-liveness filter drops sessions
 * whose cwd is not a directory on disk; the basename keeps the group label. */
const GROUP_CWD = (): string => ensureVisualProjectDir('api-server')
/** Ages (days) of the three group sessions — all settled ("Nd ago"), empty
 * dot slots: the probe measures the idle grid, not live-state noise. */
const GROUP_AGES_DAYS = [3, 6, 9]

interface HoverGeom {
  titleLeft: number
  dot: { centerX: number; visible: boolean; opacity: string }
  arch: { left: number; right: number; centerX: number; visible: boolean; opacity: string }
}

/** Geometry + computed-style dump of one task row's slot region. */
function hoverProbe(file: string): string {
  return `(() => {
    const row = document.querySelector('[data-file="${file}"]')
    if (!(row instanceof Element)) return null
    const title = row.querySelector('.sb-task-title')
    const slot = row.querySelector('.sb-dot-slot')
    const dot = slot ? slot.querySelector('.sb-run-dot, .sb-live-dot, .sb-await-dot, .sb-unread-dot') : null
    const arch = row.querySelector('.sb-arch-btn')
    if (!title || !slot || !arch) return { error: 'row is missing a part' }
    const center = (el) => {
      const r = el.getBoundingClientRect()
      return r.left + r.width / 2
    }
    const archRect = arch.getBoundingClientRect()
    const dotStyle = dot ? getComputedStyle(dot) : null
    const archStyle = getComputedStyle(arch)
    return {
      titleLeft: title.getBoundingClientRect().left,
      dot: { centerX: dot ? center(dot) : center(slot), visible: dotStyle ? dotStyle.visibility === 'visible' && Number(dotStyle.opacity) > 0.05 : false, opacity: dotStyle ? dotStyle.opacity : '1' },
      arch: {
        left: archRect.left,
        right: archRect.right,
        centerX: center(arch),
        visible: archStyle.visibility === 'visible' && Number(archStyle.opacity) > 0.05,
        opacity: archStyle.opacity
      }
    }
  })()`
}

const MENU_PROBE = `(() => {
  const menu = document.querySelector('.sb-context-menu')
  if (!menu) return null
  return {
    groups: menu.querySelectorAll('.sb-context-group').length,
    items: [...menu.querySelectorAll('.sb-context-item')].map((el) => el.textContent)
  }
})()`

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

async function measure(getWindow: () => BrowserWindow | null, probe: string): Promise<unknown> {
  const win = getWindow()
  if (!win) return null
  return win.webContents.executeJavaScript(probe).catch(() => null)
}

async function capture(win: BrowserWindow, name: string): Promise<void> {
  const png = await win.webContents.capturePage()
  const file = path.join(visualOutDir(), `${name}.png`)
  writeFileSync(file, png.toPNG())
  console.log(`VISUAL captured ${file}`)
}

/** CSS :hover only follows REAL input events (m3 precedent). Electron hover
 * is frame-aligned: the second move re-issues the hit test. */
async function hoverPoint(win: BrowserWindow, x: number, y: number): Promise<void> {
  win.webContents.sendInputEvent({ type: 'mouseMove', x, y })
  await sleep(120)
  win.webContents.sendInputEvent({ type: 'mouseMove', x, y })
  await sleep(120)
}

function mouseClick(win: BrowserWindow, x: number, y: number): void {
  win.webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 })
  win.webContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 })
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

// ---- assertion helpers (tolerances absorb sub-pixel rounding only) --------

const PX = 0.75

function assertClose(actual: number, expected: number, what: string): void {
  if (Math.abs(actual - expected) > PX) {
    throw new Error(`context-menu visual: ${what} — expected ~${expected}, got ${actual}`)
  }
}

function assert(cond: boolean, what: string): void {
  if (!cond) throw new Error(`context-menu visual: ${what}`)
}

const EXPECTED_ITEMS = [
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

export function startContextMenuVisualIfEnabled(getWindow: () => BrowserWindow | null): void {
  if (!contextMenuVisualEnabled()) return

  // Seeding must precede the session index construction (it reads
  // PICODE_SESSION_DIR once) — same constraint as the other store harnesses.
  const store = ensureVisualStore()
  const backdate = (file: string, days: number): void => {
    const then = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    utimesSync(file, then, then)
  }
  const files: string[] = []
  for (let i = 0; i < GROUP_AGES_DAYS.length; i++) {
    const file = writeVisualSession(store, {
      id: `context-menu-${i}`,
      cwd: GROUP_CWD(),
      userText: `Archive probe task number ${i + 1}`
    })
    backdate(file, GROUP_AGES_DAYS[i])
    files.push(file)
  }
  const targetFile = files[0] as string

  void (async () => {
    const measurements: Record<string, unknown> = {}
    try {
      mkdirSync(visualOutDir(), { recursive: true })
      for (let waited = 0; waited < 15_000; waited += 100) {
        if (getWindow()) break
        await sleep(100)
      }
      const win = getWindow()
      if (!win) throw new Error('context-menu visual: no window')

      // The seeded rows must reach the sidebar (index poll cadence ~2s).
      const rows = await waitFor(getWindow, `document.querySelectorAll('.sb-task').length >= 3`, 20_000)
      if (!rows) {
        const diag = (await win.webContents
          .executeJavaScript(
            `JSON.stringify({ tasks: document.querySelectorAll('.sb-task').length, files: [...document.querySelectorAll('.sb-task')].map((el) => el.getAttribute('data-file')) })`
          )
          .catch(() => 'diag failed')) as string
        throw new Error(`context-menu visual: seeded sessions never reached the sidebar ${diag}`)
      }
      await sleep(400)

      // ---- hover swap: dot out, archive button in, nothing moves ---------
      const rowPoint = (await pointOf(win, `[data-file="${targetFile}"]`)) ?? null
      if (!rowPoint) {
        const diag = (await win.webContents
          .executeJavaScript(
            `JSON.stringify([...document.querySelectorAll('.sb-task')].map((el) => el.getAttribute('data-file')))`
          )
          .catch(() => 'diag failed')) as string
        throw new Error(`context-menu visual: target row not clickable (want ${targetFile}); rows: ${diag}`)
      }
      const rest = (await measure(getWindow, hoverProbe(targetFile))) as HoverGeom | 'error' | null
      if (!rest || rest === 'error') throw new Error(`context-menu visual: no rest geometry: ${String(rest)}`)
      assert(!rest.arch.visible, 'rest: the archive button must be invisible (reserved slot only)')
      measurements.rest = rest

      await hoverPoint(win, rowPoint.x, rowPoint.y)
      let hovered: HoverGeom | null = null
      for (let waited = 0; waited < 5_000; waited += 120) {
        const g = (await measure(getWindow, hoverProbe(targetFile))) as HoverGeom | 'error' | null
        if (g && g !== 'error' && g.arch.visible && !g.dot.visible) {
          hovered = g
          break
        }
        await sleep(120)
      }
      if (!hovered) throw new Error('context-menu visual: hover never swapped the dot for the archive button')
      // Same anchor: the button replaces the dot IN the slot.
      assertClose(hovered.arch.centerX, rest.dot.centerX, 'button must be centered on the dot slot anchor')
      // Zero displacement: the row grid never moves.
      assertClose(hovered.titleLeft, rest.titleLeft, 'title left edge must not move on hover')
      // Zero overlap: the button never reaches the title.
      assert(hovered.arch.right <= hovered.titleLeft + PX, 'archive button must not overlap the title')
      measurements.hovered = hovered
      await capture(win, 'cm1-hover-archive-btn')

      // ---- right-click: the nine-item menu -------------------------------
      rightClick(win, rowPoint.x, rowPoint.y)
      let menuOpen = false
      let menu: { groups: number; items: string[] } | null = null
      for (let waited = 0; waited < 5_000; waited += 120) {
        menu = (await measure(getWindow, MENU_PROBE)) as { groups: number; items: string[] } | null
        if (menu !== null) {
          menuOpen = true
          break
        }
        await sleep(120)
      }
      if (!menuOpen || menu === null) throw new Error('context-menu visual: right-click never opened the menu')
      assert(menu.groups === 3, `menu must have three groups (got ${menu.groups})`)
      if (JSON.stringify(menu.items) !== JSON.stringify(EXPECTED_ITEMS)) {
        throw new Error(`context-menu visual: menu items/order wrong: ${menu.items.join(' | ')}`)
      }
      measurements.menu = menu
      await capture(win, 'cm2-context-menu')

      // ---- Pin task (through the menu), then re-open: the entry must flip
      // to "Unpin task" (z-context-menu.png's 置顶任务/取消置顶 flip) --------
      const pinItem = (await pointOf(win, `[data-menu-action="toggle-pin"]`)) ?? null
      if (!pinItem) throw new Error('context-menu visual: Pin item not clickable')
      mouseClick(win, pinItem.x, pinItem.y)
      const pinnedShown = await waitFor(
        getWindow,
        `document.querySelector('[data-file="${targetFile}"] .sb-pin-btn.sb-pin-on') !== null`,
        10_000
      )
      assert(pinnedShown, 'menu Pin task never pinned the row')
      // The pinned row moved to the Pinned section — re-measure before the
      // re-open right-click.
      const pinnedRowPoint = (await pointOf(win, `[data-file="${targetFile}"]`)) ?? null
      if (!pinnedRowPoint) throw new Error('context-menu visual: pinned row not clickable')
      rightClick(win, pinnedRowPoint.x, pinnedRowPoint.y)
      const flipMenu = (await measure(getWindow, MENU_PROBE)) as { groups: number; items: string[] } | null
      if (flipMenu === null) throw new Error('context-menu visual: menu never re-opened for the pin flip')
      assert(flipMenu.items[0] === 'Unpin task', `pinned row's first menu entry must read "Unpin task" (got ${String(flipMenu.items[0])})`)

      // ---- Archive the PINNED row (menu path): the row leaves the lists
      // AND the pin with it — pinned and archived never conflict (ticket 35:
      // 置顶归档隐含取消置顶) --------------------------------------------
      const archiveItem2 = (await pointOf(win, `[data-menu-action="archive"]`)) ?? null
      if (!archiveItem2) throw new Error('context-menu visual: Archive item not clickable (pinned round)')
      mouseClick(win, archiveItem2.x, archiveItem2.y)
      const rowGone = await waitFor(getWindow, `document.querySelector('[data-file="${targetFile}"]') === null`, 10_000)
      if (!rowGone) throw new Error('context-menu visual: archiving never removed the row')
      const unpinHeld = await waitFor(
        getWindow,
        `document.querySelector('.sb-pin-btn.sb-pin-on') === null`,
        5_000
      )
      assert(unpinHeld, 'archiving the pinned row must unpin it (no pinned row may survive)')
      const toastShown = await waitFor(getWindow, `document.body.textContent.includes('Task archived')`, 3_000)
      assert(toastShown, 'archiving must confirm with a toast')
      measurements.archivedRemainingRows = await win.webContents.executeJavaScript(
        `document.querySelectorAll('.sb-task').length`
      )
      await capture(win, 'cm3-archived-hidden')

      // ---- trash button → archive view -----------------------------------
      const trash = (await pointOf(win, `button[aria-label="Archived tasks"]`)) ?? null
      if (!trash) throw new Error('context-menu visual: trash button missing')
      mouseClick(win, trash.x, trash.y)
      const viewShown = await waitFor(getWindow, `document.querySelector('.sb-archived') !== null`, 5_000)
      if (!viewShown) throw new Error('context-menu visual: trash button never opened the archive view')
      const listedBack = await waitFor(
        getWindow,
        `document.querySelector('.sb-archived [data-file="${targetFile}"]') !== null`,
        5_000
      )
      assert(listedBack, 'the archived row must be listed in the archive view')
      await capture(win, 'cm4-archive-view')

      // ---- one-click restore ---------------------------------------------
      const restore = (await pointOf(win, `.sb-archived [data-file="${targetFile}"] .sb-restore-btn`)) ?? null
      if (!restore) throw new Error('context-menu visual: restore button missing')
      mouseClick(win, restore.x, restore.y)
      const restoredGone = await waitFor(
        getWindow,
        `document.querySelector('.sb-archived [data-file="${targetFile}"]') === null`,
        10_000
      )
      assert(restoredGone, 'restore must remove the row from the archive view')
      // Back to the task list: the row is present again.
      const backBtn = (await pointOf(win, `button[aria-label="Back to tasks"]`)) ?? null
      if (!backBtn) throw new Error('context-menu visual: back button missing')
      mouseClick(win, backBtn.x, backBtn.y)
      const rowBack = await waitFor(getWindow, `document.querySelector('[data-file="${targetFile}"]') !== null`, 10_000)
      assert(rowBack, 'the restored row must return to the task list')
      // The back click must have LEFT the archive view — a row matching the
      // selector inside a still-open archive view would be a false positive.
      const archiveClosed = await waitFor(getWindow, `document.querySelector('.sb-archived') === null`, 5_000)
      assert(archiveClosed, 'leaving the archive view never returned to the task list')
      await capture(win, 'cm5-restored')

      // ---- archive the dump (density-probe convention) ---------------------
      const jsonPath = path.join(visualOutDir(), 'cm-context-menu.json')
      writeFileSync(jsonPath, JSON.stringify(measurements, null, 2))
      console.log(`VISUAL measured ${jsonPath}`)
      console.log(JSON.stringify(measurements, null, 2))
      console.log('VISUAL context-menu done — all invariants held')
      app.exit(0)
    } catch (err) {
      console.error('VISUAL context-menu FAIL', err)
      try {
        const jsonPath = path.join(visualOutDir(), 'cm-context-menu.json')
        writeFileSync(jsonPath, JSON.stringify(measurements, null, 2))
      } catch {
        // dump best-effort; the failure report above is what matters
      }
      app.exit(1)
    }
  })()
}
