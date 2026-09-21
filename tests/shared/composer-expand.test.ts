import { describe, expect, it } from 'vitest'
import {
  COMPOSER_EXPAND_MAX_PX,
  COMPOSER_EXPAND_MIN_PX,
  COMPOSER_INPUT_MAX_PX,
  COMPOSER_INPUT_MIN_PX,
  composerAutoGrowHeight,
  composerCaretLineTop,
  composerCaretReveal,
  composerExpandHeight,
  composerTypingHeight,
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
})

describe('composerTypingHeight — ticket 116 (spec R11): the typing-commit split by expandState', () => {
  // Input and delete are ONE path — a value change. The table has no
  // input/delete column because nothing at this seam can tell them apart:
  // the decision sees only expandState and the two measurements. What it
  // must pin: the EXPANDED row never consults the content (typing or
  // deleting can never shrink the writing surface — the main zone sizes
  // it; the only shrink triggers stay the machine's toggle/Esc/⌘E/sent),
  // and the COLLAPSED row is the ticket-49/81 auto-grow regression
  // verbatim.
  const CONTENTS: Array<[number, string]> = [
    [Number.NaN, 'content not gathered (the expanded path never measures it)'],
    [0, 'an empty draft'],
    [74, 'a one-line draft'],
    [160, 'a draft at the cap'],
    [440, 'a long pasted draft'],
    [Number.POSITIVE_INFINITY, 'junk Infinity content']
  ]
  const MAIN_AREAS: Array<[number, string]> = [
    [Number.NaN, 'main area not gathered (the collapsed path never measures it)'],
    [560, 'a zone whose half lands on the floor'],
    [700, 'a small window'],
    [1000, 'a roomy window'],
    [2000, 'a huge zone whose half pins the cap']
  ]

  it('expanded: the main zone sizes the box — content never shrinks it (input and delete alike)', () => {
    for (const [mainArea] of MAIN_AREAS) {
      const expected = composerExpandHeight(mainArea)
      for (const [content] of CONTENTS) {
        expect(
          composerTypingHeight('expanded', { contentPx: content, mainAreaPx: mainArea }),
          `expanded × main ${mainArea} × content ${content}`
        ).toBe(expected)
      }
    }
  })

  it('collapsed: the auto-grow regression verbatim — the main zone never enters', () => {
    for (const [content] of CONTENTS) {
      const expected = composerAutoGrowHeight(content)
      for (const [mainArea] of MAIN_AREAS) {
        expect(
          composerTypingHeight('collapsed', { contentPx: content, mainAreaPx: mainArea }),
          `collapsed × content ${content} × main ${mainArea}`
        ).toBe(expected)
      }
    }
  })

  it('the split is real: the same measurements pin different heights per state', () => {
    // A 440px draft in a 1000px zone: collapsed pins the 160 cap, expanded
    // pins half the zone (500) — only the expanded surface survives the
    // keystroke at its operator-approved size.
    expect(composerTypingHeight('collapsed', { contentPx: 440, mainAreaPx: 1000 })).toBe(COMPOSER_INPUT_MAX_PX)
    expect(composerTypingHeight('expanded', { contentPx: 440, mainAreaPx: 1000 })).toBe(500)
  })

  it('the expanded typing height stays inside the expanded band', () => {
    for (const [mainArea] of MAIN_AREAS) {
      const height = composerTypingHeight('expanded', { contentPx: 440, mainAreaPx: mainArea })
      expect(height).toBeGreaterThanOrEqual(COMPOSER_EXPAND_MIN_PX)
      expect(height).toBeLessThanOrEqual(COMPOSER_EXPAND_MAX_PX)
    }
  })
})

describe('composerCaretReveal — ticket 81 R7: the caret line stays visible across the auto-grow re-measure', () => {
  const view = (lineTop: number, scrollTop: number, clientH = 160): number | null =>
    composerCaretReveal({ lineTopPx: lineTop, lineHeightPx: 21, scrollTopPx: scrollTop, clientHeightPx: clientH })

  it('the caret line already fully in view → no scroll (null)', () => {
    // padding 16 + line 2 × 21 = 58, viewport [0, 160].
    expect(view(58, 0)).toBeNull()
  })

  it('the caret line exactly filling the viewport bottom → no scroll (null)', () => {
    // line bottom = 160 = scrollTop + clientHeight — containment is inclusive.
    expect(view(139, 0)).toBeNull()
  })

  it('the caret line below the fold → align its bottom to the viewport bottom', () => {
    // padding 16 + line 11 × 21 = 247 (the repro scene: 12-line draft at the cap).
    expect(view(247, 0)).toBe(268 - 160)
  })

  it('the caret line above the scrolled view → align its top to the viewport top', () => {
    // scrolled to line 11 (scrollTop 108); the caret moved to line 1 (top 37).
    expect(view(37, 108)).toBe(37)
  })

  it('returns whole pixels (pixel-aligned scroll positions render crisp)', () => {
    expect(view(247.4, 0)).toBe(Math.round(268.4 - 160))
  })

  it('junk measurements never move the view (null)', () => {
    expect(composerCaretReveal({ lineTopPx: Number.NaN, lineHeightPx: 21, scrollTopPx: 0, clientHeightPx: 160 })).toBeNull()
    expect(
      composerCaretReveal({ lineTopPx: 58, lineHeightPx: Number.NaN, scrollTopPx: 0, clientHeightPx: 160 })
    ).toBeNull()
    expect(
      composerCaretReveal({ lineTopPx: 58, lineHeightPx: 21, scrollTopPx: Number.NaN, clientHeightPx: 160 })
    ).toBeNull()
    expect(
      composerCaretReveal({ lineTopPx: 58, lineHeightPx: 21, scrollTopPx: 0, clientHeightPx: Number.NaN })
    ).toBeNull()
  })

  it('a broken geometry (non-positive line height or viewport) never moves the view (null)', () => {
    expect(view(58, 0, 0)).toBeNull()
    expect(
      composerCaretReveal({ lineTopPx: 58, lineHeightPx: 0, scrollTopPx: 0, clientHeightPx: 160 })
    ).toBeNull()
    expect(
      composerCaretReveal({ lineTopPx: 58, lineHeightPx: -21, scrollTopPx: 0, clientHeightPx: 160 })
    ).toBeNull()
  })

  it('the reveal is idempotent: applying it once makes the next call a no-op', () => {
    const first = view(247, 0)
    expect(first).not.toBeNull()
    expect(view(247, first as number)).toBeNull()
  })
})

