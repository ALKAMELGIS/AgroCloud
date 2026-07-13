/**
 * Dynamic ArcGIS Online / Enterprise layer integration — service detection,
 * validation, metadata extraction, and Mapbox-compatible source configuration.
 */

import { arcgisExtentToWgs84BBox, type ArcGisExtent } from './arcgisImageServer'
import { discoverArcGisServiceLayers, normalizeArcGisServiceUrl } from './arcgisServiceDiscover'
import type { LngLatBBox } from './siMapViewport'
import {
  agroStructuresFullLayerSqlWhere,
  isAgroStructuresLayerUrl,
  normalizeArcgisLayerUrl,
} from './agroStructuresPrimaryAoi'

export const ARCGIS_DYNAMIC_DEBUG_PREFIX = '[arcgis-dynamic]'

export type ArcGisServiceType = 'feature' | 'map' | 'vector-tile' | 'image' | 'unknown'

export type ArcGisRasterTilesConfig = {
  tiles: string[]
  tileSize?: number
}

export type ArcGisVectorTilesConfig = {
  tiles: string[]
  sourceLayers: string[]
  minzoom?: number
  maxzoom?: number
}

export type ArcGisLayerMetadata = {
  serviceType: ArcGisServiceType
  layerUrl: string
  name: string
  geometryType?: string
  spatialReference?: { wkid?: number; latestWkid?: number }
  extent?: ArcGisExtent
  fullExtent?: ArcGisExtent
  fields?: unknown[]
  drawingInfo?: Record<string, unknown> | null
  renderer?: unknown
  maxRecordCount?: number
  supportsQuery?: boolean
}

export type ArcGisDynamicLayerPersisted = {
  id: string
  name: string
  sourceUrl: string
  arcgisServiceType: ArcGisServiceType
  visible: boolean
  mapOpacity?: number
  viewportStreaming?: boolean
  authToken?: string
}

const EMPTY_FC = { type: 'FeatureCollection' as const, features: [] as unknown[] }
const FEATURE_PAGE_SIZE = 2000
const MAX_FEATURE_PAGES = 50
const VIEWPORT_STREAMING_FEATURE_THRESHOLD = 500

export function arcgisDynamicDebug(phase: string, detail?: Record<string, unknown>): void {
  if (typeof console === 'undefined') return
  console.info(ARCGIS_DYNAMIC_DEBUG_PREFIX, phase, detail ?? {})
}

export function createEmptyArcGisFeatureCollection(): typeof EMPTY_FC {
  return { type: 'FeatureCollection', features: [] }
}

/** Detect ArcGIS service type from a REST endpoint URL (before network validation). */
export function detectArcGisServiceTypeFromUrl(rawUrl: string): ArcGisServiceType {
  const url = String(rawUrl || '').trim().toLowerCase()
  if (!url) return 'unknown'
  if (url.includes('/vectortileserver')) return 'vector-tile'
  if (url.includes('/imageserver')) return 'image'
  if (url.includes('/featureserver')) return 'feature'
  if (url.includes('/mapserver')) return 'map'
  return 'unknown'
}

/** Normalize user input to a concrete layer/service endpoint URL. */
export function normalizeArcGisLayerEndpointUrl(rawUrl: string): string {
  const trimmed = String(rawUrl || '')
    .trim()
    .replace(/^arcgis:/i, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '')
  if (!trimmed) return ''

  const lower = trimmed.toLowerCase()
  if (lower.includes('/featureserver') || lower.includes('/mapserver')) {
    const parts = trimmed.split('/')
    const last = parts[parts.length - 1] ?? ''
    const prev = (parts[parts.length - 2] ?? '').toLowerCase()
    if (/^\d+$/.test(last) && (prev === 'featureserver' || prev === 'mapserver')) {
      return trimmed
    }
    return normalizeArcGisServiceUrl(trimmed)
  }
  return trimmed
}

function buildArcGisJsonUrl(endpoint: string, token?: string): string {
  const u = new URL(`${endpoint.replace(/\/+$/, '')}?f=json`)
  const tok = token?.trim()
  if (tok) u.searchParams.set('token', tok)
  return u.toString()
}

