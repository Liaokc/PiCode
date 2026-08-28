/**
 * Review seam: data shapes for the Review tab's workspace-vs-HEAD diff
 * (ticket 06). Everything here crosses IPC (ADR-0003), so every member must
 * stay JSON-serializable and free of Node/browser types. Pure parsing and
 * layout helpers live beside these types and are table-driven tested.
 */

/**
 * One line inside a parsed hunk. `meta` rows carry patch annotations such as
 * "\ No newline at end of file"; they never count toward diffstats.
 */
export type DiffRow =
  | { kind: 'context'; oldLine: number; newLine: number; text: string }
  | { kind: 'del'; oldLine: number; text: string }
  | { kind: 'add'; newLine: number; text: string }
  | { kind: 'meta'; text: string }

export interface DiffHunk {
  /** Full `@@ -a,b +c,d @@ …` header line, kept verbatim for display. */
  header: string
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  rows: DiffRow[]
}

/** One file's parsed patch, extracted from a `git diff` unified patch. */
export interface FilePatch {
  /** Repo-relative display path (new path; the sole path for adds/deletes). */
  path: string
  /** Rename source path; null unless the file was renamed. */
  oldPath: string | null
  status: 'added' | 'modified' | 'deleted' | 'renamed'
  binary: boolean
  hunks: DiffHunk[]
}

/** Per-file entry as delivered to the renderer (patch + stats + provenance). */
export interface ReviewFileEntry {
  path: string
  oldPath: string | null
  status: 'added' | 'modified' | 'deleted' | 'renamed'
  binary: boolean
  additions: number
  deletions: number
  hunks: DiffHunk[]
  /** In the workspace but not in HEAD (from `git status`, never in `git diff`). */
  untracked: boolean
}

export interface ReviewSnapshot {
  cwd: string
  /** HEAD commit sha; null when the repository has no commits yet. */
  head: string | null
  /** Current branch name; null when detached or unborn beyond recovery. */
  branch: string | null
  files: ReviewFileEntry[]
}

/**
 * Result of collecting a Review snapshot. Failures are typed so the tab can
 * explain itself: a folder without git is a hint, not an error banner.
 */
export type ReviewResult =
  | { ok: true; snapshot: ReviewSnapshot }
  | { ok: false; reason: 'not-a-git-repo' | 'git-unavailable' | 'failed'; message: string }
