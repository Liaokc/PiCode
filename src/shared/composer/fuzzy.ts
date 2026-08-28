/**
 * Fuzzy matching for composer menus (the `/` command menu and the @ file
 * menu). A query matches when its characters appear in order inside the
 * target (case-insensitive); scores prefer earlier and consecutive hits so
 * prefix matches float to the top — the shape users expect from screenshot
 * 06's command menu.
 */

/**
 * Match score for `query` against `text`, or null when `query` is not a
 * subsequence of `text`. Higher is better. An empty query matches everything
 * with score 0.
 */
export function fuzzyScore(query: string, text: string): number | null {
  if (query.length === 0) return 0
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  let score = 0
  let ti = 0
  let streak = 0
  let firstFound = -1
  let lastFound = 0
  for (const ch of q) {
    const found = t.indexOf(ch, ti)
    if (found === -1) return null
    if (firstFound === -1) firstFound = found
    lastFound = found
    // Adjacent (or single-separator) hits keep a streak; distant hits break
    // it and cost proportionally, so tight matches win.
    const gap = found - ti
    streak = gap <= 1 ? streak + 1 : 0
    score += 1 + streak * 2 - Math.min(gap, 4)
    if (found === 0 || t[found - 1] === ' ' || t[found - 1] === '/') score += 2
    ti = found + 1
  }
  // A compact overall span beats the same letters smeared across the string.
  score += Math.max(0, 6 - Math.floor((lastFound - firstFound) / 2))
  // Shorter targets beat longer ones on equal hits.
  return score + Math.max(0, 8 - Math.floor(t.length / 8))
}

/**
 * Rank `items` by fuzzy score against `query`. Stable for equal scores
 * (menu authoring order survives), drops non-matches, caps at `limit`.
 */
export function fuzzyRank<T>(items: readonly T[], query: string, text: (item: T) => string, limit: number): T[] {
  const scored: Array<{ item: T; score: number; index: number }> = []
  for (let index = 0; index < items.length; index++) {
    const item = items[index]
    const score = fuzzyScore(query, text(item))
    if (score !== null) scored.push({ item, score, index })
  }
  scored.sort((a, b) => b.score - a.score || a.index - b.index)
  return scored.slice(0, limit).map((s) => s.item)
}