function parseArcGisRestError(json: unknown): string | null {
  if (!json || typeof json !== 'object') return null
  const err = (json as { error?: { message?: string; details?: unknown[] } }).error
  if (!err?.message) return null
  const details = Array.isArray(err.details) ? err.details.map(String).join(' ') : ''
  return [err.message, details].filter(Boolean).join(' ')
}

function arcgisTypeFromJson(json: Record<string, unknown>, url: string): ArcGisServiceType {
  const t = String(json.type || '').toLowerCase()
  if (t === 'feature layer' || t === 'table') return 'feature'
  if (t === 'map server layer' || t === 'feature layer collection') return 'feature'
  if (t === 'map server' || t === 'catalog layer') return 'map'
  if (t === 'vectortileserver') return 'vector-tile'
  if (t === 'imageserver' || t === 'image server') return 'image'
  return detectArcGisServiceTypeFromUrl(url)
}

function wgs84BBoxFromMetadata(meta: ArcGisLayerMetadata): [number, number, number, number] | null {
  const ext = meta.fullExtent ?? meta.extent
  return ext ? arcgisExtentToWgs84BBox(ext) : null
}

/** Resolve a FeatureServer/MapServer root URL to the first drawable layer when no index is given. */
export async function resolveArcGisDrawableLayerUrl(
  rawUrl: string,
  token?: string,
  signal?: AbortSignal,
): Promise<string> {
  const normalized = normalizeArcGisLayerEndpointUrl(rawUrl)
  if (!normalized) throw new Error('Enter a valid ArcGIS REST service URL.')

  const typeGuess = detectArcGisServiceTypeFromUrl(normalized)
  if (typeGuess === 'vector-tile' || typeGuess === 'image') return normalized

  const parts = normalized.split('/')
  const last = parts[parts.length - 1] ?? ''
  const prev = (parts[parts.length - 2] ?? '').toLowerCase()
  if (/^\d+$/.test(last) && (prev === 'featureserver' || prev === 'mapserver')) {
    return normalized
  }

  if (typeGuess === 'feature' || typeGuess === 'map') {
    const discovered = await discoverArcGisServiceLayers(normalized, token ?? '')
    const drawable = discovered.find(l => l.kind === 'layer')
    if (!drawable) throw new Error('No drawable layers found in this ArcGIS service.')
    return drawable.url
  }

  return normalized
}

/** Validate URL accessibility and fetch ArcGIS REST metadata. */
export async function validateAndFetchArcGisLayerMetadata(
  rawUrl: string,
  token?: string,
  signal?: AbortSignal,
): Promise<ArcGisLayerMetadata> {
  const layerUrl = await resolveArcGisDrawableLayerUrl(rawUrl, token, signal)
  arcgisDynamicDebug('url_loaded', { layerUrl })

  const res = await fetch(buildArcGisJsonUrl(layerUrl, token), { method: 'GET', signal })
  if (!res.ok) {
    throw new Error(`ArcGIS service is unavailable (HTTP ${res.status}). Check the URL and try again.`)
  }

  const json = (await res.json()) as Record<string, unknown>
  const restErr = parseArcGisRestError(json)
  if (restErr) throw new Error(restErr)

  const serviceType = arcgisTypeFromJson(json, layerUrl)
  if (serviceType === 'unknown') {
    throw new Error('URL is not a recognized ArcGIS Feature, Map, Vector Tile, or Image service.')
  }

  const name = String(json.name || json.mapName || json.serviceDescription || 'ArcGIS Layer')
  const drawingInfo =
    json.drawingInfo && typeof json.drawingInfo === 'object'
      ? (json.drawingInfo as Record<string, unknown>)
      : null

  const meta: ArcGisLayerMetadata = {
    serviceType,
    layerUrl,
    name,
    geometryType: typeof json.geometryType === 'string' ? json.geometryType : undefined,
    spatialReference:
      json.spatialReference && typeof json.spatialReference === 'object'
        ? (json.spatialReference as { wkid?: number; latestWkid?: number })
        : undefined,
    extent: json.extent as ArcGisExtent | undefined,
    fullExtent: json.fullExtent as ArcGisExtent | undefined,
    fields: Array.isArray(json.fields) ? json.fields : undefined,
    drawingInfo,
    renderer: drawingInfo?.renderer ?? json.renderer,
    maxRecordCount: typeof json.maxRecordCount === 'number' ? json.maxRecordCount : undefined,
    supportsQuery: json.supportsQuery !== false,
  }

  arcgisDynamicDebug('metadata_fetched', {
    serviceType: meta.serviceType,
    name: meta.name,
    geometryType: meta.geometryType,
    wkid: meta.spatialReference?.wkid ?? meta.spatialReference?.latestWkid,
    fieldCount: meta.fields?.length ?? 0,
  })

  return meta
}

