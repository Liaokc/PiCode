/**
 * Ticket 90 Seam-1 table tests: the subagent directory projection — a pure
 * model over (a) subagent tool-call records replayed from the parent session
 * transcript (the PRIMARY source: the session record is the single source of
 * truth, ADR-0002) and (b) live async-run states (status.json artifacts read
 * by the host bridge — live augmentation only, never history).
 *
 * Covered: the full seven-state mapping table (Running/Waiting/Blocked/
 * Completed/Failed/Cancelled/Lost), child-status precedence, the Lost
 * epistemology rule (async launch recorded + no artifact + no completion
 * evidence), record extraction from chat entries, section split + ordering,
 * Show 20 more paging, and the nested top-level-only folded count.
 */

import { describe, expect, it } from 'vitest'
import type { ChatEntry, ToolEntry } from '../../src/shared/chat-reducer'
import type { SubagentCallInfo, SubagentRunState } from '../../src/shared/subagents/types'
import {
  ENDED_PAGE_STEP,
  ENDED_VISIBLE_INITIAL,
  mapArtifactState,
  mapChildStatus,
  projectDirectoryRowState,
  subagentDirectoryFromEntries,
  type SubagentDirectoryRow
} from '../../src/shared/subagents/directory'

function toolEntry(patch: Partial<ToolEntry> & { id: string }): ToolEntry {
  return { role: 'tool', name: 'subagent', args: {}, state: 'done', output: '', ...patch }
}

function callInfo(patch: Partial<SubagentCallInfo>): SubagentCallInfo {
  return { mode: 'single', ...patch }
}

function liveRun(patch: Partial<SubagentRunState> & { runId: string }): SubagentRunState {
  return { state: 'running', ...patch }
}

// ---- ticket 99: the row's artifact-dir field (the conversation tab's key) ----

describe('row asyncDir', () => {
  it('surfaces the recorded asyncDir on async rows', () => {
    const model = subagentDirectoryFromEntries(
      [
        toolEntry({
          id: 't-async',
          state: 'done',
          args: { agent: 'scout', task: 'PICODE_99 scout the answer', async: true },
          subagent: callInfo({ runId: 'run-99', asyncId: 'run-99', asyncDir: '/tmp/run-99' })
        })
      ],
      {}
    )
    expect(model.rows[0]?.asyncDir).toBe('/tmp/run-99')
    expect(model.rows[0]?.asyncId).toBe('run-99')
  })
})

// ---- child status derivation (pi's resolveSubagentResultStatus, mirrored) ----

describe('mapChildStatus', () => {
  it('derives pi-subagents terminal statuses from the recorded child fields', () => {
    expect(mapChildStatus({ status: 'completed' })).toBe('completed')
    expect(mapChildStatus({ status: 'detached' })).toBe('detached')
    expect(mapChildStatus({ status: 'paused' })).toBe('paused')
    expect(mapChildStatus({ status: 'stopped' })).toBe('stopped')
    expect(mapChildStatus({ status: 'failed' })).toBe('failed')
    // SingleResult foreground children record no status string — the
    // derivation uses the terminal fields (same precedence as pi).
    expect(mapChildStatus({ exitCode: 0 })).toBe('completed')
    expect(mapChildStatus({ exitCode: 1 })).toBe('failed')
    expect(mapChildStatus({ detached: true, exitCode: 0 })).toBe('detached')
    expect(mapChildStatus({ stopped: true, exitCode: 0 })).toBe('stopped')
    expect(mapChildStatus({ interrupted: true, exitCode: 0 })).toBe('paused')
    expect(mapChildStatus({ timedOut: true, exitCode: 1 })).toBe('failed')
    expect(mapChildStatus({})).toBe('failed')
  })
})

// ---- the seven-state mapping table (ticket 90, finalized) -----------------

