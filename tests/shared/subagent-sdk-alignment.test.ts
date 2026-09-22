/**
 * Ticket 134: the bundled-SDK / pi-subagents alignment pure model — the
 * honest startup notice fires exactly for the broken combination the batch
 * empty runs proved (SDK < 0.86.1 has no transcript-tools export;
 * pi-subagents ≥ 0.70 imports it at module load), never for healthy or
 * absent combinations.
 */

import { describe, expect, it } from 'vitest'
import {
  compareVersions,
  subagentsSdkAlignmentNotice,
  SUBAGENTS_PACKAGE_FLOOR,
  SUBAGENTS_SDK_FLOOR
} from '../../src/shared/subagent-sdk-alignment'

describe('subagentsSdkAlignmentNotice', () => {
  it('the proven broken combination (bundled 0.85.1 × pi-subagents 0.70.1) fires with both versions named', () => {
    const notice = subagentsSdkAlignmentNotice('0.85.1', '0.70.1')
    expect(notice).not.toBeNull()
    expect(notice).toContain('0.70.1')
    expect(notice).toContain('0.85.1')
    expect(notice).toContain('0.86.1')
  })

  it.each([
    ['the pinned healthy bundle', '0.86.1', '0.70.1'],
    ['a newer SDK', '0.87.0', '0.70.1'],
    ['the SDK floor exactly', '0.86.1', '0.71.0'],
    ['an older pi-subagents (pre-watchdog-review)', '0.85.1', '0.69.2']
  ])('%s stays silent', (_label, sdk, subagents) => {
    expect(subagentsSdkAlignmentNotice(sdk, subagents)).toBeNull()
  })

  it.each([
    ['no pi-subagents installed', '0.85.1', null],
    ['SDK version unreadable', null, '0.70.1'],
    ['neither side known', null, null]
  ])('%s stays silent (absence is the bridge\u2019s designed degrade)', (_label, sdk, subagents) => {
    expect(subagentsSdkAlignmentNotice(sdk, subagents)).toBeNull()
  })

  it('a 0.86.1 bundle against a far newer pi-subagents stays silent (floors are minimums)', () => {
    expect(subagentsSdkAlignmentNotice('0.86.1', '0.99.0')).toBeNull()
  })

  it('the floors are the documented constants', () => {
    expect(SUBAGENTS_SDK_FLOOR).toBe('0.86.1')
    expect(SUBAGENTS_PACKAGE_FLOOR).toBe('0.70.0')
  })
})

describe('compareVersions', () => {
  it.each([
    ['equal', '0.86.1', '0.86.1', 0],
    ['patch higher', '0.86.2', '0.86.1', 1],
    ['minor higher', '0.87.0', '0.86.9', 1],
    ['major higher', '1.0.0', '0.99.9', 1],
    ['missing parts are zero', '0.86', '0.86.0', 0],
    ['numeric not lexical', '0.10.0', '0.9.0', 1]
  ])('%s', (_label, a, b, expected) => {
    expect(Math.sign(compareVersions(a, b))).toBe(expected)
  })
})
