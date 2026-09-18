/**
 * Preview policy (ticket 07): the explicit large-file strategy and the pure
 * path/kind helpers shared by the main-process reader and the renderer tab.
 *
 * Large-file strategy, in layers:
 * 1. Files above PREVIEW_MAX_BYTES are refused by the reader with a typed
 *    `too-large` failure — nothing oversized ever crosses IPC.
 * 2. Markdown above PREVIEW_MARKDOWN_MAX_BYTES is delivered but rendered as
 *    plain highlighted source instead of being parsed (parse cost guard).
 * 3. Source view renders PREVIEW_SOURCE_WINDOW_LINES lines at a time
 *    ("Show more" appends windows), hard-capped at PREVIEW_SOURCE_MAX_LINES
 *    so the DOM stays small no matter how long the file is.
 * 4. Directory listings cap at PREVIEW_LISTING_MAX_ENTRIES.
 */

import type { PreviewFileEntry, PreviewFileKind } from './types'

/** Hard read cap — files above this fail with `too-large` instead of loading. */
export const PREVIEW_MAX_BYTES = 2_000_000

/** Markdown above this size is shown as source rather than parsed — the
 * parse-cost cap that ticket 88 extends to SVG and HTML rendering too. */
export const PREVIEW_MARKDOWN_MAX_BYTES = 256_000

/** Initial (and per-"Show more") number of rendered source lines. */
export const PREVIEW_SOURCE_WINDOW_LINES = 1_000

/** Hard cap on rendered source lines, whatever the "Show more" clicks say. */
export const PREVIEW_SOURCE_MAX_LINES = 20_000

/** Hard cap on rows in a directory listing. */
export const PREVIEW_LISTING_MAX_ENTRIES = 500

/** Markdown files render as rich markdown (ticket 07). */
export function isMarkdownName(name: string): boolean {
  const lower = name.toLowerCase()
  return lower.endsWith('.md') || lower.endsWith('.markdown')
}

/** SVG files render as a static image plus a source view (ticket 88). */
export function isSvgName(name: string): boolean {
  return name.toLowerCase().endsWith('.svg')
}

/** HTML files render in a sandboxed iframe plus a source view (ticket 88). */
export function isHtmlName(name: string): boolean {
  const lower = name.toLowerCase()
  return lower.endsWith('.html') || lower.endsWith('.htm')
}

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp']

/** Common web images display directly; they have no source state (ticket 88). */
export function isImageName(name: string): boolean {
  const lower = name.toLowerCase()
  return IMAGE_EXTENSIONS.some((extension) => lower.endsWith(`.${extension}`))
}

/** Classify a previewed file. `text === null` means the reader saw binary —
 * except declared images, whose extension wins over the sniff so a
 * text-only .png never renders as code (ticket 88). */
export function kindForEntry(name: string, text: string | null): PreviewFileKind {
  if (isImageName(name)) return 'image'
  if (text === null) return 'binary'
  if (isMarkdownName(name)) return 'markdown'
  if (isSvgName(name)) return 'svg'
  if (isHtmlName(name)) return 'html'
  return 'source'
}

/** Kinds that carry the Rendered/Source segmented control (markdown's
 * precedent — ticket 88 extends it to svg and html). */
export function hasRenderedView(kind: PreviewFileKind): boolean {
  return kind === 'markdown' || kind === 'svg' || kind === 'html'
}

/** Mime types for the preview-file serve protocol and image data URLs
 * (ticket 88): the web formats a rendered document references, plus the
 * previewed file types themselves. Anything else is opaque bytes. */
const MIME_BY_EXTENSION: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  ico: 'image/x-icon',
  txt: 'text/plain; charset=utf-8',
  md: 'text/plain; charset=utf-8',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf'
}

/** Mime type for a filename, or application/octet-stream when unknown. */
export function mimeForName(name: string): string {
  const dot = name.lastIndexOf('.')
  if (dot < 0) return 'application/octet-stream'
  return MIME_BY_EXTENSION[name.slice(dot + 1).toLowerCase()] ?? 'application/octet-stream'
}

/**
 * The privileged scheme that serves a previewed file's relative resources
 * (ticket 88): a sandboxed HTML frame loads its document from here, so
 * `<img src="pic.png">` resolves against the file's own directory. The
 * handler lives in main/preview/serve.ts; the URL shape is shared policy.
 */
