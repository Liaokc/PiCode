import { describe, expect, it } from 'vitest'
import { buildFileTree, flattenTree, type FileTreeNode } from '../../src/shared/review/tree'

describe('buildFileTree', () => {
  it('returns an empty list for no files', () => {
    expect(buildFileTree([])).toEqual([])
  })

  it('lists root-level files directly', () => {
    expect(buildFileTree(['a.ts', 'b.ts'])).toEqual([
      { type: 'file', name: 'a.ts', path: 'a.ts' },
      { type: 'file', name: 'b.ts', path: 'b.ts' }
    ])
  })

  it('nests files under directories, folders before files, alphabetical', () => {
    const tree = buildFileTree(['z-root.ts', 'src/deep/x.ts', 'src/a.ts', 'docs/readme.md'])
    expect(tree).toEqual([
      {
        type: 'dir',
        name: 'docs',
        path: 'docs',
        children: [{ type: 'file', name: 'readme.md', path: 'docs/readme.md' }]
      },
      {
        type: 'dir',
        name: 'src',
        path: 'src',
        children: [
          {
            type: 'dir',
            name: 'deep',
            path: 'src/deep',
            children: [{ type: 'file', name: 'x.ts', path: 'src/deep/x.ts' }]
          },
          { type: 'file', name: 'a.ts', path: 'src/a.ts' }
        ]
      },
      { type: 'file', name: 'z-root.ts', path: 'z-root.ts' }
    ])
  })

  it('merges shared directory prefixes', () => {
    const tree = buildFileTree(['src/a.ts', 'src/b.ts'])
    expect(tree).toHaveLength(1)
    const dir = tree[0] as Extract<FileTreeNode, { type: 'dir' }>
    expect(dir.name).toBe('src')
    expect(dir.children?.map((c) => c.name)).toEqual(['a.ts', 'b.ts'])
  })
})

describe('flattenTree', () => {
  it('produces a depth-annotated row list for rendering', () => {
    const tree = buildFileTree(['src/deep/x.ts', 'root.ts'])
    const rows = flattenTree(tree)
    expect(rows).toEqual([
      { node: { type: 'dir', name: 'src', path: 'src', children: expect.anything() }, depth: 0 },
      { node: { type: 'dir', name: 'deep', path: 'src/deep', children: expect.anything() }, depth: 1 },
      { node: { type: 'file', name: 'x.ts', path: 'src/deep/x.ts' }, depth: 2 },
      { node: { type: 'file', name: 'root.ts', path: 'root.ts' }, depth: 0 }
    ])
  })
})
