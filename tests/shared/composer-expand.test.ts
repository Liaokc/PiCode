import { describe, expect, it } from 'vitest'
import {
  COMPOSER_EXPAND_MAX_PX,
  COMPOSER_EXPAND_MIN_PX,
  COMPOSER_INPUT_MAX_PX,
  COMPOSER_INPUT_MIN_PX,
  composerAutoGrowHeight,
  composerExpandHeight,
  reduceComposerExpand,
  type ComposerExpandEvent,
  type ComposerExpandState
} from '../../src/shared/composer/expand'

/**
 * Ticket 49 (spec R2): the composer's adaptive height — two pure
 * projections plus the expand state machine (Seam-1, composer-density
 * precedent). The component only measures and renders; every decision is
 * here:
 *
 *   composerAutoGrowHeight  content px → rendered px, clamped [74, 160]
 *                           (ZCode-calibrated min-h-10/max-h-40 parity;
 *                           74 is PiCode's measured one-line floor)
 *   composerExpandHeight    main-area px → expanded px = about half,
 *                           clamped [280, 560]
 *   reduceComposerExpand    collapsed ⇄ expanded; the three collapse
 *                           paths (toggle re-click / Esc / send success)
 *                           all land on collapsed
 */
describe('composerAutoGrowHeight (content → height, clamped 74→160)', () => {
  const cases: Array<[number, number, string]> = [
    [Number.NaN, COMPOSER_INPUT_MIN_PX, 'NaN is junk → the floor (never overflow)'],
    [0, COMPOSER_INPUT_MIN_PX, 'an empty textarea measures 0 → the floor'],
    [50, COMPOSER_INPUT_MIN_PX, 'one line sits under the floor → the floor'],
    [73, COMPOSER_INPUT_MIN_PX, 'just under the floor → the floor'],
    [74, COMPOSER_INPUT_MIN_PX, 'the floor exactly'],
    [100, 100, 'a few wrapped lines grow freely inside the band'],
    [159, 159, 'just under the cap'],
    [160, COMPOSER_INPUT_MAX_PX, 'the cap exactly'],
    [161, COMPOSER_INPUT_MAX_PX, 'just over the cap → the cap'],
    [440, COMPOSER_INPUT_MAX_PX, 'a pasted long prompt pins the cap (internal scroll takes over)'],
    [Number.POSITIVE_INFINITY, COMPOSER_INPUT_MAX_PX, 'Infinity is junk content → the cap']
  ]
  for (const [content, expected, label] of cases) {
    it(`${label} (${content} → ${expected})`, () => {
      expect(composerAutoGrowHeight(content)).toBe(expected)
    })
  }

  it('returns whole pixels (no subpixel heights from fractional measurements)', () => {
    expect(composerAutoGrowHeight(74.4)).toBe(74)
    expect(composerAutoGrowHeight(104.6)).toBe(105)
    expect(composerAutoGrowHeight(159.5)).toBe(160)
  })

  it('orders its band: floor < cap', () => {
    expect(COMPOSER_INPUT_MIN_PX).toBeLessThan(COMPOSER_INPUT_MAX_PX)
  })

  it('keeps the ZCode-calibrated band (74 floor, 160 cap)', () => {
    expect(COMPOSER_INPUT_MIN_PX).toBe(74)
    expect(COMPOSER_INPUT_MAX_PX).toBe(160)
  })
})

describe('composerExpandHeight (main area → about half, clamped 280→560)', () => {
  const cases: Array<[number, number, string]> = [
    [Number.NaN, COMPOSER_EXPAND_MIN_PX, 'NaN is junk → the floor'],
    [0, COMPOSER_EXPAND_MIN_PX, 'a zero main area → the floor'],
    [400, COMPOSER_EXPAND_MIN_PX, 'half of 400 is under the floor → the floor'],
    [559, COMPOSER_EXPAND_MIN_PX, 'just under the half-of-floor main area → the floor'],
    [560, COMPOSER_EXPAND_MIN_PX, 'half of 560 lands on the floor exactly'],
    [562, 281, 'half of 562 just clears the floor'],
    [700, 350, 'a small window: half lands mid-band'],
    [1000, 500, 'a roomy window: half lands mid-band'],
    [1119, 560, 'just under the half-of-cap main area → the cap'],
    [1120, COMPOSER_EXPAND_MAX_PX, 'half of 1120 lands on the cap exactly'],
    [2000, COMPOSER_EXPAND_MAX_PX, 'a huge main area pins the cap']
  ]
  for (const [mainArea, expected, label] of cases) {
    it(`${label} (${mainArea} → ${expected})`, () => {
      expect(composerExpandHeight(mainArea)).toBe(expected)
    })
  }

  it('orders its band: floor < cap', () => {
    expect(COMPOSER_EXPAND_MIN_PX).toBeLessThan(COMPOSER_EXPAND_MAX_PX)
  })

  it('keeps the operator-approved band (280 floor, 560 cap)', () => {
    expect(COMPOSER_EXPAND_MIN_PX).toBe(280)
    expect(COMPOSER_EXPAND_MAX_PX).toBe(560)
  })
})

describe('reduceComposerExpand (the expand state machine, three collapse paths)', () => {
  const states: ComposerExpandState[] = ['collapsed', 'expanded']
  const events: ComposerExpandEvent[] = ['toggle', 'escape', 'sent', 'key']

  const expected: Record<ComposerExpandState, Record<ComposerExpandEvent, ComposerExpandState>> = {
    collapsed: { toggle: 'expanded', escape: 'collapsed', sent: 'collapsed', key: 'expanded' },
    expanded: { toggle: 'collapsed', escape: 'collapsed', sent: 'collapsed', key: 'collapsed' }
  }

  it('follows the full decision table', () => {
    for (const state of states) {
      for (const event of events) {
        expect(reduceComposerExpand(state, event), `${state} × ${event}`).toBe(expected[state][event])
      }
    }
  })

  it('expands only through the toggle and the ⌘E chord (the sole entries)', () => {
    expect(reduceComposerExpand('collapsed', 'toggle')).toBe('expanded')
    expect(reduceComposerExpand('collapsed', 'key')).toBe('expanded')
    expect(reduceComposerExpand('collapsed', 'escape')).toBe('collapsed')
    expect(reduceComposerExpand('collapsed', 'sent')).toBe('collapsed')
  })

  it('collapses through all three paths (re-click / Esc / send success)', () => {
    expect(reduceComposerExpand('expanded', 'toggle')).toBe('collapsed')
    expect(reduceComposerExpand('expanded', 'escape')).toBe('collapsed')
    expect(reduceComposerExpand('expanded', 'sent')).toBe('collapsed')
  })
})

describe('reduceComposerExpand — ticket 57: the global ⌘E chord is its own event', () => {
  it('the key event toggles collapsed → expanded (the chord opens the input)', () => {
    expect(reduceComposerExpand('collapsed', 'key')).toBe('expanded')
  })

  it('the key event is self-inverting: expanded → collapsed (⌘E again retracts)', () => {
    expect(reduceComposerExpand('expanded', 'key')).toBe('collapsed')
  })

  it('the key event is a provenance-distinct event, not an alias of the button toggle', () => {
    // 'toggle' is the button's click; 'key' is the App-routed ⌘E chord.
    // Identical semantics BY the table, distinct events IN the union —
    // the same shape as click vs. the collapse routes.
    const events: ComposerExpandEvent[] = ['toggle', 'escape', 'sent', 'key']
    expect(new Set(events).size).toBe(events.length)
  })
})
