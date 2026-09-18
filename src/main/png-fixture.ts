/**
 * Deterministic PNG fixtures for the harnesses (ticket 91). The smoke and
 * the visual harness both need REAL decodable images with known pixel
 * dimensions: the lightbox's full-resolution rendering (过采样缩放不糊) is
 * only provable against a payload whose naturalWidth the harness controls —
 * a pasted File must decode to exactly the width the assertion expects.
 *
 * Zero-asset discipline: the bytes are built here (IHDR + a zlib IDAT +
 * CRC-checked chunks), not committed as binaries, and the paint callback
 * keeps them deterministic — same call, same pixels, every run.
 */

import { deflateSync } from 'node:zlib'

/** RGB triple the paint callback returns for one pixel. */
export type Rgb = readonly [number, number, number]

/** CRC-32 (IEEE 802.3), the PNG chunk checksum — small table-driven form. */
function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let bit = 0; bit < 8; bit++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  }
  return (c ^ 0xffffffff) >>> 0
}

/** One PNG chunk: length + type + data + CRC. */
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

/**
 * Build an 8-bit truecolor PNG of `width` × `height`, each pixel painted by
 * `paint(x, y)`. Rows carry the standard filter-0 byte; the raw scanlines
 * deflate into the single IDAT.
 */
export function pngBuffer(width: number, height: number, paint: (x: number, y: number) => Rgb): Buffer {
  const stride = 1 + width * 3
  const raw = Buffer.alloc(height * stride)
  for (let y = 0; y < height; y++) {
    const rowStart = y * stride
    raw[rowStart] = 0 // filter: none
    for (let x = 0; x < width; x++) {
      const [r, g, b] = paint(x, y)
      const at = rowStart + 1 + x * 3
      raw[at] = r
      raw[at + 1] = g
      raw[at + 2] = b
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // color type: truecolor RGB
  // compression (0), filter (0), interlace (0): zero-filled
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

/** pngBuffer as base64 — the shape the harnesses inject into the page. */
export function pngBase64(width: number, height: number, paint: (x: number, y: number) => Rgb): string {
  return pngBuffer(width, height, paint).toString('base64')
}

/**
 * The ticket-91 fixture look: an 8px two-tone checkerboard — hard edges a
 * human can judge blur on in the review frames (a solid fill would look
 * identical sharp or smeared). Orange × paper, the app's own accents.
 */
export function checkerboardPaint(x: number, y: number): Rgb {
  return ((x >> 3) ^ (y >> 3)) & 1 ? ([236, 121, 49] as const) : ([246, 242, 234] as const)
}
