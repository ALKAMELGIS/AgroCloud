import {
  fetchArcGisFeatureLayerGeoJson,
  type ArcGisFeatureLayerFetchProgress,
  type GisHostedFeatureLayerGeoJson as ArcGisFetchedGeoJson,
} from './arcgisFeatureLayerGeoJson'
import {
  fetchAgroStructuresGeoJson,
  isAgroStructuresLayerUrl,
  resolveAgroStructuresLayerUrl,
} from './agroStructuresPrimaryAoi'
import { isWorldCountriesLayerUrl } from './worldCountriesLayer'
import { getArcgisPortalToken } from './arcgisPortalToken'
import {
  GIS_CONTENT_DEFAULT_OWNER,
  gisPortalRowDemoGeoJson,
  type GisContentRow,
} from '../pages/master/gisContentPortalData'
import {
  getGisContentItemDetails,
  type GisContentItemDetails,
} from './gisContentPortalStore'
import { gisContentPortalLayerUrl } from './gisContentPortalTableUtils'

export type GisHostedFeatureLayerSourceMethod =
  | 'upload'
  | 'url'
  | 'map-viewer'
  | 'define-own'
  | 'existing'
  | 'template'
  | 'arcgis-url'

export type GisHostedFeatureLayerGeometryType = 'point' | 'line' | 'polygon'

export type GisHostedFeatureLayerGeoJson = {
  type: 'FeatureCollection'
  features: Array<{
    type: 'Feature'
    properties?: Record<string, unknown>
    geometry?: { type: string; coordinates?: unknown }
  }>
}

export type GisHostedFeatureLayerSnapshotV1 = {
  version: 1
  publishedAt: string
  hosted: true
  geometryType: GisHostedFeatureLayerGeometryType
  sourceMethod: GisHostedFeatureLayerSourceMethod
  /** ArcGIS-style FeatureServer layer endpoint (portal-hosted service). */
  featureServiceUrl: string
  /** Operational layer URL used on web maps (`gis-content://`). */
  layerUrl: string
  geojson: GisHostedFeatureLayerGeoJson
  featureCount: number
  sourceFileName?: string
  externalServiceUrl?: string
}

export const GIS_HOSTED_FEATURE_LAYERS_FOLDER_ID = 'all'

export const GIS_CONTENT_HOSTED_FEATURE_LAYER_TYPE_LABEL = 'Feature layer (hosted)'

