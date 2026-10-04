/** 0 = best match (prefix), 1 = contains, 2 = no match — for stable sort-to-top. */
export function developEliteListSearchRank(haystack: string, query: string): number {
  const q = query.trim().toLowerCase()
  if (!q) return 0
  const hay = haystack.trim().toLowerCase()
  if (!hay.includes(q)) return 2
  if (hay.startsWith(q)) return 0
  return 1
}

export function developEliteListItemMatchesSearch(haystack: string, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return false
  return haystack.trim().toLowerCase().includes(q)
}

export function sortDevelopEliteListBySearch<T>(
  items: readonly T[],
  query: string,
  haystack: (item: T) => string,
  tieBreak: (a: T, b: T) => number,
): T[] {
  const q = query.trim()
  const copy = [...items]
  if (!q) return copy.sort(tieBreak)
  return copy.sort((a, b) => {
    const ra = developEliteListSearchRank(haystack(a), q)
    const rb = developEliteListSearchRank(haystack(b), q)
    if (ra !== rb) return ra - rb
    return tieBreak(a, b)
  })
}
