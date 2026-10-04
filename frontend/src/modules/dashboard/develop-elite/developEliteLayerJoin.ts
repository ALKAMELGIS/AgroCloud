/** Normalize Farm_Code (and similar keys) for structure ↔ crops table joins. */
export function normalizeDevelopEliteJoinKey(value: string): string {
  return value.trim().toUpperCase()
}
