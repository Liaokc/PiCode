import type { BrowserWindowConstructorOptions } from 'electron'

export const WINDOW_TITLE = 'PiCode'

/**
 * Window options for the main shell. Pure (no Electron runtime needed) so the
 * macOS chrome contract stays testable headlessly:
 * - `hiddenInset` drops the native titlebar; traffic lights then sit inside
 *   our sidebar, with an HTML title centered across the whole window
 *   (reference screenshots 02/03).
 */
export function createWindowOptions(preloadPath: string): BrowserWindowConstructorOptions {
  return {
    title: WINDOW_TITLE,
    width: 1440,
    height: 900,
    minWidth: 1040,
    minHeight: 680,
    show: false,
    backgroundColor: '#f7f7f5',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 20, y: 20 },
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  }
}
