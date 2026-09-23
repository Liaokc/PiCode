/**
 * Usage-page visual-QA harness (ticket 12, reference screenshot 09). Enabled
 * only with PICODE_VISUAL_USAGE=1 — pair with PICODE_FAKE_USAGE=1 so the
 * usage IPC serves the deterministic fixture (src/shared/usage/fixture.ts).
 * Drives the real UI through the settings shell and captures:
 *
 *   u1-usage-overview  — headline cards + Token activity heatmap (daily);
 *                        the 52×7 grid fully fits its container (no
 *                        horizontal scroll — ticket 140)
 *   u10-usage-narrow   — the same daily grid with the window resized to a
 *                        narrow width (~760px content, below the app's own
 *                        1040 minimum — the minimum is relaxed for the frame
 *                        and restored after): 52 columns × 7 rows all
 *                        rendered, columns shrink and share the width, no
 *                        horizontal overflow (ticket 140 narrow-window fit)
 *   u1b-usage-heat-daily-hover — real-input hover on an active daily box:
 *                        white card above the box (z19-heatmap-daily-2 form);
 *                        the hovered box keeps its deeper outline (daily
 *                        highlight retained — ticket 140)
 *   u2-usage-heat-weekly    — heatmap toggled to Weekly: the same 52×7
 *                        contribution grid re-colored week-start-to-day
 *                        (ticket 139, z19-heatmap-weekly-1)
 *   u2b-usage-heat-weekly-hover — real-input hover on the current week's
 *                        column: card above the column's topmost box + ring;
 *                        the hovered box's outline equals its column
 *                        siblings' (no deeper cell frame — ticket 140)
 *   u2c-usage-heat-cumulative — Cumulative mode: term-start-to-day boxes
 *                        (z19-heatmap-cumulative-1)
 *   u2d-usage-heat-cumulative-hover — real-input hover, card above the
 *                        current week's column ('Through … · This week',
 *                        z19-heatmap-cumulative-2; sibling-outline rule as
 *                        u2b — ticket 140)
 *   u3-usage-trend     — the per-model daily trend, fixed to a one-week
 *                        window (the Time Range switch row is retired —
 *                        ticket 140)
 *   u4-usage-donut     — model usage donut with legend shares (same fixed
 *                        one-week window — ticket 140)
 *   u5-usage-drilldown — drill-down panel after picking an active day
 *   u6-usage-trend-hover — trend hover: guide line + dots + white card
 *   u9-usage-donut-hover — donut arc hover white card (ZCode z13 anchor form)
 *
 * Retired frames (ticket 140, recorded in the ticket Comments): u7-usage-
 * trend-7d and u8-usage-trend-7d-hover — the 7/30 switch they exercised is
 * gone; u3 + u6 now capture the fixed one-week trend and its hover. The
 * tracked PNGs were removed from the repo in review round 1.
 *
 * PNGs land in $PICODE_VISUAL_OUT (default: <cwd>/.scratch/visual/). Not part
 * of `npm test`; a human compares them against the reference screenshots.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { app, type BrowserWindow, type WebContents } from 'electron'

export function usageVisualEnabled(): boolean {
  return process.env['PICODE_VISUAL_USAGE'] === '1'
}

function outDir(): string {
  return process.env['PICODE_VISUAL_OUT'] || path.join(process.cwd(), '.scratch', 'visual')
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

async function execute<T>(webContents: WebContents, script: string): Promise<T> {
  return (await webContents.executeJavaScript(script)) as T
}

async function click(webContents: WebContents, selector: string): Promise<boolean> {
  return execute<boolean>(
    webContents,
    `(() => {
      const el = document.querySelector(${JSON.stringify(selector)})
      if (el instanceof HTMLElement) {
        el.click()
        return true
      }
      return false
    })()`
  )
}

/** Click the first segmented button whose label text matches exactly. */
async function clickSeg(webContents: WebContents, ariaLabel: string, label: string): Promise<boolean> {
  return execute<boolean>(
    webContents,
    `(() => {
      const seg = [...document.querySelectorAll('.seg')].find((el) => el.getAttribute('aria-label') === ${JSON.stringify(ariaLabel)})
      const btn = [...(seg?.querySelectorAll('.seg-btn') ?? [])].find((b) => b.textContent?.trim() === ${JSON.stringify(label)})
      if (btn instanceof HTMLElement) {
        btn.click()
        return true
      }
      return false
    })()`
  )
}

