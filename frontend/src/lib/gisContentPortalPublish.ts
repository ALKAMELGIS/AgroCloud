import type { GisContentItemType, GisContentRow } from '../pages/master/gisContentPortalData'
import type { CreateFeatureLayerResult } from '../pages/master/CreateFeatureLayerWizard'
import type { Create3dLayerResult } from '../pages/master/Create3dLayerWizard'
import { AGRO_STRUCTURES_FS21_URL, isAgroStructuresLayerUrl } from './agroStructuresPrimaryAoi'
import { isWorldCountriesLayerUrl, WORLD_COUNTRIES_FS51_URL } from './worldCountriesLayer'
import { mergeShpLikeToFeatureCollection, normalizeGeoJsonEnvelope, parseFile } from '../utils/FileLoader'
import {
  emptyHostedFeatureLayerGeoJson,
  isAgroStructuresPortalRow,
  isWorldCountriesPortalRow,
  readGisHostedFeatureLayerSnapshot,
  type GisHostedFeatureLayerGeoJson,
} from './gisHostedFeatureLayerPortal'
import {
  getGisContentItemDetails,
  getGisContentPortalRows,
  isGisContentRowInRecycle,
  publishHostedFeatureLayerFromWizard,
  registerGisContentMapLayer,
  upsertGisContentPortalHostedFeatureLayer,
  upsertGisContentPortalItem,
} from './gisContentPortalStore'

export type GisContentNewItemPayload = {
  type: string
  title: string
  file?: File
  featureLayer?: CreateFeatureLayerResult
  threeDLayer?: Create3dLayerResult
}

/** Stable portal id for the primary Agro_Structures hosted feature layer. */
export const AGRO_STRUCTURES_GIS_CONTENT_PORTAL_ID = 'agro-structures-portal'

/** Stable portal id for World_Countries FeatureServer/51. */
export const WORLD_COUNTRIES_GIS_CONTENT_PORTAL_ID = 'world-countries-portal'

export function findAgroStructuresGisContentPortalRow(): GisContentRow | null {
  return getGisContentPortalRows().find(r => isAgroStructuresPortalRow(r)) ?? null
}

export function findWorldCountriesGisContentPortalRow(): GisContentRow | null {
  return getGisContentPortalRows().find(r => isWorldCountriesPortalRow(r)) ?? null
}

function findGisContentPortalRowByExternalServiceUrl(serviceUrl: string): GisContentRow | null {
  const normalized = serviceUrl.trim().replace(/\/+$/, '').toLowerCase()
  if (!normalized) return null
  for (const row of getGisContentPortalRows()) {
    if (isGisContentRowInRecycle(row)) continue
    const snap = readGisHostedFeatureLayerSnapshot(getGisContentItemDetails(row.id))
    const external = snap?.externalServiceUrl?.trim().replace(/\/+$/, '').toLowerCase()
    if (external && external === normalized) return row
  }
  return null
}

/**
 * Ensure Agro_Structures exists in Central GIS Repository (visible in gis-portal-table-wrap).
 * Optionally register it on the shared map registry used by dashboards and GIS Map.
 */
export function ensureAgroStructuresGisContentPortalRow(input?: {
  geojson?: GisHostedFeatureLayerGeoJson
  registerOnMap?: boolean
}): GisContentRow {
  const existing = findAgroStructuresGisContentPortalRow()
  if (existing && isGisContentRowInRecycle(existing)) {
    if (input?.registerOnMap) registerGisContentMapLayer(existing.id)
    return existing
  }
  if (existing && !input?.geojson) {
    if (input?.registerOnMap) registerGisContentMapLayer(existing.id)
    return existing
  }
  const row = upsertGisContentPortalHostedFeatureLayer({
    id: existing?.id ?? AGRO_STRUCTURES_GIS_CONTENT_PORTAL_ID,
    title: existing?.title ?? 'Agro_Structures',
    geojson: input?.geojson ?? emptyHostedFeatureLayerGeoJson('polygon'),
    sourceMethod: 'arcgis-url',
    geometryType: 'polygon',
    externalServiceUrl: AGRO_STRUCTURES_FS21_URL,
    folderId: existing?.folderId ?? 'all',
  })
  if (input?.registerOnMap) registerGisContentMapLayer(row.id)
  return row
}

/**
 * Ensure World_Countries (FeatureServer/51) exists in Central GIS Repository (gis-portal-table-wrap).
 */
export function ensureWorldCountriesGisContentPortalRow(input?: {
  geojson?: GisHostedFeatureLayerGeoJson
  registerOnMap?: boolean
}): GisContentRow {
  const existing = findWorldCountriesGisContentPortalRow()
  if (existing && isGisContentRowInRecycle(existing)) {
    if (input?.registerOnMap) registerGisContentMapLayer(existing.id)
    return existing
  }
  if (existing && !input?.geojson) {
    if (input?.registerOnMap) registerGisContentMapLayer(existing.id)
    return existing
  }
  const row = upsertGisContentPortalHostedFeatureLayer({
    id: existing?.id ?? WORLD_COUNTRIES_GIS_CONTENT_PORTAL_ID,
    title: existing?.title ?? 'World_Countries',
    geojson: input?.geojson ?? emptyHostedFeatureLayerGeoJson('polygon'),
    sourceMethod: 'arcgis-url',
    geometryType: 'polygon',
    externalServiceUrl: WORLD_COUNTRIES_FS51_URL,
    folderId: existing?.folderId ?? 'all',
  })
  if (input?.registerOnMap) registerGisContentMapLayer(row.id)
  return row
}

