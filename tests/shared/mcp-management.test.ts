/**
 * MCP-management model tests (ticket 89, Seam-1): table-driven coverage of
 * the adapter-faithful config surface — multi-layer parse/merge with
 * winning-source annotation, write-target resolution, and the pure
 * document derivations for the disabled flag / add / edit / delete writes.
 * The empty state is asserted as honestly empty, never invented.
 */

import { describe, expect, it } from 'vitest'
import {
  MCP_SECURITY_COPY,
  buildMcpLayerDescriptors,
  deriveDisabledFlagWrite,
  deriveServerEntryRemove,
  deriveServerEntryWrite,
  dirnamePath,
  editTargetPathFor,
  entryToForm,
  filterMcpRows,
  formToServerEntry,
  isCanonicalMcpWritePath,
  joinPath,
  mcpDeleteCopy,
  mergeMcpLayers,
  mergeServerEntry,
  mcpReadOnlyWinnerCopy,
  mcpWinnerBadgeLabel,
  parseMcpDocument,
  partitionMcpRows,
  revealTargetForLayer,
  serversOf,
  sharedConfigTargetPath,
  supportsOAuth,
  type McpConfigLayer,
  type McpServerEntry
} from '../../src/shared/mcp-management'

const HOME = '/home/op'
const AGENT_DIR = '/home/op/.pi/agent'
const CWD = '/work/proj'

function makeLayer(
  id: 'shared-global' | 'agents-global' | 'agents-nested-global' | 'pi-global' | 'shared-project' | 'pi-project',
  servers: Record<string, McpServerEntry>,
  overrides: Partial<McpConfigLayer> = {}
): McpConfigLayer {
  const descriptors = buildMcpLayerDescriptors({ home: HOME, agentDir: AGENT_DIR, cwd: CWD })
  const base = descriptors.find((d) => d.id === id)!
  return { ...base, exists: true, error: null, servers, ...overrides }
}

describe('layer descriptors (adapter precedence order)', () => {
  it('orders global layers lowest → highest and adds project layers only with a cwd', () => {
    const withCwd = buildMcpLayerDescriptors({ home: HOME, agentDir: AGENT_DIR, cwd: CWD })
    expect(withCwd.map((d) => d.id)).toEqual([
      'shared-global',
      'agents-global',
      'agents-nested-global',
      'pi-global',
      'shared-project',
      'pi-project'
    ])
    expect(withCwd.map((d) => d.path)).toEqual([
      joinPath(HOME, '.config/mcp/mcp.json'),
      joinPath(HOME, '.agents/mcp.json'),
      joinPath(HOME, '.agents/mcp/mcp.json'),
      joinPath(AGENT_DIR, 'mcp.json'),
      joinPath(CWD, '.mcp.json'),
      joinPath(CWD, '.pi/mcp.json')
    ])

    const noCwd = buildMcpLayerDescriptors({ home: HOME, agentDir: AGENT_DIR, cwd: null })
    expect(noCwd.map((d) => d.id)).toEqual(['shared-global', 'agents-global', 'agents-nested-global', 'pi-global'])
    expect(noCwd.every((d) => d.scope === 'global')).toBe(true)
  })

  it('marks kinds: shared cross-tool files vs Pi-owned files', () => {
    const withCwd = buildMcpLayerDescriptors({ home: HOME, agentDir: AGENT_DIR, cwd: CWD })
    expect(withCwd.filter((d) => d.kind === 'pi').map((d) => d.id)).toEqual(['pi-global', 'pi-project'])
    expect(withCwd.filter((d) => d.kind === 'shared').map((d) => d.id)).toEqual([
      'shared-global',
      'agents-global',
      'agents-nested-global',
      'shared-project'
    ])
  })
})