export function gisHostedFeatureServiceRestUrl(contentId: string): string {
  const id = encodeURIComponent(contentId)
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/gis-portal/rest/services/content/${id}/FeatureServer/0`
  }
  return `/gis-portal/rest/services/content/${id}/FeatureServer/0`
}

export function inferHostedFeatureLayerGeometryType(
  geojson: GisHostedFeatureLayerGeoJson,
): GisHostedFeatureLayerGeometryType {
  const types = new Set<string>()
  for (const feature of geojson.features ?? []) {
    const gType = feature.geometry?.type
    if (gType === 'Point' || gType === 'MultiPoint') types.add('point')
    else if (gType === 'LineString' || gType === 'MultiLineString') types.add('line')
    else if (gType === 'Polygon' || gType === 'MultiPolygon') types.add('polygon')
  }
  if (types.size === 1) {
    const only = [...types][0]
    if (only === 'point' || only === 'line' || only === 'polygon') return only
  }
  return 'polygon'
}

export function buildGisHostedFeatureLayerSnapshot(input: {
  contentId: string
  geojson: GisHostedFeatureLayerGeoJson
  sourceMethod: GisHostedFeatureLayerSourceMethod
  geometryType?: GisHostedFeatureLayerGeometryType
  sourceFileName?: string
  externalServiceUrl?: string
}): GisHostedFeatureLayerSnapshotV1 {
  const geojson = normalizeHostedFeatureLayerGeoJson(input.geojson)
  const geometryType = input.geometryType ?? inferHostedFeatureLayerGeometryType(geojson)
  const layerUrl = gisContentPortalLayerUrl(input.contentId)
  return {
    version: 1,
    publishedAt: new Date().toISOString(),
    hosted: true,
    geometryType,
    sourceMethod: input.sourceMethod,
    featureServiceUrl: gisHostedFeatureServiceRestUrl(input.contentId),
    layerUrl,
    geojson,
    featureCount: geojson.features.length,
    sourceFileName: input.sourceFileName,
    externalServiceUrl: input.externalServiceUrl,
  }
}

function normalizeHostedFeatureLayerGeoJson(raw: GisHostedFeatureLayerGeoJson): GisHostedFeatureLayerGeoJson {
  const features = Array.isArray(raw?.features) ? raw.features : []
  return { type: 'FeatureCollection', features }
}

export function readGisHostedFeatureLayerSnapshot(
  details: GisContentItemDetails | undefined,
): GisHostedFeatureLayerSnapshotV1 | null {
  const raw = details?.hostedFeatureLayer
  if (!raw || typeof raw !== 'object' || (raw as GisHostedFeatureLayerSnapshotV1).version !== 1) return null
  return raw as GisHostedFeatureLayerSnapshotV1
}

export function isGisContentHostedFeatureLayer(
  row: GisContentRow,
  details?: GisContentItemDetails | null,
): boolean {
  if (row.type !== 'feature-layer') return false
  const snap = readGisHostedFeatureLayerSnapshot(details ?? undefined)
  if (snap?.hosted) return true
  return row.typeLabel.toLowerCase().includes('hosted')
}

export function hostedFeatureLayerGeoJsonForRow(row: GisContentRow): GisHostedFeatureLayerGeoJson {
  const details = getGisContentItemDetails(row.id)
  const snap = readGisHostedFeatureLayerSnapshot(details)
  if (snap?.geojson?.features?.length) return snap.geojson
  return gisPortalRowDemoGeoJson(row) as GisHostedFeatureLayerGeoJson
}

export function resolveHostedFeatureLayerExternalUrl(row: GisContentRow): string | null {
  const snap = readGisHostedFeatureLayerSnapshot(getGisContentItemDetails(row.id))
  const url = snap?.externalServiceUrl?.trim()
  return url || null
}

export function isAgroStructuresPortalRow(row: GisContentRow): boolean {
  if (isAgroStructuresLayerUrl(resolveHostedFeatureLayerExternalUrl(row) ?? undefined)) return true
  const title = row.title.trim().toLowerCase().replace(/\s+/g, ' ')
  return title === 'agro_structures' || title === 'agro structures'
}

export function isWorldCountriesPortalRow(row: GisContentRow): boolean {
  if (isWorldCountriesLayerUrl(resolveHostedFeatureLayerExternalUrl(row) ?? undefined)) return true
  const title = row.title.trim().toLowerCase().replace(/\s+/g, ' ')
  return title === 'world_countries' || title === 'world countries'
}

export function hasHostedFeatureLayerLiveSource(row: GisContentRow): boolean {
  return Boolean(resolveHostedFeatureLayerExternalUrl(row))
}

export type { ArcGisFeatureLayerFetchProgress }

/** Pull live GeoJSON directly from an ArcGIS FeatureServer layer URL. */
export async function fetchHostedFeatureLayerGeoJsonFromServiceUrl(
  serviceUrl: string,
  token = getArcgisPortalToken(),
  options?: {
    onProgress?: (progress: ArcGisFeatureLayerFetchProgress) => void
    signal?: AbortSignal
  },
): Promise<GisHostedFeatureLayerGeoJson> {
  const url = resolveAgroStructuresLayerUrl(serviceUrl.trim())
  if (!url) throw new Error('ArcGIS layer URL is required.')
  const geojson = isAgroStructuresLayerUrl(url)
    ? ((await fetchAgroStructuresGeoJson(token || undefined)) as GisHostedFeatureLayerGeoJson)
    : ((await fetchArcGisFeatureLayerGeoJson(url, {
        token,
        onProgress: options?.onProgress,
        signal: options?.signal,
      })) as ArcGisFetchedGeoJson)
  return normalizeHostedFeatureLayerGeoJson(geojson)
}

export { fetchArcGisFeatureLayerGeoJson, resolveArcGisFeatureLayerQueryProfile } from './arcgisFeatureLayerGeoJson'

/** Pull live geometry from the linked ArcGIS FeatureServer (Agro_Structures uses optimized fetch). */
export async function fetchHostedFeatureLayerLiveGeoJson(
  row: GisContentRow,
  token = getArcgisPortalToken(),
): Promise<{ geojson: GisHostedFeatureLayerGeoJson; externalServiceUrl: string | null }> {
  const externalServiceUrl = resolveHostedFeatureLayerExternalUrl(row)
  if (!externalServiceUrl) {
    return { geojson: hostedFeatureLayerGeoJsonForRow(row), externalServiceUrl: null }
  }
  const geojson = await fetchHostedFeatureLayerGeoJsonFromServiceUrl(externalServiceUrl, token)
  return { geojson, externalServiceUrl }
}

export function gisContentHostedFeatureLayerRowMeta(): Pick<GisContentRow, 'type' | 'typeLabel'> {
  return { type: 'feature-layer', typeLabel: GIS_CONTENT_HOSTED_FEATURE_LAYER_TYPE_LABEL }
}

export function mergeGisHostedFeatureLayerPortalRow(
  rows: GisContentRow[],
  itemDetails: Record<string, GisContentItemDetails>,
  input: {
    id?: string
    title: string
    geojson: GisHostedFeatureLayerGeoJson
    sourceMethod: GisHostedFeatureLayerSourceMethod
    geometryType?: GisHostedFeatureLayerGeometryType
    sourceFileName?: string
    externalServiceUrl?: string
    sharing?: GisContentRow['sharing']
    folderId?: string
  },
): { rows: GisContentRow[]; itemDetails: Record<string, GisContentItemDetails>; row: GisContentRow } {
  const now = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const id = input.id?.trim() || `hfl-${Date.now()}`
  const existing = rows.find(r => r.id === id)
  const typeMeta = gisContentHostedFeatureLayerRowMeta()
  const snapshot = buildGisHostedFeatureLayerSnapshot({
    contentId: id,
    geojson: input.geojson,
    sourceMethod: input.sourceMethod,
    geometryType: input.geometryType,
    sourceFileName: input.sourceFileName,
    externalServiceUrl: input.externalServiceUrl,
  })
  const row: GisContentRow = {
    id,
    title: input.title.trim() || 'Untitled layer',
    ...typeMeta,
    modified: now,
    created: existing?.created ?? now,
    sharing: input.sharing ?? existing?.sharing ?? 'organization',
    folderId: input.folderId ?? existing?.folderId ?? GIS_HOSTED_FEATURE_LAYERS_FOLDER_ID,
    owner: existing?.owner ?? GIS_CONTENT_DEFAULT_OWNER,
  }
  const nextRows = existing ? rows.map(r => (r.id === id ? row : r)) : [...rows, row]
  const nextDetails = {
    ...itemDetails,
    [id]: {
      ...(itemDetails[id] ?? {}),
      hostedFeatureLayer: snapshot,
      description: `Hosted feature layer published on ${now}. Data is served as a Feature Layer service for web maps, dashboards, and apps.`,
      tags: ['hosted', 'feature layer', snapshot.geometryType, 'Elite AgroCloud'],
    },
  }
  return { rows: nextRows, itemDetails: nextDetails, row }
}

export function emptyHostedFeatureLayerGeoJson(
  geometryType: GisHostedFeatureLayerGeometryType,
): GisHostedFeatureLayerGeoJson {
  const lng = 46.72
  const lat = 24.78
  if (geometryType === 'point') {
    return {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: { name: 'Sample point' }, geometry: { type: 'Point', coordinates: [lng, lat] } }],
    }
  }
  if (geometryType === 'line') {
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'Sample line' },
          geometry: { type: 'LineString', coordinates: [[lng, lat], [lng + 0.04, lat + 0.02]] },
        },
      ],
    }
  }
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { name: 'Sample polygon' },
        geometry: {
          type: 'Polygon',
          coordinates: [[[lng, lat], [lng + 0.05, lat], [lng + 0.05, lat + 0.04], [lng, lat + 0.04], [lng, lat]]],
        },
      },
    ],
  }
}
