/**
 * Iterative walk over GeoJSON-style nested coordinate arrays.
 * Avoids recursive descent that can overflow the JS stack on pathological nesting
 * or extremely deep structures (malformed data, bad imports).
 */

const DEFAULT_MAX_DEPTH = 4000
const DEFAULT_MAX_POINTS = 400_000

export type CoordWalkLimits = {
  maxDepth?: number
  maxPoints?: number
}

/**
 * Invokes `visit(lng, lat)` for each [lng, lat] leaf found (WGS84 numbers).
 * Uses an explicit stack — O(depth) memory, not O(depth) call stack.
 */
export function forEachLngLatPairInCoords(
  coords: unknown,
  visit: (lng: number, lat: number) => void,
  limits?: CoordWalkLimits,
): void {
  const maxDepth = limits?.maxDepth ?? DEFAULT_MAX_DEPTH
  const maxPoints = limits?.maxPoints ?? DEFAULT_MAX_POINTS
  const stack: { c: unknown; depth: number }[] = [{ c: coords, depth: 0 }]
  let points = 0

  while (stack.length > 0 && points < maxPoints) {
    const { c, depth } = stack.pop()!
    if (c == null) continue
    if (depth > maxDepth) continue

    if (typeof c === 'object' && c !== null && 'length' in (c as object)) {
      const arr = c as unknown[]
      if (
        arr.length >= 2 &&
        typeof arr[0] === 'number' &&
        typeof arr[1] === 'number' &&
        Number.isFinite(arr[0]) &&
        Number.isFinite(arr[1])
      ) {
        visit(arr[0], arr[1])
        points += 1
        continue
      }
      for (let i = arr.length - 1; i >= 0; i -= 1) {
        stack.push({ c: arr[i], depth: depth + 1 })
      }
    }
  }
}