describe('document parse', () => {
  it('parses the canonical mcpServers key', () => {
    const parsed = parseMcpDocument('{"mcpServers":{"a":{"command":"run"}}}')
    expect(parsed.servers).toEqual({ a: { command: 'run' } })
    expect(parsed.key).toBe('mcpServers')
  })

  it('tolerates the legacy mcp-servers key (adapter reads both)', () => {
    const parsed = parseMcpDocument('{"mcp-servers":{"a":{"command":"run"}}}')
    expect(parsed.key).toBe('mcp-servers')
    expect(parsed.servers).toEqual({ a: { command: 'run' } })
  })

  it('parses a missing file as the honest empty layer', () => {
    const parsed = parseMcpDocument(null)
    expect(parsed.doc).toEqual({})
    expect(parsed.servers).toEqual({})
  })

  it('preserves unknown document keys for surgical writes', () => {
    const parsed = parseMcpDocument('{"imports":["cursor"],"settings":{"hostConfigDiscovery":"on"},"mcpServers":{}}')
    expect(parsed.doc['imports']).toEqual(['cursor'])
    expect(parsed.doc['settings']).toEqual({ hostConfigDiscovery: 'on' })
  })

  it('rejects corrupt documents and malformed shapes with honest messages', () => {
    expect(() => parseMcpDocument('{nope')).toThrow(/Invalid JSON/)
    expect(() => parseMcpDocument('[]')).toThrow(/root must be a JSON object/)
    expect(() => parseMcpDocument('"str"')).toThrow(/root must be a JSON object/)
    expect(() => parseMcpDocument('{"mcpServers":[]}')).toThrow(/"mcpServers" must be an object/)
    expect(() => parseMcpDocument('{"mcpServers":{"a":"nope"}}')).toThrow(/Server "a" must be an object/)
  })

  it('serversOf skips malformed entries defensively', () => {
    expect(serversOf({ mcpServers: { a: { command: 'x' }, b: 'junk' } })).toEqual({ a: { command: 'x' } })
    expect(serversOf({})).toEqual({})
  })
})

describe('mergeServerEntry (adapter per-field rules + auth security)', () => {
  it('copies a definition with no lower-layer base', () => {
    expect(mergeServerEntry(undefined, { command: 'run' })).toEqual({ command: 'run' })
  })

  it('merges per top-level field, definition wins', () => {
    const merged = mergeServerEntry({ command: 'run', args: ['--a'], env: { A: '1' } }, { args: ['--b'] })
    expect(merged).toEqual({ command: 'run', args: ['--b'], env: { A: '1' } })
  })

  it('drops remote fields when a stdio definition overrides a remote base', () => {
    const merged = mergeServerEntry(
      { url: 'https://x/mcp', headers: { Authorization: 'Bearer old' }, auth: 'oauth' },
      { command: 'run' }
    )
    expect(merged).toEqual({ command: 'run' })
  })

  it('drops stdio fields when a remote definition overrides a stdio base', () => {
    const merged = mergeServerEntry({ command: 'run', args: ['--a'], env: { A: '1' } }, { url: 'https://x/mcp' })
    expect(merged).toEqual({ url: 'https://x/mcp' })
  })

  it('drops the old url-bound auth material when the url is repointed', () => {
    const merged = mergeServerEntry(
      {
        url: 'https://old/mcp',
        headers: { Authorization: 'Bearer old' },
        bearerToken: 'secret',
        oauth: { clientId: 'x' },
        timeout: 5
      },
      { url: 'https://new/mcp' }
    )
    expect(merged).toEqual({ url: 'https://new/mcp', timeout: 5 })
  })

  it('keeps url-bound fields when the url is identical (partial overrides inherit)', () => {
    const merged = mergeServerEntry({ url: 'https://x/mcp', headers: { 'X-Trace': '1' } }, { url: 'https://x/mcp', timeout: 9 })
    expect(merged).toEqual({ url: 'https://x/mcp', headers: { 'X-Trace': '1' }, timeout: 9 })
  })

  it('keeps oauth:false through a url repoint (an explicit opt-out survives)', () => {
    const merged = mergeServerEntry({ url: 'https://old/mcp', oauth: false, headers: { A: '1' } }, { url: 'https://new/mcp' })
    expect(merged).toEqual({ url: 'https://new/mcp', oauth: false })
  })
})

