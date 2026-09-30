/**
 * Pure, framework-free helpers shared by the Image Classification Wizard and the
 * Raster & Georeferencing tool for interactive raster placement (bbox / corners / GCPs / draw).
 * No React, no map, no network — just geometry math and footprint builders.
 */

/** A non-georeferenced image awaiting interactive placement on the map. */
export type GeorefPending = {
  rasterId: string
  name: string
  widthPx: number
  heightPx: number
}

/** Placement modes offered by the Georeferencing panel. */
export type GeorefMode = 'bbox' | 'corners' | 'gcps' | 'draw' | 'view'

/** One editable lon/lat pair as strings (panel inputs). */
export type LonLatDraft = { lon: string; lat: string }

/** A ground control point drafted in the panel: image pixel <-> world lon/lat. */
export type GeorefGcpDraft = {
  id: string
  col: string
  row: string
  lon: string
  lat: string
}

export type GeoBounds = { west: number; south: number; east: number; north: number }

/** Bounding box (WGS84) of a polygon/multipolygon geometry. */
export function bboxOfGeometry(
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon | null,
): GeoBounds | null {
  if (!geometry) return null
  const rings: number[][][] =
    geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates.flat()
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity
  for (const ring of rings) {
    for (const [lng, lat] of ring) {
      if (lng < west) west = lng
      if (lng > east) east = lng
      if (lat < south) south = lat
      if (lat > north) north = lat
    }
  }
  if (![west, south, east, north].every(Number.isFinite) || east <= west || north <= south) return null
  return { west, south, east, north }
}

/**
 * Compute placement bounds for a non-georeferenced image centered in the current map view,
 * covering ~60% of it while preserving the image's pixel aspect ratio (so it isn't stretched).
 * Falls back to filling the viewport if the image dimensions are unknown.
 */
export function placementBoundsInViewport(
  viewport: GeoBounds,
  widthPx: number,
  heightPx: number,
): GeoBounds {
  const centerLon = (viewport.west + viewport.east) / 2
  const centerLat = (viewport.south + viewport.north) / 2
  const viewportWidthDeg = Math.abs(viewport.east - viewport.west)
  const viewportHeightDeg = Math.abs(viewport.north - viewport.south)

  if (!widthPx || !heightPx || widthPx <= 0 || heightPx <= 0) {
    return viewport
  }

  const targetWidthDeg = viewportWidthDeg * 0.6
  const latRad = (centerLat * Math.PI) / 180
  const cosLat = Math.max(0.1, Math.cos(latRad))
  let heightDeg = (targetWidthDeg * cosLat * heightPx) / widthPx
  let widthDeg = targetWidthDeg

  const maxHeightDeg = viewportHeightDeg * 0.85
  if (heightDeg > maxHeightDeg) {
    const shrink = maxHeightDeg / heightDeg
    heightDeg *= shrink
    widthDeg *= shrink
  }

  return {
    west: centerLon - widthDeg / 2,
    east: centerLon + widthDeg / 2,
    south: centerLat - heightDeg / 2,
    north: centerLat + heightDeg / 2,
  }
}

/** Parse a string to a finite number, or null. */
export function parseNum(s: string): number | null {
  if (s == null || String(s).trim() === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** A rectangular WGS84 footprint FeatureCollection for the preview overlay. */
export function rectFootprint(b: GeoBounds): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { kind: 'georef_preview' },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [b.west, b.north],
              [b.east, b.north],
              [b.east, b.south],
              [b.west, b.south],
              [b.west, b.north],
            ],
          ],
        },
      },
    ],
  }
}

/** A quad footprint from four lon/lat corners (NW, NE, SE, SW). */
export function quadFootprint(
  nw: [number, number],
  ne: [number, number],
  se: [number, number],
  sw: [number, number],
): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { kind: 'georef_preview' },
        geometry: { type: 'Polygon', coordinates: [[nw, ne, se, sw, nw]] },
      },
    ],
  }
}

/** Point features for GCP world positions (preview overlay). */
export function pointsFootprint(points: Array<[number, number]>): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: points.map((p, i) => ({
      type: 'Feature',
      properties: { kind: 'georef_gcp', index: i + 1 },
      geometry: { type: 'Point', coordinates: p },
    })),
  }
}

let gcpSeq = 0
/** Generate a unique GCP draft id. */
export function nextGcpId(prefix = 'georef-gcp'): string {
  gcpSeq += 1
  return `${prefix}-${Date.now().toString(36)}-${gcpSeq}`
}
