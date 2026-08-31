/**
 * Usage-page visual-QA harness (ticket 12, reference screenshot 09). Enabled
 * only with PICODE_VISUAL_USAGE=1 — pair with PICODE_FAKE_USAGE=1 so the
 * usage IPC serves the deterministic fixture (src/shared/usage/fixture.ts).
 * Drives the real UI through the settings shell and captures:
 *
 *   u1-usage-overview  — headline cards + Token activity heatmap (daily)
 *   u2-usage-weekly    — heatmap toggled to Weekly
 *   u3-usage-trend     — time range + per-model daily trend chart
 *   u4-usage-donut     — model usage donut with legend shares
 *   u5-usage-drilldown — drill-down panel after picking an active day
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
      drilldown: document.querySelectorAll('.drilldown').length
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

      // Heatmap mode toggles.
      if (!(await clickSeg(wc, 'Heatmap mode', 'Weekly'))) throw new Error('usage visual: Weekly seg missing')
      await sleep(400)
      await capture(win, 'u2-usage-weekly')
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

      console.log('VISUAL usage done')
      app.exit(0)
    } catch (err) {
      console.error('VISUAL USAGE FAIL', err)
      app.exit(1)
    }
  })()
}
