/**
 * Ticket 114: deterministic alpha repair for the qlmanage white matte, plus
 * the minimal PNG codec it needs (zero npm dependencies — icon regen stays a
 * rare, human-triggered step with no bitmap toolchain).
 *
 * Root cause (measured, ticket 114 forensics): qlmanage composites SVG
 * thumbnails onto opaque white — `build/icon.png` corners were
 * (255,255,255,255) and the SVG's transparent corners rendered as white
 * triangles in Dock/Finder.
 *
 * Repair: flood-fill every pixel connected to the canvas edge whose color is
 * neutral near-white (the matte or its blend with the dark squircle) and
 * strip the white contribution:
 *
 *   - fill predicate: alpha === 255 && min(R,G,B) >= 40 && max−min <= 24
 *     · the squircle palette is neutral 15..38 (SVG gradient #262626→#0f0f0f),
 *       so min ≥ 40 means "white matte contamination";
 *     · the spread ≤ 24 guard keeps chromatic pixels (brand orange #ec7931)
 *       out of a reconstruction that is only sound for neutral blends —
 *       measured on the current master: the fill region has zero chromatic
 *       neighbours, the guard is defense for future SVG edits.
 *   - cleared pure white → (0,0,0,0); cleared blend pixels unmix toward
 *     black: α' = 255 − min(R,G,B), C' = (C − min)·255/α' — this turns the
 *     one-pixel antialias ring into the semi-transparent edge the SVG
 *     actually asked for (over white it reproduces qlmanage's own output).
 *
 * The step is post-processing only — qlmanage stays the single rasterizer
 * (ticket 102 discipline); the same PNG bytes merely get their matte back.
 *
 * Codec scope: 8-bit non-interlaced PNG, color types 0/2/4/6 (decode),
 * RGBA color type 6 (encode) with per-row min-sum adaptive filtering —
 * everything qlmanage/sips/iconutil produce and consume. Encoding needs
 * zlib.crc32 (Node ≥ 22.2); the repo's toolchain already runs on Node 22.19
 * and its usage-scan.ts precedent already requires type-stripping (Node
 * ≥ 22.18), so no additional floor is imposed.
 */

import { crc32, deflateSync, inflateSync } from 'node:zlib'

export interface PngImage {
  width: number
  height: number
  /** RGBA8888, width*height*4 bytes */
  data: Buffer
}

/** Matte fill predicate thresholds — rationale in the header comment. */
const MATTE_MIN_CHANNEL = 40
const MATTE_MAX_SPREAD = 24

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const CHANNELS_BY_COLOR_TYPE: Record<number, number> = { 0: 1, 2: 3, 4: 2, 6: 4 }

function isMatteContaminated(data: Buffer, o: number): boolean {
  if (data[o + 3] !== 255) return false // already transparent → not our problem
  const r = data[o]
  const g = data[o + 1]
  const b = data[o + 2]
  const min = Math.min(r, g, b)
  const max = Math.max(r, g, b)
  return min >= MATTE_MIN_CHANNEL && max - min <= MATTE_MAX_SPREAD
}

/**
 * Flood-fill the canvas-edge-connected white matte → transparent, in place.
 * Returns the number of cleared pixels. `dryRun` counts without mutating
 * (used by the test suite to assert the committed artifacts carry no matte).
 */
