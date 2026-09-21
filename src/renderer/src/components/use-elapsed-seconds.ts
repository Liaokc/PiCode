import { useEffect, useState } from 'react'

export interface ElapsedClock {
  /** Wall-clock now while `active` (captured at the activity edge, ticked
   * once per second); null when inactive — nothing to derive from. */
  nowMs: number | null
  /** Legacy tick count since the row took an interest — the fallback clock
   * for parts/turns with no start stamp (pre-61/108 shapes), and clamped-up
   * 1s feed. */
  tickSeconds: number
}

/**
 * The elapsed-clock hook (ticket 61, shared with the turn header by ticket
 * 108): wall-clock `now` for stamp-derived durations ((now − startedAt) —
 * entry-level, surviving fold/unmount/remount and session switches) plus
 * the local tick for stamp-less fallback rows. One interval serves both.
 * Impure `Date.now()` stays in the state initializer, same discipline as
 * `useNowTick`.
 *
 * Consumers derive the displayed seconds from ENTRY-LEVEL stamps (shared/
 * thinking-duration.ts for thinking rows, shared/turn-duration.ts for the
 * turn header); the tick only feeds the un-stamped fallback. The old
 * tick-only `useElapsedSeconds` (whose count reset on every container
 * unmount) is retired — the pi17-working-7s reset defect was its doing
 * (ticket 108).
 *
 * A row mounts already streaming or not at all (a thinking part streams
 * exactly once — its key is positional, the part never re-opens), so the
 * initializer always catches the stream start; the interval keeps `now`
 * fresh afterwards. A hypothetical mounted-inactive→active edge merely
 * derives from the local tick until the first interval tick.
 */
export function useElapsedClock(active: boolean): ElapsedClock {
  const [clock, setClock] = useState<ElapsedClock>(() => ({ nowMs: active ? Date.now() : null, tickSeconds: 0 }))

  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setClock((prev) => ({ nowMs: Date.now(), tickSeconds: prev.tickSeconds + 1 })), 1000)
    return () => clearInterval(timer)
  }, [active])

  return clock
}
