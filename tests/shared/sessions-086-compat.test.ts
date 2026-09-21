import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  buildSessionTree,
  extractTranscriptItems,
  leafIdOf,
  parseSessionLines,
  summarizeSession
} from '../../src/shared/sessions/parse.ts'

/**
 * Ticket 112 (pi 0.86.1 alignment, spec R33): session-format compatibility
 * against a REAL TUI 0.86.1 session. The fixture
 * `fixtures/tui-086-session.jsonl` is the actual session file the pi 0.86.1
 * TUI wrote on this machine (wt-105, 2026-09-21, after `pi update`), with one
 * mechanical transform: long string values capped at 200 chars — structure,
 * keys, value types, and id/parentId linkage stay byte-real. It carries the
 * 0.86 entry faces in the wild: the before_agent_start persistence (a
 * role:system message with prompt sections + toolsAdded), custom_message
 * extension notices, and — appended, documented, stable ids t112-bug1 /
 * t112-usg1 / t112-fut1 — a `custom` pi.bug-report record (shape from the
 * 0.86.1 SDK's appendCustomEntry), a cache-warm `usage` entry (0.86.0 docs
 * shape), and a hypothetical future entry type.
 *
 * The contract under test: a TUI 0.86 session opens in PiCode — parse never
 * throws, the message flow survives the projections completely, and the
 * new/unknown entry types degrade gracefully (out of the LLM replay like the
 * TUI keeps them, present as 'other' tree nodes, lossless end to end).
 * Expected counts come from an independent raw JSON.parse census of the
 * fixture, never from the projection code under test.
 */

const FIXTURE = new URL('./fixtures/tui-086-session.jsonl', import.meta.url)
const TEXT = readFileSync(FIXTURE, 'utf8')

/** Independent census: raw JSON.parse of every line — the ground truth the
 * projections are measured against. */
function census(): { header: { id: string } | null; entries: { id: string; type: string; role?: string; toolCallIds: string[] }[]; lastId: string } {
  const lines = TEXT.split('\n').filter((line) => line.trim() !== '')
  let header: { id: string } | null = null
  const entries: { id: string; type: string; role?: string; toolCallIds: string[] }[] = []
  for (const line of lines) {
    const raw = JSON.parse(line) as Record<string, unknown>
    if (raw['type'] === 'session') {
      header = { id: raw['id'] as string }
      continue
    }
    const message = raw['message'] as Record<string, unknown> | undefined
    const toolCallIds: string[] = []
    if (Array.isArray(message?.['content'])) {
      for (const part of message['content'] as Record<string, unknown>[]) {
        if (part?.['type'] === 'toolCall' && typeof part['id'] === 'string') toolCallIds.push(part['id'])
      }
    }
    entries.push({
      id: raw['id'] as string,
      type: raw['type'] as string,
      role: typeof message?.['role'] === 'string' ? (message['role'] as string) : undefined,
      toolCallIds
    })
  }
  return { header, entries, lastId: entries[entries.length - 1]?.id ?? '' }
}

const CENSUS = census()
const censusIds = new Set(CENSUS.entries.map((entry) => entry.id))
const censusMessages = CENSUS.entries.filter((entry) => entry.type === 'message')
const censusUsers = censusMessages.filter((entry) => entry.role === 'user')
const censusToolCallIds = censusMessages.flatMap((entry) => entry.toolCallIds)
/** Entry types that must stay OUT of the LLM replay (the TUI keeps them out too). */
const NON_REPLAY_IDS = new Set(
  CENSUS.entries
    .filter((entry) => entry.type !== 'message' || entry.role === 'system')
    .map((entry) => entry.id)
)

describe('ticket 112: real TUI 0.86.1 session opens in PiCode', () => {
  it('parseSessionLines keeps the header and EVERY entry — no loss, no invention, no throw', () => {
    const parsed = parseSessionLines(TEXT)
    expect(parsed.header?.id).toBe(CENSUS.header?.id)
    expect(parsed.entries).toHaveLength(CENSUS.entries.length)
    const parsedIds = new Set(parsed.entries.map((entry) => entry.id))
    expect(parsedIds).toEqual(censusIds)
    for (const entry of parsed.entries) {
      const raw = CENSUS.entries.find((candidate) => candidate.id === entry.id)
      expect(entry.type).toBe(raw?.type)
    }
  })

  it('extractTranscriptItems replays the message flow complete — 0.86 types stay out without loss', () => {
    const items = extractTranscriptItems(parseSessionLines(TEXT).entries)
    const itemIds = new Set(items.map((item) => item.id))
    // Every user message replays, in file order.
    const replayedUsers = items.filter((item) => item.role === 'user')
    expect(replayedUsers.map((item) => item.id)).toEqual(censusUsers.map((entry) => entry.id))
    // Every assistant toolCall replays as a tool item.
    for (const callId of censusToolCallIds) {
      expect(itemIds.has(callId)).toBe(true)
    }
    // Nothing outside the message universe (system/custom_message/custom/
    // usage/future) leaks into the replay.
    for (const item of items) {
      expect(NON_REPLAY_IDS.has(item.id)).toBe(false)
    }
    expect(items.length).toBeGreaterThan(censusUsers.length + censusToolCallIds.length - 1)
  })

  it('the real subagent toolResult projects its run identity through the JSON details', () => {
    const items = extractTranscriptItems(parseSessionLines(TEXT).entries)
    const subagentItems = items.filter(
      (item) => item.role === 'tool' && 'subagent' in item && item.subagent?.runId !== undefined
    )
    expect(subagentItems.length).toBeGreaterThanOrEqual(1)
    const withRunId = subagentItems.find((item) => item.role === 'tool' && 'subagent' in item)
    expect(typeof (withRunId as { subagent?: { runId?: string } })?.subagent?.runId).toBe('string')
  })

  it('summarizeSession reads the sidebar summary from the real file (title + message census)', () => {
    const summary = summarizeSession(TEXT, 'tui-086-session.jsonl', 0, null)
    expect(summary?.id).toBe(CENSUS.header?.id)
    expect(summary?.messageCount).toBe(censusMessages.length)
    expect(summary?.title?.length).toBeGreaterThan(0)
  })

  it('buildSessionTree keeps every entry as a node — 0.86/unknown types degrade to other, leaf last', () => {
    const entries = parseSessionLines(TEXT).entries
    const tree = buildSessionTree(entries, '/Users/liaokechen')
    const kinds = new Map<string, string>()
    const walk = (nodes: { id: string; kind: string; children: unknown[] }[]): void => {
      for (const node of nodes) {
        kinds.set(node.id, node.kind)
        walk(node.children as typeof nodes)
      }
    }
    walk(tree.nodes)
    expect(kinds.size).toBe(CENSUS.entries.length)
    expect(new Set(kinds.keys())).toEqual(censusIds)
    // The before_agent_start system message and every 0.86/unknown type are
    // tolerated other nodes — never a user/assistant row, never a crash.
    for (const [id, type] of CENSUS.entries.map((entry) => [entry.id, entry.type] as const)) {
      if (type === 'message') continue
      expect(kinds.get(id)).toBe('other')
    }
    for (const entry of censusMessages) {
      if (entry.role === 'system') expect(kinds.get(entry.id)).toBe('other')
      if (entry.role === 'user') expect(kinds.get(entry.id)).toBe('user')
    }
    expect(tree.leafId).toBe('t112-fut1')
    expect(leafIdOf(entries)).toBe('t112-fut1')
  })
})