describe('mergeMcpLayers (precedence + winning-source annotation)', () => {
  it('merges in precedence order and marks the winner + every defining layer', () => {
    const layers: McpConfigLayer[] = [
      makeLayer('shared-global', { search: { command: 'search', env: { KEY: 'g' } } }),
      makeLayer('pi-global', { search: { env: { KEY: 'pi' } } }),
      makeLayer('shared-project', { search: { args: ['--fast'] } })
    ]
    const rows = mergeMcpLayers(layers)
    expect(rows).toHaveLength(1)
    const row = rows[0]!
    expect(row.name).toBe('search')
    expect(row.entry).toEqual({ command: 'search', env: { KEY: 'pi' }, args: ['--fast'] })
    expect(row.winnerId).toBe('shared-project')
    expect(row.winnerScope).toBe('project')
    expect(row.definedIn.map((d) => d.id)).toEqual(['shared-global', 'pi-global', 'shared-project'])
    expect(row.disabled).toBe(false)
  })

  it('a server defined only in the project Pi layer wins there', () => {
    const rows = mergeMcpLayers([makeLayer('pi-project', { local: { command: 'dev' } })])
    expect(rows[0]!.winnerId).toBe('pi-project')
    expect(rows[0]!.winnerKind).toBe('pi')
  })

  it('the disabled flag merges like a field (higher layer wins)', () => {
    const rows = mergeMcpLayers([
      makeLayer('shared-global', { a: { command: 'a', disabled: true } }),
      makeLayer('pi-project', { a: { disabled: false } })
    ])
    expect(rows[0]!.disabled).toBe(false)
    const reDisabled = mergeMcpLayers([
      makeLayer('shared-global', { a: { command: 'a', disabled: false } }),
      makeLayer('pi-project', { a: { disabled: true } })
    ])
    expect(reDisabled[0]!.disabled).toBe(true)
  })

  it('sorts rows by name and returns honestly empty for empty layers', () => {
    expect(mergeMcpLayers([])).toEqual([])
    expect(mergeMcpLayers([makeLayer('shared-global', {}), makeLayer('pi-global', {}, { exists: false })])).toEqual([])
  })

  it('carries the OAuth marker from the merged entry', () => {
    const rows = mergeMcpLayers([makeLayer('shared-global', { notion: { url: 'https://mcp.notion.com/mcp', auth: 'oauth' } })])
    expect(rows[0]!.oauth).toBe(true)
  })

  it('never mutates the input layers', () => {
    const layers = [makeLayer('shared-global', { a: { command: 'a' } })]
    mergeMcpLayers([layers[0]!, makeLayer('pi-project', { a: { disabled: true } })])
    expect(layers[0]!.servers).toEqual({ a: { command: 'a' } })
  })
})

describe('projections', () => {
  const rows = mergeMcpLayers([
    makeLayer('shared-global', { alpha: { command: 'a' }, beta: { url: 'https://b/mcp' } }),
    makeLayer('pi-project', { gamma: { command: 'g' } })
  ])

  it('partitions by winning scope (dual-card split)', () => {
    const { global, project } = partitionMcpRows(rows)
    expect(global.map((r) => r.name)).toEqual(['alpha', 'beta'])
    expect(project.map((r) => r.name)).toEqual(['gamma'])
  })

  it('filters by name/url/command substrings, case-insensitively', () => {
    expect(filterMcpRows(rows, 'ALP').map((r) => r.name)).toEqual(['alpha'])
    expect(filterMcpRows(rows, 'https://b').map((r) => r.name)).toEqual(['beta'])
    expect(filterMcpRows(rows, '  ')).toHaveLength(3)
  })

  it('marks cross-tool .agents winners read-only in the badge', () => {
    expect(mcpWinnerBadgeLabel({ winnerId: 'shared-global', winnerLabel: 'Global shared' })).toBe('Global shared')
    expect(mcpWinnerBadgeLabel({ winnerId: 'agents-global', winnerLabel: 'Global .agents' })).toBe('Global .agents (read-only)')
  })
})

