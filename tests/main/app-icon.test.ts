import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { applyDevDockIcon, devDockIconPath } from '../../src/main/app-icon'

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

function fakeOutMain(buildDir: string | null): { root: string; mainDir: string } {
  const root = mkdtempSync(path.join(os.tmpdir(), 'picode-app-icon-'))
  const mainDir = path.join(root, 'out', 'main')
  mkdirSync(mainDir, { recursive: true })
  if (buildDir) {
    mkdirSync(path.join(root, 'build'), { recursive: true })
    writeFileSync(path.join(root, 'build', 'icon.png'), 'png-bytes')
  }
  return { root, mainDir }
}

describe('devDockIconPath', () => {
  it('resolves the 1024px master raster from out/main two levels up', () => {
    const { root, mainDir } = fakeOutMain('present')
    try {
      expect(devDockIconPath(mainDir)).toBe(path.join(root, 'build', 'icon.png'))
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('returns null when the asset is absent (partial checkout / packaged layout)', () => {
    const { root, mainDir } = fakeOutMain(null)
    try {
      expect(devDockIconPath(mainDir)).toBeNull()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('applyDevDockIcon', () => {
  it('sets the dock icon in dev and reports applied', () => {
    const { root, mainDir } = fakeOutMain('present')
    try {
      const calls: string[] = []
      const applied = applyDevDockIcon({ setIcon: (image) => calls.push(image) }, { isPackaged: false, mainDir })
      expect(applied).toBe(true)
      expect(calls).toEqual([path.join(root, 'build', 'icon.png')])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('never overrides the baked bundle icns of a packaged app', () => {
    const { mainDir } = fakeOutMain('present')
    try {
      const setIcon = () => {
        throw new Error('setIcon must not be called for a packaged app')
      }
      expect(applyDevDockIcon({ setIcon }, { isPackaged: true, mainDir })).toBe(false)
    } finally {
      rmSync(path.dirname(path.dirname(mainDir)), { recursive: true, force: true })
    }
  })

  it('no-ops without a Dock (Linux/Windows) or without the asset', () => {
    const { mainDir } = fakeOutMain('present')
    try {
      expect(applyDevDockIcon(undefined, { isPackaged: false, mainDir })).toBe(false)
    } finally {
      rmSync(path.dirname(path.dirname(mainDir)), { recursive: true, force: true })
    }
    const { mainDir: bare } = fakeOutMain(null)
    try {
      expect(applyDevDockIcon({ setIcon: () => undefined }, { isPackaged: false, mainDir: bare })).toBe(false)
    } finally {
      rmSync(path.dirname(path.dirname(bare)), { recursive: true, force: true })
    }
  })
})

describe('repo icon assets (ticket 102)', () => {
  it('ships the master SVG, the 1024px raster, the full ladder and the icns', () => {
    expect(existsSync(path.join(repoRoot, 'build', 'icon.svg'))).toBe(true)
    expect(existsSync(path.join(repoRoot, 'build', 'icon.png'))).toBe(true)
    for (const size of [16, 32, 64, 128, 256, 512, 1024]) {
      expect(existsSync(path.join(repoRoot, 'build', 'icons', `${size}.png`))).toBe(true)
    }
    expect(existsSync(path.join(repoRoot, 'build', 'icon.icns'))).toBe(true)
  })

  it('keeps the master self-drawn: plain geometric shapes, no fonts, no embedded bitmaps', () => {
    const svg = readFileSync(path.join(repoRoot, 'build', 'icon.svg'), 'utf8')
    expect(svg).toMatch(/<rect /)
    expect(svg).not.toMatch(/<text/)
    expect(svg).not.toMatch(/font-family/)
    expect(svg).not.toMatch(/<image/)
    expect(svg).not.toMatch(/href/i)
  })

  it('carries every iconset slot in the committed icns', () => {
    const extracted = mkdtempSync(path.join(os.tmpdir(), 'picode-icns-check-'))
    try {
      execFileSync('iconutil', ['-c', 'iconset', path.join(repoRoot, 'build', 'icon.icns'), '-o', path.join(extracted, 's.iconset')])
      for (const slot of [
        'icon_16x16.png',
        'icon_16x16@2x.png',
        'icon_32x32.png',
        'icon_32x32@2x.png',
        'icon_128x128.png',
        'icon_128x128@2x.png',
        'icon_256x256.png',
        'icon_256x256@2x.png',
        'icon_512x512.png',
        'icon_512x512@2x.png'
      ]) {
        expect(existsSync(path.join(extracted, 's.iconset', slot)), slot).toBe(true)
      }
    } finally {
      rmSync(extracted, { recursive: true, force: true })
    }
  })
})