/** Scroll the .usage-card containing `innerSelector` to the viewport top
 * (the trend/donut cards have no stable class of their own). */
async function scrollCard(webContents: WebContents, innerSelector: string): Promise<boolean> {
  return execute<boolean>(
    webContents,
    `(() => {
      const card = document.querySelector(${JSON.stringify(innerSelector)})?.closest('.usage-card')
      if (card instanceof HTMLElement) {
        card.scrollIntoView({ block: 'start' })
        return true
      }
      return false
    })()`
  )
}

async function scrollTo(webContents: WebContents, selector: string): Promise<boolean> {
  return execute<boolean>(
    webContents,
    `(() => {
      const el = document.querySelector(${JSON.stringify(selector)})
      if (el instanceof HTMLElement) {
        el.scrollIntoView({ block: 'start' })
        return true
      }
      return false
    })()`
  )
}

/** Dispatch a real-bubbling mousemove at a fractional position of an element
 * (React's delegated listeners treat it exactly like a native move). */
async function hoverAt(webContents: WebContents, selector: string, fx: number, fy: number): Promise<boolean> {
  return execute<boolean>(
    webContents,
    `(() => {
      const el = document.querySelector(${JSON.stringify(selector)})
      if (!el) return false
      const r = el.getBoundingClientRect()
      el.dispatchEvent(new MouseEvent('mousemove', {
        bubbles: true,
        clientX: r.left + r.width * ${fx},
        clientY: r.top + r.height * ${fy}
      }))
      return true
    })()`
  )
}

/** Leave an element with the pointer (mouseout with a body relatedTarget +
 * the non-bubbling mouseleave — the ticket-46 unhover recipe). */
async function unhover(webContents: WebContents, selector: string): Promise<boolean> {
  return execute<boolean>(
    webContents,
    `(() => {
      const el = document.querySelector(${JSON.stringify(selector)})
      if (!el) return false
      el.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }))
      el.dispatchEvent(new MouseEvent('mouseleave', { relatedTarget: document.body }))
      return true
    })()`
  )
}

/** Capture one frame. When `expect` is given, settle-poll the renderer until
 * the DOM holds the frame's expected state, then flush the compositor with a
 * discarded capturePage before the real one: a backgrounded (or just
 * changed) window otherwise hands back the PREVIOUSLY presented frame — the
 * review round's one-state-lag root cause (u1≡u1b, u2≡u2b, u2c≡u2d were
 * byte-identical pairs, each showing the prior state). Mirrors visual.ts's
 * background-throttling opt-out plus the batch's settle-poll precedent. */
async function capture(win: BrowserWindow, name: string, expect?: string): Promise<void> {
  if (expect !== undefined) {
    let ok = false
    for (let waited = 0; waited < 8_000 && !ok; waited += 200) {
      ok = await execute<boolean>(win.webContents, expect)
      if (!ok) await sleep(200)
    }
    if (!ok) throw new Error(`usage visual: frame ${name} never reached its expected DOM state`)
  }
  await win.webContents.capturePage() // compositor flush — discarded
  await sleep(150)
  const png = await win.webContents.capturePage()
  const file = path.join(outDir(), `${name}.png`)
  writeFileSync(file, png.toPNG())
  const sig = await execute<Record<string, unknown>>(
    win.webContents,
    `(() => ({
      cards: document.querySelectorAll('.stat-card').length,
      heatCells: document.querySelectorAll('.heat').length,
      series: document.querySelectorAll('.trend-legend-item').length,
      donutSlices: document.querySelectorAll('.donut-legend-row').length,
      drilldown: document.querySelectorAll('.drilldown').length,
      trendTooltip: document.querySelectorAll('.trend-tooltip').length,
      donutTooltip: document.querySelectorAll('.donut-tooltip').length,
      heatTooltip: document.querySelectorAll('.heat-tooltip').length
    }))()`
  )
  console.log(`VISUAL captured ${file} ${JSON.stringify(sig)}`)
}