describe('write-target resolution', () => {
  it('the /mcp setup targets: project .mcp.json and global shared config', () => {
    expect(sharedConfigTargetPath('project', { home: HOME, cwd: CWD })).toBe(joinPath(CWD, '.mcp.json'))
    expect(sharedConfigTargetPath('global', { home: HOME, cwd: CWD })).toBe(joinPath(HOME, '.config/mcp/mcp.json'))
    expect(() => sharedConfigTargetPath('project', { home: HOME, cwd: null })).toThrow(/no focused session/)
  })

  it('edits/deletes target the winning layer file; .agents winners refuse', () => {
    for (const id of ['shared-global', 'pi-global', 'shared-project', 'pi-project'] as const) {
      const path = buildMcpLayerDescriptors({ home: HOME, agentDir: AGENT_DIR, cwd: CWD }).find((d) => d.id === id)!.path
      expect(editTargetPathFor({ winnerId: id, winnerPath: path })).toBe(path)
    }
    expect(editTargetPathFor({ winnerId: 'agents-global', winnerPath: '/home/op/.agents/mcp.json' })).toBeNull()
    expect(editTargetPathFor({ winnerId: 'agents-nested-global', winnerPath: '/home/op/.agents/mcp/mcp.json' })).toBeNull()
  })

  it('the canonical write surface covers exactly the four adapter-sanctioned files', () => {
    const options = { home: HOME, agentDir: AGENT_DIR, cwd: CWD }
    expect(isCanonicalMcpWritePath(joinPath(CWD, '.mcp.json'), options)).toBe(true)
    expect(isCanonicalMcpWritePath(joinPath(HOME, '.config/mcp/mcp.json'), options)).toBe(true)
    expect(isCanonicalMcpWritePath(joinPath(CWD, '.pi/mcp.json'), options)).toBe(true)
    expect(isCanonicalMcpWritePath(joinPath(AGENT_DIR, 'mcp.json'), options)).toBe(true)

    // The red line: external host-tool configs and everything else refuse.
    expect(isCanonicalMcpWritePath(joinPath(HOME, '.cursor/mcp.json'), options)).toBe(false)
    expect(isCanonicalMcpWritePath(joinPath(HOME, '.claude/mcp.json'), options)).toBe(false)
    expect(isCanonicalMcpWritePath(joinPath(HOME, '.codex/config.toml'), options)).toBe(false)
    expect(isCanonicalMcpWritePath(joinPath(HOME, '.agents/mcp.json'), options)).toBe(false)
    expect(isCanonicalMcpWritePath(joinPath(CWD, 'session.jsonl'), options)).toBe(false)
  })

  it('reveals the file itself, else the nearest existing ancestor', () => {
    expect(revealTargetForLayer('/a/b/mcp.json', (p) => p === '/a/b/mcp.json')).toBe('/a/b/mcp.json')
    expect(revealTargetForLayer('/a/b/mcp.json', (p) => p === '/a/b' || p === '/a')).toBe('/a/b')
    expect(revealTargetForLayer('/a/b/mcp.json', (p) => p === '/a')).toBe('/a')
  })
})

describe('deriveDisabledFlagWrite (the adapter disabled-flag port)', () => {
  const doc = { mcpServers: { a: { command: 'a' } } }

  it('disable writes ONLY the flag into the project Pi layer', () => {
    const { doc: next, changed } = deriveDisabledFlagWrite(doc, { a: { command: 'a' } }, 'a', true)
    expect(changed).toBe(true)
    expect(serversOf(next)['a']).toEqual({ command: 'a', disabled: true })
  })

  it('disable creates a flag-only entry when the override file has none', () => {
    const { doc: next } = deriveDisabledFlagWrite({}, { a: { command: 'a' } }, 'a', true)
    expect(serversOf(next)['a']).toEqual({ disabled: true })
  })

  it('enable drops the flag when no lower layer is disabled', () => {
    const flagged = { mcpServers: { a: { command: 'a', disabled: true } } }
    const { doc: next, changed } = deriveDisabledFlagWrite(flagged, { a: { command: 'a' } }, 'a', false)
    expect(changed).toBe(true)
    expect(serversOf(next)['a']).toEqual({ command: 'a' })
  })

  it('enable writes an explicit false when a lower layer is itself disabled', () => {
    const flagged = { mcpServers: { a: { command: 'a', disabled: true } } }
    const { doc: next } = deriveDisabledFlagWrite(flagged, { a: { command: 'a', disabled: true } }, 'a', false)
    expect(serversOf(next)['a']).toEqual({ command: 'a', disabled: false })
  })

  it('an emptied entry is removed from the map (adapter cleanup)', () => {
    const flagOnly = { mcpServers: { a: { disabled: true }, b: { command: 'b' } } }
    const { doc: next } = deriveDisabledFlagWrite(flagOnly, { a: { command: 'a' } }, 'a', false)
    expect(serversOf(next)).toEqual({ b: { command: 'b' } })
  })

  it('no-ops are honest: same doc reference, changed false', () => {
    const again = deriveDisabledFlagWrite(doc, { a: { command: 'a' } }, 'a', false)
    expect(again.changed).toBe(false)
    expect(again.doc).toBe(doc)
    const alreadyDisabled = { mcpServers: { a: { command: 'a', disabled: true } } }
    const repeat = deriveDisabledFlagWrite(alreadyDisabled, { a: { command: 'a' } }, 'a', true)
    expect(repeat.changed).toBe(false)
    expect(repeat.doc).toBe(alreadyDisabled)
  })

  it('migrates a legacy mcp-servers document (the adapter keeps the legacy key for flag writes)', () => {
    const legacy = { 'mcp-servers': { a: { command: 'a' } } }
    const { doc: next } = deriveDisabledFlagWrite(legacy, { a: { command: 'a' } }, 'a', true)
    expect(next['mcp-servers']).toEqual({ a: { command: 'a', disabled: true } })
    expect(serversOf(next)['a']).toEqual({ command: 'a', disabled: true })
  })
})

