/**
 * Map viewport / extent helpers for Live Layer lazy loading (Sentinel, AOI, Alerts).
 */

import { bboxesIntersect, geometryBBox } from './geoAiGeoJsonSpatial'

/** WGS84 bounding box: [west, south, east, north] */
export type LngLatBBox = [number, number, number, number]

export const SI_VIEWPORT_PREFETCH_RATIO = 0.22
export const SI_VIEWPORT_DEBOUNCE_MS = 120
export const SI_VIEWPORT_BBOX_TILE_DEG = 0.06
export const SI_VIEWPORT_MOVE_THROTTLE_MS = 80

export function normalizeLngLatBBox(raw: LngLatBBox): LngLatBBox | null {
  const [w, s, e, n] = raw
  if (![w, s, e, n].every(Number.isFinite)) return null
  if (e < w || n < s) return null
  return [w, s, e, n]
}

/** True when {@link outer} fully contains {@link inner} on WGS84 axes. */
export function lngLatBBoxContains(outer: LngLatBBox, inner: LngLatBBox): boolean {
  const o = normalizeLngLatBBox(outer)
  const i = normalizeLngLatBBox(inner)
  if (!o || !i) return false
  return o[0] <= i[0] && o[1] <= i[1] && o[2] >= i[2] && o[3] >= i[3]
}

/** Expand bbox by ratio of its width/height (prefetch buffer for pan/zoom). */
export function expandLngLatBBox(bbox: LngLatBBox, ratio = SI_VIEWPORT_PREFETCH_RATIO): LngLatBBox {
  const [w, s, e, n] = bbox
  const padX = Math.max((e - w) * ratio, 1e-5)
  const padY = Math.max((n - s) * ratio, 1e-5)
  return [w - padX, s - padY, e + padX, n + padY]
}

/** Snap bbox to a fixed grid for cache keys / tile deduplication. */
export function quantizeLngLatBBox(bbox: LngLatBBox, tileDeg = SI_VIEWPORT_BBOX_TILE_DEG): LngLatBBox {
  const [w, s, e, n] = bbox
  return [
    Math.floor(w / tileDeg) * tileDeg,
    Math.floor(s / tileDeg) * tileDeg,
    Math.ceil(e / tileDeg) * tileDeg,
    Math.ceil(n / tileDeg) * tileDeg,
  ]
}

export function lngLatBBoxCacheKey(bbox: LngLatBBox, tileDeg = SI_VIEWPORT_BBOX_TILE_DEG): string {
  const q = quantizeLngLatBBox(bbox, tileDeg)
  return q.map(v => v.toFixed(4)).join(',')
}

/** Lightweight WMS AOI key — stable within a viewport tile (avoids remount on every pan). */
export function viewportAoiMaskCacheKey(
  bbox: LngLatBBox | null | undefined,
  featureCount: number,
  tileDeg = SI_VIEWPORT_BBOX_TILE_DEG,
): string | null {
  if (!bbox || featureCount <= 0) return null
  return `${lngLatBBoxCacheKey(bbox, tileDeg)}:n${featureCount}`
}

export function geometryIntersectsLngLatBBox(
  geometry: { type?: string; coordinates?: unknown } | null | undefined,
  bbox: LngLatBBox,
): boolean {
  const fb = geometryBBox(geometry)
  if (!fb) return false
  return bboxesIntersect(fb, bbox)
}

export function filterFeatureCollectionByLngLatBBox(
  geojson: { type?: string; features?: unknown[] } | null | undefined,
  bbox: LngLatBBox,
): { type: 'FeatureCollection'; features: unknown[] } {
  const features = Array.isArray(geojson?.features) ? geojson!.features! : []
  return {
    type: 'FeatureCollection',
    features: features.filter(f => {
      const geom = (f as { geometry?: { type?: string; coordinates?: unknown } })?.geometry
      return geometryIntersectsLngLatBBox(geom, bbox)
    }),
  }
}

/** WGS84 bounds for outer rings with optional padding (limits WMS tile fetch per clip chunk). */
export function lngLatBoundsFromOuterRings(
  outerRings: [number, number][][],
  padRatio = 0.04,
): LngLatBBox | null {
  if (!outerRings.length) return null
  let minLng = Infinity
  let minLat = Infinity
  let maxLng = -Infinity
  let maxLat = -Infinity
  for (const ring of outerRings) {
    for (const [lng, lat] of ring) {
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue
      minLng = Math.min(minLng, lng)
      maxLng = Math.max(maxLng, lng)
      minLat = Math.min(minLat, lat)
      maxLat = Math.max(maxLat, lat)
    }
  }
  if (!Number.isFinite(minLng)) return null
  const padX = Math.max((maxLng - minLng) * padRatio, 1e-6)
  const padY = Math.max((maxLat - minLat) * padRatio, 1e-6)
  return [minLng - padX, minLat - padY, maxLng + padX, maxLat + padY]
}

export function filterOuterRingsByLngLatBBox(
  outerRings: [number, number][][],
  bbox: LngLatBBox,
): [number, number][][] {
  return outerRings.filter(ring => {
    let minLng = Infinity
    let minLat = Infinity
    let maxLng = -Infinity
    let maxLat = -Infinity
    for (const [lng, lat] of ring) {
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue
      minLng = Math.min(minLng, lng)
      maxLng = Math.max(maxLng, lng)
      minLat = Math.min(minLat, lat)
      maxLat = Math.max(maxLat, lat)
    }
    if (!Number.isFinite(minLng)) return false
    return bboxesIntersect([minLng, minLat, maxLng, maxLat], bbox)
  })
}