export function shouldUseArcGisViewportStreaming(meta: ArcGisLayerMetadata): boolean {
  if (meta.serviceType !== 'feature') return false
  const g = String(meta.geometryType || '').toLowerCase()
  if (!g || g.includes('point')) return false
  if (isAgroStructuresLayerUrl(meta.layerUrl)) return true
  const max = meta.maxRecordCount ?? FEATURE_PAGE_SIZE
  return max >= VIEWPORT_STREAMING_FEATURE_THRESHOLD
}

export function buildArcGisMapServerRasterTiles(layerUrl: string, token?: string): ArcGisRasterTilesConfig {
  const base = layerUrl.replace(/\/+$/, '')
  const tok = token?.trim()
  const tokenParam = tok ? `&token=${encodeURIComponent(tok)}` : ''
  const tiles = [
    `${base}/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256&dpi=96&format=png32&transparent=true&f=image${tokenParam}`,
  ]
  return { tiles, tileSize: 256 }
}

export function buildArcGisImageServerRasterTiles(serviceUrl: string, token?: string): ArcGisRasterTilesConfig {
  const base = serviceUrl.replace(/\/+$/, '')
  const tok = token?.trim()
  const tokenParam = tok ? `&token=${encodeURIComponent(tok)}` : ''
  const tiles = [
    `${base}/exportImage?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256&f=image&format=png&transparent=true&interpolation=RSP_BilinearInterpolation${tokenParam}`,
  ]
  return { tiles, tileSize: 256 }
}

export async function buildArcGisVectorTileConfig(
  serviceUrl: string,
  token?: string,
  signal?: AbortSignal,
): Promise<ArcGisVectorTilesConfig> {
  const base = serviceUrl.replace(/\/+$/, '')
  const res = await fetch(buildArcGisJsonUrl(base, token), { method: 'GET', signal })
  if (!res.ok) throw new Error(`Vector tile service unavailable (HTTP ${res.status}).`)
  const json = (await res.json()) as Record<string, unknown>
  const restErr = parseArcGisRestError(json)
  if (restErr) throw new Error(restErr)

  let tiles = Array.isArray(json.tiles) ? json.tiles.map(String).filter(Boolean) : []
  if (!tiles.length) {
    const tok = token?.trim()
    const tokenSuffix = tok ? `?token=${encodeURIComponent(tok)}` : ''
    tiles = [`${base}/tile/{z}/{y}/{x}.pbf${tokenSuffix}`]
  }

  let sourceLayers: string[] = []
  try {
    const layersRes = await fetch(buildArcGisJsonUrl(`${base}/layers`, token), { method: 'GET', signal })
    if (layersRes.ok) {
      const layersJson = (await layersRes.json()) as { layers?: Array<{ id?: string; name?: string }> }
      sourceLayers = (layersJson.layers ?? [])
        .map(l => String(l.name || l.id || '').trim())
        .filter(Boolean)
    }
  } catch {
    /* optional */
  }
  if (!sourceLayers.length) sourceLayers = [String(json.name || 'layer')]

  return {
    tiles,
    sourceLayers,
    minzoom: typeof json.minLOD === 'number' ? json.minLOD : 0,
    maxzoom: typeof json.maxLOD === 'number' ? json.maxLOD : 22,
  }
}

