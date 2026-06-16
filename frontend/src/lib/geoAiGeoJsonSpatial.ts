/**
 * Lightweight GeoJSON spatial helpers for Geo AI “Select by location” (no Turf dependency).
 */

type Ring = [number, number][]

function ringClosed(ring: Ring): Ring {
  if (ring.length < 2) return ring
  const a = ring[0]
  const b = ring[ring.length - 1]
  if (a && b && a[0] === b[0] && a[1] === b[1]) return ring
  return [...ring, a!]
}

/** Ray casting; ring is one closed linear ring [lng, lat]. */
export function pointInRing(lng: number, lat: number, ring: Ring): boolean {
  const r = ringClosed(ring)
  let inside = false
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const xi = r[i]![0]
    const yi = r[i]![1]
    const xj = r[j]![0]
    const yj = r[j]![1]
    const inter = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-18) + xi
    if (inter) inside = !inside
  }
  return inside
}

/** GeoJSON Polygon: first ring exterior, rest holes. */
export function pointInPolygonRings(lng: number, lat: number, rings: Ring[]): boolean {
  if (!rings.length) return false
  if (!pointInRing(lng, lat, rings[0]!)) return false
  for (let h = 1; h < rings.length; h++) {
    if (pointInRing(lng, lat, rings[h]!)) return false
  }
  return true
}

function polygonCoordsToRings(coords: unknown): Ring[] | null {
  if (!Array.isArray(coords) || !coords.length) return null
  const rings: Ring[] = []
  for (const ring of coords as unknown[]) {
    if (Array.isArray(ring) && ring.length && Array.isArray((ring as unknown[])[0])) {
      rings.push(ring as Ring)
    }
  }
  return rings.length ? rings : null
}

export function pointInPolygonGeometry(
  lng: number,
  lat: number,
  geometry: { type?: string; coordinates?: unknown } | null | undefined,
): boolean {
  if (!geometry?.type || !geometry.coordinates) return false
  const t = geometry.type
  const c = geometry.coordinates
  if (t === 'Point' && Array.isArray(c) && c.length >= 2) {
    const d = Math.hypot(lng - Number(c[0]), lat - Number(c[1]))
    return d < 1e-9
  }
  if (t === 'Polygon') {
    const rings = polygonCoordsToRings(c)
    return rings ? pointInPolygonRings(lng, lat, rings) : false
  }
  if (t === 'MultiPolygon' && Array.isArray(c)) {
    for (const poly of c as unknown[]) {
      const rings = polygonCoordsToRings(poly)
      if (rings && pointInPolygonRings(lng, lat, rings)) return true
    }
    return false
  }
  if (t === 'LineString' && Array.isArray(c)) {
    const bbox = geometryBBox(geometry)
    return bbox ? lng >= bbox[0] && lng <= bbox[2] && lat >= bbox[1] && lat <= bbox[3] : false
  }
  return false
}

export function geometryBBox(geometry: { type?: string; coordinates?: unknown } | null | undefined): [number, number, number, number] | null {
  if (!geometry?.coordinates) return null
  let minLng = Infinity
  let minLat = Infinity
  let maxLng = -Infinity
  let maxLat = -Infinity
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      if (
        node.length >= 2 &&
        typeof node[0] === 'number' &&
        typeof node[1] === 'number' &&
        (node.length === 2 || typeof node[2] !== 'number')
      ) {
        const x = node[0] as number
        const y = node[1] as number
        if (Number.isFinite(x) && Number.isFinite(y)) {
          minLng = Math.min(minLng, x)
          maxLng = Math.max(maxLng, x)
          minLat = Math.min(minLat, y)
          maxLat = Math.max(maxLat, y)
        } else {
          for (const ch of node) walk(ch)
        }
      } else {
        for (const ch of node) walk(ch)
      }
    }
  }
  walk(geometry.coordinates)
  if (!Number.isFinite(minLng)) return null
  return [minLng, minLat, maxLng, maxLat]
}

export function bboxesIntersect(a: [number, number, number, number], b: [number, number, number, number]): boolean {
  return !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3])
}

export function featureIntersectsMask(
  feature: { geometry?: { type?: string; coordinates?: unknown } },
  maskGeometries: Array<{ type?: string; coordinates?: unknown }>,
): boolean {
  const g = feature.geometry
  const bbA = geometryBBox(g)
  if (!bbA) return false
  const cx = (bbA[0] + bbA[2]) / 2
  const cy = (bbA[1] + bbA[3]) / 2
  for (const m of maskGeometries) {
    const bbB = geometryBBox(m)
    if (bbB && !bboxesIntersect(bbA, bbB)) continue
    if (pointInPolygonGeometry(cx, cy, m)) return true
    if (bbB && bboxesIntersect(bbA, bbB)) return true
  }
  return false
}

export function featureWithinMask(
  feature: { geometry?: { type?: string; coordinates?: unknown } },
  maskGeometries: Array<{ type?: string; coordinates?: unknown }>,
): boolean {
  const g = feature.geometry
  const bbA = geometryBBox(g)
  if (!bbA) return false
  const cx = (bbA[0] + bbA[2]) / 2
  const cy = (bbA[1] + bbA[3]) / 2
  for (const m of maskGeometries) {
    if (pointInPolygonGeometry(cx, cy, m)) return true
  }
  return false
}
