import type { CropAlertFieldResult } from './siCropAlertEngine'
import {
  classifyDchasRiskTier,
  resolveDchasMetrics,
  type DchasRiskTier,
} from './siCropAlertDchasBeacon'
import type { LngLatBBox } from './siMapViewport'
import { filterCropAlertMarkersForViewport } from './siCropAlertMapMarkersFilter'

/** Minimal tier encoding for Mapbox data-driven paint (0 = stable … 3 = critical). */
export const CROP_ALERT_LIGHTWEIGHT_TIER: Record<DchasRiskTier, number> = {
  stable: 0,
  watch: 1,
  stress: 2,
  critical: 3,
}

export type CropAlertLightweightFeatureProps = {
  fieldKey: string
  tier: number
}

const OVERLAY_RING_MAX_VERTICES = 6
const OVERLAY_POLYGON_MIN_ZOOM = 9
const OVERLAY_POLYGON_TIER_MIN = CROP_ALERT_LIGHTWEIGHT_TIER.stress

function decimateRing(ring: number[][], maxPts: number): number[][] {
  if (ring.length <= maxPts) return ring
  const step = Math.ceil(ring.length / maxPts)
  const out: number[][] = []
  for (let i = 0; i < ring.length; i += step) out.push(ring[i]!)
  const last = ring[ring.length - 1]!
  const prev = out[out.length - 1]!
  if (prev[0] !== last[0] || prev[1] !== last[1]) out.push(last)
  return out
}

/** Aggressive ring decimation for map overlay — not for analytics. */
export function simplifyGeometryForCropAlertOverlay(
  geometry: GeoJSON.Geometry | null | undefined,
): GeoJSON.Polygon | GeoJSON.MultiPolygon | null {
  if (!geometry) return null
  if (geometry.type === 'Polygon') {
    const ring = geometry.coordinates[0]
    if (!ring?.length) return null
    return { type: 'Polygon', coordinates: [decimateRing(ring as number[][], OVERLAY_RING_MAX_VERTICES)] }
  }
  if (geometry.type === 'MultiPolygon') {
    const polys = geometry.coordinates
      .map(poly => {
        const ring = poly?.[0]
        if (!ring?.length) return null
        return [decimateRing(ring as number[][], OVERLAY_RING_MAX_VERTICES)] as number[][][]
      })
      .filter(Boolean) as number[][][][]
    if (!polys.length) return null
    return { type: 'MultiPolygon', coordinates: polys }
  }
  return null
}

export function resolveCropAlertLightweightTier(result: CropAlertFieldResult): number {
  const { deltaChas } = resolveDchasMetrics(result)
  return CROP_ALERT_LIGHTWEIGHT_TIER[classifyDchasRiskTier(deltaChas)]
}

type BuildOverlayOptions = {
  results: CropAlertFieldResult[]
  viewportBbox: LngLatBBox | null
  mapZoom: number | null
  pinKeys: ReadonlySet<string>
  /** Hide GPU dots for fields rendered as interactive DOM beacons. */
  excludeFieldKeys?: ReadonlySet<string>
  /** When true, omit point beacons (DOM 3D pins handle world / regional view). */
  skipPointMarkers?: boolean
}

/**
 * Point beacons + optional simplified polygons — geometry and tier only.
 * No index snapshots, messages, or time-series payload on the wire to Mapbox.
 */
export function buildCropAlertLightweightOverlayGeoJson(
  options: BuildOverlayOptions,
): GeoJSON.FeatureCollection {
  const filtered = filterCropAlertMarkersForViewport(
    options.results,
    options.viewportBbox,
    options.mapZoom,
    options.pinKeys,
  )
  const exclude = options.excludeFieldKeys ?? new Set<string>()
  const showPolygons =
    options.mapZoom != null && options.mapZoom >= OVERLAY_POLYGON_MIN_ZOOM

  const features: GeoJSON.Feature[] = []

  for (const result of filtered) {
    if (exclude.has(result.fieldKey)) continue

    const tier = resolveCropAlertLightweightTier(result)
    const baseProps: CropAlertLightweightFeatureProps = {
      fieldKey: result.fieldKey,
      tier,
    }

    if (!options.skipPointMarkers) {
      features.push({
        type: 'Feature',
        id: `pt-${result.fieldKey}`,
        properties: baseProps,
        geometry: { type: 'Point', coordinates: result.centroid },
      })
    }

    if (showPolygons && tier >= OVERLAY_POLYGON_TIER_MIN) {
      const simplified = simplifyGeometryForCropAlertOverlay(result.geometry)
      if (simplified) {
        features.push({
          type: 'Feature',
          id: `pg-${result.fieldKey}`,
          properties: baseProps,
          geometry: simplified,
        })
      }
    }
  }

  return { type: 'FeatureCollection', features }
}