/** Approximate map bounds from react-map-gl viewState when getBounds() is unavailable. */
export function approximateLngLatBBoxFromViewState(viewState: {
  longitude?: number
  latitude?: number
  zoom?: number
  width?: number
  height?: number
}): LngLatBBox | null {
  const lng = viewState.longitude
  const lat = viewState.latitude
  const zoom = viewState.zoom
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || !Number.isFinite(zoom)) return null
  const latRad = (lat * Math.PI) / 180
  const worldPx = 512 * 2 ** zoom
  const metersPerPx = (156543.03392 * Math.cos(latRad)) / 2 ** (zoom - 0)
  const widthPx = viewState.width && viewState.width > 0 ? viewState.width : 1280
  const heightPx = viewState.height && viewState.height > 0 ? viewState.height : 720
  const halfW = (widthPx / worldPx) * 360 * 0.5
  const halfH = (heightPx / worldPx) * 360 * Math.cos(latRad) * 0.5
  return normalizeLngLatBBox([lng - halfW, lat - halfH, lng + halfW, lat + halfH])
}

export function pointInLngLatBBox(lng: number, lat: number, bbox: LngLatBBox): boolean {
  return lng >= bbox[0] && lng <= bbox[2] && lat >= bbox[1] && lat <= bbox[3]
}

/** Intersection of two WGS84 bboxes — null when disjoint. */
export function intersectLngLatBboxes(a: LngLatBBox, b: LngLatBBox): LngLatBBox | null {
  const w = Math.max(a[0], b[0])
  const s = Math.max(a[1], b[1])
  const e = Math.min(a[2], b[2])
  const n = Math.min(a[3], b[3])
  if (e <= w || n <= s) return null
  return [w, s, e, n]
}

/** Cache-bust key for WMS raster sources — ties tiles to map zoom + extent. */
export function buildLngLatBBoxRefreshKey(
  bbox: LngLatBBox | null | undefined,
  zoom: number | undefined,
  extra = '',
): string {
  const z = Number.isFinite(zoom) ? Number(zoom).toFixed(2) : '0'
  if (!bbox) return extra ? `${z}:${extra}` : z
  return `${z}:${bbox.map(v => v.toFixed(4)).join(',')}${extra ? `:${extra}` : ''}`
}

export function readMapLngLatBBox(map: {
  getBounds?: () => { getWest(): number; getSouth(): number; getEast(): number; getNorth(): number }
} | null | undefined): LngLatBBox | null {
  try {
    const b = map?.getBounds?.()
    if (!b) return null
    return normalizeLngLatBBox([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()])
  } catch {
    return null
  }
}

/**
 * Ease the camera to an AOI extent while guaranteeing Sentinel WMS minzoom.
 * Fitting a huge multi-polygon extent alone often leaves zoom below minzoom
 * (outlines visible, index tiles blocked). cameraForBounds + floor zoom fixes that.
 */
export function easeMapCameraToLngLatBBoxWithMinZoom(
  map: {
    cameraForBounds?: (
      bounds: [[number, number], [number, number]],
      options?: { padding?: number; maxZoom?: number },
    ) =>
      | {
          center?: [number, number] | { lng: number; lat: number }
          zoom?: number
          bearing?: number
          pitch?: number
        }
      | null
      | undefined
    easeTo?: (options: Record<string, unknown>) => void
    fitBounds?: (
      bounds: [[number, number], [number, number]],
      options?: { padding?: number; duration?: number; maxZoom?: number },
    ) => void
    once?: (type: string, listener: () => void) => void
    getZoom?: () => number
  },
  bbox: LngLatBBox,
  minZoom: number,
  options?: { padding?: number; duration?: number },
): void {
  const padding = options?.padding ?? 72
  const duration = options?.duration ?? 700
  const sw: [number, number] = [bbox[0], bbox[1]]
  const ne: [number, number] = [bbox[2], bbox[3]]
  const maxZoom = Math.max(minZoom + 2, 15)
  const floorZoom = minZoom + 0.75

  if (typeof map.cameraForBounds === 'function' && typeof map.easeTo === 'function') {
    try {
      const cam = map.cameraForBounds([sw, ne], { padding, maxZoom })
      if (cam && typeof cam.zoom === 'number') {
        map.easeTo({
          center: cam.center,
          zoom: Math.max(cam.zoom, floorZoom),
          bearing: cam.bearing,
          pitch: cam.pitch,
          duration,
        })
        return
      }
    } catch {
      /* fall through */
    }
  }

  if (typeof map.fitBounds !== 'function') return
  try {
    map.fitBounds([sw, ne], { padding, duration, maxZoom })
    if (
      typeof map.once === 'function' &&
      typeof map.getZoom === 'function' &&
      typeof map.easeTo === 'function'
    ) {
      map.once('moveend', () => {
        try {
          if ((map.getZoom?.() ?? minZoom) < minZoom) {
            map.easeTo?.({ zoom: floorZoom, duration: 400 })
          }
        } catch {
          /* camera race */
        }
      })
    }
  } catch {
    /* camera race */
  }
}
