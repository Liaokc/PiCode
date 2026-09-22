/**
 * Usage-page visual-QA harness (ticket 12, reference screenshot 09). Enabled
 * only with PICODE_VISUAL_USAGE=1 — pair with PICODE_FAKE_USAGE=1 so the
 * usage IPC serves the deterministic fixture (src/shared/usage/fixture.ts).
 * Drives the real UI through the settings shell and captures:
 *
 *   u1-usage-overview  — headline cards + Token activity heatmap (daily)
 *   u1b-usage-heat-daily-hover — real-input hover on an active daily box:
 *                        white card above the box (z19-heatmap-daily-2 form)
 *   u2-usage-heat-weekly    — heatmap toggled to Weekly: the same 52×7
 *                        contribution grid re-colored week-start-to-day
 *                        (ticket 139, z19-heatmap-weekly-1)
 *   u2b-usage-heat-weekly-hover — real-input hover on the current week's
 *                        column: card above the column's topmost box + ring
 *                        (z19-heatmap-weekly-2)
 *   u2c-usage-heat-cumulative — Cumulative mode: term-start-to-day boxes
 *                        (z19-heatmap-cumulative-1)
 *   u2d-usage-heat-cumulative-hover — real-input hover, card above the
 *                        current week's column ('Through … · This week',
 *                        z19-heatmap-cumulative-2)
 *   u3-usage-trend     — time range + per-model daily trend chart (30d,
 *                        curves clamped into the plot band — ticket 65)
 *   u4-usage-donut     — model usage donut with legend shares
 *   u5-usage-drilldown — drill-down panel after picking an active day
 *   u6-usage-trend-hover — 30d trend hover: guide line + dots + white card
 *   u7-usage-trend-7d  — 7-day trend (same interpolation/clamp as 30d)
 *   u8-usage-trend-7d-hover — 7d hover white card (ZCode z13 anchor form)
 *   u9-usage-donut-hover — donut arc hover white card (ZCode z13 anchor form)
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

async function capture(win: BrowserWindow, name: string): Promise<void> {
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
      await capture(win, 'u1-usage-overview')

      // ---- ticket 139: the six heat frames (three modes × normal/hover) ----
      // Hover target: the LAST active box (the fixture's streak ends today,
      // so the current week's column always carries activity — the z19
      // frames' right-edge cluster). The grid scrolls horizontally, so the
      // scroll box is driven to its right end before the box is located.
      const todayBox = await execute<{ x: number; y: number } | null>(
        wc,
        `(() => {
          const scroll = document.querySelector('.heatmap-scroll')
          if (scroll instanceof HTMLElement) scroll.scrollLeft = scroll.scrollWidth
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
        await execute<boolean>(
          wc,
          `(() => {
            const cells = [...document.querySelectorAll('button.heat')]
            const cell = cells[cells.length - 1]
            if (!cell) return false
            cell.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }))
            cell.dispatchEvent(new MouseEvent('mouseleave', { relatedTarget: document.body }))
            return true
          })()`
        )
        win.webContents.sendInputEvent({ type: 'mouseMove', x: todayBox.x + 260, y: todayBox.y - 120 })
        await sleep(300)
      }

      // Daily hover (u1b) — card above the hovered box.
      await hoverBoxAndSettle()
      await capture(win, 'u1b-usage-heat-daily-hover')
      await unhoverBox()

      // Weekly normal + hover (u2/u2b) — card above the column's topmost box.
      if (!(await clickSeg(wc, 'Heatmap mode', 'Weekly'))) throw new Error('usage visual: Weekly seg missing')
      await sleep(400)
      await capture(win, 'u2-usage-heat-weekly')
      await hoverBoxAndSettle()
      await capture(win, 'u2b-usage-heat-weekly-hover')
      await unhoverBox()

      // Cumulative normal + hover (u2c/u2d).
      if (!(await clickSeg(wc, 'Heatmap mode', 'Cumulative'))) throw new Error('usage visual: Cumulative seg missing')
      await sleep(400)
      await capture(win, 'u2c-usage-heat-cumulative')
      await hoverBoxAndSettle()
      await capture(win, 'u2d-usage-heat-cumulative-hover')
      await unhoverBox()

      if (!(await clickSeg(wc, 'Heatmap mode', 'Daily'))) throw new Error('usage visual: Daily seg missing')
      await sleep(300)

      // Trend section (default range 30 days, like the reference).
      await scrollTo(wc, '.range-row')
      await sleep(400)
      await capture(win, 'u3-usage-trend')

      // Donut section.
      await scrollTo(wc, '.donut-row')
      await sleep(400)
      await capture(win, 'u4-usage-donut')

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
      await capture(win, 'u5-usage-drilldown')

      // ---- ticket 65: hover frames (ZCode z13-usage-* anchors) -------------
      // Close the drill-down, then hover the trend chart: the white-card
      // tooltip with guide line + intersection dots must appear.
      if (!(await click(wc, '.dd-close'))) throw new Error('usage visual: drill-down close button missing')
      await sleep(300)

      await scrollTo(wc, '.range-row')
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
      await capture(win, 'u6-usage-trend-hover')
      await unhover(wc, '.trend-svg')
      await sleep(300)

      // The 7-day range must speak the same visual language (same
      // interpolation + clamp) — captured for the side-by-side review.
      if (!(await clickSeg(wc, 'Trend time range', 'Last 7 days'))) throw new Error('usage visual: 7d seg missing')
      await sleep(400)
      await capture(win, 'u7-usage-trend-7d')
      if (!(await hoverAt(wc, '.trend-svg', 0.5, 0.5))) throw new Error('usage visual: trend svg missing for 7d hover')
      let trendTip7 = false
      for (let waited = 0; waited < 5_000 && !trendTip7; waited += 200) {
        trendTip7 = await execute<boolean>(wc, `document.querySelectorAll('.trend-tooltip').length > 0`)
        if (!trendTip7) await sleep(200)
      }
      if (!trendTip7) throw new Error('usage visual: 7d trend hover never opened the tooltip')
      await sleep(300)
      await capture(win, 'u8-usage-trend-7d-hover')
      await unhover(wc, '.trend-svg')
      await sleep(300)

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
      await capture(win, 'u9-usage-donut-hover')
      await unhover(wc, '.donut-svg')

      console.log('VISUAL usage done')
      app.exit(0)
    } catch (err) {
      console.error('VISUAL USAGE FAIL', err)
      app.exit(1)
    }
  })()
}