// --- per-frame DOM expectations (the settle-poll probes) ----------------------

/** The Heatmap-mode segment control's active label equals `label`. */
const heatModeActive = (label: string): string =>
  `(() => {
    const seg = [...document.querySelectorAll('.seg')].find((el) => el.getAttribute('aria-label') === 'Heatmap mode')
    return (seg?.querySelector('.seg-btn-active')?.textContent ?? '').trim() === ${JSON.stringify(label)}
  })()`

/** The heat card is up and its text carries every `must` and no `forbid`
 * fragment (daily: date + 'tokens · messages'; weekly adds '· This week';
 * cumulative reads 'Through … · This week'). */
const heatCardShowing = (must: string[], forbid: string[] = []): string =>
  `(() => {
    const tip = document.querySelector('.heat-tooltip')
    if (!tip) return false
    const text = tip.textContent ?? ''
    return ${JSON.stringify(must)}.every((m) => text.includes(m))
      && ${JSON.stringify(forbid)}.every((m) => !text.includes(m))
  })()`

const noHeatCard = `document.querySelector('.heat-tooltip') === null`

/** The hovered column's ring is up (weekly/cumulative hover state). */
const heatColumnRing = `document.querySelector('.heatmap-col-hover') !== null`

/** The 52×7 grid fully fits its scroll box (ticket 140): no horizontal
 * overflow at any window width — the columns shrink with the container. */
const heatFitsContainer = `(() => {
  const scroll = document.querySelector('.heatmap-scroll')
  return scroll !== null && scroll.scrollWidth <= scroll.clientWidth + 1
})()`

/** All 364 day boxes render (52 columns × 7 rows — nothing dropped). */
const heatCellsAll = `document.querySelectorAll('.heat').length === 364`

/** The grid fills the scroll box's padded content and never spills past it
 * (ticket 140 narrow-window fit): the columns share the width instead of
 * keeping a fixed pitch that could overflow. */
const heatFillsContainer = `(() => {
  const scroll = document.querySelector('.heatmap-scroll')
  const grid = document.querySelector('.heatmap')
  if (!scroll || !grid) return false
  const g = grid.getBoundingClientRect()
  const s = scroll.getBoundingClientRect()
  return g.width >= s.width - 12 && g.right <= s.right + 1
})()`

/** Daily hover keeps its deeper box outline (ticket 140): the hovered box
 * under the real pointer carries a non-none outline (button.heat:hover). */
const dailyHoverBoxOutlined = `(() => {
  const el = document.querySelector('button.heat:hover')
  return el !== null && getComputedStyle(el).outlineStyle !== 'none'
})()`

/** weekly/cumulative hover shows ONLY the column ring (ticket 140): the
 * hovered box's computed outline equals a column sibling's — no deeper
 * cell frame on top of the ring. */
const hoverBoxMatchesSiblings = `(() => {
  const hovered = document.querySelector('.heatmap-col-hover button.heat:hover')
  if (!hovered) return false
  const col = hovered.closest('.heatmap-col')
  const sibling = [...col.querySelectorAll('.heat')].find((el) => el !== hovered)
  if (!sibling) return true
  const a = getComputedStyle(hovered)
  const b = getComputedStyle(sibling)
  return a.outlineStyle === b.outlineStyle && a.outlineWidth === b.outlineWidth && a.outlineColor === b.outlineColor
})()`

/** A section's top edge is inside the viewport (the scroll-to target landed). */
const sectionInView = (selector: string): string =>
  `(() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    if (!el) return false
    const r = el.getBoundingClientRect()
    return r.top >= 0 && r.top < window.innerHeight && r.bottom > 0
  })()`

