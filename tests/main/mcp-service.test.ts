/**
 * McpService tests (ticket 89): the main-side backend against a real
 * sandbox (temp dirs for the home + the Pi agent dir) — the read/merge
 * surface over actual files, the disabled-flag write, add/edit/delete
 * landing in the correct layer, and the red lines: external host-tool
 * configs never written, cross-tool ~/.agents winners refused, and the
 * canonical-write-path guard.
 */

import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { McpService } from '../../src/main/settings/mcp-service'
import { mergeMcpLayers, type McpServerForm } from '../../src/shared/mcp-management'

let sandbox = ''
let home = ''
let agentDir = ''
let project = ''

const previousEnv: Record<string, string | undefined> = {}

beforeEach(() => {
  sandbox = mkdtemp()
  home = path.join(sandbox, 'home')
  agentDir = path.join(sandbox, 'pi-agent')
  project = path.join(sandbox, 'project')
  mkdirSync(home, { recursive: true })
  mkdirSync(agentDir, { recursive: true })
  mkdirSync(project, { recursive: true })
  for (const key of ['PICODE_PI_AGENT_DIR', 'PI_CODING_AGENT_DIR', 'PICODE_MCP_HOME']) {
    previousEnv[key] = process.env[key]
  }
  process.env['PICODE_PI_AGENT_DIR'] = agentDir
  delete process.env['PI_CODING_AGENT_DIR']
  process.env['PICODE_MCP_HOME'] = home
})

