import { describe, expect, it } from 'vitest'
import {
  buildSessionTree,
  extractTranscriptItems,
  leafIdOf,
  parseSessionLines,
  summarizeSession
} from '../../src/shared/sessions/parse.ts'

/**
 * Ticket 112 (pi 0.86.1 alignment, spec R33): session-format compatibility
 * with the entry shapes the pi 0.86 TUI actually writes. Shapes below are
 * copied from a REAL TUI 0.86.1 session on this machine (system message with
 * prompt sections + toolsAdded — the before_agent_start transcript
 * persistence; custom_message extension notices) and from the 0.86.1 SDK
 * source/docs (appendCustomEntry → `custom` with customType; `usage` with
 * kind). The contract under test: a TUI 0.86 session opens in PiCode —
 * parse never throws, the pre-0.86 message entries ALL survive the
 * projections, and the new/unknown entry types degrade gracefully (out of
 * the LLM replay like the TUI keeps them, present as 'other' tree nodes,
 * lossless on disk).
 */

const T086 = '2026-09-21T06:20:00.000Z'

/** The 0.86.0 system message: transcript-backed prompt/tool loadout
 * (before_agent_start persistence). Real shape: sections keyed by name,
 * toolsAdded array, integer timestamp INSIDE the message. */
const systemMessageLine = JSON.stringify({
  type: 'message',
  id: 't086-sys1',
  parentId: null,
  timestamp: T086,
  message: {
    role: 'system',
    content: '',
    sections: {
      preamble: 'You are an expert coding assistant...',
      tools: '<tools>\n- read: ...\n</tools>',
      rules: 'Be careful.'
    },
    toolsAdded: [
      { name: 'read', description: 'Read a file', parameters: { type: 'object' } }
    ],
    timestamp: 1758438000000
  }
})

const userLine = JSON.stringify({
  type: 'message',
  id: 't086-u1',
  parentId: 't086-sys1',
  timestamp: T086,
  message: { role: 'user', content: [{ type: 'text', text: 'T086 what changed in pi 0.86?' }] }
})

const assistantToolLine = JSON.stringify({
  type: 'message',
  id: 't086-a1',
  parentId: 't086-u1',
  timestamp: T086,
  message: {
    role: 'assistant',
    content: [
      { type: 'thinking', thinking: 'Check the changelog.' },
      { type: 'toolCall', id: 't086-call1', name: 'read', arguments: { path: '/tmp/changelog.md' } }
    ],
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    stopReason: 'toolUse'
  }
})

/** The toolResult's recorded details: JSON-compatible values only (the
 * 0.86.0 tightening) — the subagent run-identity shape PiCode consumes. */
const toolResultLine = JSON.stringify({
  type: 'message',
  id: 't086-r1',
  parentId: 't086-a1',
  timestamp: T086,
  message: {
    role: 'toolResult',
    toolCallId: 't086-call1',
    toolName: 'read',
    content: [{ type: 'text', text: '0.86.0 changelog text' }],
    isError: false,
    details: { mode: 'single', runId: 't086-run-1', results: [{ agent: 'scout', status: 'completed', finalOutput: 'done' }] }
  }
})

/** Extension-injected context that DOES participate in LLM context
 * (pi-subagents async notices ride this shape — real session evidence). */
const customMessageLine = JSON.stringify({
  type: 'custom_message',
  id: 't086-cm1',
  parentId: 't086-r1',
  timestamp: T086,
  customType: 'subagent-notify',
  content: 'Background task completed: workflow',
  display: false
})

const assistantReplyLine = JSON.stringify({
  type: 'message',
  id: 't086-a2',
  parentId: 't086-cm1',
  timestamp: T086,
  message: {
    role: 'assistant',
    content: [{ type: 'text', text: 'T086 reply: three breaking changes, none hit PiCode.' }],
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    stopReason: 'stop'
  }
})

/** The /bug record: appendCustomEntry(BUG_REPORT_CUSTOM_ENTRY_TYPE, data) →
 * a `custom` entry with customType "pi.bug-report" (0.86.0 bug reporting). */
const bugReportLine = JSON.stringify({
  type: 'custom',
  id: 't086-bug1',
  parentId: 't086-a2',
  timestamp: T086,
  customType: 'pi.bug-report',
  data: {
    schemaVersion: 1,
    id: 'bug-t086',
    createdAt: T086,
    hint: null,
    sessionIncluded: false,
    summaryIncluded: false,
    delivery: { uploaded: true }
  }
})

/** 0.86.0 cache warming: model-attributed usage that is not an assistant
 * message and does not participate in LLM context. */
const usageLine = JSON.stringify({
  type: 'usage',
  id: 't086-usg1',
  parentId: 't086-bug1',
  timestamp: T086,
  kind: 'cache_warm',
  provider: 'anthropic',
  model: 'claude-sonnet-4-5',
  usage: { input: 0, output: 0, cacheRead: 50000, cacheWrite: 0, totalTokens: 50000, cost: { total: 0.015 } }
})

/** Beyond every known type: the degradation contract must hold for entry
 * types a FUTURE TUI invents (the exact ticket-112 wording). */
