#!/usr/bin/env node
/**
 * Ticket 102: regenerate the app icon assets from the single SVG master
 * (build/icon.svg). The generated artifacts are committed — rerun this only
 * when the master changes:
 *
 *   node scripts/make-icons.mjs
 *     → build/icon.png                1024px master raster (dev Dock icon)
 *     → build/icons/{16..1024}.png    full png ladder (7 sizes)
 *     → build/icon.icns               macOS bundle icon (every iconset slot)
 *     → build/icon.iconset/           Apple-named ladder (derived, gitignored)
 *
 * Pipeline (macOS built-ins only — same platform the packager targets):
 *   qlmanage    renders the SVG master once at 1024px (QuickLook) — pinned
 *               single renderer so regenerated artifacts stay comparable
 *               regardless of what else is installed
 *   icon-alpha  deterministic alpha repair: qlmanage composites its thumbnail
 *               onto opaque white, so the canvas-edge-connected white matte is
 *               flood-filled away (thresholds + unmixing rationale documented
 *               in scripts/icon-alpha.ts). Pure post-processing — qlmanage
 *               stays the single rasterizer (ticket 102 discipline)
 *   sips        resamples the repaired master down to each size
 *   iconutil    packs build/icon.iconset → build/icon.icns
 *
 * Zero npm dependencies on purpose: icon regen is a rare, human-triggered
 * step, and the renderer/bitmap toolchains of this repo stay untouched.
 */

import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { decodePng, encodePng, stripEdgeWhiteMatte } from './icon-alpha.ts'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const buildDir = path.join(root, 'build')
const masterSvg = path.join(buildDir, 'icon.svg')
const masterPng = path.join(buildDir, 'icon.png')
const iconsDir = path.join(buildDir, 'icons')
const iconsetDir = path.join(buildDir, 'icon.iconset')
const icns = path.join(buildDir, 'icon.icns')

const RASTER_SIZE = 1024
// Apple iconset contract: every slot, mapped to its ladder size. Duplicate
// sizes are intentional — e.g. icon_16x16@2x and icon_32x32 are both 32px.
// The plain png ladder is derived from these slots (single source of sizes).
const ICONSET_SLOTS = [
  [16, 'icon_16x16.png'],
  [32, 'icon_16x16@2x.png'],
  [32, 'icon_32x32.png'],
  [64, 'icon_32x32@2x.png'],
  [128, 'icon_128x128.png'],
  [256, 'icon_128x128@2x.png'],
  [256, 'icon_256x256.png'],
  [512, 'icon_256x256@2x.png'],
  [512, 'icon_512x512.png'],
  [1024, 'icon_512x512@2x.png']
]
const SIZES = [...new Set(ICONSET_SLOTS.map(([size]) => size))]

function sh(command, args, opts = {}) {
  return execFileSync(command, args, { stdio: 'pipe', encoding: 'utf8', ...opts })
}

/** Render `svg` at exactly size×size px into `out` (PNG, alpha preserved). */
function rasterize(svg, size, out, workDir) {
  // macOS built-in QuickLook renders the SVG thumbnail (square source →
  // exactly size×size, RGBA preserved). Deliberately the only renderer:
  // regenerating through a different rasterizer would silently change every
  // committed artifact's bytes.
  sh('qlmanage', ['-t', '-s', String(size), '-o', workDir, svg])
  const produced = path.join(workDir, path.basename(svg) + '.png')
  if (!existsSync(produced)) throw new Error(`qlmanage produced no thumbnail at ${produced}`)
  copyFileSync(produced, out)
}

/** Downsample `src` to exactly size×size px into `out` via sips. */
function resize(src, size, out) {
  sh('sips', ['-s', 'format', 'png', '-z', String(size), String(size), src, '--out', out])
}

function pngSize(file) {
  const out = sh('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', file])
  const [, w, h] = out.match(/pixelWidth: (\d+)[\s\S]*pixelHeight: (\d+)/) ?? []
  return [Number(w), Number(h)]
}

function main() {
  if (process.platform !== 'darwin') {
    console.error('make-icons: macOS only (the pipeline is qlmanage/sips/iconutil).')
    process.exit(1)
  }
  if (!existsSync(masterSvg)) {
    console.error(`make-icons: master SVG missing: ${masterSvg}`)
    process.exit(1)
  }

  const workDir = mkdtempSync(path.join(os.tmpdir(), 'picode-make-icons-'))
  try {
    mkdirSync(iconsDir, { recursive: true })
    rmSync(iconsetDir, { recursive: true, force: true })
    mkdirSync(iconsetDir)

    console.log(`→ rasterizing master ${path.relative(root, masterSvg)} at ${RASTER_SIZE}px`)
    rasterize(masterSvg, RASTER_SIZE, workDir + '/master.png', workDir)

    console.log('→ alpha repair (strip the qlmanage white matte)')
    const master = decodePng(readFileSync(workDir + '/master.png'))
    const cleared = stripEdgeWhiteMatte(master)
    console.log(`  cleared ${cleared} edge-connected matte pixels`
      + (cleared === 0 ? ' (no matte found — qlmanage output changed?)' : ''))
    for (const [x, y] of [[0, 0], [master.width - 1, 0], [0, master.height - 1], [master.width - 1, master.height - 1]]) {
      const o = (y * master.width + x) * 4
      if (master.data[o + 3] !== 0) {
        throw new Error(`alpha repair left corner (${x},${y}) opaque (a=${master.data[o + 3]}) — matte not stripped`)
      }
    }
    writeFileSync(masterPng, encodePng(master))

    console.log('→ png ladder (build/icons)')
    for (const size of SIZES) resize(masterPng, size, path.join(iconsDir, `${size}.png`))

    console.log('→ apple iconset (build/icon.iconset)')
    for (const [size, slot] of ICONSET_SLOTS) resize(masterPng, size, path.join(iconsetDir, slot))

    console.log('→ icns (build/icon.icns)')
    sh('iconutil', ['-c', 'icns', iconsetDir, '-o', icns])
    if (!existsSync(icns)) throw new Error('iconutil produced no icns')

    // Self-check: every artifact square and at its nominal size.
    const artifacts = [
      [masterPng, RASTER_SIZE],
      ...SIZES.map((s) => [path.join(iconsDir, `${s}.png`), s]),
      ...ICONSET_SLOTS.map(([s, slot]) => [path.join(iconsetDir, slot), s])
    ]
    for (const [file, size] of artifacts) {
      const [w, h] = pngSize(file)
      if (w !== size || h !== size) throw new Error(`${file}: expected ${size}×${size}, got ${w}×${h}`)
    }
    if (readFileSync(masterPng).readUInt8(25) !== 6) {
      throw new Error(`${masterPng}: lost alpha (IHDR color type != 6) — corners must stay transparent`)
    }

    console.log(`done. artifacts: build/icon.png + ${SIZES.length} pngs + build/icon.icns`)
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }
}

main()