export function stripEdgeWhiteMatte(img: PngImage, opts: { dryRun?: boolean } = {}): number {
  const { width: w, height: h, data } = img
  const seen = new Uint8Array(w * h)
  const stack = new Int32Array(w * h)
  let sp = 0
  let cleared = 0

  const visit = (x: number, y: number): void => {
    const i = y * w + x
    if (seen[i]) return
    if (!isMatteContaminated(data, i * 4)) return
    seen[i] = 1
    stack[sp++] = i
    cleared++
  }

  for (let x = 0; x < w; x++) {
    visit(x, 0)
    visit(x, h - 1)
  }
  for (let y = 0; y < h; y++) {
    visit(0, y)
    visit(w - 1, y)
  }

  while (sp > 0) {
    const i = stack[--sp]
    const x = i % w
    const y = (i / w) | 0
    if (x > 0) visit(x - 1, y)
    if (x < w - 1) visit(x + 1, y)
    if (y > 0) visit(x, y - 1)
    if (y < h - 1) visit(x, y + 1)
  }

  if (opts.dryRun) return cleared

  for (let i = 0; i < w * h; i++) {
    if (!seen[i]) continue
    const o = i * 4
    const min = Math.min(data[o], data[o + 1], data[o + 2])
    const alpha = 255 - min
    // unmix the white contribution: observed = α·C + (1−α)·255 with C ≈ the
    // dark squircle → C' = (observed − min)·255/α (0 for pure matte). Read
    // the original channels before overwriting them.
    const rgb = [0, 0, 0]
    if (alpha > 0) {
      for (let c = 0; c < 3; c++) {
        rgb[c] = Math.min(255, Math.max(0, Math.round(((data[o + c] - min) * 255) / alpha)))
      }
    }
    data[o] = rgb[0]
    data[o + 1] = rgb[1]
    data[o + 2] = rgb[2]
    data[o + 3] = alpha
  }
  return cleared
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

/** Decode an 8-bit non-interlaced PNG (color types 0/2/4/6) into RGBA8888. */
export function decodePng(buf: Buffer): PngImage {
  if (buf.length < 8 + 12 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('decodePng: not a PNG buffer')
  }
  let width = 0
  let height = 0
  let colorType = -1
  let interlace = -1
  const idat: Buffer[] = []
  let off = 8
  while (off + 12 <= buf.length) {
    const len = buf.readUInt32BE(off)
    const type = buf.toString('ascii', off + 4, off + 8)
    const data = buf.subarray(off + 8, off + 8 + len)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      if (data[8] !== 8) throw new Error(`decodePng: unsupported bit depth ${data[8]}`)
      colorType = data[9]
      interlace = data[12]
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'IEND') {
      break
    }
    off += 12 + len
  }
  if (!width || !height || colorType === -1) throw new Error('decodePng: missing IHDR')
  if (interlace !== 0) throw new Error('decodePng: interlaced PNG unsupported')
  const channels = CHANNELS_BY_COLOR_TYPE[colorType]
  if (!channels) throw new Error(`decodePng: unsupported color type ${colorType}`)

  const stride = width * channels
  const raw = inflateSync(Buffer.concat(idat))
  if (raw.length !== height * (stride + 1)) {
    throw new Error(`decodePng: decompressed ${raw.length} bytes, expected ${height * (stride + 1)}`)
  }

  const out = Buffer.alloc(width * height * 4)
  let line = Buffer.alloc(stride)
  let prev = Buffer.alloc(stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    raw.copy(line, 0, y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0
      const b = prev[i]
      const c = i >= channels ? prev[i - channels] : 0
      if (filter === 1) line[i] = (line[i] + a) & 0xff
      else if (filter === 2) line[i] = (line[i] + b) & 0xff
      else if (filter === 3) line[i] = (line[i] + ((a + b) >> 1)) & 0xff
      else if (filter === 4) {
        line[i] = (line[i] + paeth(a, b, c)) & 0xff
      } else if (filter !== 0) {
        throw new Error(`decodePng: unknown row filter ${filter}`)
      }
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4
      const s = x * channels
      if (colorType === 6) line.copy(out, o, s, s + 4)
      else if (colorType === 2) {
        out[o] = line[s]
        out[o + 1] = line[s + 1]
        out[o + 2] = line[s + 2]
        out[o + 3] = 255
      } else if (colorType === 0) {
        out[o] = out[o + 1] = out[o + 2] = line[s]
        out[o + 3] = 255
      } else {
        out[o] = out[o + 1] = out[o + 2] = line[s]
        out[o + 3] = line[s + 1]
      }
    }
    ;[prev, line] = [line, prev]
  }
  return { width, height, data: out }
}

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write(type, 4, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0)
  return Buffer.concat([head, data, crc])
}

/** Encode RGBA8888 as an 8-bit color-type-6 PNG (adaptive min-sum filtering). */
export function encodePng(img: PngImage): Buffer {
  const { width, height, data } = img
  const stride = width * 4
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  ihdr[10] = 0 // deflate
  ihdr[11] = 0 // adaptive filtering
  ihdr[12] = 0 // no interlace

  const strideBytes = Buffer.alloc(height * (stride + 1))
  const filtered = [Buffer.alloc(stride), Buffer.alloc(stride), Buffer.alloc(stride), Buffer.alloc(stride), Buffer.alloc(stride)]
  for (let y = 0; y < height; y++) {
    const rowStart = y * stride
    const types = [0, 1, 2, 3, 4]
    const sums = [0, 0, 0, 0, 0]
    for (let i = 0; i < stride; i++) {
      const x = data[rowStart + i]
      const a = i >= 4 ? data[rowStart + i - 4] : 0
      const b = y > 0 ? data[rowStart - stride + i] : 0
      const c = y > 0 && i >= 4 ? data[rowStart - stride + i - 4] : 0
      const candidates = [x, (x - a) & 0xff, (x - b) & 0xff, (x - ((a + b) >> 1)) & 0xff, (x - paeth(a, b, c)) & 0xff]
      for (let f = 0; f < 5; f++) {
        filtered[f][i] = candidates[f]
        const signed = candidates[f] > 127 ? candidates[f] - 256 : candidates[f]
        sums[f] += signed < 0 ? -signed : signed
      }
    }
    let best = 0
    for (let f = 1; f < 5; f++) if (sums[f] < sums[best]) best = f
    strideBytes[y * (stride + 1)] = types[best]
    filtered[best].copy(strideBytes, y * (stride + 1) + 1)
  }

  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(strideBytes, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}
