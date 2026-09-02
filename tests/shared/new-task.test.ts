import { describe, expect, it } from 'vitest'
import { filterWorkspaces, recentProjects, resolveNewTaskProject } from '../../src/shared/new-task.ts'
import type { SessionSummary } from '../../src/shared/sessions/types.ts'

/** Minimal SessionSummary factory — only cwd/modifiedAt drive these modules. */
function session(cwd: string, modifiedAt: number, id = cwd): SessionSummary {
  return {
    file: `${cwd}/${id}.jsonl`,
    id,
    cwd,
    name: null,
    title: `t-${id}`,
    startedAt: new Date(modifiedAt).toISOString(),
    modifiedAt,
    createdAt: null,
    messageCount: 1
  }
}

describe('recentProjects', () => {
  it('orders distinct cwds by their most recent session, newest first', () => {
    const projects = recentProjects([
      session('/repos/api', 100),
      session('/repos/web', 300),
      session('/repos/api', 400),
      session('/repos/ops', 200)
    ])
    expect(projects).toEqual(['/repos/api', '/repos/web', '/repos/ops'])
  })

  it('returns an empty list for an empty index', () => {
    expect(recentProjects([])).toEqual([])
  })

  it('keeps a project whose only session is old, after fresher projects', () => {
    const projects = recentProjects([session('/old', 1), session('/new', 999)])
    expect(projects).toEqual(['/new', '/old'])
  })
})

describe('resolveNewTaskProject', () => {
  const base = {
    mode: 'last-used' as const,
    fixedProject: null,
    activeSessionCwd: null,
    lastUsedDirectory: null,
    recentProjects: [] as readonly string[]
  }

  it('resolves the fallback chain: active session → last used → recent first', () => {
    expect(
      resolveNewTaskProject({
        ...base,
        activeSessionCwd: '/repos/a',
        lastUsedDirectory: '/repos/b',
        recentProjects: ['/repos/c', '/repos/d']
      })
    ).toBe('/repos/a')
    expect(resolveNewTaskProject({ ...base, lastUsedDirectory: '/repos/b', recentProjects: ['/repos/c'] })).toBe(
      '/repos/b'
    )
    expect(resolveNewTaskProject({ ...base, recentProjects: ['/repos/c', '/repos/d'] })).toBe('/repos/c')
  })

  it('returns null when nothing is known yet (fresh install)', () => {
    expect(resolveNewTaskProject(base)).toBeNull()
  })

  it('treats blank strings as unknown at every link of the chain', () => {
    expect(
      resolveNewTaskProject({ ...base, activeSessionCwd: '   ', lastUsedDirectory: '', recentProjects: ['', '/real'] })
    ).toBe('/real')
  })

  it('pins the fixed project in fixed mode, overriding the whole chain', () => {
    expect(
      resolveNewTaskProject({
        ...base,
        mode: 'fixed',
        fixedProject: '/repos/pinned',
        activeSessionCwd: '/repos/a',
        lastUsedDirectory: '/repos/b',
        recentProjects: ['/repos/c']
      })
    ).toBe('/repos/pinned')
  })

  it('falls back to the chain in fixed mode when no fixed project is chosen yet', () => {
    expect(resolveNewTaskProject({ ...base, mode: 'fixed', fixedProject: null, recentProjects: ['/repos/c'] })).toBe(
      '/repos/c'
    )
  })

  it('ignores the fixed project in last-used mode', () => {
    expect(
      resolveNewTaskProject({ ...base, mode: 'last-used', fixedProject: '/repos/pinned', lastUsedDirectory: '/b' })
    ).toBe('/b')
  })

  it('skips blank entries at the head of the recent list', () => {
    expect(resolveNewTaskProject({ ...base, recentProjects: ['', '  '] })).toBeNull()
    expect(resolveNewTaskProject({ ...base, recentProjects: ['', '/repos/first-real'] })).toBe('/repos/first-real')
  })
})

describe('filterWorkspaces', () => {
  const projects = ['/repos/PiCode', '/repos/api-gateway', '/home/demo/WebApp']

  it('keeps everything for a blank query', () => {
    expect(filterWorkspaces(projects, '')).toEqual(projects)
    expect(filterWorkspaces(projects, '   ')).toEqual(projects)
  })

  it('matches case-insensitively on the project label', () => {
    expect(filterWorkspaces(projects, 'picode')).toEqual(['/repos/PiCode'])
    expect(filterWorkspaces(projects, 'WEBAPP')).toEqual(['/home/demo/WebApp'])
  })

  it('matches on the full path too', () => {
    expect(filterWorkspaces(projects, 'repos/api')).toEqual(['/repos/api-gateway'])
    expect(filterWorkspaces(projects, '/home/demo')).toEqual(['/home/demo/WebApp'])
  })

  it('returns nothing when no workspace matches', () => {
    expect(filterWorkspaces(projects, 'zzz')).toEqual([])
  })
})