afterEach(() => {
  for (const [key, value] of Object.entries(previousEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  rmSync(sandbox, { recursive: true, force: true })
})

function mkdtemp(): string {
  return mkdtempSync(path.join(tmpdir(), 'picode-mcp-service-'))
}

function service(): McpService {
  return new McpService({})
}

function form(overrides: Partial<McpServerForm>): McpServerForm {
  return {
    name: 'search',
    transport: 'stdio',
    command: 'run',
    args: '',
    env: '',
    url: '',
    oauth: false,
    ...overrides
  }
}

describe('listConfig — the multi-layer read over real files', () => {
  it('reports the empty state honestly: no files, no servers, no errors', () => {
    const report = service().listConfig(project)
    expect(report.error).toBeNull()
    expect(report.globalLayers).toHaveLength(4)
    expect(report.projectLayers).toHaveLength(2)
    for (const layer of [...report.globalLayers, ...report.projectLayers]) {
      expect(layer.exists).toBe(false)
      expect(layer.error).toBeNull()
      expect(layer.servers).toEqual({})
    }
    // The merged view of nothing is honestly empty.
    expect(mergedRows(report)).toEqual([])
  })

  it('reads every layer file and merges with winning-source annotation', () => {
    mkdirSync(path.join(home, '.config/mcp'), { recursive: true })
    writeFileSync(path.join(home, '.config/mcp/mcp.json'), JSON.stringify({ mcpServers: { search: { command: 'search', env: { KEY: 'global' } }, shared: { command: 'shared' } } }))
    writeFileSync(path.join(agentDir, 'mcp.json'), JSON.stringify({ mcpServers: { search: { env: { KEY: 'pi-global' } } } }))
    writeFileSync(path.join(project, '.mcp.json'), JSON.stringify({ mcpServers: { search: { args: ['--fast'] } } }))

    const report = service().listConfig(project)
    const merged = mergedServers(report)
    expect(merged['search']).toEqual({ command: 'search', env: { KEY: 'pi-global' }, args: ['--fast'] })
    const row = mergedRows(report).find((r) => r.name === 'search')!
    expect(row.winnerId).toBe('shared-project')
    expect(row.definedIn.map((d) => d.id)).toEqual(['shared-global', 'pi-global', 'shared-project'])
    expect(merged['shared']).toEqual({ command: 'shared' })
  })

  it('surfaces a corrupt layer as an error row without inventing servers', () => {
    writeFileSync(path.join(project, '.mcp.json'), '{nope')
    const report = service().listConfig(project)
    const layer = report.projectLayers.find((l) => l.id === 'shared-project')!
    expect(layer.error).toMatch(/Invalid JSON/)
    expect(layer.servers).toEqual({})
  })

  it('without a cwd the project face is absent (no invented layers)', () => {
    const report = service().listConfig(null)
    expect(report.cwd).toBeNull()
    expect(report.projectLayers).toEqual([])
  })
})

describe('toggleServer — the disabled flag lands in the project Pi layer', () => {
  it('disable writes only the flag; enable removes it (file assertions)', async () => {
    const flagFile = path.join(project, '.pi', 'mcp.json')
    writeFileSync(path.join(project, '.mcp.json'), JSON.stringify({ mcpServers: { search: { command: 'search' } } }))

    const disable = await service().toggleServer('search', true, project)
    expect(disable).toEqual({ ok: true, path: flagFile })
    expect(readDoc(flagFile)).toEqual({ mcpServers: { search: { disabled: true } } })

    const enable = await service().toggleServer('search', false, project)
    expect(enable.ok).toBe(true)
    expect(readDoc(flagFile)).toEqual({ mcpServers: {} })
  })

  it('enable writes an explicit false when a lower layer is itself disabled', async () => {
    writeFileSync(path.join(project, '.mcp.json'), JSON.stringify({ mcpServers: { search: { command: 's', disabled: true } } }))
    const flagFile = path.join(project, '.pi', 'mcp.json')
    mkdirSync(path.dirname(flagFile), { recursive: true })
    writeFileSync(flagFile, JSON.stringify({ mcpServers: { search: { disabled: true } } }))

    await service().toggleServer('search', false, project)
    expect(readDoc(flagFile)).toEqual({ mcpServers: { search: { disabled: false } } })
  })

  it('refuses without a workspace instead of writing somewhere guessed', async () => {
    const outcome = await service().toggleServer('search', true, null)
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.error).toMatch(/no focused session/)
  })

  it('the flag write never copies the definition (credential safety)', async () => {
    writeFileSync(path.join(project, '.mcp.json'), JSON.stringify({ mcpServers: { search: { url: 'https://x/mcp', bearerToken: 'secret' } } }))
    const flagFile = path.join(project, '.pi', 'mcp.json')
    await service().toggleServer('search', true, project)
    expect(JSON.stringify(readDoc(flagFile))).not.toContain('secret')
    expect(readDoc(flagFile)).toEqual({ mcpServers: { search: { disabled: true } } })
  })
})

describe('writeServerEntry — adds and edits land in the correct layer', () => {
  it('add targets the project .mcp.json', async () => {
    const outcome = await service().writeServerEntry('add', form({ name: 'local' }), 'project', project)
    expect(outcome).toEqual({ ok: true, path: path.join(project, '.mcp.json') })
    expect(readDoc(path.join(project, '.mcp.json'))).toEqual({ mcpServers: { local: { command: 'run' } } })
  })

  it('add targets the global shared config', async () => {
    const outcome = await service().writeServerEntry('add', form({ name: 'g', transport: 'http', url: 'https://x/mcp', oauth: true }), 'global', project)
    expect(outcome).toEqual({ ok: true, path: path.join(home, '.config/mcp/mcp.json') })
    expect(readDoc(path.join(home, '.config/mcp/mcp.json'))).toEqual({
      mcpServers: { g: { url: 'https://x/mcp', auth: 'oauth' } }
    })
  })

  it('edit rewrites the winning layer file and preserves unknown document keys', async () => {
    mkdirSync(path.join(home, '.config/mcp'), { recursive: true })
    writeFileSync(path.join(home, '.config/mcp/mcp.json'), JSON.stringify({ imports: ['cursor'], mcpServers: { search: { command: 'old' } } }))
    const outcome = await service().writeServerEntry('edit', form({ name: 'search', command: 'new' }), 'project', project)
    expect(outcome.ok).toBe(true)
    const doc = readDoc(path.join(home, '.config/mcp/mcp.json'))
    expect(doc['imports']).toEqual(['cursor'])
    expect((doc['mcpServers'] as Record<string, object>)['search']).toEqual({ command: 'new' })
  })

  it('add without a workspace refuses the project target', async () => {
    const outcome = await service().writeServerEntry('add', form({}), 'project', null)
    expect(outcome.ok).toBe(false)
  })
})

describe('removeServer — deletes from the owning layer', () => {
  it('removes the definition from the winner file only', async () => {
    writeFileSync(path.join(project, '.mcp.json'), JSON.stringify({ mcpServers: { a: { command: 'a' }, b: { command: 'b' } } }))
    writeFileSync(path.join(agentDir, 'mcp.json'), JSON.stringify({ mcpServers: { a: { command: 'a-global' } } }))

    const outcome = await service().removeServer('a', project)
    expect(outcome).toEqual({ ok: true, path: path.join(project, '.mcp.json') })
    expect(readDoc(path.join(project, '.mcp.json'))).toEqual({ mcpServers: { b: { command: 'b' } } })
    // The shadowed global definition survives and resurfaces.
    expect(readDoc(path.join(agentDir, 'mcp.json'))).toEqual({ mcpServers: { a: { command: 'a-global' } } })
  })

  it('a cross-tool ~/.agents winner is refused with zero writes', async () => {
    const agentsFile = path.join(home, '.agents', 'mcp.json')
    mkdirSync(path.dirname(agentsFile), { recursive: true })
    writeFileSync(agentsFile, JSON.stringify({ mcpServers: { agent: { command: 'x' } } }))
    const before = readFileSync(agentsFile, 'utf-8')

    const remove = await service().removeServer('agent', project)
    expect(remove.ok).toBe(false)
    const edit = await service().writeServerEntry('edit', form({ name: 'agent', command: 'y' }), 'project', project)
    expect(edit.ok).toBe(false)
    expect(readFileSync(agentsFile, 'utf-8')).toBe(before)
  })

  it('an unknown name refuses honestly', async () => {
    const outcome = await service().removeServer('ghost', project)
    expect(outcome.ok).toBe(false)
  })
})

describe('writer fidelity — the adapter 2.35 writeConfigText contract', () => {
  it('a symlinked config keeps its alias: the write lands in the link target (2.35 #597)', async () => {
    // The operator's dotfiles alias: the canonical path is a symlink to a
    // managed file. The adapter resolves an existing file through realpath
    // before the atomic replace — PiCode's writer must do the same, or the
    // alias is silently destroyed and the operator's dotfiles diverge.
    mkdirSync(path.join(home, 'dotfiles'), { recursive: true })
    const managed = path.join(home, 'dotfiles', 'pi-mcp.json')
    writeFileSync(managed, JSON.stringify({ mcpServers: { other: { command: 'o' } } }))
    const flagFile = path.join(project, '.pi', 'mcp.json')
    mkdirSync(path.dirname(flagFile), { recursive: true })
    symlinkSync(managed, flagFile)
    writeFileSync(path.join(project, '.mcp.json'), JSON.stringify({ mcpServers: { search: { command: 's' } } }))

    const outcome = await service().toggleServer('search', true, project)
    expect(outcome).toEqual({ ok: true, path: flagFile })
    // The alias SURVIVES and still points at the managed file.
    expect(lstatSync(flagFile).isSymbolicLink()).toBe(true)
    expect(readlinkSync(flagFile)).toBe(managed)
    // The content landed in the target (read through either path).
    const expected = { mcpServers: { other: { command: 'o' }, search: { disabled: true } } }
    expect(readDoc(managed)).toEqual(expected)
    expect(readDoc(flagFile)).toEqual(expected)
  })

  it('an existing file keeps its mode across the atomic replace (2.35 writeConfigText)', async () => {
    const flagFile = path.join(project, '.pi', 'mcp.json')
    mkdirSync(path.dirname(flagFile), { recursive: true })
    writeFileSync(flagFile, JSON.stringify({ mcpServers: { search: { command: 's' } } }))
    chmodSync(flagFile, 0o600)

    await service().toggleServer('search', true, project)
    expect(readDoc(flagFile)).toEqual({ mcpServers: { search: { command: 's', disabled: true } } })
    expect(statSync(flagFile).mode & 0o777).toBe(0o600)
  })
})

describe('red lines — external host-tool configs are never written', () => {
  it('external configs seeded in the sandbox stay byte-identical across every action', async () => {
    const external = {
      cursor: path.join(home, '.cursor', 'mcp.json'),
      claude: path.join(home, '.claude', 'mcp.json')
    }
    for (const file of Object.values(external)) {
      mkdirSync(path.dirname(file), { recursive: true })
      writeFileSync(file, JSON.stringify({ mcpServers: { external: { command: 'ext' } } }))
    }
    const before = Object.fromEntries(Object.entries(external).map(([k, f]) => [k, readFileSync(f, 'utf-8')]))

    const svc = service()
    await svc.writeServerEntry('add', form({ name: 'added' }), 'global', project)
    await svc.writeServerEntry('add', form({ name: 'added' }), 'project', project)
    await svc.writeServerEntry('edit', form({ name: 'added', command: 'edited' }), 'project', project)
    await svc.toggleServer('added', true, project)
    await svc.removeServer('added', project)

    for (const [key, file] of Object.entries(external)) {
      expect(readFileSync(file, 'utf-8')).toBe(before[key]!)
    }
  })
})

describe('revealLayer', () => {
  it('resolves a layer file to itself, or to the nearest existing ancestor', () => {
    const svc = service()
    const layerPath = path.join(project, '.mcp.json')
    expect(svc.revealLayer(layerPath, project)).toEqual({ ok: true, target: project })
    writeFileSync(layerPath, JSON.stringify({}))
    expect(svc.revealLayer(layerPath, project)).toEqual({ ok: true, target: layerPath })
  })

  it('refuses paths outside the layer set', () => {
    const svc = service()
    expect(svc.revealLayer(path.join(sandbox, 'elsewhere.json'), project).ok).toBe(false)
    expect(svc.revealLayer('', project).ok).toBe(false)
  })
})

function readDoc(file: string): Record<string, unknown> {
  expect(existsSync(file)).toBe(true)
  return JSON.parse(readFileSync(file, 'utf-8'))
}

function mergedServers(report: ReturnType<McpService['listConfig']>): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {}
  for (const row of mergedRows(report)) out[row.name] = row.entry
  return out
}

describe('service defaults follow the SDK agent-dir rule', () => {
  it('resolves ~/.pi/agent when no override env is set', () => {
    delete process.env['PICODE_PI_AGENT_DIR']
    delete process.env['PI_CODING_AGENT_DIR']
    delete process.env['PICODE_MCP_HOME']
    const svc = new McpService({})
    expect(svc.agentDir).toBe(path.join(homedir(), '.pi', 'agent'))
    expect(svc.home).toBe(homedir())
  })
})

function mergedRows(report: ReturnType<McpService['listConfig']>) {
  return mergeMcpLayers([...report.globalLayers, ...report.projectLayers])
}
