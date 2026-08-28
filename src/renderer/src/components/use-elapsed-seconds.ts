import { useEffect, useState } from 'react'

/**
 * Seconds counter that ticks once per second while `active` (screenshot 01:
 * the elapsed-seconds readouts on the working line and streaming thinking
 * row). View-side clock only — the Seam-1 reducer stays time-free.
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
