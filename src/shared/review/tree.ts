/**
 * File-tree builder for the Review tab: turns changed file paths into a
 * nested, sorted tree (directories first, then files, alphabetical). Pure
 * function over path strings.
 */

export type FileTreeNode = { type: 'file'; name: string; path: string } | { type: 'dir'; name: string; path: string; children: FileTreeNode[] }

export interface FlatTreeNode {
  node: FileTreeNode
  depth: number
}

function compareNodes(a: FileTreeNode, b: FileTreeNode): number {
  if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
  return a.name.localeCompare(b.name)
}

export function buildFileTree(paths: string[]): FileTreeNode[] {
  const root: FileTreeNode[] = []
  for (const path of paths) {
    const segments = path.split('/')
    let level = root
    let prefix = ''
    for (let i = 0; i < segments.length; i++) {
      const name = segments[i]
      const isFile = i === segments.length - 1
      prefix = prefix === '' ? name : `${prefix}/${name}`
      let node = level.find((n) => n.name === name && (isFile ? n.type === 'file' : n.type === 'dir'))
      if (!node) {
        node = isFile ? { type: 'file', name, path: prefix } : { type: 'dir', name, path: prefix, children: [] }
        level.push(node)
      }
      if (!isFile) {
        level = (node as Extract<FileTreeNode, { type: 'dir' }>).children
      }
    }
  }
  const sortLevel = (nodes: FileTreeNode[]): FileTreeNode[] => {
    nodes.sort(compareNodes)
    for (const node of nodes) {
      if (node.type === 'dir') sortLevel(node.children)
    }
    return nodes
  }
  return sortLevel(root)
}

/** Depth-first flattening for a simple mapped list in the tree column. */
export function flattenTree(nodes: FileTreeNode[], depth = 0): FlatTreeNode[] {
  const rows: FlatTreeNode[] = []
  for (const node of nodes) {
    rows.push({ node, depth })
    if (node.type === 'dir') rows.push(...flattenTree(node.children, depth + 1))
  }
  return rows
}
