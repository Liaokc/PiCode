/**
 * Empty-state greeting line, mirroring ZCode's time-aware welcome.
 * Kept as a pure function so the copy logic is testable headlessly;
 * UI copy is always English (CONTEXT.md).
 */
export function greetingForHour(hour: number): string {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new RangeError(`hour must be an integer between 0 and 23, got ${hour}`)
  }
  if (hour >= 5 && hour < 12) return 'Good morning. What shall we tackle today?'
  if (hour >= 12 && hour < 18) return 'Good afternoon. What are we building next?'
  if (hour >= 18 && hour < 23) return 'Good evening. Wrapping up the day?'
  return 'Working late — let’s finish strong.'
}
