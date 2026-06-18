import { bboxesIntersect, geometryBBox } from '../../../lib/geoAiGeoJsonSpatial'
import { resolveAgroStructuresCountry } from '../../../lib/agroStructuresPrimaryAoi'
import {
  SENTINEL_LAYER_LIVE_WMS_MAX_TILE_LAYERS_PLATFORM,
  type SentinelLayerLiveWmsBuildOptions,
} from '../../../lib/sentinelLayerLiveWmsEngine'
import { expandLngLatBBox, type LngLatBBox } from '../../../lib/siMapViewport'
import { quantizeAcpMapViewBbox } from './map/acpMapViewPublish'

/** Safety cap when viewport holds an extreme number of fields (rare). */
export const ACP_WMS_VIEWPORT_RING_CAP = 128

/** At/above this zoom, WMS load set follows map extent (spatial definition query). */
export const ACP_WMS_FIELD_CLIP_MIN_ZOOM = 8

export const ACP_WMS_RASTER_LAYER_CLEAR_CAP = 48

export type AcpWmsSessionClipOptions = {
  /** Current map extent — spatial definition query (intersects), not geometry clip. */
  viewportBBox?: LngLatBBox | null
  mapCenter?: [number, number] | null
  countryFilter?: string
  maxFeatures?: number
}

function featureCenter(f: GeoJSON.Feature): [number, number] | null {
  const bb = geometryBBox(f.geometry as { type?: string; coordinates?: unknown })
  if (!bb) return null
  return [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2]
}

function distanceSqLngLat(a: [number, number], b: [number, number]): number {
  const dx = a[0] - b[0]
  const dy = a[1] - b[1]
  return dx * dx + dy * dy
}

function sortFeaturesNearCenter(
  features: GeoJSON.Feature[],
  center: [number, number],
): GeoJSON.Feature[] {
  return [...features].sort((a, b) => {
    const ca = featureCenter(a)
    const cb = featureCenter(b)
    if (!ca && !cb) return 0
    if (!ca) return 1
    if (!cb) return -1
    return distanceSqLngLat(ca, center) - distanceSqLngLat(cb, center)
  })
}

/** Definition query: features whose bbox intersects current extent (with prefetch buffer). */
function filterFeaturesInViewport(
  features: GeoJSON.Feature[],
  viewportBBox: LngLatBBox,
): GeoJSON.Feature[] {
  const expanded = expandLngLatBBox(viewportBBox, 0.15)
  return features.filter(f => {
    const bb = geometryBBox(f.geometry as { type?: string; coordinates?: unknown })
    return Boolean(bb && bboxesIntersect(bb, expanded))
  })
}

/**
 * When viewport filtering is active, return all intersecting features (extent is the limit).
 * Otherwise apply optional cap after center sort (overview / country-wide load).
 */
function applyExtentLoadCap(
  features: GeoJSON.Feature[],
  cap: number,
  viewportFiltered: boolean,
): GeoJSON.Feature[] {
  if (viewportFiltered) {
    if (features.length <= ACP_WMS_VIEWPORT_RING_CAP) return features
    return features.slice(0, ACP_WMS_VIEWPORT_RING_CAP)
  }
  if (!Number.isFinite(cap) || cap <= 0 || features.length <= cap) return features
  return features.slice(0, cap)
}

/**
 * Full dataMask AOI layer — country definition query only.
 * Each feature keeps its complete polygon (Farm Plots + PIVOT).
 */
export function buildAcpWmsDataMaskSource(
  aoiMask: GeoJSON.FeatureCollection,
  countryFilter = 'all',
): GeoJSON.FeatureCollection {
  return buildAcpWmsTileClipSource(aoiMask, countryFilter)
}

/**
 * Which AOIs to load for WMS — spatial + scale filter (ArcGIS definition query).
 * Geometries are never clipped to the viewport; dataMask uses full polygons.
 */
export function buildAcpWmsExtentLoadSet(
  aoiMask: GeoJSON.FeatureCollection,
  options?: AcpWmsSessionClipOptions,
): GeoJSON.FeatureCollection {
  const cap =
    options?.maxFeatures === 0
      ? Number.POSITIVE_INFINITY
      : (options?.maxFeatures ?? Number.POSITIVE_INFINITY)
  let features = [...(aoiMask.features as GeoJSON.Feature[])]
  let viewportFiltered = false

  const countryFilter = options?.countryFilter
  if (countryFilter && countryFilter !== 'all') {
    features = features.filter(f => {
      const props = (f.properties ?? {}) as Record<string, unknown>
      return resolveAgroStructuresCountry(props) === countryFilter
    })
  }

  if (options?.viewportBBox) {
    const inView = filterFeaturesInViewport(features, options.viewportBBox)
    if (inView.length) {
      features = inView
      viewportFiltered = true
    }
  }

  if (!viewportFiltered) {
    const center = options?.mapCenter
    if (center && Number.isFinite(center[0]) && Number.isFinite(center[1])) {
      features = sortFeaturesNearCenter(features, center)
    }
  }

  return {
    type: 'FeatureCollection',
    features: applyExtentLoadCap(features, cap, viewportFiltered),
  }
}

/** @deprecated use buildAcpWmsExtentLoadSet */
export function buildAcpWmsSessionClipFeatureCollection(
  aoiMask: GeoJSON.FeatureCollection,
  options?: AcpWmsSessionClipOptions,
): GeoJSON.FeatureCollection {
  return buildAcpWmsExtentLoadSet(aoiMask, options)
}

/**
 * Stable Agro Structures dataMask — country definition query at overview zoom.
 */
