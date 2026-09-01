/**
 * Sidebar file browser (ticket 26): the pure state behind the sidebar's
 * file-browser mode — the "View files" group action swaps the whole task
 * list for one project's file tree. Renderer-side only; nothing here
 * crosses IPC. Tree data is lazy per directory and arrives through the
 * EXISTING preview directory-read channel (`preview:load`), which lists
 * every entry unfiltered — hidden entries (.git, .idea, …) included —
 * dirs first, alphabetical. The tree mirrors that order; it is a
 * projection of the channel, not a second sort authority.
 */

/** One row of a listing as delivered by the preview channel. */
export interface FileBrowserListingEntry {
  name: string
  type: 'file' | 'dir'
}

/** One node of the browser tree. `path` is relative to the project root
 * ('' is the root itself); it doubles as the preview-channel target and
 * the node's identity. */
export interface FileBrowserNode {
  name: string
  path: string
  type: 'file' | 'dir'
}

export interface FileBrowserState {
  cwd: string
  /** Group label shown in the browser's title bar (the project name). */
  project: string
  /** Loaded child nodes per directory path ('' = root), in delivered order. */
  children: Readonly<Record<string, readonly FileBrowserNode[]>>
  /** Directories currently expanded. */
  expanded: ReadonlySet<string>
  /** Directories whose listing is in flight (root included). */
  loading: ReadonlySet<string>
  /** Directories whose listing failed (shown as an inline error + retry). */
  failed: ReadonlySet<string>
}

export type FileBrowserAction =
  | { type: 'close' }
  | { type: 'toggle'; path: string }
  | { type: 'retry'; path: string }
  | { type: 'children-loaded'; path: string; entries: readonly FileBrowserListingEntry[] }
  | { type: 'children-failed'; path: string }

/** Open the browser for one project: root listing in flight, nothing cached. */
export function openBrowser(cwd: string, project: string): FileBrowserState {
  return { cwd, project, children: { '': [] }, expanded: new Set(), loading: new Set(['']), failed: new Set() }
}

function childPath(parent: string, name: string): string {
  return parent === '' ? name : `${parent}/${name}`
}

/** Toggle one directory. Expanding a directory that has no cached children
 * marks it loading (the component then fetches through the preview
 * channel); expanding a cached one is instant; collapsing always is. */
function toggle(state: FileBrowserState, path: string): FileBrowserState {
  const expanded = new Set(state.expanded)
  const loading = new Set(state.loading)
  if (expanded.has(path)) {
    expanded.delete(path)
    return { ...state, expanded, loading }
  }
  expanded.add(path)
  if (state.children[path] === undefined) loading.add(path)
  return { ...state, expanded, loading }
}

/** Re-request one failed listing (root has no toggle to retry through). */
function retry(state: FileBrowserState, path: string): FileBrowserState {
  const loading = new Set(state.loading)
  const failed = new Set(state.failed)
  failed.delete(path)
  loading.add(path)
  return { ...state, loading, failed }
}

export function fileBrowserReducer(
  state: FileBrowserState | null,
  action: FileBrowserAction
): FileBrowserState | null {
  if (state === null) return null
  switch (action.type) {
    case 'close':
      return null
    case 'toggle':
      return toggle(state, action.path)
    case 'retry':
      return retry(state, action.path)
    case 'children-loaded': {
      const children = { ...state.children }
      children[action.path] = action.entries.map((entry) => ({
        name: entry.name,
        path: childPath(action.path, entry.name),
        type: entry.type
      }))
      const loading = new Set(state.loading)
      const failed = new Set(state.failed)
      loading.delete(action.path)
      failed.delete(action.path)
      return { ...state, children, loading, failed }
    }
    case 'children-failed': {
      const loading = new Set(state.loading)
      const failed = new Set(state.failed)
      loading.delete(action.path)
      failed.add(action.path)
      return { ...state, loading, failed }
    }
    default:
      return state
  }
}

/** One renderable row of the tree: a node, its nesting depth and the
 * per-directory status flags the row must show (spinner / error). */
export interface FileBrowserRow {
  node: FileBrowserNode
  depth: number
  loading: boolean
  failed: boolean
}

/** Flatten the expanded tree into display order: a directory's rows follow
 * it directly, one depth level deeper. */
export function browserRows(state: FileBrowserState): FileBrowserRow[] {
  const rows: FileBrowserRow[] = []

  function walk(nodes: readonly FileBrowserNode[], depth: number): void {
    for (const node of nodes) {
      rows.push({
        node,
        depth,
        loading: state.loading.has(node.path),
        failed: state.failed.has(node.path)
      })
      if (node.type === 'dir' && state.expanded.has(node.path)) {
        const children = state.children[node.path]
        if (children !== undefined) walk(children, depth + 1)
      }
    }
  }

  const root = state.children['']
  if (root !== undefined) walk(root, 0)
  return rows
}

/** Icon vocabulary the tree renders (ticket 26: type icons per ZCode). */
export type FileIconKind = 'folder' | 'git' | 'docs' | 'image' | 'style' | 'config' | 'code' | 'file'

const CODE_EXTENSIONS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py', 'rb', 'go', 'rs', 'java', 'c', 'h',
  'cpp', 'hpp', 'swift', 'kt', 'php', 'sh', 'bash', 'zsh', 'fish', 'sql', 'html',
  'htm', 'vue', 'svelte', 'lua', 'pl', 'r', 'scala', 'dart'
])
const CONFIG_EXTENSIONS = new Set(['json', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'xml', 'lock', 'env', 'properties'])
const DOCS_EXTENSIONS = new Set(['md', 'markdown', 'mdx', 'txt', 'rst', 'adoc'])
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'avif', 'bmp'])
const STYLE_EXTENSIONS = new Set(['css', 'scss', 'sass', 'less', 'styl'])

/** Type icon for one tree entry. Directories are folders (the tree keeps
 * the folder glyph for hidden dirs like .git too); the git family of files
 * gets its own kind; the rest classify by extension. */
export function fileIconKind(name: string, type: 'file' | 'dir'): FileIconKind {
  if (type === 'dir') return 'folder'
  const lower = name.toLowerCase()
  if (lower.startsWith('.git')) return 'git'
  const dot = lower.lastIndexOf('.')
  if (dot === -1 || dot === lower.length - 1) return 'file'
  const ext = lower.slice(dot + 1)
  if (CONFIG_EXTENSIONS.has(ext)) return 'config'
  if (DOCS_EXTENSIONS.has(ext)) return 'docs'
  if (IMAGE_EXTENSIONS.has(ext)) return 'image'
  if (STYLE_EXTENSIONS.has(ext)) return 'style'
  if (CODE_EXTENSIONS.has(ext)) return 'code'
  return 'file'
}
