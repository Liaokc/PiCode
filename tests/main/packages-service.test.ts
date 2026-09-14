import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  PackagesService,
  type PackagesOpRunner,
  type PackagesProbe
} from '../../src/main/settings/packages-service'
import { runOpWithManager, type OpPackageManagerLike } from '../../src/host/packages-op'
import type { AuthProbeReport } from '../../src/shared/auth-status'
import type {
  PackageRow,
  PackagesOpDescriptor,
  PackagesProgressEvent,
  PackagesReport
} from '../../src/shared/packages-management'

function packagesReport(overrides: Partial<PackagesReport>): PackagesReport {
  return {
    cwd: null,
    scannedAt: 1_800_000_000_000,
    global: [],
    project: [],
    trust: null,
    error: null,
    ...overrides
  }
}

function probeReport(report: PackagesReport, error: string | null = null): AuthProbeReport {
  return {
    scannedAt: 1_800_000_000_000,
    providers: [],
    models: [],
    commands: [],
    packages: report.global,
    projectPackages: report.project,
    packagesError: error,
    packagesScannedAt: report.scannedAt,
    packagesCwd: report.cwd,
    projectTrust: report.trust,
    error: null
  }
}

function npmRow(overrides: Partial<PackageRow>): PackageRow {
  return {
    source: 'npm:@demo/pi-clipboard',
    kind: 'npm',
    entry: 'npm:@demo/pi-clipboard',
    autoload: null,
    counts: { extensions: 1, skills: 2, prompts: 0, themes: 1 },
    installedPath: '/Users/op/.pi/agent/npm/node_modules/@demo/pi-clipboard',
    scope: 'user',
    ...overrides
  }
}

/** The noop op runner (never called by the read/toggle tests). */
const noopOp: PackagesOpRunner = async () => ({ ok: true })

function service(
  probe: PackagesProbe,
  options: { agentDir?: string; runOp?: PackagesOpRunner } = {}
): PackagesService {
  return new PackagesService({
    probe,
    runOp: options.runOp ?? noopOp,
    agentDirOverride: options.agentDir ?? null
  })
}

describe('PackagesService — list cache', () => {
  it('probes once per directory and serves the cache afterwards', async () => {
    let calls = 0
    const svc = service(async () => {
      calls += 1
      return probeReport(packagesReport({ global: [npmRow({})] }))
    })
    const first = await svc.listPackages(null)
    const second = await svc.listPackages(null)
    expect(calls).toBe(1)
    expect(first.global).toHaveLength(1)
    expect(second).toBe(first)
  })

  it('force bypasses the cache and refreshes it', async () => {
    let calls = 0
    const svc = service(async () => {
      calls += 1
      return probeReport(packagesReport({ global: [npmRow({ source: `npm:v${calls}` })] }))
    })
    await svc.listPackages(null)
    const fresh = await svc.listPackages(null, true)
    expect(calls).toBe(2)
    expect(fresh.global[0]?.source).toBe('npm:v2')
  })

  it('degrades a failed probe into an error report', async () => {
    const svc = service(async () => {
      throw new Error('probe boom')
    })
    const report = await svc.listPackages(null)
    expect(report.global).toEqual([])
    expect(report.error).toBe('probe boom')
  })

  it('reports an error when the probe carried no packages enumeration', async () => {
    const svc = service(async () => ({ scannedAt: 1, providers: [], models: [], error: null }))
    const report = await svc.listPackages(null)
    expect(report.global).toEqual([])
    expect(report.error).toContain('no enumeration')
  })
})