describe('the seven-state mapping table', () => {
  it('maps artifact states onto the badge vocabulary', () => {
    expect(mapArtifactState('running')).toBe('running')
    expect(mapArtifactState('queued')).toBe('waiting')
    expect(mapArtifactState('paused')).toBe('blocked')
    expect(mapArtifactState('complete')).toBe('completed')
    expect(mapArtifactState('failed')).toBe('failed')
    // partial = some children failed; rejected = the launch never happened.
    expect(mapArtifactState('partial')).toBe('failed')
    expect(mapArtifactState('rejected')).toBe('failed')
    expect(mapArtifactState('stopped')).toBe('cancelled')
  })

  it('a live run state overrides the replay projection', () => {
    // The seeded call is an async launch (replay alone = lost), but the
    // artifact says running.
    const row = projectDirectoryRowState(
      callInfo({ asyncId: 'r1' }),
      'done',
      false,
      { r1: liveRun({ runId: 'r1', state: 'running' }) }
    )
    expect(row).toBe('running')
  })

  it('an async launch with no artifact and no completion evidence is Lost', () => {
    // Epistemology rule: the tmpdir artifacts get cleaned; without them (and
    // without a forwarded completion) the run's fate is unknowable.
    expect(projectDirectoryRowState(callInfo({ asyncId: 'r1' }), 'done', false, {})).toBe('lost')
    expect(projectDirectoryRowState(callInfo({ asyncId: 'r1' }), 'done', false, undefined)).toBe('lost')
    // The REAL launch-receipt shape carries runId == asyncId (pi-subagents
    // records both in the async launch details) — still Lost.
    expect(
      projectDirectoryRowState(callInfo({ runId: 'r1', asyncId: 'r1', asyncDir: '/x' }), 'done', false, {})
    ).toBe('lost')
  })

  it('a foreground closed call maps through its children (all completed)', () => {
    expect(
      projectDirectoryRowState(
        callInfo({ runId: 'f1', children: [{ agent: 'scout', status: 'completed' }] }),
        'done',
        false,
        {}
      )
    ).toBe('completed')
    // exitCode-0 foreground SingleResult child (no status string recorded).
    expect(
      projectDirectoryRowState(
        callInfo({ runId: 'f1', children: [{ agent: 'scout', exitCode: 0 }] }),
        'done',
        false,
        {}
      )
    ).toBe('completed')
  })

  it('the failed child outranks everything (pi resolveGroupedStatus parity)', () => {
    expect(
      projectDirectoryRowState(
        callInfo({
          runId: 'f1',
          children: [{ status: 'completed' }, { status: 'stopped' }, { status: 'failed' }]
        }),
        'done',
        false,
        {}
      )
    ).toBe('failed')
  })

  it('stopped maps to Cancelled above paused', () => {
    expect(
      projectDirectoryRowState(
        callInfo({ runId: 'f1', children: [{ status: 'paused' }, { status: 'stopped' }] }),
        'done',
        false,
        {}
      )
    ).toBe('cancelled')
  })

  it('a paused child maps to Blocked', () => {
    expect(
      projectDirectoryRowState(
        callInfo({ runId: 'f1', children: [{ status: 'paused' }] }),
        'done',
        false,
        {}
      )
    ).toBe('blocked')
  })

  it('a detached child keeps the row Running — live work is never "Completed" (ticket-90 deviation from pi, documented)', () => {
    expect(
      projectDirectoryRowState(
        callInfo({ runId: 'f1', children: [{ status: 'completed' }, { status: 'detached' }] }),
        'done',
        false,
        {}
      )
    ).toBe('running')
  })

  it('an open call is Running; an errored result without children is Failed', () => {
    expect(projectDirectoryRowState(callInfo({ runId: 'f1' }), 'running', false, {})).toBe('running')
    expect(projectDirectoryRowState(callInfo({ runId: 'f1', children: [] }), 'error', false, {})).toBe('failed')
    // A closed foreground call whose details carried no children at all:
    // the result's own error flag is the only honest evidence.
    expect(projectDirectoryRowState(callInfo({ runId: 'f1' }), 'done', true, {})).toBe('failed')
    expect(projectDirectoryRowState(callInfo({ runId: 'f1' }), 'done', false, {})).toBe('completed')
  })

  it('a completion event (live, no artifact) finalizes the row', () => {
    expect(
      projectDirectoryRowState(
        callInfo({ asyncId: 'r1' }),
        'done',
        false,
        { r1: liveRun({ runId: 'r1', state: 'complete' }) }
      )
    ).toBe('completed')
    expect(
      projectDirectoryRowState(
        callInfo({ asyncId: 'r1' }),
        'done',
        false,
        { r1: liveRun({ runId: 'r1', state: 'stopped' }) }
      )
    ).toBe('cancelled')
  })
})

