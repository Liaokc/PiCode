/**
 * Row-geometry visual-QA harness (ticket 34). Enabled with PICODE_VISUAL=1
 * plus PICODE_VISUAL_ROW_GEOMETRY=1. NOT part of `npm test` — but unlike the
 * screenshot-only harnesses it ASSERTS its probe results (exit 1 on any
 * violation), density-probe style: the sidebar row grid is geometry, and
 * geometry is measurable, not eyeballable.
 *
 * The invariants under test (grilling Q5, decision a — pin at the row END,
 * ZCode's row-start pin explicitly rejected):
 *
 *   1. Row order is [dot slot][title][time][pin] with the pin flush at the
 *      row end — for pinned AND unpinned rows alike.
 *   2. The time is a FIXED-WIDTH slot: its width is identical across rows
 *      and unchanged while hovered; hover fades ONLY the text
 *      (opacity/visibility, ~150ms), so nothing in the row ever shifts.
 *   3. Pin x is INVARIANT: unpinned at rest == unpinned hovered ==
 *      pinned at rest == pinned hovered (same reserved slot everywhere).
 *   4. Transitions are fades: opacity+visibility at ~150ms, no display
 *      flipping.
 *   5. Show more / Show less text left edge sits on the session-title text
 *      grid (x=34 within a group row), not on the status dot.
 *
 * Seeding: an isolated session store (PICODE_SESSION_DIR tmpdir) with one
 * seven-session project group (drives Show more/less) and one other-project
 * session that the harness pins through the REAL pin button. Files are
 * backdated so every row shows a settled "Nd ago" time and an empty dot
 * slot — the probe measures the idle grid, not live-state noise.
 *
 * Captures (PNGs land in the visual out dir):
 *   rg1-sidebar-rest     — idle grid: times right-aligned, no pins visible
 *   rg2-row-hover        — unpinned row hovered: pin faded in, time faded out
 *   rg3-pinned-rest      — Pinned section: orange pin + time, both visible
 *   rg4-pinned-hover     — pinned row hovered: time gone, pin NOT moved
 *   rg5-show-more-expanded — Show less state, label on the title grid
 *
 * Plus rg-row-geometry.json — the raw measurement dump for the archive
 * trail (density-probe convention).
 */

import { mkdirSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { app, type BrowserWindow } from 'electron'
import { visualOutDir } from './visual'
import { ensureVisualProjectDir, ensureVisualStore, writeVisualSession } from './visual-store'

export function rowGeometryVisualEnabled(): boolean {
  return process.env['PICODE_VISUAL_ROW_GEOMETRY'] === '1'
}

/** The harness pins a session through the REAL pin button, which writes the
 * pin preference — so the run gets throwaway userData, exactly like the
 * multi-session harness (its captures drive real settings too). Called from
 * index.ts at module scope, BEFORE app.whenReady reads userData. */
export function isolateRowGeometryUserData(): void {
  if (!rowGeometryVisualEnabled()) return
  app.setPath('userData', path.join(tmpdir(), `picode-visual-rg-userdata-${process.pid}`))
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** The project group seeded with more than SHOW_FIRST (5) sessions so the
 * sidebar shows "Show more". REAL tmpdir dirs (ticket 42): the cwd-liveness
 * filter drops sessions whose cwd is not a directory on disk; basenames
 * keep the 'api-server' / 'web-app' group labels. */
const GROUP_CWD = (): string => ensureVisualProjectDir('api-server')
const PIN_CWD = (): string => ensureVisualProjectDir('web-app')
/** Ages (days) of the seven group sessions. Day 0 stays fresh on purpose:
 * its time reads "just now" — the LONGEST string the slot must hold — and
 * its live dot proves the fixed dot slot survives the new row grid. */
const GROUP_AGES_DAYS = [0, 2, 3, 5, 9, 12, 15, 20]
const PIN_TARGET_AGE_DAYS = 4

interface RowGeom {
  row: { left: number; right: number; top: number; bottom: number; width: number }
  dot: { left: number; right: number }
  title: { left: number }
  time: { left: number; right: number; width: number; clientWidth: number; scrollWidth: number }
  pin: { left: number; right: number; width: number }
  timeStyle: { visibility: string; opacity: string; transitionDuration: string; textAlign: string }
  pinStyle: { visibility: string; opacity: string; transitionDuration: string; color: string }
}

/** Full geometry + computed-style dump of one task row. */
function rowProbe(file: string): string {
  return `(() => {
    const row = document.querySelector('[data-file="${file}"]')
    if (!(row instanceof Element)) return null
    const rect = (el) => {
      const b = el.getBoundingClientRect()
      return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width }
    }
    const slot = row.querySelector('.sb-dot-slot')
    const title = row.querySelector('.sb-task-title')
    const time = row.querySelector('.sb-task-time')
    const pin = row.querySelector('.sb-pin-btn')
    if (slot === null || title === null || time === null || pin === null) {
      return { error: 'row is missing a part', html: row.innerHTML.slice(0, 300) }
    }
    const style = (el) => {
      const s = getComputedStyle(el)
      return { visibility: s.visibility, opacity: s.opacity, transitionDuration: s.transitionDuration }
    }
    const timeRect = rect(time)
    const pinRect = rect(pin)
    return {
      row: rect(row),
      dot: rect(slot),
      title: rect(title),
      time: { ...timeRect, clientWidth: time.clientWidth, scrollWidth: time.scrollWidth },
      pin: pinRect,
      timeStyle: { ...style(time), textAlign: getComputedStyle(time).textAlign },
      pinStyle: { ...style(pin), color: getComputedStyle(pin).color }
    }
  })()`
}

/** Left edge of an element's TEXT (first line box), not its box — the
 * show-more/grid alignment is about glyphs. Uses a Range over contents. */
const TEXT_ALIGNMENT_PROBE = `(() => {
  const textLeft = (el) => {
    if (!(el instanceof Element)) return null
    const range = document.createRange()
    range.selectNodeContents(el)
    const rects = range.getClientRects()
    return rects.length > 0 ? rects[0].left : null
  }
  const more = [...document.querySelectorAll('.sb-show-more')].find((el) =>
    (el.textContent ?? '').trim().startsWith('Show')
  )
  const title = document.querySelector('.sb-group .sb-task-title')
  const row = document.querySelector('.sb-group .sb-task')
  if (more === null || title === null || row === null) return null
  return {
    label: (more.textContent ?? '').trim(),
    moreTextLeft: textLeft(more),
    titleTextLeft: textLeft(title),
    rowLeft: row.getBoundingClientRect().left
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

async function measureRow(win: BrowserWindow, file: string): Promise<RowGeom> {
  const raw = (await win.webContents.executeJavaScript(rowProbe(file)).catch(() => null)) as RowGeom | null
  const failure = raw as unknown as { error?: string } | null
  if (raw === null || failure?.error !== undefined) {
    throw new Error(`row-geometry visual: no geometry for ${path.basename(file)}: ${JSON.stringify(raw)}`)
  }
  return raw
}

/** Measure until the row's fade state settles (hover in / hover out). A
 * fixed sleep races the 150ms transition and the input hit-test; poll the
 * computed styles instead. */
async function waitForRow(
  win: BrowserWindow,
  file: string,
  what: string,
  pred: (g: RowGeom) => boolean
): Promise<RowGeom> {
  let last: RowGeom | null = null
  for (let waited = 0; waited < 5_000; waited += 120) {
    last = await measureRow(win, file)
    if (pred(last)) return last
    await sleep(120)
  }
  throw new Error(`row-geometry visual: ${what} never settled (last: ${JSON.stringify(last?.timeStyle)} / ${JSON.stringify(last?.pinStyle)})`)
}

async function measureTextAlignment(win: BrowserWindow): Promise<{
  label: string
  moreTextLeft: number
  titleTextLeft: number
  rowLeft: number
}> {
  const raw = (await win.webContents.executeJavaScript(TEXT_ALIGNMENT_PROBE).catch(() => null)) as {
    label: string
    moreTextLeft: number
    titleTextLeft: number
    rowLeft: number
  } | null
  if (raw === null || raw.moreTextLeft === null || raw.titleTextLeft === null) {
    throw new Error('row-geometry visual: show-more / title alignment probe found nothing')
  }
  return raw
}

async function capture(win: BrowserWindow, name: string): Promise<void> {
  const png = await win.webContents.capturePage()
  const file = path.join(visualOutDir(), `${name}.png`)
  writeFileSync(file, png.toPNG())
  console.log(`VISUAL captured ${file}`)
}

/** CSS :hover only follows REAL input events (m3 precedent) — the harness
 * moves the pointer, it never toggles classes by hand. Electron hover is
 * frame-aligned: the second move re-issues the hit test after the first
 * lands, a known quirk when teleporting the pointer across containers. */
async function mouseMove(win: BrowserWindow, x: number, y: number): Promise<void> {
  win.webContents.sendInputEvent({ type: 'mouseMove', x, y })
}

async function hoverPoint(win: BrowserWindow, x: number, y: number): Promise<void> {
  await mouseMove(win, x, y)
  await sleep(120)
  await mouseMove(win, x, y)
}

async function mouseClick(win: BrowserWindow, x: number, y: number): Promise<void> {
  win.webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 })
  win.webContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 })
}

/** Pointer parking spot: the sidebar's action rows — no .sb-task under it. */
const NEUTRAL = { x: 120, y: 40 }

// ---- assertion helpers (tolerances absorb sub-pixel rounding only) --------

const PX = 0.75

function assertClose(actual: number, expected: number, what: string): void {
  if (Math.abs(actual - expected) > PX) {
    throw new Error(`row-geometry visual: ${what} — expected ~${expected}, got ${actual}`)
  }
}

function assert(cond: boolean, what: string): void {
  if (!cond) throw new Error(`row-geometry visual: ${what}`)
}

/** op/visibility ~150ms: every transitionDuration entry must be 0.15s. */
function assertFade(style: { transitionDuration: string }, what: string): void {
  const entries = style.transitionDuration.split(',').map((s) => s.trim())
  assert(entries.length >= 2, `${what}: opacity+visibility must both transition (got ${style.transitionDuration})`)
  for (const entry of entries) {
    assert(entry === '0.15s', `${what}: fade must be ~150ms (got ${entry})`)
  }
}

/** The invariant itself: [dot][title][time][pin], pin flush at the row end. */
function assertRowOrder(g: RowGeom, what: string): void {
  assert(g.dot.right <= g.title.left + PX, `${what}: dot slot must precede the title`)
  assert(g.title.left < g.time.left, `${what}: title must precede the time slot`)
  assert(g.time.right <= g.pin.left + PX, `${what}: time slot must precede the pin (pin is LAST)`)
  assertClose(g.row.right - g.pin.right, 10, `${what}: pin must sit flush at the row end (10px pad)`)
  assert(g.time.scrollWidth <= g.time.clientWidth + PX, `${what}: time text must not clip in its fixed slot`)
  assert(g.timeStyle.textAlign === 'right', `${what}: time text must be right-aligned in its slot`)
}

/** The time slot is fixed-width: hover (or anything else) never resizes it. */
function assertSlotStable(a: RowGeom, b: RowGeom, what: string): void {
  assertClose(a.time.width, b.time.width, `${what}: time slot width must not change`)
  assertClose(a.pin.left, b.pin.left, `${what}: pin x must not change`)
  assertClose(a.pin.right, b.pin.right, `${what}: pin right edge must not change`)
}

export function startRowGeometryVisualIfEnabled(getWindow: () => BrowserWindow | null): void {
  if (!rowGeometryVisualEnabled()) return

  // Seeding must precede the session index construction (it reads
  // PICODE_SESSION_DIR once) — same constraint as the other store harnesses.
  const store = ensureVisualStore()
  const backdate = (file: string, days: number): void => {
    const then = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    utimesSync(file, then, then)
  }
  const groupFiles: string[] = []
  for (let i = 0; i < GROUP_AGES_DAYS.length; i++) {
    const file = writeVisualSession(store, {
      id: `row-geometry-g${i}`,
      cwd: GROUP_CWD(),
      userText: `Calibrate the row grid sample task number ${i + 1}`
    })
    backdate(file, GROUP_AGES_DAYS[i])
    groupFiles.push(file)
  }
  const pinFile = writeVisualSession(store, {
    id: 'row-geometry-pin',
    cwd: PIN_CWD(),
    userText: 'Pin this task to verify the pinned-row geometry'
  })
  backdate(pinFile, PIN_TARGET_AGE_DAYS)

  void (async () => {
    const measurements: Record<string, unknown> = {}
    try {
      mkdirSync(visualOutDir(), { recursive: true })
      for (let waited = 0; waited < 15_000; waited += 100) {
        const w = getWindow()
        if (w) break
        await sleep(100)
      }
      const win = getWindow()
      if (!win) throw new Error('row-geometry visual: no window')

      // The seeded rows must reach the sidebar (index poll cadence ~2s):
      // five group rows (SHOW_FIRST truncates the seven-session group) plus
      // the pin target.
      const rows = await waitFor(
        getWindow,
        `document.querySelectorAll('.sb-task').length >= 6`,
        20_000
      )
      if (!rows) {
        const diag = (await win.webContents
          .executeJavaScript(
            `JSON.stringify((() => ({
              ready: document.documentElement.dataset['chatSubscribed'],
              sidebar: document.querySelector('.sidebar') !== null,
              tasks: document.querySelectorAll('.sb-task').length,
              body: document.body.className,
              storeHint: location.href
            }))())`,
            true
          )
          .catch((err: unknown) => `diag failed: ${String(err)}`)) as string
        throw new Error(`row-geometry visual: seeded sessions never reached the sidebar ${diag}`)
      }
      await sleep(400)

      // Park the pointer so no row is hovered.
      await mouseMove(win, NEUTRAL.x, NEUTRAL.y)
      await sleep(200)

      // ---- rg1: idle grid -------------------------------------------------
      await capture(win, 'rg1-sidebar-rest')

      const groupRowFile = groupFiles[0]
      const rest = await measureRow(win, pinFile)
      const groupRest = await measureRow(win, groupRowFile)
      assertRowOrder(rest, 'rest/pin-target')
      assertRowOrder(groupRest, 'rest/group-row')
      assert(rest.pinStyle.visibility === 'hidden' && rest.pinStyle.opacity === '0',
        'rest: the unpinned pin must be invisible (reserved slot only)')
      assert(rest.timeStyle.visibility === 'visible' && rest.timeStyle.opacity === '1',
        'rest: the time text must be visible')
      assertFade(rest.timeStyle, 'time slot')
      assertFade(rest.pinStyle, 'pin button')
      // The fixed-width slot is the SAME width in every row.
      assertClose(rest.time.width, groupRest.time.width, 'fixed slot: pinned-target vs group row')
      measurements.rest = { pinTarget: rest, groupRow: groupRest }

      // ---- unpinned hover: pin fades in, time fades out, nothing moves ----
      const rowPoint = {
        x: Math.round((rest.row.left + rest.row.right) / 2),
        y: Math.round((rest.row.top + rest.row.bottom) / 2)
      }
      await hoverPoint(win, rowPoint.x, rowPoint.y)
      const hovered = await waitForRow(win, pinFile, 'unpinned hover fade', (g) =>
        g.pinStyle.visibility === 'visible' && g.pinStyle.opacity === '1' &&
        g.timeStyle.visibility === 'hidden' && g.timeStyle.opacity === '0'
      )
      assertRowOrder(hovered, 'hover/unpinned')
      assertSlotStable(rest, hovered, 'unpinned hover')
      assert(hovered.pinStyle.visibility === 'visible' && hovered.pinStyle.opacity === '1',
        'unpinned hover: the pin must be visible')
      assert(hovered.timeStyle.visibility === 'hidden' && hovered.timeStyle.opacity === '0',
        'unpinned hover: only the time TEXT hides (slot kept)')
      measurements.unpinnedHover = hovered
      await capture(win, 'rg2-row-hover')

      // ---- pin it through the REAL button ---------------------------------
      await mouseClick(win, Math.round(hovered.pin.left + hovered.pin.width / 2), rowPoint.y)
      const pinnedShown = await waitFor(
        getWindow,
        `(() => {
          const pin = document.querySelector('[data-file="${pinFile}"] .sb-pin-btn.sb-pin-on')
          return pin !== null && pin.getBoundingClientRect().width > 0
        })()`,
        10_000
      )
      if (!pinnedShown) throw new Error('row-geometry visual: pin click never pinned the row')
      await mouseMove(win, NEUTRAL.x, NEUTRAL.y)

      // ---- pinned rest: orange pin + time, pin in the SAME slot -----------
      const pinnedRest = await waitForRow(win, pinFile, 'pinned rest settle', (g) =>
        g.timeStyle.visibility === 'visible' && g.timeStyle.opacity === '1' &&
        g.pinStyle.visibility === 'visible' && g.pinStyle.opacity === '1'
      )
      assertRowOrder(pinnedRest, 'pinned rest')
      assert(pinnedRest.pinStyle.visibility === 'visible' && pinnedRest.pinStyle.opacity === '1',
        'pinned rest: the pin must be visible without hover')
      assert(pinnedRest.timeStyle.visibility === 'visible',
        'pinned rest: the time stays visible next to the pin')
      assert(pinnedRest.pinStyle.color === 'rgb(236, 121, 49)',
        `pinned rest: the pin must be orange (got ${pinnedRest.pinStyle.color})`)
      // Same-position guarantee across row states (ticket 34 core): the
      // pinned row's pin x equals the unpinned row's hover pin x.
      assertClose(pinnedRest.pin.left, hovered.pin.left, 'same slot: pinned rest vs unpinned hover (pin left)')
      assertClose(pinnedRest.pin.right, hovered.pin.right, 'same slot: pinned rest vs unpinned hover (pin right)')
      assertClose(pinnedRest.time.width, groupRest.time.width, 'fixed slot: pinned row vs group row')
      measurements.pinnedRest = pinnedRest
      await capture(win, 'rg3-pinned-rest')

      // ---- pinned hover: ONLY the time text fades; the pin does not move --
      const pinnedPoint = {
        x: Math.round((pinnedRest.row.left + pinnedRest.row.right) / 2),
        y: Math.round((pinnedRest.row.top + pinnedRest.row.bottom) / 2)
      }
      await hoverPoint(win, pinnedPoint.x, pinnedPoint.y)
      const pinnedHovered = await waitForRow(win, pinFile, 'pinned hover fade', (g) =>
        g.timeStyle.visibility === 'hidden' && g.timeStyle.opacity === '0'
      )
      assertRowOrder(pinnedHovered, 'pinned hover')
      // THE assertion of this ticket: pin x is invariant across the hover.
      assertSlotStable(pinnedRest, pinnedHovered, 'pinned hover')
      assertClose(pinnedRest.pin.left, rest.pin.left,
        'zero displacement: pinned-hover pin == unpinned-rest reserved slot')
      assert(pinnedHovered.timeStyle.visibility === 'hidden' && pinnedHovered.timeStyle.opacity === '0',
        'pinned hover: the time text fades out')
      assert(pinnedHovered.pinStyle.visibility === 'visible',
        'pinned hover: the pin stays visible')
      measurements.pinnedHover = pinnedHovered
      await capture(win, 'rg4-pinned-hover')

      // ---- Show more / Show less alignment (x=34 title grid) --------------
      await mouseMove(win, NEUTRAL.x, NEUTRAL.y)
      await sleep(200)
      const collapsed = await measureTextAlignment(win)
      assert(collapsed.label === 'Show more', `expected the collapsed label (got ${collapsed.label})`)
      assertClose(collapsed.moreTextLeft, collapsed.titleTextLeft,
        'Show more text must align with the session-title text')
      assertClose(collapsed.titleTextLeft - collapsed.rowLeft, 34,
        'title text must sit at the x=34 grid line')
      measurements.showMoreCollapsed = collapsed

      // Expand: "Show less" must sit on the same grid line.
      const morePoint = (await win.webContents.executeJavaScript(
        `(() => {
          const more = [...document.querySelectorAll('.sb-show-more')].find((el) => (el.textContent ?? '').trim() === 'Show more')
          if (!(more instanceof Element)) return null
          const r = more.getBoundingClientRect()
          return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
        })()`
      ).catch(() => null)) as { x: number; y: number } | null
      if (morePoint === null) throw new Error('row-geometry visual: Show more row not clickable')
      await mouseClick(win, morePoint.x, morePoint.y)
      const expandedShown = await waitFor(
        getWindow,
        `[...document.querySelectorAll('.sb-show-more')].some((el) => (el.textContent ?? '').trim() === 'Show less')`,
        10_000
      )
      if (!expandedShown) throw new Error('row-geometry visual: Show more never expanded the group')
      await sleep(200)
      const expanded = await measureTextAlignment(win)
      assert(expanded.label === 'Show less', `expected the expanded label (got ${expanded.label})`)
      assertClose(expanded.moreTextLeft, expanded.titleTextLeft,
        'Show less text must align with the session-title text')
      measurements.showMoreExpanded = expanded
      await capture(win, 'rg5-show-more-expanded')

      // ---- archive the dump (density-probe convention) ---------------------
      const jsonPath = path.join(visualOutDir(), 'rg-row-geometry.json')
      writeFileSync(jsonPath, JSON.stringify(measurements, null, 2))
      console.log(`VISUAL measured ${jsonPath}`)
      console.log(JSON.stringify(measurements, null, 2))
      console.log('VISUAL row-geometry done — all invariants held')
      app.exit(0)
    } catch (err) {
      console.error('VISUAL row-geometry FAIL', err)
      try {
        const jsonPath = path.join(visualOutDir(), 'rg-row-geometry.json')
        writeFileSync(jsonPath, JSON.stringify(measurements, null, 2))
      } catch {
        // dump best-effort; the failure report above is what matters
      }
      app.exit(1)
    }
  })()
}