export function startUsageVisualIfEnabled(getWindow: () => BrowserWindow | null): void {
  if (!usageVisualEnabled()) return

  void (async () => {
    try {
      mkdirSync(outDir(), { recursive: true })
      let win: BrowserWindow | null = null
      for (let waited = 0; waited < 15_000 && !win; waited += 100) {
        win = getWindow()
        if (win) {
          const ready = await win.webContents
            .executeJavaScript("document.documentElement.dataset['chatSubscribed'] === 'true'")
            .catch(() => false)
          if (ready !== true) win = null
        }
        if (!win) await sleep(100)
      }
      if (!win) throw new Error('usage visual: no window')
      const wc = win.webContents
      // The frames capture mode switches + hover cards — a backgrounded
      // window's renderer is compositor-throttled and capturePage then hands
      // back a stale presented frame (the one-state-lag review finding).
      // Opt this harness window out, same as visual.ts.
      win.webContents.setBackgroundThrottling(false)

      // Open the settings shell; the Usage section is the initial section.
      if (!(await click(wc, 'button[aria-label="Settings"]'))) throw new Error('usage visual: settings gear not found')
      let usageReady = false
      for (let waited = 0; waited < 10_000 && !usageReady; waited += 200) {
        usageReady = await execute<boolean>(
          wc,
          `document.querySelectorAll('.stat-card').length >= 5 && document.querySelectorAll('.heat').length > 0`
        )
        if (!usageReady) await sleep(200)
      }
      if (!usageReady) throw new Error('usage visual: usage page never rendered cards + heatmap')
      await sleep(400)
      await capture(
        win,
        'u1-usage-overview',
        `(${heatModeActive('Daily')}) && ${noHeatCard} && ${heatFitsContainer}`
      )

      // ---- ticket 140: the narrow-window fit frame (u10) ------------------
      // The columns must shrink and share the container at ANY width. The
      // app's own minimum is 1040px, so the harness relaxes it for this one
      // frame (~760px content — inside the review's 720–800px band), then
      // restores BOTH the minimum and the content size so every later frame
      // runs at the original geometry.
      {
        const [origW, origH] = win.getContentSize()
        const [minW, minH] = win.getMinimumSize()
        win.setMinimumSize(0, 0)
        win.setContentSize(760, origH)
        await sleep(400)
        await capture(
          win,
          'u10-usage-narrow',
          `(${heatModeActive('Daily')}) && ${noHeatCard} && ${heatCellsAll} && ${heatFitsContainer} && ${heatFillsContainer}`
        )
        win.setContentSize(origW, origH)
        win.setMinimumSize(minW, minH)
        await sleep(400)
      }

      // ---- ticket 139: the six heat frames (three modes × normal/hover) ----
      // Hover target: the LAST active box (the fixture's streak ends today,
      // so the current week's column always carries activity — the z19
      // frames' right-edge cluster). The grid never scrolls (ticket 140),
      // so every box is reachable where it lays.
      const todayBox = await execute<{ x: number; y: number } | null>(
        wc,
        `(() => {
          const cells = [...document.querySelectorAll('button.heat')]
          const cell = cells[cells.length - 1]
          if (!cell) return null
          cell.scrollIntoView({ block: 'center' })
          const r = cell.getBoundingClientRect()
          if (r.width === 0) return null
          return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
        })()`
      )
      if (!todayBox) throw new Error('usage visual: no active heat box to hover')
      // The programmatic scroll flashes the overlay scrollbar — park the real
      // cursor away and let the fade finish before any hover frame.
      win.webContents.sendInputEvent({ type: 'mouseMove', x: 60, y: 60 })
      await sleep(2_000)
      const hoverBoxAndSettle = async (): Promise<void> => {
        // React-driven hover: dispatch on the box itself (the card and the
        // column ring are React state, not CSS), then a real-input move to
        // the same point for the CSS :hover outline.
        const opened = await execute<boolean>(
          wc,
          `(() => {
            const cells = [...document.querySelectorAll('button.heat')]
            const cell = cells[cells.length - 1]
            if (!cell) return false
            const r = cell.getBoundingClientRect()
            cell.dispatchEvent(new MouseEvent('mousemove', {
              bubbles: true,
              clientX: r.left + r.width / 2,
              clientY: r.top + r.height / 2
            }))
            return true
          })()`
        )
        if (!opened) throw new Error('usage visual: no active heat box to hover')
        win.webContents.sendInputEvent({ type: 'mouseMove', x: todayBox.x, y: todayBox.y })
        let heatTip = false
        for (let waited = 0; waited < 5_000 && !heatTip; waited += 200) {
          heatTip = await execute<boolean>(wc, `document.querySelectorAll('.heat-tooltip').length > 0`)
          if (!heatTip) await sleep(200)
        }
        if (!heatTip) throw new Error('usage visual: heat box hover never opened the white-card tooltip')
        await sleep(300)
      }
      const unhoverBox = async (): Promise<void> => {
        // The card clears on the WRAP's mouseleave — dispatch there (the
        // trend/donut unhover recipe), plus a real move well outside the
        // grid for the CSS :hover state.
        await execute<boolean>(
          wc,
          `(() => {
            const wrap = document.querySelector('.heatmap-wrap')
            if (!wrap) return false
            wrap.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }))
            wrap.dispatchEvent(new MouseEvent('mouseleave', { relatedTarget: document.body }))
            return true
          })()`
        )
        win.webContents.sendInputEvent({ type: 'mouseMove', x: 60, y: 60 })
        await sleep(300)
      }

      // Daily hover (u1b) — card above the hovered box; the box keeps its
      // deeper outline (daily highlight retained, ticket 140).
      await hoverBoxAndSettle()
      await capture(
        win,
        'u1b-usage-heat-daily-hover',
        `(${heatModeActive('Daily')}) && (${heatCardShowing(['tokens', 'messages'], ['This week'])}) && ${dailyHoverBoxOutlined}`
      )
      await unhoverBox()

      // Weekly normal + hover (u2/u2b) — card above the column's topmost box;
      // the hovered box reads like its column siblings (ring only, ticket 140).
      if (!(await clickSeg(wc, 'Heatmap mode', 'Weekly'))) throw new Error('usage visual: Weekly seg missing')
      await sleep(400)
      await capture(
        win,
        'u2-usage-heat-weekly',
        `(${heatModeActive('Weekly')}) && ${noHeatCard} && ${heatFitsContainer}`
      )
      await hoverBoxAndSettle()
      await capture(
        win,
        'u2b-usage-heat-weekly-hover',
        `(${heatModeActive('Weekly')}) && (${heatCardShowing(['This week'], ['Through'])}) && ${heatColumnRing} && ${hoverBoxMatchesSiblings}`
      )
      await unhoverBox()

      // Cumulative normal + hover (u2c/u2d).
      if (!(await clickSeg(wc, 'Heatmap mode', 'Cumulative'))) throw new Error('usage visual: Cumulative seg missing')
      await sleep(400)
      await capture(
        win,
        'u2c-usage-heat-cumulative',
        `(${heatModeActive('Cumulative')}) && ${noHeatCard} && ${heatFitsContainer}`
      )
      await hoverBoxAndSettle()
      await capture(
        win,
        'u2d-usage-heat-cumulative-hover',
        `(${heatModeActive('Cumulative')}) && (${heatCardShowing(['Through', 'This week'])}) && ${heatColumnRing} && ${hoverBoxMatchesSiblings}`
      )
      await unhoverBox()

      if (!(await clickSeg(wc, 'Heatmap mode', 'Daily'))) throw new Error('usage visual: Daily seg missing')
      await sleep(300)

      // Trend section — fixed to a one-week window (ticket 140): the Time
      // Range switch row is retired (no .range-row, no 'Trend time range'
      // segment) and the axis always projects the 7-day three-tick form.
      if (!(await scrollCard(wc, '.trend-svg'))) throw new Error('usage visual: trend card missing')
      await sleep(400)
      await capture(
        win,
        'u3-usage-trend',
        `(${sectionInView('.trend-svg')}) && document.querySelector('.range-row') === null
          && document.querySelectorAll('.trend-x-label').length === 3
          && document.querySelector('.trend-tooltip') === null`
      )

      // Donut section.
      await scrollTo(wc, '.donut-row')
      await sleep(400)
      await capture(win, 'u4-usage-donut', sectionInView('.donut-row'))

      // Drill-down: pick the last active day cell (most recent cluster).
      const picked = await execute<boolean>(
        wc,
        `(() => {
          const cells = [...document.querySelectorAll('button.heat')]
          if (cells.length === 0) return false
          const cell = cells[cells.length - 1]
          cell.click()
          cell.scrollIntoView({ block: 'center' })
          return true
        })()`
      )
      if (!picked) throw new Error('usage visual: no active heat cell to pick')
      let drilldown = false
      for (let waited = 0; waited < 5_000 && !drilldown; waited += 200) {
        drilldown = await execute<boolean>(wc, `document.querySelectorAll('.drilldown').length > 0`)
        if (!drilldown) await sleep(200)
      }
      if (!drilldown) throw new Error('usage visual: drill-down panel never opened')
      await sleep(400)
      await capture(win, 'u5-usage-drilldown', `document.querySelectorAll('.drilldown').length > 0`)

      // ---- ticket 65/140: hover frames (ZCode z13-usage-* anchors) --------
      // Close the drill-down, then hover the fixed one-week trend chart: the
      // white-card tooltip with guide line + intersection dots must appear.
      if (!(await click(wc, '.dd-close'))) throw new Error('usage visual: drill-down close button missing')
      await sleep(300)

      if (!(await scrollCard(wc, '.trend-svg'))) throw new Error('usage visual: trend svg missing for hover')
      await sleep(300)
      if (!(await hoverAt(wc, '.trend-svg', 0.8, 0.5))) throw new Error('usage visual: trend svg missing for hover')
      let trendTip = false
      for (let waited = 0; waited < 5_000 && !trendTip; waited += 200) {
        trendTip = await execute<boolean>(
          wc,
          `document.querySelectorAll('.trend-tooltip').length > 0 && document.querySelectorAll('.trend-guide').length > 0`
        )
        if (!trendTip) await sleep(200)
      }
      if (!trendTip) throw new Error('usage visual: trend hover never opened the white-card tooltip')
      await sleep(300)
      await capture(
        win,
        'u6-usage-trend-hover',
        `document.querySelectorAll('.trend-tooltip').length > 0 && document.querySelectorAll('.trend-guide').length > 0`
      )
      await unhover(wc, '.trend-svg')
      await sleep(300)

      // (u7/u8 retired — ticket 140: the 7/30 Time Range switch they
      // exercised is gone; u3 + u6 cover the fixed one-week trend.)

      // Donut hover: move over the first arc (twelve o'clock sits on the
      // ring) — the white card with model · tokens · share must appear.
      await scrollTo(wc, '.donut-row')
      await sleep(300)
      const donutHovered = await execute<boolean>(
        wc,
        `(() => {
          const svg = document.querySelector('.donut-svg')
          const arc = document.querySelector('.donut-arc[data-model]')
          if (!svg || !arc) return false
          const r = svg.getBoundingClientRect()
          arc.dispatchEvent(new MouseEvent('mousemove', {
            bubbles: true,
            clientX: r.left + r.width * 0.5,
            clientY: r.top + r.height * (22 / 180)
          }))
          return true
        })()`
      )
      if (!donutHovered) throw new Error('usage visual: no donut arc to hover')
      let donutTip = false
      for (let waited = 0; waited < 5_000 && !donutTip; waited += 200) {
        donutTip = await execute<boolean>(wc, `document.querySelectorAll('.donut-tooltip').length > 0`)
        if (!donutTip) await sleep(200)
      }
      if (!donutTip) throw new Error('usage visual: donut hover never opened the white-card tooltip')
      await sleep(300)
      await capture(win, 'u9-usage-donut-hover', `document.querySelectorAll('.donut-tooltip').length > 0`)
      await unhover(wc, '.donut-svg')

      console.log('VISUAL usage done')
      app.exit(0)
    } catch (err) {
      console.error('VISUAL USAGE FAIL', err)
      app.exit(1)
    }
  })()
}
