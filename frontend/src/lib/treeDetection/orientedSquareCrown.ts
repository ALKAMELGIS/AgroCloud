/**
 * Fit an oriented square to a crown ring (lng/lat) for Detected Tree Crown mode.
 * Uses discrete rotation search in a local metre frame around the ring centroid.
 */

export type LngLatRing = [number, number][]

const DEG_STEP = 5
const M_PER_DEG_LAT = 111_320

function ringPoints(ring: LngLatRing): Array<[number, number]> {
  if (!ring.length) return []
  const pts = ring.slice()
  const a = pts[0]!
  const b = pts[pts.length - 1]!
  if (a[0] === b[0] && a[1] === b[1] && pts.length > 1) pts.pop()
  return pts as Array<[number, number]>
}

function centroid(pts: Array<[number, number]>): [number, number] {
  let sx = 0
  let sy = 0
  for (const [x, y] of pts) {
    sx += x
    sy += y
  }
  const n = Math.max(1, pts.length)
  return [sx / n, sy / n]
}

function toLocalM(lng: number, lat: number, originLng: number, originLat: number): [number, number] {
  const mPerDegLng = M_PER_DEG_LAT * Math.cos((originLat * Math.PI) / 180)
  return [(lng - originLng) * mPerDegLng, (lat - originLat) * M_PER_DEG_LAT]
}

function fromLocalM(x: number, y: number, originLng: number, originLat: number): [number, number] {
  const mPerDegLng = Math.max(1e-9, M_PER_DEG_LAT * Math.cos((originLat * Math.PI) / 180))
  return [
    Number((originLng + x / mPerDegLng).toFixed(7)),
    Number((originLat + y / M_PER_DEG_LAT).toFixed(7)),
  ]
}

function rotate(x: number, y: number, cos: number, sin: number): [number, number] {
  return [x * cos - y * sin, x * sin + y * cos]
}

/**
 * Oriented square (equal side length = max extent of min-area OBB) around the crown ring.
 * Returns a closed lng/lat ring, or null if the input is unusable.
 */
export function orientedSquareFromRing(ring: LngLatRing): LngLatRing | null {
  const pts = ringPoints(ring)
  if (pts.length < 3) return null
  const [oLng, oLat] = centroid(pts)
  const local = pts.map(([lng, lat]) => toLocalM(lng, lat, oLng, oLat))

  let best: { side: number; cx: number; cy: number; deg: number } | null = null
  for (let deg = 0; deg < 90; deg += DEG_STEP) {
    const rad = (deg * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const [x, y] of local) {
      const [rx, ry] = rotate(x, y, cos, sin)
      if (rx < minX) minX = rx
      if (ry < minY) minY = ry
      if (rx > maxX) maxX = rx
      if (ry > maxY) maxY = ry
    }
    const w = Math.max(0.2, maxX - minX)
    const h = Math.max(0.2, maxY - minY)
    const side = Math.max(w, h)
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    if (!best || side < best.side) best = { side, cx, cy, deg }
  }
  if (!best) return null

  const half = best.side / 2
  const rad = (best.deg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  // Corners in rotated frame around bbox centre, then un-rotate.
  const cornersLocal: Array<[number, number]> = [
    [-half, -half],
    [half, -half],
    [half, half],
    [-half, half],
  ].map(([dx, dy]) => {
    const [ux, uy] = rotate(dx, dy, cos, -sin) // inverse rotation
    return [best!.cx + ux, best!.cy + uy]
  })

  const out = cornersLocal.map(([x, y]) => fromLocalM(x, y, oLng, oLat))
  out.push([out[0]![0], out[0]![1]])
  return out
}

/** Axis-aligned fallback square from centre + diameter (metres). */
export function axisSquareFromCentre(
  lng: number,
  lat: number,
  diameterM: number,
): LngLatRing {
  const half = Math.max(0.25, diameterM / 2)
  const corners: Array<[number, number]> = [
    [-half, -half],
    [half, -half],
    [half, half],
    [-half, half],
  ].map(([x, y]) => fromLocalM(x, y, lng, lat))
  corners.push([corners[0]![0], corners[0]![1]])
  return corners
}
