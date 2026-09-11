import { useEffect, useState } from 'react'

/**
 * Seconds counter that ticks once per second while `active` (screenshot 01:
 * the elapsed-seconds readouts on the working line). View-side clock only —
 * the Seam-1 reducer stays time-free.
 *
 * The container keeps this hook for its header count (the container row never
 * unmounts across folds, so a plain tick survives — ticket 55). Thinking rows
 * use `useElapsedClock` instead (ticket 61): they DO unmount across folds, so
 * their seconds must derive from the entry-level start timestamp.
 */
export function useElapsedSeconds(active: boolean): number {
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(timer)
  }, [active])

  return seconds
}

export interface ElapsedClock {
  /** Wall-clock now while `active` (captured at the activity edge, ticked
   * once per second); null when inactive — nothing to derive from. */
  nowMs: number | null
  /** Legacy tick count since the row took an interest — the fallback clock
   * for parts with no start stamp (pre-61 shapes), and clamped-up 1s feed. */
  tickSeconds: number
}

/**
 * The thinking row's elapsed clock (ticket 61): wall-clock `now` for the
 * stamp-derived duration ((now − startedAt) — entry-level, survives
 * fold/unmount/remount) plus the local tick for stamp-less fallback rows.
 * One interval serves both. Impure `Date.now()` stays in the state
 * initializer, same discipline as `useNowTick`.
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