describe('deriveServerEntryWrite / deriveServerEntryRemove (add / edit / delete)', () => {
  it('adds to an empty document under the canonical key', () => {
    const { doc, changed } = deriveServerEntryWrite({}, 'search', { command: 'search' })
    expect(changed).toBe(true)
    expect(serversOf(doc)).toEqual({ search: { command: 'search' } })
  })

  it('replaces the full entry on edit and preserves unknown document keys', () => {
    const raw = { imports: ['cursor'], settings: { a: 1 }, mcpServers: { search: { command: 'old' } } }
    const { doc, changed } = deriveServerEntryWrite(raw, 'search', { command: 'new' })
    expect(changed).toBe(true)
    expect(doc['imports']).toEqual(['cursor'])
    expect(serversOf(doc)['search']).toEqual({ command: 'new' })
  })

  it('an identical write is a no-op', () => {
    const raw = { mcpServers: { search: { command: 'same' } } }
    const { doc, changed } = deriveServerEntryWrite(raw, 'search', { command: 'same' })
    expect(changed).toBe(false)
    expect(doc).toBe(raw)
  })

  it('migrates a legacy mcp-servers document on write', () => {
    const raw = { 'mcp-servers': { search: { command: 'old' } } }
    const { doc, changed } = deriveServerEntryWrite(raw, 'search', { command: 'old' })
    expect(changed).toBe(true)
    expect(doc['mcp-servers']).toBeUndefined()
    expect(serversOf(doc)['search']).toEqual({ command: 'old' })
  })

  it('removes a definition; a missing name is a no-op', () => {
    const raw = { mcpServers: { a: { command: 'a' }, b: { command: 'b' } } }
    const { doc, changed } = deriveServerEntryRemove(raw, 'a')
    expect(changed).toBe(true)
    expect(serversOf(doc)).toEqual({ b: { command: 'b' } })
    const repeat = deriveServerEntryRemove(doc, 'a')
    expect(repeat.changed).toBe(false)
    expect(repeat.doc).toBe(doc)
  })
})

describe('OAuth support (adapter-faithful detection)', () => {
  it('detects explicit auth: oauth and auto-detection', () => {
    expect(supportsOAuth({ url: 'https://x/mcp', auth: 'oauth' })).toBe(true)
    expect(supportsOAuth({ url: 'https://x/mcp' })).toBe(true)
  })

  it('rejects stdio servers, explicit opt-outs, and header configs', () => {
    expect(supportsOAuth({ command: 'run' })).toBe(false)
    expect(supportsOAuth({ url: 'https://x/mcp', auth: false })).toBe(false)
    expect(supportsOAuth({ url: 'https://x/mcp', oauth: false })).toBe(false)
    expect(supportsOAuth({ url: 'https://x/mcp', headers: { Authorization: 'Bearer t' } })).toBe(false)
    expect(supportsOAuth({})).toBe(false)
  })
})