describe('composerCaretLineTop — ticket 117 (spec R12): the caret line is the VISUAL line, measured not counted', () => {
  // The measured reading comes from the input's mirror (the component's
  // measureCaretLineTopPx); this seam turns it into the exact flow-
  // coordinate lineTop composerCaretReveal consumes. The grid is the real
  // composer's: padding-top 16, line-height 21 (the ticket-81 fixtures).
  const measure = (caretTop: number, padTop = 16, lineHeight = 21): number | null =>
    composerCaretLineTop({ caretTopPx: caretTop, padTopPx: padTop, lineHeightPx: lineHeight })

  it('on-grid readings pass through exactly (line k = padTop + k × lineHeight)', () => {
    expect(measure(16)).toBe(16) // line 0 — the empty/one-line draft
    expect(measure(37)).toBe(37) // line 1 — caret after a trailing newline
    expect(measure(100)).toBe(100) // line 4 — a mid-draft CJK caret (probe-validated)
    expect(measure(205)).toBe(205) // line 9 — the caret at a soft-wrapped draft's end
  })

  it('sub-line noise snaps to the line grid (the reading lands inside the line box)', () => {
    // +3px and −10px around line 1 (top 37, half-grid tolerance 10.5):
    expect(measure(40)).toBe(37)
    expect(measure(27)).toBe(37)
    // Just past the half-grid crosses to the neighboring line — the caret
    // measured at the boundary IS on that line.
    expect(measure(48)).toBe(58)
    expect(measure(26)).toBe(16)
  })

  it('a caret measured above line 0 clamps to line 0 (never a negative line)', () => {
    expect(measure(0)).toBe(16)
    expect(measure(-50)).toBe(16)
  })

  it('junk measurements never move the view (null — the ticket-81 defense, unchanged)', () => {
    expect(measure(Number.NaN)).toBeNull()
    expect(measure(Number.POSITIVE_INFINITY)).toBeNull()
    expect(measure(Number.NEGATIVE_INFINITY)).toBeNull()
    expect(measure(205, Number.NaN)).toBeNull()
    expect(measure(205, 16, Number.NaN)).toBeNull()
    expect(measure(205, Number.POSITIVE_INFINITY)).toBeNull()
  })

  it('a broken grid (non-positive line height) never moves the view (null)', () => {
    expect(measure(205, 16, 0)).toBeNull()
    expect(measure(205, 16, -21)).toBeNull()
  })

  it('the ghost-line fix: a deep soft-wrapped caret stays deep (the hard-line count said line 0)', () => {
    // The operator's CJK scene: a single-paragraph draft soft-wrapped over
    // ~10 visual lines, the caret at its end. The ticket-81 math computed
    // padTop + 0×21 = 16 (hard-line count 1) and the reveal scrolled the
    // view to the top on every keystroke; the measured line is 205.
    expect(measure(205)).not.toBe(16)
    expect(measure(205)).toBe(16 + 9 * 21)
  })

  it('feeds composerCaretReveal: the measured line converges with the native caret scroll', () => {
    // The probe-validated bottom-typing scene: caret at line 9 (top 205),
    // view scrolled to the bottom (scrollTop 70, clientHeight 160). The
    // caret's line is already in view where the browser's own caret scroll
    // put it — the reveal must NOT write (the two writers agree; the
    // per-keystroke oscillation is gone).
    const lineTop = measure(205) as number
    expect(composerCaretReveal({ lineTopPx: lineTop, lineHeightPx: 21, scrollTopPx: 70, clientHeightPx: 160 })).toBeNull()
    // From the ghost position the old math pinned (scrollTop 16 — the top),
    // the measured line recovers the view to the caret: its bottom aligns
    // to the viewport bottom (226 − 160 = 66), and once landed the next
    // pass is a no-op (stability).
    expect(composerCaretReveal({ lineTopPx: lineTop, lineHeightPx: 21, scrollTopPx: 16, clientHeightPx: 160 })).toBe(66)
    expect(composerCaretReveal({ lineTopPx: lineTop, lineHeightPx: 21, scrollTopPx: 66, clientHeightPx: 160 })).toBeNull()
  })
})