describe('PackagesService — toggle writes the settings file (sandboxed)', () => {
  function sandbox(): { agentDir: string; file: string } {
    const agentDir = mkdtempSync(path.join(tmpdir(), 'picode-packages-svc-'))
    const file = path.join(agentDir, 'settings.json')
    writeFileSync(file, JSON.stringify({ theme: 'dark' }))
    return { agentDir, file }
  }

  it('disable writes the canonical all-[] shape and preserves other keys', async () => {
    const t = sandbox()
    writeFileSync(t.file, JSON.stringify({ theme: 'dark', packages: ['npm:@demo/pkg'] }))
    const svc = service(async () => probeReport(packagesReport({})), { agentDir: t.agentDir })
    const outcome = await svc.togglePackage('global', 'npm:@demo/pkg', false, null)
    expect(outcome).toEqual({ ok: true })
    const doc = JSON.parse(readFileSync(t.file, 'utf-8'))
    expect(doc.theme).toBe('dark')
    expect(doc.packages).toEqual([
      { source: 'npm:@demo/pkg', extensions: [], skills: [], prompts: [], themes: [] }
    ])
  })

  it('enable strips the empty arrays back to the string form', async () => {
    const t = sandbox()
    writeFileSync(
      t.file,
      JSON.stringify({
        packages: [{ source: 'npm:@demo/pkg', extensions: [], skills: [], prompts: [], themes: [] }]
      })
    )
    const svc = service(async () => probeReport(packagesReport({})), { agentDir: t.agentDir })
    const outcome = await svc.togglePackage('global', 'npm:@demo/pkg', true, null)
    expect(outcome).toEqual({ ok: true })
    const doc = JSON.parse(readFileSync(t.file, 'utf-8'))
    expect(doc.packages).toEqual(['npm:@demo/pkg'])
  })

  it('a toggle for an absent source is a no-op (no write)', async () => {
    const t = sandbox()
    const before = readFileSync(t.file, 'utf-8')
    const svc = service(async () => probeReport(packagesReport({})), { agentDir: t.agentDir })
    const outcome = await svc.togglePackage('global', 'npm:ghost', true, null)
    expect(outcome).toEqual({ ok: true })
    expect(readFileSync(t.file, 'utf-8')).toBe(before)
  })

  it('drops the cache so the next list reflects the new truth', async () => {
    const t = sandbox()
    writeFileSync(t.file, JSON.stringify({ packages: ['npm:@demo/pkg'] }))
    let calls = 0
    const svc = service(
      async () => {
        calls += 1
        const doc = JSON.parse(readFileSync(t.file, 'utf-8'))
        return probeReport(
          packagesReport({ global: [npmRow({ entry: doc.packages?.[0] ?? 'npm:@demo/pkg' })] })
        )
      },
      { agentDir: t.agentDir }
    )
    await svc.listPackages(null)
    await svc.togglePackage('global', 'npm:@demo/pkg', false, null)
    const fresh = await svc.listPackages(null, false)
    expect(calls).toBe(2)
    expect(fresh.global[0]?.entry).toEqual({
      source: 'npm:@demo/pkg',
      extensions: [],
      skills: [],
      prompts: [],
      themes: []
    })
  })
})

describe('PackagesService — the project trust gate (zero trust.json writes)', () => {
  function sandboxProject(): { agentDir: string; project: string; settingsFile: string } {
    const agentDir = mkdtempSync(path.join(tmpdir(), 'picode-packages-trust-'))
    const project = mkdtempSync(path.join(tmpdir(), 'picode-packages-proj-'))
    const settingsFile = path.join(project, '.pi', 'settings.json')
    mkdirSync(path.dirname(settingsFile), { recursive: true })
    return { agentDir, project, settingsFile }
  }

  it('refuses project toggles for an untrusted project (ask + no decision)', () => {
    const t = sandboxProject()
    const svc = service(async () => probeReport(packagesReport({})), { agentDir: t.agentDir })
    const trust = svc.projectTrustState(t.project)
    expect(trust.trusted).toBe(false)
  })

  it('project toggle: untrusted → refused, the settings file is never written', async () => {
    const t = sandboxProject()
    const svc = service(async () => probeReport(packagesReport({})), { agentDir: t.agentDir })
    const outcome = await svc.togglePackage('project', 'npm:@demo/pkg', false, t.project)
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.error).toContain('not trusted')
    expect(existsSync(t.settingsFile)).toBe(false)
  })

  it('project toggle: trusted (saved decision in trust.json) → writes .pi/settings.json', async () => {
    const t = sandboxProject()
    // The SMOKE may seed trust.json to test the trusted path; the APP never
    // writes it (this seed stands in for a /trust decision the operator
    // made). The key is the REALPATH form — the trust walk canonicalizes
    // (macOS /var/... is a symlink to /private/var/...).
    writeFileSync(
      path.join(t.agentDir, 'trust.json'),
      JSON.stringify({ [realpathSync(t.project)]: true })
    )
    // The toggle targets an entry the project settings file lists.
    writeFileSync(t.settingsFile, JSON.stringify({ packages: ['npm:@demo/pkg'] }))
    const svc = service(async () => probeReport(packagesReport({})), { agentDir: t.agentDir })
    const outcome = await svc.togglePackage('project', 'npm:@demo/pkg', false, t.project)
    expect(outcome).toEqual({ ok: true })
    const doc = JSON.parse(readFileSync(t.settingsFile, 'utf-8'))
    expect(doc.packages).toEqual([
      { source: 'npm:@demo/pkg', extensions: [], skills: [], prompts: [], themes: [] }
    ])
  })

  it('trust.json is byte-identical after any toggle (zero app writes)', async () => {
    const t = sandboxProject()
    const trustFile = path.join(t.agentDir, 'trust.json')
    writeFileSync(trustFile, JSON.stringify({ [realpathSync(t.project)]: true }))
    const before = readFileSync(trustFile, 'utf-8')
    const svc = service(async () => probeReport(packagesReport({})), { agentDir: t.agentDir })
    await svc.togglePackage('project', 'npm:@demo/pkg', false, t.project)
    expect(readFileSync(trustFile, 'utf-8')).toBe(before)
  })

  it('a saved parent-directory decision covers the project (nearest-parent walk)', () => {
    const t = sandboxProject()
    writeFileSync(path.join(t.agentDir, 'trust.json'), JSON.stringify({ [realpathSync(t.project)]: true }))
    // The queried cwd EXISTS (a session cwd always does) so the walk runs
    // on realpath-canonicalized keys.
    const sub = path.join(t.project, 'sub', 'dir')
    mkdirSync(sub, { recursive: true })
    const svc = service(async () => probeReport(packagesReport({})), { agentDir: t.agentDir })
    expect(svc.projectTrustState(sub).trusted).toBe(true)
  })

  it('defaultProjectTrust: always in the global settings trusts a decisionless project', () => {
    const t = sandboxProject()
    writeFileSync(path.join(t.agentDir, 'settings.json'), JSON.stringify({ defaultProjectTrust: 'always' }))
    const svc = service(async () => probeReport(packagesReport({})), { agentDir: t.agentDir })
    expect(svc.projectTrustState(t.project).trusted).toBe(true)
  })
})

