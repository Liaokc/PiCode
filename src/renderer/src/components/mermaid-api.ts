/**
 * The ONLY module that touches the mermaid package (ticket 59, spec R4).
 * Every consumer reaches it through a dynamic `import()`, so the bundler
 * splits mermaid — and mermaid's own lazy per-diagram chunks (the ZCode
 * same-shape family: flow/sequence/gantt/class/er/pie/…) — out of the main
 * renderer bundle. The chunk family loads only when a closed mermaid fence
 * actually needs it: the main package carries zero diagram bytes.
 *
 * Theme: the mermaid library default (light) is the approved look — the
 * dark theme is an app-wide topic, out of scope (spec R4).
 */

import mermaid from 'mermaid'

let initialized = false

function ensureInitialized(): void {
  if (initialized) return
  // startOnLoad off: rendering is driven per fence card, never by DOM
  // scanning (the transcript re-renders wholesale while streaming).
  mermaid.initialize({ startOnLoad: false })
  initialized = true
}

/**
 * Parse verdict for one fence source: `true` when the text parses as any
 * registered diagram type, `false` otherwise. Never throws — the fence-card
 * projection only wants the boolean.
 */
export async function parseMermaid(source: string): Promise<boolean> {
  ensureInitialized()
  try {
    return (await mermaid.parse(source, { suppressErrors: true })) !== false
  } catch {
    return false
  }
}

let renderCounter = 0

/**
 * Render one fence source to SVG markup. Throws when the text fails to
 * render (the caller falls back to the source card). Calls are serialized
 * inside mermaid; ids must be unique per render and CSS-safe — the `picode-`
 * prefix keeps digits out of the lead.
 */
export async function renderMermaidSvg(source: string): Promise<string> {
  ensureInitialized()
  renderCounter += 1
  const { svg } = await mermaid.render(`picode-mermaid-${renderCounter}`, source)
  return svg
}

/** The svg's intrinsic size: viewBox box first, then width/height attrs. */
function svgIntrinsicSize(svg: string): { width: number; height: number } {
  const box = /\bviewBox="([^\"]+)"/.exec(svg)
  if (box !== null) {
    const parts = box[1]!.trim().split(/[\s,]+/).map(Number)
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n) && n >= 0)) {
      const width = parts[2]!
      const height = parts[3]!
      if (width > 0 && height > 0) return { width, height }
    }
  }
  const width = /\bwidth="([\d.]+)(?:px)?"/.exec(svg)
  const height = /\bheight="([\d.]+)(?:px)?"/.exec(svg)
  if (width !== null && height !== null) {
    const w = Number(width[1])
    const h = Number(height[1])
    if (w > 0 && h > 0) return { width: w, height: h }
  }
  return { width: 800, height: 600 }
}

/**
 * Rasterize the rendered SVG markup to a PNG blob at `scale`× intrinsic
 * size, over white (the light-theme diagram background). Chromium renders
 * the SVG image — including mermaid's foreignObject labels — statically.
 */
export async function svgToPngBlob(svg: string, scale = 2): Promise<Blob> {
  const size = svgIntrinsicSize(svg)
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('svg image decode failed'))
      image.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(size.width * scale))
    canvas.height = Math.max(1, Math.round(size.height * scale))
    const ctx = canvas.getContext('2d')
    if (ctx === null) throw new Error('canvas 2d context unavailable')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (blob === null) throw new Error('canvas toBlob failed')
    return blob
  } finally {
    URL.revokeObjectURL(url)
  }
}
