import { describe, expect, it } from 'vitest'
import { parseGitDiff, rowStat, unifiedRenderRows } from '../../src/shared/review/parse'

const MODIFIED_PATCH = [
  'diff --git a/src/app.ts b/src/app.ts',
  'index 1111111..2222222 100644',
  '--- a/src/app.ts',
  '+++ b/src/app.ts',
  '@@ -1,4 +1,5 @@',
  ' import { start } from "./boot"',
  ' ',
  '-const port = 3000',
  '+const port = 3001',
  '+const host = "localhost"',
  ' start(port)',
  '@@ -10,3 +11,4 @@ export function boot() {',
  '   first()',
  '-  second()',
  '+  second(true)',
  '+  third()',
  ' }'
].join('\n')

describe('parseGitDiff', () => {
  it('returns an empty list for an empty diff', () => {
    expect(parseGitDiff('')).toEqual([])
    expect(parseGitDiff('\n')).toEqual([])
  })

  it('parses a modified file with two hunks and resolved line numbers', () => {
    const files = parseGitDiff(MODIFIED_PATCH)
    expect(files).toHaveLength(1)
    const file = files[0]
    expect(file.path).toBe('src/app.ts')
    expect(file.status).toBe('modified')
    expect(file.binary).toBe(false)
    expect(file.hunks).toHaveLength(2)

    const [h1, h2] = file.hunks
    expect(h1.header).toBe('@@ -1,4 +1,5 @@')
    expect(h1.oldStart).toBe(1)
    expect(h1.oldLines).toBe(4)
    expect(h1.newStart).toBe(1)
    expect(h1.newLines).toBe(5)
    expect(h1.rows).toEqual([
      { kind: 'context', oldLine: 1, newLine: 1, text: 'import { start } from "./boot"' },
      { kind: 'context', oldLine: 2, newLine: 2, text: '' },
      { kind: 'del', oldLine: 3, text: 'const port = 3000' },
      { kind: 'add', newLine: 3, text: 'const port = 3001' },
      { kind: 'add', newLine: 4, text: 'const host = "localhost"' },
      { kind: 'context', oldLine: 4, newLine: 5, text: 'start(port)' }
    ])
    expect(h2.header).toBe('@@ -10,3 +11,4 @@ export function boot() {')
    expect(h2.oldStart).toBe(10)
    expect(h2.rows).toEqual([
      { kind: 'context', oldLine: 10, newLine: 11, text: '  first()' },
      { kind: 'del', oldLine: 11, text: '  second()' },
      { kind: 'add', newLine: 12, text: '  second(true)' },
      { kind: 'add', newLine: 13, text: '  third()' },
      { kind: 'context', oldLine: 12, newLine: 14, text: '}' }
    ])
  })

  it('parses single-line hunk headers with omitted counts', () => {
    const patch = [
      'diff --git a/one.txt b/one.txt',
      'index 1111111..2222222 100644',
      '--- a/one.txt',
      '+++ b/one.txt',
      '@@ -1 +1 @@',
      '-a',
      '+b'
    ].join('\n')
    const [file] = parseGitDiff(patch)
    expect(file.hunks[0].oldStart).toBe(1)
    expect(file.hunks[0].oldLines).toBe(1)
    expect(file.hunks[0].newLines).toBe(1)
  })

  it('parses a new file with /dev/null source marked as added', () => {
    const patch = [
      'diff --git a/new.ts b/new.ts',
      'new file mode 100644',
      'index 0000000..3333333',
      '--- /dev/null',
      '+++ b/new.ts',
      '@@ -0,0 +1,2 @@',
      '+export const x = 1',
      '+export const y = 2'
    ].join('\n')
    const [file] = parseGitDiff(patch)
    expect(file.status).toBe('added')
    expect(file.path).toBe('new.ts')
    expect(file.oldPath).toBeNull()
    expect(file.hunks[0].rows).toEqual([
      { kind: 'add', newLine: 1, text: 'export const x = 1' },
      { kind: 'add', newLine: 2, text: 'export const y = 2' }
    ])
  })

  it('parses a deleted file targeting /dev/null', () => {
    const patch = [
      'diff --git a/gone.ts b/gone.ts',
      'deleted file mode 100644',
      'index 3333333..0000000',
      '--- a/gone.ts',
      '+++ /dev/null',
      '@@ -1,2 +0,0 @@',
      '-export const x = 1',
      '-export const y = 2'
    ].join('\n')
    const [file] = parseGitDiff(patch)
    expect(file.status).toBe('deleted')
    expect(file.path).toBe('gone.ts')
    expect(file.hunks[0].rows.every((r) => r.kind === 'del')).toBe(true)
  })

  it('parses a rename with old and new paths', () => {
    const patch = [
      'diff --git a/before.ts b/after.ts',
      'similarity index 92%',
      'rename from before.ts',
      'rename to after.ts',
      'index 1111111..2222222 100644',
      '--- a/before.ts',
      '+++ b/after.ts',
      '@@ -1 +1 @@',
      '-old',
      '+new'
    ].join('\n')
    const [file] = parseGitDiff(patch)
    expect(file.status).toBe('renamed')
    expect(file.path).toBe('after.ts')
    expect(file.oldPath).toBe('before.ts')
  })

  it('marks binary files and keeps no hunks', () => {
    const patch = [
      'diff --git a/logo.png b/logo.png',
      'index 1111111..2222222 100644',
      'Binary files a/logo.png and b/logo.png differ'
    ].join('\n')
    const [file] = parseGitDiff(patch)
    expect(file.binary).toBe(true)
    expect(file.hunks).toEqual([])
    expect(file.path).toBe('logo.png')
  })

  it('skips GIT binary patch payload sections', () => {
    const patch = [
      'diff --git a/blob.bin b/blob.bin',
      'index 1111111..2222222 100644',
      'GIT binary patch',
      'literal 24',
      'cmeZneYsnD7EWv4a$yKz0D;BFnFefh^=',
      '',
      'diff --git a/next.txt b/next.txt',
      'index 1111111..2222222 100644',
      '--- a/next.txt',
      '+++ b/next.txt',
      '@@ -1 +1 @@',
      '-x',
      '+y'
    ].join('\n')
    const files = parseGitDiff(patch)
    expect(files).toHaveLength(2)
    expect(files[0].binary).toBe(true)
    expect(files[0].hunks).toEqual([])
    expect(files[1].path).toBe('next.txt')
    expect(files[1].hunks[0].rows).toEqual([
      { kind: 'del', oldLine: 1, text: 'x' },
      { kind: 'add', newLine: 1, text: 'y' }
    ])
  })

  it('parses a mode-only change with no content hunks', () => {
    const patch = [
      'diff --git a/script.sh b/script.sh',
      'old mode 100644',
      'new mode 100755'
    ].join('\n')
    const [file] = parseGitDiff(patch)
    expect(file.status).toBe('modified')
    expect(file.path).toBe('script.sh')
    expect(file.hunks).toEqual([])
    expect(file.binary).toBe(false)
  })

  it('attaches a no-newline marker as a meta row after its line', () => {
    const patch = [
      'diff --git a/eol.txt b/eol.txt',
      'index 1111111..2222222 100644',
      '--- a/eol.txt',
      '+++ b/eol.txt',
      '@@ -1 +1 @@',
      '-old without newline',
      '\\ No newline at end of file',
      '+new without newline',
      '\\ No newline at end of file'
    ].join('\n')
    const [file] = parseGitDiff(patch)
    expect(file.hunks[0].rows).toEqual([
      { kind: 'del', oldLine: 1, text: 'old without newline' },
      { kind: 'meta', text: '\\ No newline at end of file' },
      { kind: 'add', newLine: 1, text: 'new without newline' },
      { kind: 'meta', text: '\\ No newline at end of file' }
    ])
  })

  it('splits multiple files in order', () => {
    const patch = [
      'diff --git a/a.txt b/a.txt',
      'index 1111111..2222222 100644',
      '--- a/a.txt',
      '+++ b/a.txt',
      '@@ -1 +1 @@',
      '-a1',
      '+a2',
      'diff --git a/b.txt b/b.txt',
      'index 3333333..4444444 100644',
      '--- a/b.txt',
      '+++ b/b.txt',
      '@@ -1 +1 @@',
      '-b1',
      '+b2'
    ].join('\n')
    const files = parseGitDiff(patch)
    expect(files.map((f) => f.path)).toEqual(['a.txt', 'b.txt'])
  })

  it('handles paths containing spaces taken from the ---/+++ header lines', () => {
    const patch = [
      'diff --git a/my notes.md b/my notes.md',
      'index 1111111..2222222 100644',
      '--- a/my notes.md',
      '+++ b/my notes.md',
      '@@ -1 +1 @@',
      '-hello',
      '+hi'
    ].join('\n')
    const [file] = parseGitDiff(patch)
    expect(file.path).toBe('my notes.md')
  })

  it('unquotes C-style quoted paths', () => {
    const patch = [
      'diff --git a/we "ird"\\tab b/we "ird"\\tab',
      'index 1111111..2222222 100644',
      '--- "a/we \\"ird\\"\\\\tab"',
      '+++ "b/we \\"ird\\"\\\\tab"',
      '@@ -1 +1 @@',
      '-x',
      '+y'
    ].join('\n')
    const [file] = parseGitDiff(patch)
    expect(file.path).toBe('we "ird"\\tab')
  })

  it('does not confuse deleted content lines with file headers', () => {
    // The removed text `-- a/trap.md` renders as a line starting with `---`;
    // hunk line counts must keep the parser inside the hunk.
    const patch = [
      'diff --git a/trap.md b/trap.md',
      'index 1111111..2222222 100644',
      '--- a/trap.md',
      '+++ b/trap.md',
      '@@ -1,4 +1,2 @@',
      ' start',
      '--- a/trap.md',
      ' end',
      '-tail'
    ].join('\n')
    const files = parseGitDiff(patch)
    expect(files).toHaveLength(1)
    expect(files[0].path).toBe('trap.md')
    expect(files[0].hunks[0].rows).toEqual([
      { kind: 'context', oldLine: 1, newLine: 1, text: 'start' },
      { kind: 'del', oldLine: 2, text: '-- a/trap.md' },
      { kind: 'context', oldLine: 3, newLine: 2, text: 'end' },
      { kind: 'del', oldLine: 4, text: 'tail' }
    ])
  })
})

describe('unifiedRenderRows', () => {
  it('interleaves hunk headers with the hunk rows in order', () => {
    const files = parseGitDiff(MODIFIED_PATCH)
    const rows = unifiedRenderRows(files[0])
    expect(rows).toHaveLength(13) // 2 hunk headers + 11 rows
    expect(rows[0]).toEqual({ kind: 'hunk-header', header: '@@ -1,4 +1,5 @@' })
    expect(rows[1]?.kind).toBe('row')
    expect(rows[rows.length - 1]).toEqual({ kind: 'row', row: { kind: 'context', oldLine: 12, newLine: 14, text: '}' } })
  })
})

describe('rowStat', () => {
  it('counts add/del rows and skips context and meta rows', () => {
    const files = parseGitDiff(MODIFIED_PATCH)
    expect(rowStat(files[0])).toEqual({ additions: 4, deletions: 2 })
  })

  it('reports zero for binary and hunk-less files', () => {
    const binary = parseGitDiff(
      ['diff --git a/x.bin b/x.bin', 'index 1111111..2222222 100644', 'Binary files a/x.bin and b/x.bin differ'].join('\n')
    )
    expect(rowStat(binary[0])).toEqual({ additions: 0, deletions: 0 })
  })
})
