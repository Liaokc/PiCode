import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { applyDevDockIcon, devDockIconPath } from '../../src/main/app-icon'
import { decodePng, encodePng, stripEdgeWhiteMatte } from '../../scripts/icon-alpha.ts'
import type { PngImage } from '../../scripts/icon-alpha.ts'

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

function px(img: PngImage, x: number, y: number): [number, number, number, number] {
  const o = (y * img.width + x) * 4
  return [img.data[o], img.data[o + 1], img.data[o + 2], img.data[o + 3]]
}

function fakeOutMain(hasBuild: boolean): { root: string; mainDir: string } {
  const root = mkdtempSync(path.join(os.tmpdir(), 'picode-app-icon-'))
  const mainDir = path.join(root, 'out', 'main')
  mkdirSync(mainDir, { recursive: true })
  if (hasBuild) {
    mkdirSync(path.join(root, 'build'), { recursive: true })
    writeFileSync(path.join(root, 'build', 'icon.png'), 'png-bytes')
  }
  return { root, mainDir }
}

describe('devDockIconPath', () => {
  it('resolves the 1024px master raster from out/main two levels up', () => {
    const { root, mainDir } = fakeOutMain(true)
    try {
      expect(devDockIconPath(mainDir)).toBe(path.join(root, 'build', 'icon.png'))
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('returns null when the asset is absent (partial checkout / packaged layout)', () => {
    const { root, mainDir } = fakeOutMain(false)
    try {
      expect(devDockIconPath(mainDir)).toBeNull()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('applyDevDockIcon', () => {
  it('sets the dock icon in dev and reports applied', () => {
    const { root, mainDir } = fakeOutMain(true)
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
    const { mainDir } = fakeOutMain(true)
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
    const { mainDir } = fakeOutMain(true)
    try {
      expect(applyDevDockIcon(undefined, { isPackaged: false, mainDir })).toBe(false)
    } finally {
      rmSync(path.dirname(path.dirname(mainDir)), { recursive: true, force: true })
    }
    const { mainDir: bare } = fakeOutMain(false)
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

describe('alpha repair (ticket 114 — qlmanage white matte stripped)', () => {
  it('master corners are fully transparent after the repair', () => {
    const img = decodePng(readFileSync(path.join(repoRoot, 'build', 'icon.png')))
    expect(px(img, 0, 0)).toEqual([0, 0, 0, 0])
    expect(px(img, 1023, 0)).toEqual([0, 0, 0, 0])
    expect(px(img, 0, 1023)).toEqual([0, 0, 0, 0])
    expect(px(img, 1023, 1023)).toEqual([0, 0, 0, 0])
  })

  it('master keeps no edge-connected opaque near-white (the matte is gone, not relocated)', () => {
    const img = decodePng(readFileSync(path.join(repoRoot, 'build', 'icon.png')))
    expect(stripEdgeWhiteMatte(img, { dryRun: true })).toBe(0)
  })

  it('master keeps π strokes, the orange cursor block and the squircle gradient intact', () => {
    const img = decodePng(readFileSync(path.join(repoRoot, 'build', 'icon.png')))
    // sample points derive from build/icon.svg geometry (see the measured
    // coordinates note in scripts/make-icons.mjs)
    expect(px(img, 552, 500)).toEqual([255, 255, 255, 255]) // π stem
    expect(px(img, 640, 390)).toEqual([255, 255, 255, 255]) // π bar
    expect(px(img, 275, 600)).toEqual([255, 255, 255, 255]) // π left leg (skewed)
    expect(px(img, 717, 652)).toEqual([236, 121, 49, 255]) // cursor block #ec7931
    const [topR] = px(img, 512, 130) // gradient #262626→#0f0f0f: no dithering,
    const [botR] = px(img, 512, 940) // only rounding — assert as a falling range
    expect(topR).toBeGreaterThan(botR)
    expect(topR).toBeGreaterThanOrEqual(33)
    expect(topR).toBeLessThanOrEqual(38)
    expect(botR).toBeGreaterThanOrEqual(14)
    expect(botR).toBeLessThanOrEqual(19)
  })

  it('every ladder size has transparent corners', () => {
    for (const size of [16, 32, 64, 128, 256, 512, 1024]) {
      const img = decodePng(readFileSync(path.join(repoRoot, 'build', 'icons', `${size}.png`)))
      expect(px(img, 0, 0)[3], `icons/${size}.png tl alpha`).toBe(0)
      expect(px(img, size - 1, 0)[3], `icons/${size}.png tr alpha`).toBe(0)
      expect(px(img, 0, size - 1)[3], `icons/${size}.png bl alpha`).toBe(0)
      expect(px(img, size - 1, size - 1)[3], `icons/${size}.png br alpha`).toBe(0)
    }
  })

  it('the smallest ladder rung still reads as the icon (π white present, orange present)', () => {
    const img = decodePng(readFileSync(path.join(repoRoot, 'build', 'icons', '16.png')))
    let white = 0
    let orange = 0
    for (let i = 0; i < img.data.length; i += 4) {
      const [r, g, b] = [img.data[i], img.data[i + 1], img.data[i + 2]]
      if (img.data[i + 3] === 255 && r >= 240 && g >= 240 && b >= 240) white++
      // the cursor block is ~1.3px wide at 16px — sips dilutes #ec7931 to
      // roughly (118..136, 66..75, 33..37); still unmistakably orange
      if (img.data[i + 3] === 255 && r >= 110 && g >= 55 && b <= 45 && r - b > 80) orange++
    }
    expect(white).toBeGreaterThan(0)
    expect(orange).toBeGreaterThan(0)
  })

  it('icns slots inherit the transparent corners', () => {
    const extracted = mkdtempSync(path.join(os.tmpdir(), 'picode-icns-alpha-'))
    try {
      execFileSync('iconutil', ['-c', 'iconset', path.join(repoRoot, 'build', 'icon.icns'), '-o', path.join(extracted, 's.iconset')])
      for (const [slot, size] of [
        ['icon_16x16.png', 16],
        ['icon_512x512@2x.png', 1024]
      ] as const) {
        const img = decodePng(readFileSync(path.join(extracted, 's.iconset', slot)))
        expect(img.width).toBe(size)
        expect(px(img, 0, 0)[3], `${slot} corner alpha`).toBe(0)
        expect(px(img, size - 1, size - 1)[3], `${slot} far corner alpha`).toBe(0)
      }
    } finally {
      rmSync(extracted, { recursive: true, force: true })
    }
  })
})

describe('icon-alpha seam (pure functions behind the repair step)', () => {
  const solid = (w: number, h: number, rgba: [number, number, number, number]): PngImage => {
    const data = Buffer.alloc(w * h * 4)
    for (let i = 0; i < w * h; i++) data.set(rgba, i * 4)
    return { width: w, height: h, data }
  }

  it('encodePng → decodePng round-trips RGBA exactly (including partial alpha)', () => {
    const w = 13
    const h = 7
    const src: PngImage = { width: w, height: h, data: Buffer.alloc(w * h * 4) }
    for (let i = 0; i < w * h; i++) {
      src.data[i * 4] = (i * 17) % 256
      src.data[i * 4 + 1] = (i * 29) % 256
      src.data[i * 4 + 2] = (i * 53) % 256
      src.data[i * 4 + 3] = (i * 37) % 256
    }
    const back = decodePng(encodePng(src))
    expect(back.width).toBe(w)
    expect(back.height).toBe(h)
    expect(Buffer.compare(back.data, src.data)).toBe(0)
  })

  it('strips an edge-connected white matte and never touches an interior shape', () => {
    const img = solid(9, 9, [255, 255, 255, 255])
    for (let y = 3; y <= 5; y++) for (let x = 3; x <= 5; x++) img.data.set([30, 30, 30, 255], (y * 9 + x) * 4)
    const cleared = stripEdgeWhiteMatte(img)
    expect(cleared).toBe(81 - 9)
    expect(px(img, 0, 0)).toEqual([0, 0, 0, 0])
    expect(px(img, 4, 4)).toEqual([30, 30, 30, 255])
  })

  it('unmixes the one-pixel antialias blend into semi-transparent black', () => {
    const img = solid(6, 3, [255, 255, 255, 255])
    img.data.set([232, 232, 232, 255], (1 * 6 + 2) * 4) // blend column
    img.data.set([36, 36, 36, 255], (1 * 6 + 3) * 4) // solid column stops the fill
    stripEdgeWhiteMatte(img)
    expect(px(img, 2, 1)).toEqual([0, 0, 0, 23]) // α = 255 − 232, unmixed toward black
    expect(px(img, 3, 1)).toEqual([36, 36, 36, 255])
  })

  it('leaves chromatic pixels alone even when they touch the canvas edge (spread guard)', () => {
    const img = solid(6, 6, [255, 255, 255, 255])
    img.data.set([236, 121, 49, 255], (0 * 6 + 0) * 4)
    img.data.set([236, 121, 49, 255], (1 * 6 + 0) * 4)
    const cleared = stripEdgeWhiteMatte(img)
    expect(cleared).toBe(36 - 2)
    expect(px(img, 0, 0)).toEqual([236, 121, 49, 255])
    expect(px(img, 1, 0)).toEqual([0, 0, 0, 0])
  })

  it('is deterministic (same input → byte-identical output) and skips already-transparent pixels', () => {
    const make = (): PngImage => {
      const img = solid(8, 8, [255, 255, 255, 255])
      img.data.set([255, 255, 255, 0], (0 * 8 + 4) * 4) // pre-transparent pixel stays untouched
      return img
    }
    const a = make()
    const b = make()
    stripEdgeWhiteMatte(a)
    stripEdgeWhiteMatte(b)
    expect(Buffer.compare(encodePng(a), encodePng(b))).toBe(0)
    expect(px(a, 4, 0)).toEqual([255, 255, 255, 0])
    expect(px(a, 0, 0)).toEqual([0, 0, 0, 0])
  })

  it('dryRun counts without mutating', () => {
    const img = solid(4, 4, [255, 255, 255, 255])
    expect(stripEdgeWhiteMatte(img, { dryRun: true })).toBe(16)
    expect(px(img, 2, 2)).toEqual([255, 255, 255, 255])
    expect(stripEdgeWhiteMatte(img)).toBe(16)
    expect(px(img, 2, 2)).toEqual([0, 0, 0, 0])
  })
})