const futureLine = JSON.stringify({
  type: 'hypothetical_113_entry',
  id: 't086-fut1',
  parentId: 't086-usg1',
  timestamp: T086,
  payload: { anything: true }
})

const HEADER = JSON.stringify({
  type: 'session', version: 3, id: 't086-header-id', timestamp: T086, cwd: '/tmp/t086-cwd'
})

/** The seeded TUI 0.86 session: every 0.86 entry shape interleaved with the
 * pre-0.86 message flow, in real file order. */
const TUI086_SESSION = [
  HEADER,
  systemMessageLine,
  userLine,
  assistantToolLine,
  toolResultLine,
  customMessageLine,
  assistantReplyLine,
  bugReportLine,
  usageLine,
  futureLine
].join('\n')

const MESSAGE_ENTRY_IDS = ['t086-sys1', 't086-u1', 't086-a1', 't086-r1', 't086-a2']
// File order: the custom_message notice (child of r1) precedes the reply
// (child of the notice).
const ALL_ENTRY_IDS = ['t086-sys1', 't086-u1', 't086-a1', 't086-r1', 't086-cm1', 't086-a2', 't086-bug1', 't086-usg1', 't086-fut1']

describe('ticket 112: TUI 0.86 session-format compatibility', () => {
  it('parseSessionLines keeps the header and EVERY entry — new types are entries, not parse failures', () => {
    const parsed = parseSessionLines(TUI086_SESSION)
    expect(parsed.header?.id).toBe('t086-header-id')
    expect(parsed.header?.cwd).toBe('/tmp/t086-cwd')
    expect(parsed.entries.map((entry) => entry.id)).toEqual(ALL_ENTRY_IDS)
    const types = new Map(parsed.entries.map((entry) => [entry.id, entry.type]))
    expect(types.get('t086-sys1')).toBe('message')
    expect(types.get('t086-cm1')).toBe('custom_message')
    expect(types.get('t086-bug1')).toBe('custom')
    expect(types.get('t086-usg1')).toBe('usage')
    expect(types.get('t086-fut1')).toBe('hypothetical_113_entry')
  })

  it('summarizeSession still reads the title from the first user message (system preamble never hijacks it)', () => {
    const summary = summarizeSession(TUI086_SESSION, '/tmp/t086.jsonl', T086.length)
    expect(summary).not.toBeNull()
    expect(summary?.title).toContain('what changed in pi 0.86?')
    // messageCount counts message entries — system messages included, every
    // non-message type (custom/custom_message/usage/future) excluded.
    expect(summary?.messageCount).toBe(MESSAGE_ENTRY_IDS.length)
  })

  it('extractTranscriptItems replays the user/assistant/tool flow complete — 0.86 types stay out without loss', () => {
    const items = extractTranscriptItems(parseSessionLines(TUI086_SESSION).entries)
    // user, assistant(+thinking), tool (folded result), assistant — the
    // system message, custom_message, custom bug report, usage, and the
    // unknown type project NOTHING (the replay stays isomorphic with the
    // TUI's conversation), yet nothing of the pre-0.86 flow is lost.
    expect(items.map((item) => item.id)).toEqual(['t086-u1', 't086-a1', 't086-call1', 't086-a2'])
    const tool = items[2]
    expect(tool?.role).toBe('tool')
    expect(tool && 'output' in tool ? tool.output : '').toContain('0.86.0 changelog text')
    expect(tool && 'subagent' in tool ? tool.subagent?.runId : undefined).toBe('t086-run-1')
  })

  it('buildSessionTree degrades every 0.86/unknown type to a tolerated other node — leaf stays the last entry', () => {
    const entries = parseSessionLines(TUI086_SESSION).entries
    const tree = buildSessionTree(entries)
    expect(tree.nodes).toHaveLength(1) // the system message roots the chain
    const kinds = new Map<string, string>()
    const walk = (nodes: { id: string; kind: string; preview: string | null; children: unknown[] }[]): void => {
      for (const node of nodes) {
        kinds.set(node.id, node.kind)
        walk(node.children as typeof nodes)
      }
    }
    walk(tree.nodes)
    expect(kinds.get('t086-sys1')).toBe('other') // system role — internal, never a user/assistant row
    expect(kinds.get('t086-u1')).toBe('user')
    expect(kinds.get('t086-a1')).toBe('assistant')
    expect(kinds.get('t086-cm1')).toBe('other')
    expect(kinds.get('t086-bug1')).toBe('other')
    expect(kinds.get('t086-usg1')).toBe('other')
    expect(kinds.get('t086-fut1')).toBe('other')
    expect(tree.leafId).toBe('t086-fut1')
    expect(leafIdOf(entries)).toBe('t086-fut1')
  })

  it('a system message degrades to an honest (system) preview, not a crash', () => {
    const entries = parseSessionLines(TUI086_SESSION).entries
    const tree = buildSessionTree(entries, '')
    const find = (nodes: { id: string; preview: string | null; children: object[] }[]): { id: string; preview: string | null } | null => {
      for (const node of nodes) {
        if (node.id === 't086-sys1') return node
        const hit = find(node.children as typeof nodes)
        if (hit) return hit
      }
      return null
    }
    expect(find(tree.nodes)?.preview).toBe('(system)')
  })
})