export const PREVIEW_SERVE_SCHEME = 'preview-file'

/** URL for a previewed file on the serve scheme. The hierarchical form
 * (`//local/<abs path>`) is what makes relative resources resolve against
 * the file's directory. */
export function previewFileUrl(absolutePath: string): string {
  const encoded = absolutePath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  return `${PREVIEW_SERVE_SCHEME}://local${encoded}`
}

/** Data URL for the rendered SVG state: an <img> context never executes
 * scripts, so SVG renders statically whatever it contains (ticket 88). */
export function svgDataUrl(svgText: string): string {
  const bytes = new TextEncoder().encode(svgText)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `data:image/svg+xml;base64,${btoa(binary)}`
}

/**
 * Resolve a preview target to an absolute, normalized POSIX path. Absolute
 * inputs are kept (tool calls may legitimately touch files outside the
 * workspace); relative inputs join against the workspace root. Lexical only —
 * no filesystem access. Returns null for empty input.
 */
export function resolvePreviewPath(cwd: string, raw: string): string | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const isAbsolute = trimmed.startsWith('/')
  const joined = isAbsolute ? trimmed : `${cwd}/${trimmed}`
  const segments: string[] = []
  for (const segment of joined.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      segments.pop()
      continue
    }
    segments.push(segment)
  }
  return `/${segments.join('/')}`
}

/** Display path: workspace-relative when inside `cwd`, absolute otherwise. */
export function previewRelativePath(cwd: string, absolutePath: string): string {
  if (absolutePath === cwd) return '.'
  if (absolutePath.startsWith(`${cwd}/`)) return absolutePath.slice(cwd.length + 1)
  return absolutePath
}

export interface PreviewCrumb {
  name: string
  path: string
  type: 'dir' | 'file'
}

/**
 * Breadcrumb segments for the current location: the workspace root, then
 * each directory level, then the file itself. Paths outside the workspace
 * fall back to absolute segments from the filesystem root.
 */
export function previewCrumbs(cwd: string, absolutePath: string, isFile: boolean): PreviewCrumb[] {
  const crumbs: PreviewCrumb[] = []
  if (absolutePath === cwd || absolutePath.startsWith(`${cwd}/`)) {
    const rest = absolutePath === cwd ? '' : absolutePath.slice(cwd.length + 1)
    crumbs.push({ name: cwd.split('/').pop() || cwd, path: cwd, type: 'dir' })
    const segments = rest === '' ? [] : rest.split('/')
    segments.forEach((segment, index) => {
      const isLast = index === segments.length - 1
      const parent = index === 0 ? cwd : `${cwd}/${segments.slice(0, index).join('/')}`
      crumbs.push({
        name: segment,
        path: `${parent}/${segment}`,
        type: isLast && isFile ? 'file' : 'dir'
      })
    })
    return crumbs
  }
  // Outside the workspace: absolute crumbs from the filesystem root.
  const segments = absolutePath.split('/').filter((s) => s !== '')
  crumbs.push({ name: '/', path: '/', type: 'dir' })
  segments.forEach((segment, index) => {
    const isLast = index === segments.length - 1
    const path = `/${segments.slice(0, index + 1).join('/')}`
    crumbs.push({ name: segment, path, type: isLast && isFile ? 'file' : 'dir' })
  })
  return crumbs
}

/** How the tab presents a loaded file: markdown/svg/html/image rendered
 * states or highlighted source. The markdown parse-cap semantics extend to
 * SVG and HTML (ticket 88): above PREVIEW_MARKDOWN_MAX_BYTES the tab falls
 * back to source. Images are single-state at any size — the reader's 2 MB
 * hard cap is their only limit. */
export type PreviewDisplayMode = 'markdown' | 'svg' | 'html' | 'image' | 'source'

export function displayModeFor(file: PreviewFileEntry): PreviewDisplayMode {
  switch (file.kind) {
    case 'markdown':
    case 'svg':
    case 'html':
      return file.sizeBytes <= PREVIEW_MARKDOWN_MAX_BYTES ? file.kind : 'source'
    case 'image':
      return 'image'
    default:
      return 'source'
  }
}
