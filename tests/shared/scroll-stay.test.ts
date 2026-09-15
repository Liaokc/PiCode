import { describe, expect, it } from 'vitest'
import {
  STICK_THRESHOLD_PX,
  distanceFromBottom,
  isNearBottom,
  nextHeldAway,
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

describe('shouldAutoScroll decision table (Seam-1: held-away × scroll state × growth × self-send — all 16 combinations)', () => {
  const TABLE: Array<{
    heldAway: boolean
    nearBottom: boolean
    grew: boolean
    selfSent: boolean
    stick: boolean
    why: string
  }> = [
    // The user's own agency always wins — held away or not (自发送复位).
    { heldAway: true, nearBottom: true, grew: true, selfSent: true, stick: true, why: 'own send wins from the bottom even mid-hold (steer while reading)' },
    { heldAway: true, nearBottom: true, grew: false, selfSent: true, stick: true, why: 'own send wins with nothing growing, held away' },
    { heldAway: true, nearBottom: false, grew: true, selfSent: true, stick: true, why: 'own send yanks from scrolled-away mid-hold (follow-up while reading)' },
    { heldAway: true, nearBottom: false, grew: false, selfSent: true, stick: true, why: 'own send wins even before its content lands, held away' },
    { heldAway: false, nearBottom: true, grew: true, selfSent: true, stick: true, why: 'own send wins from the bottom' },
    { heldAway: false, nearBottom: true, grew: false, selfSent: true, stick: true, why: 'own send wins with nothing growing' },
    { heldAway: false, nearBottom: false, grew: true, selfSent: true, stick: true, why: 'own send yanks from scrolled-away (steer while reading)' },
    { heldAway: false, nearBottom: false, grew: false, selfSent: true, stick: true, why: 'own send wins even before its content lands' },
    // Held away: growth NEVER yanks — the ticket-75 law, including inside the band.
    { heldAway: true, nearBottom: true, grew: true, selfSent: false, stick: false, why: 'ticket 75, THE fix: a slight upward wheel inside the band stops the per-delta yank (jitter)' },
    { heldAway: true, nearBottom: true, grew: false, selfSent: false, stick: false, why: 'held away inside the band, nothing growing — nowhere to follow anyway' },
    { heldAway: true, nearBottom: false, grew: true, selfSent: false, stick: false, why: 'held away past the band, growth must not yank either' },
    { heldAway: true, nearBottom: false, grew: false, selfSent: false, stick: false, why: 'held away, idle — stays put' },
    // Un-held: the ticket-45 semantics carry over unchanged.
    { heldAway: false, nearBottom: true, grew: true, selfSent: false, stick: true, why: 'pinned reader follows streaming growth' },
    { heldAway: false, nearBottom: true, grew: false, selfSent: false, stick: false, why: 'nothing grew — nowhere to follow' },
    { heldAway: false, nearBottom: false, grew: true, selfSent: false, stick: false, why: 'Q12: growth never yanks a reader who scrolled away' },
    { heldAway: false, nearBottom: false, grew: false, selfSent: false, stick: false, why: 'an idle reader away from the bottom stays put' }
  ]

  it('sticks only while near the bottom un-held, or on the user’s own send', () => {
    for (const row of TABLE) {
      const state: ScrollState = { nearBottom: row.nearBottom, heldAway: row.heldAway }
      const growth: ContentGrowth = { grew: row.grew }
      expect(shouldAutoScroll(state, growth, row.selfSent), row.why).toBe(row.stick)
    }
  })

  it('keeps the Q12 behavior change alive on its own row', () => {
    // The ticket-45 regression: the old `grew || nearBottom` rule yanked a
    // scrolled-away reader on every streaming delta.
    expect(shouldAutoScroll({ nearBottom: false, heldAway: false }, { grew: true }, false)).toBe(false)
  })

  it('keeps the ticket-75 jitter row alive on its own', () => {
    // The ticket-75 regression: inside the 160px band the old rule still
    // yanked — a slight upward wheel fought the stream frame-by-frame. The
    // held-away latch must mute the in-band strong stick.
    expect(shouldAutoScroll({ nearBottom: true, heldAway: true }, { grew: true }, false)).toBe(false)
  })
})

describe('nextHeldAway latch transition (ticket 75: set by an upward movement off the bottom, cleared by a return to the bottom band)', () => {
  // Viewport geometry: 2000px of content, 500px client — scrollTop 1500 sits
  // on the bottom (distance 0), 1440 is inside the band (60px away),
  // 1000 is far past it (500px away).
  const TABLE: Array<{ current: boolean; deltaPx: number; viewport: ScrollSnapshot; next: boolean; why: string }> = [
    { current: false, deltaPx: -60, viewport: snap(2000, 1440, 500), next: true, why: 'THE jitter gesture: a slight in-band wheel-up holds the viewport away' },
    { current: false, deltaPx: -2, viewport: snap(2000, 1498, 500), next: true, why: 'any real upward amount sets the latch — one line is enough' },
    { current: false, deltaPx: -1, viewport: snap(2000, 1440, 500), next: false, why: 'hysteresis: sub-pixel noise is not a gesture' },
    { current: false, deltaPx: -800, viewport: snap(2000, 700, 500), next: true, why: 'a page-up far past the band sets the latch' },
    { current: true, deltaPx: -5, viewport: snap(2000, 1000, 500), next: true, why: 'already held, further up stays held' },
    { current: false, deltaPx: -500, viewport: snap(2000, 1500, 500), next: false, why: 'a bottom clamp (content shrank while pinned) is not a gesture — follow survives' },
    { current: true, deltaPx: -3, viewport: snap(2000, 1500, 500), next: false, why: 'clamped onto the bottom = 回底: a held latch clears (no stuck-at-bottom state)' },
    { current: true, deltaPx: 0, viewport: snap(2000, 1440, 500), next: true, why: 'content growth without scrollTop movement cannot clear the latch' },
    { current: true, deltaPx: 30, viewport: snap(2000, 1000, 500), next: true, why: 'a downward stroll above the band keeps the hold' },
    { current: true, deltaPx: 2, viewport: snap(2000, 1440, 500), next: false, why: 'scrolling back down into the band restores (回底)' },
    { current: true, deltaPx: 900, viewport: snap(2000, 1500, 500), next: false, why: 'a full return to the bottom restores' },
    { current: false, deltaPx: 900, viewport: snap(2000, 1500, 500), next: false, why: 'an arrival yank onto the bottom stays un-held' },
    { current: false, deltaPx: 30, viewport: snap(2000, 1000, 500), next: false, why: 'downward above the band stays un-held' },
    { current: true, deltaPx: 1, viewport: snap(2000, 1440, 500), next: true, why: 'hysteresis on the downward arm too: noise restores nothing' }
  ]

  it('transitions exactly on real upward movement (set) and real downward movement into the band (clear)', () => {
    for (const row of TABLE) {
      expect(nextHeldAway(row.current, row.deltaPx, row.viewport), row.why).toBe(row.next)
    }
  })

  it('is symmetric with the stick table: the jitter gesture sets, and a held reader inside the band never sticks', () => {
    // Wheel up 60px from the bottom during streaming, then a delta lands.
    const afterGesture = nextHeldAway(false, -60, snap(2000, 1440, 500))
    expect(afterGesture).toBe(true)
    expect(shouldAutoScroll({ nearBottom: true, heldAway: afterGesture }, { grew: true }, false)).toBe(false)
  })
})
