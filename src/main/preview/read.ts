/**
 * Preview reader (main process, ticket 07): resolves a preview target against
 * the workspace, reads file content (with the policy's hard byte cap and a
 * binary sniff) or lists a directory (breadcrumb fallback navigation), and
 * folds everything into the JSON-safe `PreviewResult` seam (ADR-0003). No
 * filesystem logic lives in the renderer.
 */

import { open, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import {
  PREVIEW_LISTING_MAX_ENTRIES,
  PREVIEW_MAX_BYTES,
  kindForEntry,
  previewRelativePath,
  resolvePreviewPath
} from '../../shared/preview/policy'
import type { PreviewListEntry, PreviewResult } from '../../shared/preview/types'

/** How many leading bytes are sniffed for NUL when deciding "binary". */
const BINARY_SNIFF_BYTES = 8192

function humanBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

function failure(
  reason: Extract<PreviewResult, { ok: false }>['reason'],
  message: string
): Extract<PreviewResult, { ok: false }> {
  return { ok: false, reason, message }
}

async function readTextFile(absolutePath: string, sizeBytes: number): Promise<string | null> {
  const handle = await open(absolutePath, 'r')
  try {
    const sniffLength = Math.min(sizeBytes, BINARY_SNIFF_BYTES)
    const sniff = Buffer.alloc(sniffLength)
    await handle.read(sniff, 0, sniffLength, 0)
    if (sniff.includes(0)) return null
    return await handle.readFile('utf8')
  } finally {
    await handle.close()
  }
}

/** Collect the preview payload for a file-or-directory target. */
export async function readPreview(cwd: string, rawPath: string): Promise<PreviewResult> {
  const resolved = resolvePreviewPath(cwd, rawPath)
  if (resolved === null) return failure('failed', 'The preview target path is empty.')

  let info
  try {
    info = await stat(resolved)
  } catch (error) {
    const err = error as NodeJS.ErrnoException
    return failure(err.code === 'ENOENT' ? 'not-found' : 'not-readable', `'${previewRelativePath(cwd, resolved)}' could not be opened.`)
  }

  if (info.isDirectory()) {
    let dirents
    try {
      dirents = await readdir(resolved, { withFileTypes: true })
    } catch (error) {
      const err = error as NodeJS.ErrnoException
      return failure(err.code === 'ENOENT' ? 'not-found' : 'not-readable', 'The folder could not be listed.')
    }
    const sorted = dirents.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    const capped = sorted.slice(0, PREVIEW_LISTING_MAX_ENTRIES)
    const entries: PreviewListEntry[] = await Promise.all(
      capped.map(async (entry): Promise<PreviewListEntry> => {
        if (entry.isDirectory()) return { name: entry.name, type: 'dir', sizeBytes: null }
        try {
          const childInfo = await stat(path.join(resolved, entry.name))
          return { name: entry.name, type: 'file', sizeBytes: childInfo.size }
        } catch {
          return { name: entry.name, type: 'file', sizeBytes: null }
        }
      })
    )
    return {
      ok: true,
      kind: 'directory',
      listing: {
        absolutePath: resolved,
        cwd,
        relativePath: previewRelativePath(cwd, resolved),
        entries,
        truncated: sorted.length > PREVIEW_LISTING_MAX_ENTRIES
      }
    }
  }

  if (!info.isFile()) {
    return failure('not-readable', 'The target is neither a file nor a folder.')
  }
  if (info.size > PREVIEW_MAX_BYTES) {
    return failure(
      'too-large',
      `This file is ${humanBytes(info.size)} — over the ${humanBytes(PREVIEW_MAX_BYTES)} preview limit. Open it in an editor instead.`
    )
  }

  let text: string | null
  try {
    text = await readTextFile(resolved, info.size)
  } catch {
    return failure('not-readable', 'The file could not be read.')
  }

  const name = path.posix.basename(resolved)
  // A trailing newline yields a final empty segment; it is not a content line.
  const lineCount = text === null ? 0 : (text.endsWith('\n') ? text.slice(0, -1) : text).split('\n').length
  return {
    ok: true,
    kind: 'file',
    file: {
      absolutePath: resolved,
      cwd,
      relativePath: previewRelativePath(cwd, resolved),
      name,
      kind: kindForEntry(name, text),
      sizeBytes: info.size,
      totalLines: lineCount,
      text
    }
  }
}