describe('PackagesService — ops (install/remove via the op runner)', () => {
  function sandbox(): { agentDir: string; file: string } {
    const agentDir = mkdtempSync(path.join(tmpdir(), 'picode-packages-op-'))
    const file = path.join(agentDir, 'settings.json')
    writeFileSync(file, JSON.stringify({}))
    return { agentDir, file }
  }

  it('install runs the descriptor through the runner and drops the cache', async () => {
    const t = sandbox()
    const seen: Array<{ op: string; source: string; local: boolean }> = []
    const runOp: PackagesOpRunner = async (descriptor) => {
      seen.push({ op: descriptor.op, source: descriptor.source, local: descriptor.local })
      return { ok: true }
    }
    const svc = service(async () => probeReport(packagesReport({})), { agentDir: t.agentDir, runOp })
    const events: PackagesProgressEvent[] = []
    const outcome = await svc.performOp('install', '/local/pkg', false, null, (e) => events.push(e))
    expect(outcome).toEqual({ ok: true })
    expect(seen).toEqual([{ op: 'install', source: '/local/pkg', local: false }])
    expect(events).toEqual([])
  })

  it('relays progress events from the runner', async () => {
    const t = sandbox()
    const runOp: PackagesOpRunner = async (_descriptor, onProgress) => {
      onProgress({ kind: 'packages-progress', phase: 'start', action: 'install', source: 'npm:x', message: 'Installing npm:x...' })
      onProgress({ kind: 'packages-progress', phase: 'complete', action: 'install', source: 'npm:x', message: null })
      return { ok: true }
    }
    const svc = service(async () => probeReport(packagesReport({})), { agentDir: t.agentDir, runOp })
    const events: PackagesProgressEvent[] = []
    await svc.performOp('install', 'npm:x', false, null, (e) => events.push(e))
    expect(events.map((e) => e.phase)).toEqual(['start', 'complete'])
  })

  it('a failed op surfaces the error and does not clear the cache', async () => {
    const t = sandbox()
    let calls = 0
    const runOp: PackagesOpRunner = async () => ({ ok: false, error: 'npm install failed' })
    const svc = service(
      async () => {
        calls += 1
        return probeReport(packagesReport({ global: [npmRow({})] }))
      },
      { agentDir: t.agentDir, runOp }
    )
    await svc.listPackages(null)
    const outcome = await svc.performOp('remove', 'npm:@demo/pi-clipboard', false, null, () => undefined)
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.error).toBe('npm install failed')
    await svc.listPackages(null, false)
    expect(calls).toBe(1) // served from cache — the failed op cleared nothing
  })

  it('one op at a time', async () => {
    const t = sandbox()
    let releaseGate: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve
    })
    const runOp: PackagesOpRunner = async () => {
      await gate
      return { ok: true }
    }
    const svc = service(async () => probeReport(packagesReport({})), { agentDir: t.agentDir, runOp })
    const first = svc.performOp('install', 'npm:x', false, null, () => undefined)
    const second = await svc.performOp('install', 'npm:y', false, null, () => undefined)
    expect(second.ok).toBe(false)
    if (!second.ok) expect(second.error).toContain('already running')
    releaseGate?.()
    await expect(first).resolves.toEqual({ ok: true })
  })

  it('a project-scope op is refused before the runner ever sees it (untrusted)', async () => {
    const t = sandbox()
    let ran = false
    const runOp: PackagesOpRunner = async () => {
      ran = true
      return { ok: true }
    }
    const project = mkdtempSync(path.join(tmpdir(), 'picode-packages-op-proj-'))
    const svc = service(async () => probeReport(packagesReport({})), { agentDir: t.agentDir, runOp })
    const outcome = await svc.performOp('install', '/local/pkg', true, project, () => undefined)
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.error).toContain('not trusted')
    expect(ran).toBe(false)
  })

  it('a trusted project op passes the gate to the runner', async () => {
    const t = sandbox()
    const project = mkdtempSync(path.join(tmpdir(), 'picode-packages-op-proj2-'))
    writeFileSync(path.join(t.agentDir, 'trust.json'), JSON.stringify({ [realpathSync(project)]: true }))
    const seen: PackagesOpDescriptor[] = []
    const runOp: PackagesOpRunner = async (descriptor) => {
      seen.push(descriptor)
      return { ok: true }
    }
    const svc = service(async () => probeReport(packagesReport({})), { agentDir: t.agentDir, runOp })
    const outcome = await svc.performOp('install', '/local/pkg', true, project, () => undefined)
    expect(outcome).toEqual({ ok: true })
    expect(seen).toHaveLength(1)
    expect(seen[0]?.local).toBe(true)
    expect(seen[0]?.cwd).toBe(project)
  })
})