function buildArcGisFeatureBboxQueryUrl(
  layerUrl: string,
  bbox: LngLatBBox,
  token?: string,
  resultOffset = 0,
): string {
  const where = encodeURIComponent(
    isAgroStructuresLayerUrl(layerUrl) ? agroStructuresFullLayerSqlWhere() : '1=1',
  )
  const geometry = encodeURIComponent(
    JSON.stringify({
      xmin: bbox[0],
      ymin: bbox[1],
      xmax: bbox[2],
      ymax: bbox[3],
      spatialReference: { wkid: 4326 },
    }),
  )
  const base =
    `${layerUrl.replace(/\/+$/, '')}/query?where=${where}&geometry=${geometry}` +
    `&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects` +
    `&outFields=*&returnGeometry=true&outSR=4326&f=geojson` +
    `&resultRecordCount=${FEATURE_PAGE_SIZE}&resultOffset=${resultOffset}`
  if (!token?.trim()) return base
  return `${base}&token=${encodeURIComponent(token.trim())}`
}

/** Fetch feature-layer GeoJSON intersecting a WGS84 bounding box (paginated). */
export async function fetchArcGisFeatureGeoJsonInBbox(
  layerUrl: string,
  bbox: LngLatBBox,
  token?: string,
  signal?: AbortSignal,
): Promise<{ type: 'FeatureCollection'; features: unknown[] }> {
  const features: unknown[] = []
  let offset = 0
  for (let page = 0; page < 20; page++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const res = await fetch(buildArcGisFeatureBboxQueryUrl(layerUrl, bbox, token, offset), { signal })
    if (!res.ok) throw new Error(`ArcGIS bbox query failed (HTTP ${res.status}).`)
    const data = (await res.json()) as {
      type?: string
      features?: unknown[]
      properties?: { exceededTransferLimit?: boolean }
      error?: { message?: string }
    }
    if (data?.error?.message) throw new Error(data.error.message)
    if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
      throw new Error('ArcGIS service did not return GeoJSON features.')
    }
    features.push(...data.features)
    if (!data.properties?.exceededTransferLimit || data.features.length < FEATURE_PAGE_SIZE) {
      arcgisDynamicDebug('features_loaded', { layerUrl, count: features.length, mode: 'bbox' })
      return { type: 'FeatureCollection', features }
    }
    offset += FEATURE_PAGE_SIZE
  }
  arcgisDynamicDebug('features_loaded', { layerUrl, count: features.length, mode: 'bbox-paged' })
  return { type: 'FeatureCollection', features }
}

export function arcGisLayerExtentWgs84(meta: ArcGisLayerMetadata): [number, number, number, number] | null {
  return wgs84BBoxFromMetadata(meta)
}

export function arcGisServiceTypeLabel(type: ArcGisServiceType): string {
  switch (type) {
    case 'feature':
      return 'Feature Service'
    case 'map':
      return 'Map Service'
    case 'vector-tile':
      return 'Vector Tile Service'
    case 'image':
      return 'Image Service'
    default:
      return 'Auto Detect'
  }
}

/** Strip heavy GeoJSON from viewport-streaming layers before localStorage persistence. */
export function slimArcGisLayersForStorage<T extends { viewportStreaming?: boolean; geojson?: { features?: unknown[] } }>(
  layers: T[],
): T[] {
  return layers.map(layer => {
    if (!layer.viewportStreaming) return layer
    const featCount = Array.isArray(layer.geojson?.features) ? layer.geojson!.features!.length : 0
    if (featCount <= 0) return layer
    return { ...layer, geojson: createEmptyArcGisFeatureCollection() }
  })
}

export function isArcGisDynamicRestorableLayer(layer: {
  source?: string
  sourceUrl?: string
  arcgisServiceType?: ArcGisServiceType
}): boolean {
  return (
    layer.source === 'arcgis' &&
    typeof layer.sourceUrl === 'string' &&
    !!layer.sourceUrl.trim() &&
    !!layer.arcgisServiceType &&
    layer.arcgisServiceType !== 'unknown'
  )
}

export function arcGisLayerUrlsMatch(a: string | undefined, b: string | undefined): boolean {
  if (!a?.trim() || !b?.trim()) return false
  return normalizeArcgisLayerUrl(a) === normalizeArcgisLayerUrl(b)
}