// ---- extraction from chat entries ----------------------------------------

describe('subagentDirectoryFromEntries', () => {
  it('extracts only subagent tool entries and keeps transcript order', () => {
    const entries: ChatEntry[] = [
      { id: 'u1', role: 'user', text: 'go', skillName: null },
      { id: 'a1', role: 'assistant', parts: [], streaming: false },
      toolEntry({
        id: 't1',
        state: 'done',
        args: { agent: 'scout', task: 'Find the answer' },
        subagent: callInfo({ runId: 'f1', children: [{ status: 'completed' }] })
      }),
      toolEntry({ id: 't2', name: 'bash', state: 'done' }),
      toolEntry({ id: 't3', state: 'running', args: { agent: 'worker' } })
    ]
    const model = subagentDirectoryFromEntries(entries, {})
    expect(model.rows).toHaveLength(2)
    expect(model.rows.map((r) => r.id)).toEqual(['t1', 't3'])
    expect(model.rows[0]).toMatchObject({ agent: 'scout', title: 'Find the answer', state: 'completed' })
    // Ticket 99 (additive): the row carries the artifact dir the conversation
    // tab follows — null for foreground calls that recorded none.
    expect(model.rows[0]?.asyncDir).toBeNull()
    expect(model.rows[1]).toMatchObject({ agent: 'worker', state: 'running' })
  })

  it('titles fall back agent → task → the mode label', () => {
    const entries: ChatEntry[] = [
      toolEntry({ id: 't1', state: 'done', args: { task: 'Do it' }, subagent: callInfo({ runId: 'r' }) }),
      toolEntry({ id: 't2', state: 'done', args: {}, subagent: callInfo({ mode: 'workflow' }) })
    ]
    const model = subagentDirectoryFromEntries(entries, {})
    expect(model.rows[0].title).toBe('Do it')
    expect(model.rows[1].title).toBe('workflow')
  })

  it('a parallel call titles from its first task and counts the children', () => {
    const entries: ChatEntry[] = [
      toolEntry({
        id: 't1',
        state: 'done',
        args: { tasks: [{ agent: 'a', task: 'First' }, { agent: 'b', task: 'Second' }] },
        subagent: callInfo({ mode: 'parallel', runId: 'r', children: [{ status: 'completed' }, { status: 'completed' }] })
      })
    ]
    const model = subagentDirectoryFromEntries(entries, {})
    expect(model.rows[0].title).toBe('First')
    expect(model.rows[0].childCount).toBe(2)
  })

  it('splits Running vs Ended, newest first within each section', () => {
    const entries: ChatEntry[] = [
      toolEntry({ id: 't1', startedAtMs: 100, state: 'done', subagent: callInfo({ asyncId: 'r1', asyncDir: '/x' }) }),
      toolEntry({ id: 't2', startedAtMs: 200, state: 'done', subagent: callInfo({ asyncId: 'r2', asyncDir: '/x' }) }),
      toolEntry({ id: 't3', startedAtMs: 300, state: 'running', args: { agent: 'live' } })
    ]
    const model = subagentDirectoryFromEntries(entries, {
      r2: liveRun({ runId: 'r2', state: 'complete' })
    })
    // running section: only t3 (r1/r2 are async receipts — r1 lost, r2 completed).
    expect(model.running.map((r) => r.id)).toEqual(['t3'])
    // ended: newest start first.
    expect(model.ended.map((r) => r.id)).toEqual(['t2', 't1'])
    expect(model.ended.map((r) => r.state)).toEqual(['completed', 'lost'])
  })

  it('the nested count comes from the live run only (top-level display)', () => {
    const entries: ChatEntry[] = [
      toolEntry({ id: 't1', state: 'done', args: { agent: 'a' }, subagent: callInfo({ asyncId: 'r1', asyncDir: '/x' }) })
    ]
    const model = subagentDirectoryFromEntries(entries, {
      r1: liveRun({ runId: 'r1', state: 'running', nestedCount: 3 })
    })
    expect(model.rows[0].nestedCount).toBe(3)
    expect(model.rows[0].state).toBe('running')
  })

  it('previews clamp to one line from the first child finalOutput or the completion summary', () => {
    const entries: ChatEntry[] = [
      toolEntry({
        id: 't1',
        state: 'done',
        subagent: callInfo({ runId: 'f1', children: [{ status: 'completed', finalOutput: 'The scout found three files.' }] })
      }),
      toolEntry({ id: 't2', startedAtMs: 5, state: 'done', subagent: callInfo({ asyncId: 'r1', asyncDir: '/x' }) })
    ]
    const model = subagentDirectoryFromEntries(entries, {
      r1: liveRun({ runId: 'r1', state: 'complete', summary: 'Done in 3 steps.' })
    })
    expect(model.rows[0].preview).toBe('The scout found three files.')
    expect(model.rows[1].preview).toBe('Done in 3 steps.')
  })

  it('a non-subagent tool entry without info but with subagent args still projects defensively', () => {
    // A pre-90 payload (no info field recorded): the args alone still name
    // the run — the row exists with the honest unknown-state fallback.
    const entries: ChatEntry[] = [
      toolEntry({ id: 't1', state: 'done', args: { agent: 'old-scout', task: 'Legacy' } })
    ]
    const model = subagentDirectoryFromEntries(entries, {})
    expect(model.rows).toHaveLength(1)
    expect(model.rows[0]).toMatchObject({ agent: 'old-scout', title: 'Legacy' })
    expect(model.rows[0].state).toBe('completed') // closed without error, no children → completed
  })
})

