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
  /** Ticket 88: static rendered image (img data-URL — scripts never run in
   * an img context) plus a source view. */
  | 'svg'
  /** Ticket 88: sandboxed-iframe rendered document plus a source view. */
  | 'html'
  /** Ticket 88: common web image (png/jpg/gif/webp), direct display,
   * single state (no source view). */
  | 'image'

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
  /** Base64 data URL for image-kind files (ticket 88); absent otherwise. */
  dataUrl?: string
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

/** Ticket 107 (additive IPC, main → renderer): one coalesced file-watch
 * invalidation for the sidebar file browser. A HINT, never data — the
 * renderer re-reads affected listings through the existing preview:load
 * channel, so the read path stays the tree's only truth. JSON-safe, free of
 * Node/browser types like every member of this seam (ADR-0003). */
export interface PreviewWatchEvent {
  /** The browsed cwd the watcher serves; the renderer drops events whose
   * cwd is not the one its browser has open. */
  cwd: string
  /** Directories RELATIVE to cwd (posix, '' = the root) whose listings may
   * have changed — the parent of each coalesced change. */
  dirs: string[]
  /** True when the window's change set could not be bounded (unnamed
   * platform change, event/dir cap breach): the renderer must treat EVERY
   * loaded listing as stale. `dirs` is empty when set. */
  overflow: boolean
}