describe('runOpWithManager (op-host collector, ticket 64 + release fix)', () => {
  function fakeManager(fail: { installError?: Error; removeError?: Error; removeResult?: boolean } = {}) {
    const state: {
      cb: ((event: { type: string; action: string; source: string; message?: string }) => void) | undefined
    } = { cb: undefined }
    const manager: OpPackageManagerLike = {
      setProgressCallback(cb) {
        state.cb = cb
      },
      async installAndPersist(_source) {
        if (fail.installError) throw fail.installError
      },
      async removeAndPersist(_source) {
        if (fail.removeError) throw fail.removeError
        return fail.removeResult ?? true
      }
    }
    return {
      manager,
      emit(event: { type: string; action: string; source: string; message?: string }): void {
        state.cb?.(event)
      }
    }
  }
  const descriptor = (op: 'install' | 'remove'): PackagesOpDescriptor => ({
    op,
    source: '../picode-smoke-pkg-x',
    local: false,
    cwd: '/tmp/project',
    agentDir: '/tmp/agent'
  })

  it('a remove that persists reports ok', async () => {
    const { manager } = fakeManager({ removeResult: true })
    const outcome = await runOpWithManager(manager, descriptor('remove'), () => undefined)
    expect(outcome).toEqual({ ok: true })
  })

  it('a remove that matches nothing is a FAILURE, never a silent no-op', async () => {
    const { manager } = fakeManager({ removeResult: false })
    const outcome = await runOpWithManager(manager, descriptor('remove'), () => undefined)
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.error).toContain('No matching package found')
  })

  it('a remove that throws surfaces the error (errors resolve, never throw)', async () => {
    const { manager } = fakeManager({ removeError: new Error('npm uninstall failed') })
    const outcome = await runOpWithManager(manager, descriptor('remove'), () => undefined)
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.error).toContain('npm uninstall failed')
  })

  it('an install failure surfaces the error', async () => {
    const { manager } = fakeManager({ installError: new Error('manifest unreadable') })
    const outcome = await runOpWithManager(manager, descriptor('install'), () => undefined)
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.error).toContain('manifest unreadable')
  })

  it('progress events relay through with unknown phases normalized', async () => {
    const seen: PackagesProgressEvent[] = []
    const { manager, emit } = fakeManager()
    const pending = runOpWithManager(manager, descriptor('install'), (e) => seen.push(e))
    emit({ type: 'start', action: 'install', source: '../picode-smoke-pkg-x' })
    emit({ type: 'weird-phase', action: 'install', source: '../picode-smoke-pkg-x' })
    emit({ type: 'complete', action: 'install', source: '../picode-smoke-pkg-x' })
    await expect(pending).resolves.toEqual({ ok: true })
    expect(seen.map((e) => e.phase)).toEqual(['start', 'progress', 'complete'])
  })
})