// ---- Show 20 more paging ---------------------------------------------------

describe('Show 20 more paging', () => {
  function seedEnded(count: number): ChatEntry[] {
    return Array.from({ length: count }, (_, i) =>
      toolEntry({
        id: `t${i}`,
        startedAtMs: 1000 + i,
        state: 'done',
        subagent: callInfo({ runId: `f${i}`, children: [{ status: 'completed' }] })
      })
    )
  }

  it('shows the first 20 ended rows and counts the hidden rest', () => {
    const model = subagentDirectoryFromEntries(seedEnded(45), {})
    expect(model.endedTotal).toBe(45)
    expect(model.endedShown).toBe(20)
    expect(model.endedHidden).toBe(25)
    expect(model.showMoreVisible).toBe(true)
  })

  it('the stepping constant is 20 and paging exposes the next page', () => {
    expect(ENDED_VISIBLE_INITIAL).toBe(20)
    expect(ENDED_PAGE_STEP).toBe(20)
    const model = subagentDirectoryFromEntries(seedEnded(45), {}, ENDED_VISIBLE_INITIAL + ENDED_PAGE_STEP)
    expect(model.endedShown).toBe(40)
    expect(model.endedHidden).toBe(5)
  })
  it('hides the control when every ended row is already shown', () => {
    const model = subagentDirectoryFromEntries(seedEnded(20), {})
    expect(model.endedHidden).toBe(0)
    expect(model.showMoreVisible).toBe(false)
  })

  it('running rows are never paged', () => {
    const entries: ChatEntry[] = Array.from({ length: 30 }, (_, i) =>
      toolEntry({ id: `t${i}`, startedAtMs: i, state: 'running', args: { agent: `a${i}` } })
    )
    const model = subagentDirectoryFromEntries(entries, {})
    expect(model.running).toHaveLength(30)
  })
})

// ---- row shape --------------------------------------------------------------

describe('row shape', () => {
  it('carries the async id for correlation and the started time', () => {
    const entries: ChatEntry[] = [
      toolEntry({
        id: 't1',
        startedAtMs: 42_000,
        state: 'done',
        args: { agent: 'scout', task: 'Explore' },
        subagent: callInfo({ asyncId: 'r9', asyncDir: '/tmp/x', runId: 'f9' })
      })
    ]
    const model = subagentDirectoryFromEntries(entries, {
      r9: liveRun({ runId: 'r9', state: 'running' })
    })
    const row: SubagentDirectoryRow = model.rows[0]
    expect(row.id).toBe('t1')
    expect(row.asyncId).toBe('r9')
    expect(row.startedAtMs).toBe(42_000)
    expect(row.state).toBe('running')
    expect(row.agent).toBe('scout')
    expect(row.title).toBe('Explore')
  })
})