export function buildAcpWmsTileClipSource(
  aoiMask: GeoJSON.FeatureCollection,
  countryFilter = 'all',
): GeoJSON.FeatureCollection {
  if (!countryFilter || countryFilter === 'all') return aoiMask
  const features = (aoiMask.features as GeoJSON.Feature[]).filter(f => {
    const props = (f.properties ?? {}) as Record<string, unknown>
    return resolveAgroStructuresCountry(props) === countryFilter
  })
  return { type: 'FeatureCollection', features }
}

export function buildAcpWmsTileClipForMapView(
  aoiMask: GeoJSON.FeatureCollection,
  options: {
    countryFilter: string
    zoom: number
    bbox: LngLatBBox | null
    center: [number, number]
    maxLoadFields?: number
  },
): GeoJSON.FeatureCollection {
  const atFieldZoom = options.zoom >= ACP_WMS_FIELD_CLIP_MIN_ZOOM
  if (atFieldZoom && options.bbox) {
    return buildAcpWmsExtentLoadSet(aoiMask, {
      viewportBBox: options.bbox,
      mapCenter: options.center,
      countryFilter: options.countryFilter,
      maxFeatures: 0,
    })
  }
  return buildAcpWmsTileClipSource(aoiMask, options.countryFilter)
}

/** @deprecated */
export function buildAcpWmsLiveClipFromMapView(
  aoiMask: GeoJSON.FeatureCollection,
  options: {
    zoom: number
    bbox: LngLatBBox | null
    center: [number, number]
    countryFilter: string
  },
): GeoJSON.FeatureCollection {
  const atFieldZoom = options.zoom >= ACP_WMS_FIELD_CLIP_MIN_ZOOM
  return buildAcpWmsExtentLoadSet(aoiMask, {
    viewportBBox: atFieldZoom ? options.bbox : null,
    mapCenter: options.center,
    countryFilter: options.countryFilter,
  })
}

/** Scale-based load cap — viewport spatial filter is primary; no arbitrary 8-field slice. */
export function resolveScaleBasedLoadCap(zoom: number, _maxWmsLayers: number): number {
  if (zoom < ACP_WMS_FIELD_CLIP_MIN_ZOOM) {
    return Number.POSITIVE_INFINITY
  }
  return Number.POSITIVE_INFINITY
}

/** Cache signature for the loaded AOI set (sorted OBJECTIDs). */
export function buildAcpWmsSessionClipSignature(clip: GeoJSON.FeatureCollection): string {
  const ids = clip.features
    .map(f => {
      const props = (f.properties ?? {}) as Record<string, unknown>
      return String(props.OBJECTID ?? props.objectid ?? props.__acpFieldKey ?? '')
    })
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  if (!ids.length) return '0'
  if (ids.length <= 16) return `${ids.length}:${ids.join(',')}`
  return `${ids.length}:${ids.slice(0, 8).join(',')}..${ids.slice(-4).join(',')}`
}

/** Quantized extent tile — avoids WMS reload on minor pan jitter. */
export function buildAcpWmsExtentTileSignature(
  bbox: LngLatBBox | null,
  zoom: number,
): string {
  if (!bbox) return `z${Math.floor(zoom)}`
  const q = quantizeAcpMapViewBbox(bbox)
  const zBand = zoom < ACP_WMS_FIELD_CLIP_MIN_ZOOM ? 'overview' : zoom < 10 ? 'z8' : zoom < 12 ? 'z10' : 'z12'
  return `${zBand}:${q.map(v => v.toFixed(3)).join(',')}`
}

export const ACP_WMS_MAX_PACKED_TILE_LAYERS = SENTINEL_LAYER_LIVE_WMS_MAX_TILE_LAYERS_PLATFORM

/** WMS build — full dataMask per field when possible; packed fallback up to platform tile cap. */
export function resolveAcpWmsBuildOptions(
  fieldCount = 0,
  maxWmsLayers?: number,
): SentinelLayerLiveWmsBuildOptions {
  const configured = maxWmsLayers ?? SENTINEL_LAYER_LIVE_WMS_MAX_TILE_LAYERS_PLATFORM
  const tileCap = Math.min(
    SENTINEL_LAYER_LIVE_WMS_MAX_TILE_LAYERS_PLATFORM,
    Math.max(configured, fieldCount > 0 ? Math.min(fieldCount, SENTINEL_LAYER_LIVE_WMS_MAX_TILE_LAYERS_PLATFORM) : configured),
  )
  return {
    preferSingleRingChunks:
      fieldCount > 0 && fieldCount <= SENTINEL_LAYER_LIVE_WMS_MAX_TILE_LAYERS_PLATFORM,
    maxTileLayers: tileCap,
    viewportBBox: null,
  }
}

export type AcpWmsMapViewClipInput = {
  countryFilter: string
  zoom: number | null | undefined
  bbox: LngLatBBox | null
  center: [number, number] | null
  maxWmsLayers?: number
}

/**
 * Resolve WMS load set for current map view.
 * - Overview: full country dataMask (all AOI polygons, merged WMS chunks).
 * - Field zoom: extent spatial filter + scale cap; each AOI keeps full polygon dataMask.
 */
export function resolveAcpWmsClipForMapView(
  aoiMask: GeoJSON.FeatureCollection,
  view: AcpWmsMapViewClipInput,
): GeoJSON.FeatureCollection {
  const zoom = view.zoom ?? 0
  if (zoom >= ACP_WMS_FIELD_CLIP_MIN_ZOOM && view.bbox) {
    // Live map extent for AOI pick — quantization is only for cache signatures.
    return buildAcpWmsExtentLoadSet(aoiMask, {
      viewportBBox: expandLngLatBBox(view.bbox, 0.08),
      mapCenter: view.center ?? undefined,
      countryFilter: view.countryFilter,
      maxFeatures: 0,
    })
  }
  return buildAcpWmsDataMaskSource(aoiMask, view.countryFilter)
}
