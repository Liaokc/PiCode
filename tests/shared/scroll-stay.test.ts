import { describe, expect, it } from 'vitest'
import {
  IDLE_BOTTOM_SEQUENCE_IDLE,
  STICK_THRESHOLD_PX,
  distanceFromBottom,
  isAtBottom,
  isNearBottom,
  nextHeldAway,
  nextIdleBottomPin,
  nextSendLatch,
  shouldAutoScroll,
  type ContentGrowth,
  type IdleBottomSequence,
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

describe('isAtBottom (ticket 93: the send latch\'s arrival arm — ON the bottom, not the 160px follow band)', () => {
  it('reads true only at the bottom edge (±1px fractional-scrollTop noise)', () => {
    expect(isAtBottom(snap(2000, 1500, 500))).toBe(true) // exactly on the bottom
    expect(isAtBottom(snap(2000, 1499.5, 500))).toBe(true) // 0.5px off — sub-pixel rounding noise
    expect(isAtBottom(snap(2000, 1341, 500))).toBe(false) // 159px away — inside the band, NOT arrived
    expect(isAtBottom(snap(2000, 1000, 500))).toBe(false) // far away
  })
})

describe('nextSendLatch transition (ticket 93: the send pin is an until-arrival latch — set by the user\'s own send, cleared by reaching the bottom or an upward takeover)', () => {
  // Viewport geometry as in the held-away table: 2000px of content, 500px
  // client — scrollTop 1500 sits on the bottom (distance 0), 1440 inside
  // the band (60px away), 1000 far past it (500px away).
  const TABLE: Array<{ current: boolean; deltaPx: number; viewport: ScrollSnapshot; next: boolean; why: string }> = [
    { current: true, deltaPx: 0, viewport: snap(2000, 1000, 500), next: true, why: 'THE fix: the latch survives the pass that found nothing landed yet — entry arrives late, growth is multi-pass' },
    { current: true, deltaPx: 0, viewport: snap(2000, 1440, 500), next: true, why: 'armed and inside the band but not ON the bottom — the agency keeps asking (queue injection pending)' },
    { current: true, deltaPx: 2, viewport: snap(2000, 1000, 500), next: true, why: 'a downward stroll toward the bottom does not cancel the agency — only arrival or upward does' },
    { current: true, deltaPx: -0.5, viewport: snap(2000, 1000, 500), next: true, why: 'hysteresis: sub-pixel noise is not a takeover' },
    { current: true, deltaPx: 0, viewport: snap(2000, 1500, 500), next: false, why: 'THE settle arm: the view is ON the bottom — the latch\'s job is done, follow resumes under the near-bottom rule' },
    { current: true, deltaPx: 900, viewport: snap(2000, 1500, 500), next: false, why: 'a manual scroll all the way to the bottom is arrival too (the reader brought it there)' },
    { current: true, deltaPx: -3, viewport: snap(2000, 1500, 500), next: false, why: 'a bottom clamp (content shrank while pinned) reads as arrival — the view IS at the bottom' },
    { current: true, deltaPx: -60, viewport: snap(2000, 1440, 500), next: false, why: 'THE takeover arm: any real upward movement during the latch hands control back — the wheel always wins (93 extends 75 to the send pin)' },
    { current: true, deltaPx: -800, viewport: snap(2000, 700, 500), next: false, why: 'a page-up mid-travel cancels the agency outright' },
    { current: false, deltaPx: 0, viewport: snap(2000, 1000, 500), next: false, why: 'un-armed stays un-armed' },
    { current: false, deltaPx: -60, viewport: snap(2000, 1440, 500), next: false, why: 'a gesture without a send never arms anything' },
    { current: false, deltaPx: 900, viewport: snap(2000, 1500, 500), next: false, why: 'arrival without the latch is nothing to clear' }
  ]

  it('transitions exactly on arrival (bottom) and real upward movement (takeover), nothing else', () => {
    for (const row of TABLE) {
      expect(nextSendLatch(row.current, row.deltaPx, row.viewport), row.why).toBe(row.next)
    }
  })

  it('the takeover outranks the agency in the stick table: a wheel-up between the send and the echo kills the yank (the 75 law extended to the send pin)', () => {
    // The 93 window: user sends, then wheels up BEFORE the echo pass runs.
    // The gesture clears the latch (nextSendLatch) and sets the hold
    // (nextHeldAway) — the echo pass must NOT yank (the pre-93 code
    // out-ranked the fresh hold with the armed pin: `if (selfSent)
    // heldAway = false` yanked anyway).
    const afterGestureLatch = nextSendLatch(true, -60, snap(2000, 1440, 500))
    const afterGestureHold = nextHeldAway(false, -60, snap(2000, 1440, 500))
    expect(afterGestureLatch).toBe(false)
    expect(afterGestureHold).toBe(true)
    expect(shouldAutoScroll({ nearBottom: true, heldAway: afterGestureHold }, { grew: true }, afterGestureLatch)).toBe(false)
  })
})

describe('nextIdleBottomPin (ticket 119: the idle viewport-shrink re-pin — a bottom-pinned reader stays pinned across a whole typing burst, everyone else untouched)', () => {
  // Geometry: 2000px of content; the composer's growth shrinks the scroll
  // cell from 500px to 420px (Δ=80) or 450px (Δ=50). A bottom-pinned reader
  // sits at scrollTop 1500 (= 2000 − 500, distance 0); an off-bottom
  // reader at 1000 (distance 500). The observation builder pins
  // agentRunning false unless a test says otherwise (idle is the ticket's
  // whole scope).
  const obs = (clientHeight: number, scrollTop: number, agentRunning = false) => ({
    snapshot: snap(2000, scrollTop, clientHeight),
    agentRunning
  })
  const armed: IdleBottomSequence = { clientHeightStartPx: 500 }

  it('arms the sequence only on an at-bottom observation (the strict ticket-93 arrival rule, not the 160px follow band)', () => {
    // At the bottom (distance 0): arms with the current height, no write.
    expect(nextIdleBottomPin(obs(500, 1500), IDLE_BOTTOM_SEQUENCE_IDLE)).toEqual({
      scrollTopPx: null,
      next: { clientHeightStartPx: 500 }
    })
    // Mid-band (159px away — inside the follow band but NOT at the bottom)
    // and far away: nothing arms, nothing writes.
    expect(nextIdleBottomPin(obs(500, 1341), IDLE_BOTTOM_SEQUENCE_IDLE)).toEqual({
      scrollTopPx: null,
      next: IDLE_BOTTOM_SEQUENCE_IDLE
    })
    expect(nextIdleBottomPin(obs(500, 1000), IDLE_BOTTOM_SEQUENCE_IDLE)).toEqual({
      scrollTopPx: null,
      next: IDLE_BOTTOM_SEQUENCE_IDLE
    })
  })

  it('re-pins a bottom-pinned reader across each shrink by exactly the geometry delta (the tail rows stay in view)', () => {
    // 500→420 while pinned at 1500: the bottom edge would ride 80px up the
    // content; the pin moves to 2000−420 = 1580 = 1500 + 80 — the exact
    // delta, no snapping. The sequence stays armed for the next shrink.
    expect(nextIdleBottomPin(obs(420, 1500), armed)).toEqual({
      scrollTopPx: 1580,
      next: armed
    })
    expect(nextIdleBottomPin(obs(450, 1500), armed)).toEqual({
      scrollTopPx: 1550,
      next: armed
    })
  })

  it('re-pins through the engine’s native pre-pin restore (the instrumentation-proven revert: a scroll move with no JS write that lands the reader exactly the cumulative shrink above the bottom)', () => {
    // Burst: 500→420 (the pin writes 1580), then 420→350. On the second
    // shrink’s layout the engine natively restores the pre-pin absolute
    // 1500 — distance = 2000−1500−350 = 150 = the cumulative shrink
    // (500−350). A single-shot at-bottom check would read “off bottom”
    // and stand down; the sequence bound still explains the position, so
    // the re-pin fires: 2000−350 = 1650.
    expect(nextIdleBottomPin(obs(350, 1500), armed)).toEqual({
      scrollTopPx: 1650,
      next: armed
    })
  })

  it('leaves a reader who scrolled away on their own byte-for-byte untouched (their scroll breaks the cumulative-shrink bound)', () => {
    // Armed at 500, shrunk to 420, the reader deliberately scrolled up to
    // 1450: distance 130 > cumulative 80 + 1 — their own read move. No
    // write, and the sequence closes until they return to the bottom.
    expect(nextIdleBottomPin(obs(420, 1450), armed)).toEqual({
      scrollTopPx: null,
      next: IDLE_BOTTOM_SEQUENCE_IDLE
    })
    // A mid-band reader who never armed: no write at all.
    expect(nextIdleBottomPin(obs(420, 1341), IDLE_BOTTOM_SEQUENCE_IDLE)).toEqual({
      scrollTopPx: null,
      next: IDLE_BOTTOM_SEQUENCE_IDLE
    })
    expect(nextIdleBottomPin(obs(420, 1000), IDLE_BOTTOM_SEQUENCE_IDLE)).toEqual({
      scrollTopPx: null,
      next: IDLE_BOTTOM_SEQUENCE_IDLE
    })
  })

  it('stands down entirely while the agent runs (ticket-93/94/75 semantics own the view — zero regression)', () => {
    expect(nextIdleBottomPin(obs(420, 1500, true), armed)).toEqual({
      scrollTopPx: null,
      next: armed
    })
  })

  it('closes the sequence on viewport growth or a same-height observation (the browser’s range clamp already bottom-pins; off-bottom anchors are stable)', () => {
    // Draft deleted: the cell grows back past the baseline → close. The
    // reader still on the bottom re-arms a fresh sequence at the new
    // height; an off-bottom reader stays disarmed.
    expect(nextIdleBottomPin(obs(560, 1440), armed)).toEqual({
      scrollTopPx: null,
      next: { clientHeightStartPx: 560 }
    })
    expect(nextIdleBottomPin(obs(500, 1000), armed)).toEqual({
      scrollTopPx: null,
      next: IDLE_BOTTOM_SEQUENCE_IDLE
    })
    // A same-height observation (width-only resize): also the clamp’s
    // territory — close and re-arm only if at the bottom.
    expect(nextIdleBottomPin(obs(500, 1500), armed)).toEqual({
      scrollTopPx: null,
      next: { clientHeightStartPx: 500 }
    })
  })

  it('re-arms after the reader returns to the bottom (return-to-bottom starts the next burst)', () => {
    // The sequence closed (they scrolled away); they scroll back to the
    // bottom at the shrunken height 420: the next observation arms
    // {420}, and the FOLLOWING shrink (420→350) re-pins again.
    const reArmed = nextIdleBottomPin(obs(420, 1580), IDLE_BOTTOM_SEQUENCE_IDLE)
    expect(reArmed).toEqual({ scrollTopPx: null, next: { clientHeightStartPx: 420 } })
    expect(nextIdleBottomPin(obs(350, 1580), reArmed.next)).toEqual({
      scrollTopPx: 1650,
      next: { clientHeightStartPx: 420 }
    })
  })

  it('floors at 0 when the content cannot fill the shrunk viewport', () => {
    // 300px of content in a 500px cell (nothing scrollable, reader at 0),
    // shrunk to 420: the pin target is negative — floor to 0, nothing
    // moves. The arm itself happens on the at-bottom (distance < 1)
    // observation.
    const tiny = (clientHeight: number): { snapshot: ScrollSnapshot; agentRunning: boolean } => ({
      snapshot: snap(300, 0, clientHeight),
      agentRunning: false
    })
    expect(nextIdleBottomPin(tiny(500), IDLE_BOTTOM_SEQUENCE_IDLE)).toEqual({
      scrollTopPx: null,
      next: { clientHeightStartPx: 500 }
    })
    expect(nextIdleBottomPin(tiny(420), { clientHeightStartPx: 500 })).toEqual({
      scrollTopPx: 0,
      next: { clientHeightStartPx: 500 }
    })
  })

  it('composes with the growth stick: a shrink then content growth both keep the pinned reader on the bottom', () => {
    // Typing grows the composer (cell 500→420): the re-pin writes 1580.
    // A late entry then grows the content to 2100: the stick effect’s
    // near-bottom follow pins 2100−420 = 1680 — one continuous bottom.
    const afterShrink = nextIdleBottomPin(obs(420, 1500), armed)
    expect(afterShrink.scrollTopPx).toBe(1580)
    const grown = snap(2100, afterShrink.scrollTopPx ?? 0, 420)
    expect(shouldAutoScroll({ nearBottom: isNearBottom(grown), heldAway: false }, { grew: true }, false)).toBe(true)
  })
})

describe('send-latch lifecycle composition (ticket 93: 置位→到底才清 — armed by all four send paths, persists across passes, settles at the bottom)', () => {
  // The four send paths arm the SAME latch; the queue-injection path rides
  // the arming done at the original steer/follow-up gesture (the queue
  // update itself changes no entries, so the latch is the only carrier from
  // the gesture to the delivery pass). These rows walk the effect pass
  // sequence: each iteration applies the transition + the stick decision
  // exactly as the ChatView effect does.
  function pass(latched: boolean, scrollTop: number, grew: boolean): { latched: boolean; stuck: boolean } {
    const viewport = snap(2000, scrollTop, 500)
    const deltaPx = 0 // no independent gesture between passes
    const next = nextSendLatch(latched, deltaPx, viewport)
    const heldAway = false // the armed latch and the hold never coexist (the gesture clears both ways)
    const stuck = shouldAutoScroll({ nearBottom: isNearBottom(viewport), heldAway }, { grew }, next)
    return { latched: next, stuck }
  }

  it('idle send from scrolled-away: armed passes yank until the view lands, then the latch settles and normal follow resumes', () => {
    // Send from 500px away. Pass 1: armed, off-bottom → yank (agency).
    let state = pass(true, 1000, true)
    expect(state.stuck).toBe(true)
    // Pass 2 runs at the landed bottom: arrival clears; the follow gate
    // takes over (still sticky at the bottom while content grows).
    state = pass(state.latched, 1500, true)
    expect(state.latched).toBe(false)
    expect(state.stuck).toBe(true)
    // A reader wheel-up afterwards is pure ticket-75 territory again.
    expect(nextHeldAway(false, -60, snap(2000, 1440, 500))).toBe(true)
  })

  it('queue injection (steer/follow-up arming): the latch rides every streaming pass until the delivery lands the view at the bottom', () => {
    // The gesture arms; queue_update runs no pass; streaming passes with
    // the view pinned clear it on the first arrival reading — the delivery
    // later lands at the bottom through the un-held follow gate.
    let state = pass(true, 1500, true)
    expect(state.latched).toBe(false) // already at the bottom: arrival, job done
    expect(state.stuck).toBe(true) // near-bottom follow keeps pinning through growth
    // If the reader was NOT at the bottom when the delivery lands and never
    // gestured upward, the surviving latch still yanks (多轮增长 coverage).
    state = pass(true, 1000, true)
    expect(state.stuck).toBe(true)
  })

  it('the takeover during the latch is permanent: no later pass re-yanks (滚轮赢，不回退)', () => {
    // Send from scrolled-away, wheel up mid-travel, THEN the echo lands.
    const takenOver = nextSendLatch(true, -60, snap(2000, 940, 500))
    expect(takenOver).toBe(false)
    const held = nextHeldAway(false, -60, snap(2000, 940, 500))
    expect(held).toBe(true)
    // Every subsequent growth pass reads through the held-away law: no yank.
    expect(shouldAutoScroll({ nearBottom: false, heldAway: held }, { grew: true }, takenOver)).toBe(false)
    expect(shouldAutoScroll({ nearBottom: true, heldAway: held }, { grew: true }, takenOver)).toBe(false)
  })
})
