import { describe, expect, it } from 'vitest'
import { createWindowOptions, WINDOW_TITLE } from '../../src/main/window-options'

const PRELOAD = '/fake/out/preload/index.js'

describe('createWindowOptions', () => {
  const options = createWindowOptions(PRELOAD)

  it('embeds traffic lights into the sidebar chrome via hiddenInset', () => {
    // Reference screenshots 02/03: no native titlebar, macOS lights at top-left.
    expect(options.titleBarStyle).toBe('hiddenInset')
  })

  it('keeps the renderer locked down (isolated world, no node)', () => {
    expect(options.webPreferences?.contextIsolation).toBe(true)
    expect(options.webPreferences?.nodeIntegration).toBe(false)
    expect(options.webPreferences?.preload).toBe(PRELOAD)
  })

  it('opens at a comfortable desktop size with sane minimums', () => {
    expect(options.width).toBeGreaterThanOrEqual(1200)
    expect(options.height).toBeGreaterThanOrEqual(720)
    expect(options.minWidth).toBeLessThanOrEqual(options.width as number)
    expect(options.minHeight).toBeLessThanOrEqual(options.height as number)
  })

  it('titles the window and pre-paints the app background', () => {
    expect(WINDOW_TITLE).toBe('PiCode')
    expect(typeof options.backgroundColor).toBe('string')
    expect(options.backgroundColor).toMatch(/^#[0-9a-fA-F]{6}$/)
  })
})
