/**
 * Settings-window visual-QA harness (ticket 11). Enabled only with
 * PICODE_VISUAL_SETTINGS=1 (pair with PICODE_FAKE_SETTINGS=1 so the settings
 * IPC serves deterministic fixtures). Drives the real UI and captures:
 *
 *   1. ⌘K task-search palette (workspace, keyboard-opened)
 *   2. Models section — default model/thinking + provider sign-in list
 *   3. General section — startup preferences
 *   4. Appearance section — theme placeholder
 *   5. Skills section (ticket 63) — the full state vocabulary: source
 *      badges, disabled row, broken link, per-skill switches
 *   6. Packages placeholder (ticket 63 nav slot, ticket 64 delivers)
 *
 * PNGs land in $PICODE_VISUAL_OUT (default: <cwd>/.scratch/visual/). Not part
 * of `npm test`; a human compares them against the reference screenshots.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { app, type BrowserWindow, type WebContents } from 'electron'

export function settingsVisualEnabled(): boolean {
  return process.env['PICODE_VISUAL_SETTINGS'] === '1'
}

function outDir(): string {
  return process.env['PICODE_VISUAL_OUT'] || path.join(process.cwd(), '.scratch', 'visual')
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

async function execute<T>(webContents: WebContents, script: string): Promise<T> {
  return (await webContents.executeJavaScript(script)) as T
}

/** Click the first element matching `selector` inside the renderer. */
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

/** Click the settings nav item whose label text matches (e.g. "Models"). */
async function clickNavItem(webContents: WebContents, label: string): Promise<boolean> {
  return execute<boolean>(
    webContents,
    `(() => {
      const items = [...document.querySelectorAll('.settings-item')]
      const item = items.find((el) => el.textContent?.trim() === ${JSON.stringify(label)})
      if (item instanceof HTMLElement) {
        item.click()
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
  console.log(`VISUAL captured ${file}`)
}

export function startSettingsVisualIfEnabled(getWindow: () => BrowserWindow | null): void {
  if (!settingsVisualEnabled()) return

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
      if (!win) throw new Error('settings visual: no window')
      const wc = win.webContents
      await sleep(600)

      // 1. ⌘K palette — opened exactly the way the keybinding does it
      // (the physical-code chord the ticket-27 table resolves; the keycap
      // dispatch needs `code`, not just the derived character).
      await wc.executeJavaScript(
        `(() => {
          window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyK', key: 'k', metaKey: true, cancelable: true }))
          return true
        })()`
      )
      await sleep(400)
      const paletteOpen = await execute<boolean>(
        wc,
        `(() => {
          const input = document.querySelector('.palette-input')
          if (!(input instanceof HTMLElement)) return false
          // Type a query through the React-controlled input.
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
          setter.call(input, 'api')
          input.dispatchEvent(new Event('input', { bubbles: true }))
          return true
        })()`
      )
      if (!paletteOpen) throw new Error('settings visual: palette never opened')
      await sleep(300)
      const paletteState = await execute<Record<string, unknown>>(
        wc,
        `(() => ({
          value: document.querySelector('.palette-input')?.value ?? null,
          rows: document.querySelectorAll('.palette-item').length,
          firstRow: document.querySelector('.palette-item-title')?.textContent ?? null
        }))()`
      )
      console.log(`VISUAL palette state ${JSON.stringify(paletteState)}`)
      await capture(win, 's1-task-search-palette')
      await wc.executeJavaScript(
        `(() => {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
          document.querySelector('.palette-input')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
          return true
        })()`
      )
      await sleep(200)

      // Open the settings shell via the sidebar gear.
      if (!(await click(wc, 'button[aria-label="Settings"]'))) {
        throw new Error('settings visual: settings gear not found')
      }
      await sleep(500)

      // 2. Models section.
      if (!(await clickNavItem(wc, 'Models'))) throw new Error('settings visual: Models nav item missing')
      await sleep(400)
      await capture(win, 's2-settings-models')

      // 3. General section.
      if (!(await clickNavItem(wc, 'General'))) throw new Error('settings visual: General nav item missing')
      await sleep(300)
      await capture(win, 's3-settings-general')

      // 4. Appearance section.
      if (!(await clickNavItem(wc, 'Appearance'))) throw new Error('settings visual: Appearance nav item missing')
      await sleep(300)
      await capture(win, 's4-settings-appearance')

      // 5. Skills section (ticket 63): the fake-settings fixture serves a
      // deterministic enumeration — every badge + a broken link + a
      // disabled row — so the frame shows the whole state vocabulary.
      if (!(await clickNavItem(wc, 'Skills'))) throw new Error('settings visual: Skills nav item missing')
      await sleep(400)
      await capture(win, 's5-settings-skills')

      // 6. Packages placeholder (nav slot for ticket 64).
      if (!(await clickNavItem(wc, 'Packages'))) throw new Error('settings visual: Packages nav item missing')
      await sleep(300)
      await capture(win, 's6-settings-packages')

      console.log('VISUAL settings done')
      app.exit(0)
    } catch (err) {
      console.error('VISUAL SETTINGS FAIL', err)
      app.exit(1)
    }
  })()
}
