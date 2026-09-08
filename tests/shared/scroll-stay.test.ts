import { describe, expect, it } from 'vitest'
import {
  STICK_THRESHOLD_PX,
  distanceFromBottom,
  isNearBottom,
  shouldAutoScroll,
  type ContentGrowth,
  type ScrollSnapshot,
  type ScrollState
} from '../../src/shared/scroll-stay'

const snap = (scrollHeight: number, scrollTop: number, clientHeight: number): ScrollSnapshot => ({
  scrollHeight,
  scrollTop,
  clientHeight
})

describe('distanceFromBottom / isNearBottom (ticket 45: the ~160px stick threshold carries over)', () => {
  it('measures how far the viewport rides above the bottom edge', () => {
    expect(distanceFromBottom(snap(2000, 300, 500))).toBe(1200)
    expect(distanceFromBottom(snap(2000, 1500, 500))).toBe(0)
  })

  it('keeps the existing threshold: inside 160px counts as near, at or past it does not', () => {
    expect(STICK_THRESHOLD_PX).toBe(160)
    expect(isNearBottom(snap(2000, 1500, 500))).toBe(true) // 0px away
    expect(isNearBottom(snap(2000, 1341, 500))).toBe(true) // 159px away
    expect(isNearBottom(snap(2000, 1340, 500))).toBe(false) // 160px away
    expect(isNearBottom(snap(2000, 1000, 500))).toBe(false) // 500px away
  })
})

describe('shouldAutoScroll decision table (Seam-1: scroll state × growth × self-send)', () => {
  const TABLE: Array<{ nearBottom: boolean; grew: boolean; selfSent: boolean; stick: boolean; why: string }> = [
    { nearBottom: true, grew: true, selfSent: false, stick: true, why: 'pinned reader follows streaming growth' },
    { nearBottom: true, grew: false, selfSent: false, stick: false, why: 'nothing grew — nowhere to follow' },
    { nearBottom: false, grew: true, selfSent: false, stick: false, why: 'Q12: growth never yanks a reader who scrolled away' },
    { nearBottom: false, grew: false, selfSent: false, stick: false, why: 'an idle reader away from the bottom stays put' },
    { nearBottom: true, grew: true, selfSent: true, stick: true, why: 'own send wins from the bottom' },
    { nearBottom: true, grew: false, selfSent: true, stick: true, why: 'own send wins with nothing growing' },
    { nearBottom: false, grew: true, selfSent: true, stick: true, why: 'own send yanks from scrolled-away (steer while reading)' },
    { nearBottom: false, grew: false, selfSent: true, stick: true, why: 'own send wins even before its content lands' }
  ]

  it('sticks only while near the bottom or on the user’s own send', () => {
    for (const row of TABLE) {
      const state: ScrollState = { nearBottom: row.nearBottom }
      const growth: ContentGrowth = { grew: row.grew }
      expect(shouldAutoScroll(state, growth, row.selfSent), row.why).toBe(row.stick)
    }
  })

  it('keeps the Q12 behavior change alive on its own row', () => {
    // The regression this ticket exists for: the old `grew || nearBottom`
    // rule yanked a scrolled-away reader on every streaming delta.
    expect(shouldAutoScroll({ nearBottom: false }, { grew: true }, false)).toBe(false)
  })

  it('jumps for the user’s own send regardless of scroll state', () => {
    expect(shouldAutoScroll({ nearBottom: true }, { grew: true }, true)).toBe(true)
    expect(shouldAutoScroll({ nearBottom: false }, { grew: false }, true)).toBe(true)
  })
})
