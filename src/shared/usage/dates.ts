/**
 * Local-day date arithmetic over YYYY-MM-DD keys (the aggregator's day unit).
 * All math is UTC-pinned so a day key round-trips exactly regardless of the
 * host time zone.
 */

/** 'YYYY-MM-DD' shifted by n days (n may be negative). */
export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/** Monday that starts the week containing dateStr. */
export function mondayOf(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0 = Sunday
  return addDays(dateStr, -(dow + 6) % 7)
}