/** Seed default ArcGIS hosted layers into GIS Content (table + map registry). */
export function ensureDefaultGisContentPortalHostedLayers(input?: {
  agroStructuresGeojson?: GisHostedFeatureLayerGeoJson
  worldCountriesGeojson?: GisHostedFeatureLayerGeoJson
  registerOnMap?: boolean
}): { agroStructures: GisContentRow; worldCountries: GisContentRow } {
  return {
    agroStructures: ensureAgroStructuresGisContentPortalRow({
      geojson: input?.agroStructuresGeojson,
      registerOnMap: input?.registerOnMap,
    }),
    worldCountries: ensureWorldCountriesGisContentPortalRow({
      geojson: input?.worldCountriesGeojson,
      registerOnMap: input?.registerOnMap,
    }),
  }
}

/** Persist an ArcGIS feature layer added on a map into Central GIS Repository. */
export function persistArcGisHostedFeatureLayerToGisContentPortal(input: {
  title: string
  geojson: GisHostedFeatureLayerGeoJson
  serviceUrl: string
  registerOnMap?: boolean
}): GisContentRow {
  if (isAgroStructuresLayerUrl(input.serviceUrl)) {
    return ensureAgroStructuresGisContentPortalRow({
      geojson: input.geojson,
      registerOnMap: input.registerOnMap,
    })
  }
  if (isWorldCountriesLayerUrl(input.serviceUrl)) {
    return ensureWorldCountriesGisContentPortalRow({
      geojson: input.geojson,
      registerOnMap: input.registerOnMap,
    })
  }
  const existing = findGisContentPortalRowByExternalServiceUrl(input.serviceUrl)
  const row = upsertGisContentPortalHostedFeatureLayer({
    id: existing?.id,
    title: input.title.trim() || existing?.title || 'Feature layer',
    geojson: input.geojson,
    sourceMethod: 'arcgis-url',
    externalServiceUrl: input.serviceUrl.trim(),
    folderId: existing?.folderId ?? 'all',
  })
  if (input.registerOnMap) registerGisContentMapLayer(row.id)
  return row
}

const NEW_ITEM_CATALOG_META: Record<string, { type: GisContentItemType; typeLabel: string }> = {
  url: { type: 'feature-layer', typeLabel: 'Feature layer (URL)' },
  'developer-credentials': { type: 'tool', typeLabel: 'Developer credentials' },
  application: { type: 'app', typeLabel: 'Application' },
  locator: { type: 'tool', typeLabel: 'Locator' },
  'data-store': { type: 'file', typeLabel: 'Data store' },
  'raster-template': { type: 'file', typeLabel: 'Raster function template' },
  'data-pipeline': { type: 'tool', typeLabel: 'Data pipeline' },
  upload: { type: 'feature-layer', typeLabel: 'Feature layer (hosted)' },
}

async function parseUploadFileToGeoJson(file: File): Promise<GisHostedFeatureLayerGeoJson> {
  const parsed = await parseFile(file)
  if (parsed.type !== 'geojson') {
    throw new Error('File must contain GIS features (GeoJSON, KML, KMZ, Shapefile zip, or CSV with coordinates).')
  }
  let geojson: unknown = parsed.data
  if (Array.isArray(geojson)) geojson = geojson[0]
  const normalized = normalizeGeoJsonEnvelope(mergeShpLikeToFeatureCollection(geojson))
  if (!normalized.features.length) {
    throw new Error('No drawable features found in the uploaded file.')
  }
  return normalized as GisHostedFeatureLayerGeoJson
}

async function publishUploadedFile(title: string, file: File): Promise<GisContentRow> {
  const geojson = await parseUploadFileToGeoJson(file)
  const layerTitle = title.trim() || file.name.replace(/\.[^.]+$/, '').trim() || 'Uploaded layer'
  return upsertGisContentPortalHostedFeatureLayer({
    title: layerTitle,
    geojson,
    sourceMethod: 'upload',
    sourceFileName: file.name,
    folderId: 'all',
  })
}

function publish3dLayer(result: Create3dLayerResult): GisContentRow {
  return upsertGisContentPortalItem({
    title: result.title,
    type: 'three-d-layer',
    typeLabel: '3D layer',
    folderId: 'all',
    details: {
      tags: ['3d layer', result.layerKind, 'Elite AgroCloud'],
      portalSource: {
        kind: '3d-layer',
        fileName: result.fileName,
        threeDLayerKind: result.layerKind,
      },
    },
  })
}

function publishCatalogItem(type: string, title: string): GisContentRow {
  const meta = NEW_ITEM_CATALOG_META[type] ?? { type: 'file' as const, typeLabel: type.replace(/-/g, ' ') }
  return upsertGisContentPortalItem({
    title,
    type: meta.type,
    typeLabel: meta.typeLabel,
    folderId: 'all',
    details: {
      tags: [meta.typeLabel, 'Elite AgroCloud'],
      portalSource: { kind: type },
    },
  })
}

/**
 * Save any New item / upload flow into GIS Content (local portal store).
 * Items persist across sessions until the user deletes them from Recycle bin.
 */
export async function publishGisContentNewItem(payload: GisContentNewItemPayload): Promise<GisContentRow> {
  if (payload.featureLayer) {
    return publishHostedFeatureLayerFromWizard(payload.featureLayer)
  }
  if (payload.threeDLayer) {
    return publish3dLayer(payload.threeDLayer)
  }
  if (payload.file) {
    return publishUploadedFile(payload.title, payload.file)
  }
  if (payload.type === 'upload') {
    throw new Error('Choose a file to upload before publishing.')
  }
  return publishCatalogItem(payload.type, payload.title)
}
