import { existsSync } from 'node:fs'
import path from 'node:path'

/**
 * Ticket 102: the formal app icon (V2 — black squircle + white geometric π +
 * orange terminal cursor). build/icon.svg is the single master; build/icon.png
 * and build/icon.icns are generated from it by scripts/make-icons.mjs and
 * committed.
 *
 * Icon surfaces:
 * - Packaged macOS app: `scripts/package.mjs` passes build/icon.icns to
 *   @electron/packager, which bakes it into the bundle (Contents/Resources +
 *   CFBundleIconFile) — LaunchServices paints Finder/Dock; no runtime work.
 * - Dev (`electron-vite dev` / `electron .` on the built out/): the binary is
 *   stock Electron, whose Dock icon is Electron's — override it explicitly
 *   with the generated 1024px PNG while running unpackaged.
 */

/**
 * Absolute path of the dev Dock icon PNG, resolved from the main-process
 * directory (out/main), or null when the asset is absent (partial checkout).
 * In a packaged app this lookup lands inside Contents/Resources/app where
 * build/ is deliberately not shipped — callers also guard on isPackaged.
 */
export function devDockIconPath(mainDir: string): string | null {
  const candidate = path.resolve(mainDir, '..', '..', 'build', 'icon.png')
  return existsSync(candidate) ? candidate : null
}

/**
 * Set the macOS Dock icon while running unpackaged (dev). No-op when there is
 * no Dock (Linux/Windows: app.dock is undefined), when packaged (the bundle
 * icns owns the Dock), or when the asset is missing. Returns whether applied.
 */
export function applyDevDockIcon(
  dock: { setIcon(image: string): void } | undefined,
  opts: { isPackaged: boolean; mainDir: string }
): boolean {
  if (!dock || opts.isPackaged) return false
  const iconPath = devDockIconPath(opts.mainDir)
  if (!iconPath) return false
  dock.setIcon(iconPath)
  return true
}