describe('form round-trip', () => {
  it('round-trips a stdio entry with args and env', () => {
    const entry = { command: 'npx', args: ['-y', 'srv'], env: { KEY: 'v' } }
    const form = entryToForm(entry, 'srv')
    expect(form).toMatchObject({ transport: 'stdio', command: 'npx', args: '-y\nsrv', env: 'KEY=v' })
    const built = formToServerEntry(form)
    expect('entry' in built && built.entry).toEqual(entry)
  })

  it('round-trips an http entry with the OAuth marker and unknown fields', () => {
    const entry = { url: 'https://x/mcp', auth: 'oauth', timeout: 30 }
    const form = entryToForm(entry, 'x')
    expect(form.transport).toBe('http')
    const built = formToServerEntry(form, { timeout: 30 })
    expect('entry' in built && built.entry).toEqual(entry)
  })

  it('prefills an effective disabled entry and the flag rides through an edit', () => {
    const form = entryToForm({ command: 'a', disabled: true }, 'a')
    const built = formToServerEntry(form, { disabled: true })
    expect('entry' in built && built.entry).toEqual({ command: 'a', disabled: true })
  })

  it('validates honestly', () => {
    expect(formToServerEntry(entryToForm({}, ''))).toEqual({ error: 'The server name is required.' })
    expect(formToServerEntry({ ...entryToForm({}, 'x'), transport: 'http', url: '' })).toEqual({
      error: 'A server URL is required for remote servers.'
    })
    expect(formToServerEntry({ ...entryToForm({}, 'x'), command: '' })).toEqual({
      error: 'A command is required for local servers.'
    })
    expect(formToServerEntry({ ...entryToForm({}, 'x'), command: 'run', env: 'novalue' })).toEqual({
      error: 'Environment entries must be KEY=value (saw "novalue").'
    })
  })
})

type McpEffectiveRowLike = Pick<import('../../src/shared/mcp-management').McpEffectiveServer, 'name' | 'winnerPath' | 'definedIn'>

describe('copy', () => {
  it('carries the Pi-official security tone', () => {
    expect(MCP_SECURITY_COPY).toBe('MCP servers run with full system access. Add only servers you trust.')
  })

  it('delete copy names the file and the shadowing semantics', () => {
    const single: McpEffectiveRowLike = {
      name: 'search',
      winnerPath: '/w/.mcp.json',
      definedIn: [{ id: 'shared-project', label: 'Project shared', scope: 'project', kind: 'shared', path: '/w/.mcp.json' }]
    }
    expect(mcpDeleteCopy(single)).toBe(
      'This removes "search" from /w/.mcp.json. This cannot be undone.'
    )
    const shadowed: McpEffectiveRowLike = {
      name: 'search',
      winnerPath: '/w/.pi/mcp.json',
      definedIn: [
        { id: 'shared-project', label: 'Project shared', scope: 'project', kind: 'shared', path: '/w/.mcp.json' },
        { id: 'pi-project', label: 'Pi project', scope: 'project', kind: 'pi', path: '/w/.pi/mcp.json' }
      ]
    }
    expect(mcpDeleteCopy(shadowed)).toBe(
      'This removes "search" from /w/.pi/mcp.json — the definition in the lower layer resurfaces.'
    )
  })

  it('read-only winner copy points at the file PiCode never writes', () => {
    expect(mcpReadOnlyWinnerCopy({ name: 'search', winnerPath: '/h/.agents/mcp.json' })).toBe(
      '"search" is defined in the cross-tool shared config /h/.agents/mcp.json — PiCode never writes it. Edit that file directly, or add an override for this server.'
    )
  })
})

describe('path helpers', () => {
  it('joinPath and dirnamePath behave like their node counterparts', () => {
    expect(joinPath('/a', 'b', 'c.json')).toBe('/a/b/c.json')
    expect(joinPath('/a', '', 'c.json')).toBe('/a/c.json')
    expect(dirnamePath('/a/b/c.json')).toBe('/a/b')
    expect(dirnamePath('/a')).toBe('/')
  })
})
