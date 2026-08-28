/**
 * Preview seam (ticket 07): data shapes for the side panel's File Preview
 * tab — file contents, directory listings, and typed failures. Everything
 * here crosses IPC (ADR-0003), so every member must stay JSON-serializable
 * and free of Node/browser types. The large-file policy lives in policy.ts;
 * the tab's load/navigation state machine in view-model.ts.
 */

/** How a file presents in the preview tab. */
export type PreviewFileKind =
  /** Rendered markdown (screenshot 04 right panel). */
  | 'markdown'
  /** Syntax-highlighted source with line numbers (screenshot 08). */
  | 'source'
  /** Binary content — shown as a notice, never as text. */
  | 'binary'

/** One file's content as delivered to the renderer. */
export interface PreviewFileEntry {
  /** Absolute, normalized path. */
  absolutePath: string
  /** Workspace root the preview was opened from. */
  cwd: string
  /** Path relative to `cwd` when inside it, absolute otherwise. */
  relativePath: string
  name: string
  kind: PreviewFileKind
  sizeBytes: number
  totalLines: number
  /** Decoded text; null for binary files. */
  text: string | null
}

/** One row of a directory listing (breadcrumb fallback navigation). */
export interface PreviewListEntry {
  name: string
  type: 'file' | 'dir'
  /** File size in bytes; null for directories or when stat failed. */
  sizeBytes: number | null
}

/** A directory's listing, shown when navigating breadcrumb levels. */
export interface PreviewDirectoryListing {
  absolutePath: string
  cwd: string
  /** Path relative to `cwd` when inside it, absolute otherwise. */
  relativePath: string
  /** Directories first, then files, each alphabetical. */
  entries: PreviewListEntry[]
  /** True when entries beyond the listing cap were dropped. */
  truncated: boolean
}

/**
 * Result of opening a preview target. A target that turns out to be a
 * directory yields a listing instead of a failure — breadcrumb navigation
 * walks directories the same way it opens files.
 */
export type PreviewResult =
  | { ok: true; kind: 'file'; file: PreviewFileEntry }
  | { ok: true; kind: 'directory'; listing: PreviewDirectoryListing }
  | {
      ok: false
      reason: 'not-found' | 'not-readable' | 'too-large' | 'failed'
      message: string
    }
