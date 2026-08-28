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

/** Markdown above this size is shown as source rather than parsed. */
export const PREVIEW_MARKDOWN_MAX_BYTES = 256_000

/** Initial (and per-"Show more") number of rendered source lines. */
export const PREVIEW_SOURCE_WINDOW_LINES = 1_000

/** Hard cap on rendered source lines, whatever the "Show more" clicks say. */
export const PREVIEW_SOURCE_MAX_LINES = 20_000

/** Hard cap on rows in a directory listing. */
export const PREVIEW_LISTING_MAX_ENTRIES = 500

/** Markdown files render as rich markdown; every other extension is source. */
export function isMarkdownName(name: string): boolean {
  const lower = name.toLowerCase()
  return lower.endsWith('.md') || lower.endsWith('.markdown')
}

/** Classify a previewed file. `text === null` means the reader saw binary. */
export function kindForEntry(name: string, text: string | null): PreviewFileKind {
  if (text === null) return 'binary'
  return isMarkdownName(name) ? 'markdown' : 'source'
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

/** How the tab presents a loaded file: parsed markdown or highlighted source. */
export function displayModeFor(file: PreviewFileEntry): 'markdown' | 'source' {
  if (file.kind !== 'markdown') return 'source'
  return file.sizeBytes <= PREVIEW_MARKDOWN_MAX_BYTES ? 'markdown' : 'source'
}
