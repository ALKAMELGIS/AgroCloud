/**
 * Agro_Structures FeatureServer/21 — primary AOI for Sentinel Live dynamic clip + dataMask.
 */

import {
  arcLegendLabelForFieldValue,
  buildArcFieldsByLower,
  readCodedValueDescription,
  type ArcgisLayerDefLite,
} from './arcgisAttributeDisplay'
import { pointInPolygonGeometry } from './geoAiGeoJsonSpatial'
import { computeStableGisFeatureKey } from './gisFeatureStableKey'
import { computeSiAoiFieldMetrics } from './siAoiFields'
import type { LngLatBBox } from './siMapViewport'

export const AGRO_STRUCTURES_FS21_URL =
  'https://services1.arcgis.com/jz3ndhbYV5K9NwI8/arcgis/rest/services/Agro_Structures/FeatureServer/21'

export const AGRO_STRUCTURES_PRIMARY_LAYER_ID = 'agro-structures-fs21'

/** ArcGIS subtype codes on Structure_Type (layer 21). */
export const AGRO_STRUCTURES_SENTINEL_STRUCTURE_TYPE_CODES = [1006, 1007] as const

/** Display labels for Sentinel Live AOI filter (Structure_Type IN …). */
export const AGRO_STRUCTURES_SENTINEL_STRUCTURE_TYPE_LABELS = ['Farm Plots', 'PIVOT'] as const

/** Full Structure_Type catalog (ArcGIS subtypes 1000–1007 on layer 21). */
export const AGRO_STRUCTURES_STRUCTURE_TYPE_CATALOG = [
  { code: 1000, label: 'Greenhouse' },
  { code: 1001, label: 'Nethouse' },
  { code: 1002, label: 'Glasshouse' },
  { code: 1003, label: 'Retractable Roof Houses' },
  { code: 1004, label: 'Cravo' },
  { code: 1005, label: 'Dates Farm' },
  { code: 1006, label: 'PIVOT' },
  { code: 1007, label: 'Farm Plots' },
] as const

const AGRO_STRUCTURES_STRUCTURE_TYPE_BY_CODE = new Map<number, string>(
  AGRO_STRUCTURES_STRUCTURE_TYPE_CATALOG.map(item => [item.code, item.label]),
)

const AGRO_STRUCTURES_STRUCTURE_TYPE_BY_LABEL = new Map<string, number>(
  AGRO_STRUCTURES_STRUCTURE_TYPE_CATALOG.map(item => [item.label.toLowerCase(), item.code]),
)

export type AgroStructuresStructureTypeTotal = {
  code: number
  label: string
  count: number
  areaHa: number
}

const AGRO_STRUCTURES_SENTINEL_STRUCTURE_TYPE_CODE_SET = new Set<number>(
  AGRO_STRUCTURES_SENTINEL_STRUCTURE_TYPE_CODES,
)

const AGRO_STRUCTURES_SENTINEL_STRUCTURE_TYPE_LABEL_SET = new Set<string>(
  AGRO_STRUCTURES_SENTINEL_STRUCTURE_TYPE_LABELS.map(l => l.toLowerCase()),
)

/** Resolve Structure_Type to a canonical label (handles ArcGIS subtype codes + strings). */
export function resolveAgroStructuresStructureTypeLabel(
  props: Record<string, unknown> | null | undefined,
): string {
  if (!props || typeof props !== 'object') return ''
  const raw = props.Structure_Type ?? props.STRUCTURE_TYPE ?? props.structure_type
  if (raw == null || raw === '') return ''
  const code = Number(raw)
  if (Number.isFinite(code) && AGRO_STRUCTURES_STRUCTURE_TYPE_BY_CODE.has(code)) {
    return AGRO_STRUCTURES_STRUCTURE_TYPE_BY_CODE.get(code)!
  }
  const text = String(raw).trim()
  const byLabel = AGRO_STRUCTURES_STRUCTURE_TYPE_BY_LABEL.get(text.toLowerCase())
  if (byLabel != null) return AGRO_STRUCTURES_STRUCTURE_TYPE_BY_CODE.get(byLabel)!
  if (/^pivot$/i.test(text)) return 'PIVOT'
  if (/^farm\s*plots?$/i.test(text)) return 'Farm Plots'
  return text
}

function resolveAgroStructuresStructureTypeCode(
  props: Record<string, unknown> | null | undefined,
): number | null {
  if (!props || typeof props !== 'object') return null
  const raw = props.Structure_Type ?? props.STRUCTURE_TYPE ?? props.structure_type
  if (raw == null || raw === '') return null
  const code = Number(raw)
  if (Number.isFinite(code) && AGRO_STRUCTURES_STRUCTURE_TYPE_BY_CODE.has(code)) return code
  const label = resolveAgroStructuresStructureTypeLabel(props)
  return label ? (AGRO_STRUCTURES_STRUCTURE_TYPE_BY_LABEL.get(label.toLowerCase()) ?? null) : null
}

function resolveAgroStructuresFeatureAreaHa(
  props: Record<string, unknown>,
  geometry: unknown,
): number {
  const fromAttr = props.Area_ha ?? props.AREA_HA ?? props.area_ha
  const attrNum = Number(fromAttr)
  if (Number.isFinite(attrNum) && attrNum > 0) return attrNum
  if (isPolygonalAoiGeometry(geometry)) {
    const { areaHa } = computeSiAoiFieldMetrics(geometry as GeoJSON.Geometry)
    if (Number.isFinite(areaHa) && areaHa > 0) return areaHa
  }
  return 0
}

/** Count + area (ha) per Structure_Type from the full Agro_Structures GeoJSON layer. */
export function buildAgroStructuresStructureTypeTotals(
  geojson: { features?: unknown[] } | null | undefined,
): AgroStructuresStructureTypeTotal[] {
  const buckets = new Map<number, { count: number; areaHa: number }>(
    AGRO_STRUCTURES_STRUCTURE_TYPE_CATALOG.map(item => [item.code, { count: 0, areaHa: 0 }]),
  )
  const features = Array.isArray(geojson?.features) ? geojson!.features! : []
  for (const raw of features) {
    const feature = raw as {
      type?: string
      geometry?: unknown
      properties?: Record<string, unknown>
    }
    if (feature?.type !== 'Feature' || !isPolygonalAoiGeometry(feature.geometry)) continue
    const props = feature.properties ?? {}
    const code = resolveAgroStructuresStructureTypeCode(props)
    if (code == null || !buckets.has(code)) continue
    const bucket = buckets.get(code)!
    bucket.count += 1
    bucket.areaHa += resolveAgroStructuresFeatureAreaHa(props, feature.geometry)
  }
  return AGRO_STRUCTURES_STRUCTURE_TYPE_CATALOG.map(item => {
    const bucket = buckets.get(item.code)!
    return {
      code: item.code,
      label: item.label,
      count: bucket.count,
      areaHa: Number(bucket.areaHa.toFixed(2)),
    }
  })
}

const AGRO_STRUCTURES_NAME_KEYS = [
  'Farm_Name',
  'FARM_NAME',
  'farm_name',
  'farmName',
  'Structure_Name',
  'STRUCTURE_NAME',
  'structure_name',
  'Site_Name',
  'SITE_NAME',
  'site_name',
  'Area_Name',
  'AREA_NAME',
  'area_name',
  'Name',
  'NAME',
  'name',
  'Description',
  'DESCRIPTION',
  'description',
] as const

const AGRO_STRUCTURES_CODE_KEYS = [
  'Farm_Code',
  'FARM_CODE',
  'farm_code',
  'farmCode',
  'Site_Plot_ID',
  'SITE_PLOT_ID',
  'site_plot_id',
  'Unit_ID',
  'UNIT_ID',
  'unit_id',
  'Plot_ID',
  'PLOT_ID',
  'plot_id',
  'Parcel_ID',
  'PARCEL_ID',
  'parcel_id',
] as const

const AGRO_STRUCTURES_COUNTRY_KEYS = [
  'Country',
  'COUNTRY',
  'country',
  'Country_Name',
  'COUNTRY_NAME',
  'country_name',
  'Nation',
  'NATION',
  'nation',
] as const

/** City / region locality from Agro_Structures (layer 21 exposes `Region`). */
const AGRO_STRUCTURES_CITY_KEYS = [
  'Region',
  'REGION',
  'region',
  'City',
  'CITY',
  'city',
  'City_Name',
  'CITY_NAME',
  'city_name',
  'Governorate',
  'GOVERNORATE',
  'governorate',
  'Emirate',
  'EMIRATE',
  'emirate',
  'Municipality',
  'MUNICIPALITY',
  'municipality',
  'Locality',
  'LOCALITY',
  'locality',
  'Town',
  'TOWN',
  'town',
] as const

export type AgroStructuresCountryTotal = {
  country: string
  structureCount: number
  areaHa: number
}

function readAgroStructuresPropString(
  props: Record<string, unknown>,
  keys: readonly string[],
): string {
  for (const key of keys) {
    const direct = props[key]
    if (direct != null && direct !== '') {
      const text = String(direct).trim()
      if (text && !/^null$/i.test(text)) return text
    }
    const lower = key.toLowerCase()
    for (const [propKey, value] of Object.entries(props)) {
      if (propKey.toLowerCase() !== lower) continue
      if (value == null || value === '') continue
      const text = String(value).trim()
      if (text && !/^null$/i.test(text)) return text
    }
  }
  return ''
}

/** Human-readable name from Agro_Structures attributes (Farm_Name, Structure_Name, …). */
export function resolveAgroStructuresFieldName(props: Record<string, unknown>): string {
  return readAgroStructuresPropString(props, AGRO_STRUCTURES_NAME_KEYS)
}

/** Business / plot code from Agro_Structures attributes (Farm_Code, Site_Plot_ID, …). */
export function resolveAgroStructuresFieldCode(props: Record<string, unknown>): string {
  return readAgroStructuresPropString(props, AGRO_STRUCTURES_CODE_KEYS)
}

/** Country from Agro_Structures attributes (Country, Country_Name, …). */
export function resolveAgroStructuresCountry(props: Record<string, unknown>): string {
  return readAgroStructuresPropString(props, AGRO_STRUCTURES_COUNTRY_KEYS)
}

/** City / region locality from Agro_Structures attributes (Region, City, …). */
export function resolveAgroStructuresCity(props: Record<string, unknown>): string {
  return readAgroStructuresPropString(props, AGRO_STRUCTURES_CITY_KEYS)
}

function collectAgroStructuresCountryDomainLabels(
  domain: unknown,
  out: Map<string, string>,
): void {
  if (!domain || typeof domain !== 'object') return
  const codedDomain = domain as { type?: string; codedValues?: unknown[] }
  if (codedDomain.type !== 'codedValue' || !Array.isArray(codedDomain.codedValues)) return
  for (const coded of codedDomain.codedValues) {
    const code = String((coded as { code?: unknown })?.code ?? '').trim()
    const description = readCodedValueDescription(coded)
    if (code && description) out.set(code, description)
  }
}

/** Country coded-value descriptions from Agro_Structures layer schema (Country domain). */
export function buildAgroStructuresCountryDescriptionMap(
  arcDef: ArcgisLayerDefLite | null | undefined,
): Map<string, string> {
  const out = new Map<string, string>()
  if (!arcDef) return out

  const fieldsByLower = buildArcFieldsByLower(arcDef)
  collectAgroStructuresCountryDomainLabels(fieldsByLower.get('country')?.domain, out)

  const arcTypes = Array.isArray(arcDef.types) ? arcDef.types : []
  for (const subtype of arcTypes) {
    const domains =
      subtype && typeof subtype === 'object' && subtype.domains && typeof subtype.domains === 'object'
        ? (subtype.domains as Record<string, unknown>)
        : null
    if (!domains) continue
    for (const [fieldName, domain] of Object.entries(domains)) {
      if (String(fieldName).toLowerCase() !== 'country') continue
      collectAgroStructuresCountryDomainLabels(domain, out)
    }
  }

  return out
}

/** Human-readable Country label from coded-value domain; falls back to stored code. */
export function resolveAgroStructuresCountryLabel(
  countryCode: string,
  descriptionMap: Map<string, string> | null | undefined,
  arcDef?: ArcgisLayerDefLite | null,
): string {
  const code = String(countryCode || '').trim()
  if (!code || code === 'Unknown') return 'Unknown'
  const fromMap = descriptionMap?.get(code)
  if (fromMap) return fromMap
  if (arcDef) {
    const fieldsByLower = buildArcFieldsByLower(arcDef)
    const resolved = arcLegendLabelForFieldValue('Country', code, arcDef, fieldsByLower)
    if (resolved && resolved !== code) return resolved
  }
  return code
}

/** Count + area (ha) per Country from the full Agro_Structures GeoJSON layer. */
export function buildAgroStructuresCountryTotals(
  geojson: { features?: unknown[] } | null | undefined,
): AgroStructuresCountryTotal[] {
  const buckets = new Map<string, { structureCount: number; areaHa: number }>()
  const features = Array.isArray(geojson?.features) ? geojson!.features! : []
  for (const raw of features) {
    const feature = raw as {
      type?: string
      geometry?: unknown
      properties?: Record<string, unknown>
    }
    if (feature?.type !== 'Feature' || !isPolygonalAoiGeometry(feature.geometry)) continue
    const props = feature.properties ?? {}
    const country = resolveAgroStructuresCountry(props) || 'Unknown'
    const bucket = buckets.get(country) ?? { structureCount: 0, areaHa: 0 }
    bucket.structureCount += 1
    bucket.areaHa += resolveAgroStructuresFeatureAreaHa(props, feature.geometry)
    buckets.set(country, bucket)
  }
  return [...buckets.entries()]
    .map(([country, bucket]) => ({
      country,
      structureCount: bucket.structureCount,
      areaHa: Number(bucket.areaHa.toFixed(2)),
    }))
    .sort((a, b) => b.structureCount - a.structureCount || a.country.localeCompare(b.country))
}

export function resolveAgroStructuresFieldDisplayName(
  source:
    | Record<string, unknown>
    | {
        farmName?: string
        farmCode?: string
        objectId?: string | number
        structureType?: string
      },
): string {
  const props =
    'farmName' in source || 'farmCode' in source || 'objectId' in source || 'structureType' in source
      ? null
      : (source as Record<string, unknown>)
  const name = props
    ? resolveAgroStructuresFieldName(props)
    : String(source.farmName ?? '').trim()
  const code = props
    ? resolveAgroStructuresFieldCode(props)
    : String(source.farmCode ?? '').trim()
  const structureType = props
    ? resolveAgroStructuresStructureTypeLabel(props)
    : String(source.structureType ?? '').trim()
  const objectId =
    (props ? props.OBJECTID ?? props.objectid ?? props.FID : source.objectId) ?? null

  if (name && code && name.toLowerCase() !== code.toLowerCase()) return `${name} (${code})`
  if (name) return name
  if (code) return code
  if (structureType && objectId != null && String(objectId).trim()) {
    return `${structureType} #${String(objectId).trim()}`
  }
  if (objectId != null && String(objectId).trim()) return `#${String(objectId).trim()}`
  return 'Agro Field'
}

/** True when Structure_Type is Farm Plots or PIVOT (Sentinel Live / dataMask AOI). */
export function isAgroStructuresSentinelMaskStructureType(
  props: Record<string, unknown> | null | undefined,
): boolean {
  if (!props || typeof props !== 'object') return false
  const raw = props.Structure_Type ?? props.STRUCTURE_TYPE ?? props.structure_type
  if (raw != null && raw !== '') {
    const code = Number(raw)
    if (Number.isFinite(code) && AGRO_STRUCTURES_SENTINEL_STRUCTURE_TYPE_CODE_SET.has(code as 1006 | 1007)) {
      return true
    }
  }
  const label = resolveAgroStructuresStructureTypeLabel(props).toLowerCase()
  return AGRO_STRUCTURES_SENTINEL_STRUCTURE_TYPE_LABEL_SET.has(label)
}

export function filterAgroStructuresSentinelMaskFeatures(features: unknown[]): unknown[] {
  return features.filter(raw => {
    const props = (raw as { properties?: Record<string, unknown> })?.properties ?? {}
    return isAgroStructuresSentinelMaskStructureType(props) && featureToPrimaryAoiFeature(raw) != null
  })
}

/** ArcGIS SQL for server-side Structure_Type filter (Farm Plots + PIVOT only). */
export function agroStructuresSentinelMaskSqlWhere(): string {
  return `Structure_Type IN (${AGRO_STRUCTURES_SENTINEL_STRUCTURE_TYPE_CODES.join(',')})`
}

const AGRO_STRUCTURES_QUERY_PAGE_SIZE = 2000

export type AgroStructuresLayerLike = {
  id?: string
  name?: string
  source?: string
  sourceUrl?: string
  geojson?: { features?: unknown[] }
}

export function normalizeArcgisLayerUrl(url: string): string {
  return String(url || '')
    .trim()
    .replace(/^arcgis:/i, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '')
    .toLowerCase()
}

const AGRO_STRUCTURES_FS21_NORMALIZED = normalizeArcgisLayerUrl(AGRO_STRUCTURES_FS21_URL)

export function isAgroStructuresLayerUrl(url: string | undefined): boolean {
  if (!url?.trim()) return false
  return normalizeArcgisLayerUrl(url) === AGRO_STRUCTURES_FS21_NORMALIZED
}

export function isAgroStructuresLayer(layer: AgroStructuresLayerLike | null | undefined): boolean {
  if (!layer) return false
  if (layer.id === AGRO_STRUCTURES_PRIMARY_LAYER_ID) return true
  if (isAgroStructuresLayerUrl(layer.sourceUrl)) return true
  const name = String(layer.name || '').trim().toLowerCase()
  return name === 'agro_structures' || name === 'agro structures'
}

export type GeoJsonPolygonalFeature = {
  type: 'Feature'
  properties?: Record<string, unknown>
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown }
}

export function isPolygonalAoiGeometry(
  geom: unknown,
): geom is { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown } {
  if (!geom || typeof geom !== 'object') return false
  const t = (geom as { type?: string }).type
  return t === 'Polygon' || t === 'MultiPolygon'
}

/** Normalize any polygon feature into a primary AOI Feature for Sentinel GEOMETRY + dataMask. */
export function featureToPrimaryAoiFeature(feature: unknown): GeoJsonPolygonalFeature | null {
  if (!feature || typeof feature !== 'object') return null
  const f = feature as {
    type?: string
    geometry?: { type?: string; coordinates?: unknown }
    properties?: Record<string, unknown>
  }
  if (f.type !== 'Feature' || !isPolygonalAoiGeometry(f.geometry)) return null
  const props = f.properties ?? {}
  const label = resolveAgroStructuresFieldDisplayName(props)
  return {
    type: 'Feature',
    properties: { ...f.properties, label, aoiSource: 'agro-structures' },
    geometry: f.geometry as GeoJsonPolygonalFeature['geometry'],
  }
}

function propsFingerprint(props: Record<string, unknown>): string {
  const sorted = Object.keys(props)
    .sort()
    .reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = props[k]
      return acc
    }, {})
  return JSON.stringify(sorted)
}

const AGRO_STRUCTURES_MATCH_KEYS = ['OBJECTID', 'GlobalID', 'globalid', 'Farm_Code', 'Farm_Name', 'FARM_NAME'] as const

/** Match Mapbox identify props to GeoJSON attrs (handles string/number coercion). */
export function agroStructuresHitPropertiesMatch(
  hitProperties: Record<string, unknown>,
  featureProps: Record<string, unknown>,
): boolean {
  for (const key of AGRO_STRUCTURES_MATCH_KEYS) {
    const hv = hitProperties[key] ?? hitProperties[key.toLowerCase()]
    const fv = featureProps[key] ?? featureProps[key.toLowerCase()]
    if (hv != null && fv != null && String(hv).trim() === String(fv).trim()) return true
  }
  return propsFingerprint(hitProperties) === propsFingerprint(featureProps)
}

/** Match identify hit properties to a full GeoJSON feature (includes geometry). */
export function findAgroStructuresFeatureInLayer(
  layer: AgroStructuresLayerLike,
  hitProperties: Record<string, unknown>,
): { feature: GeoJsonPolygonalFeature; featureKey: string } | null {
  const features = Array.isArray(layer.geojson?.features) ? layer.geojson!.features! : []
  for (let i = 0; i < features.length; i++) {
    const raw = features[i] as { properties?: Record<string, unknown> }
    const props =
      raw?.properties && typeof raw.properties === 'object' && !Array.isArray(raw.properties)
        ? raw.properties
        : {}
    if (!agroStructuresHitPropertiesMatch(hitProperties, props)) continue
    const aoi = featureToPrimaryAoiFeature(raw)
    if (!aoi) continue
    return { feature: aoi, featureKey: computeStableGisFeatureKey(raw, i) }
  }
  return null
}

/** Point-in-polygon lookup when Mapbox queryRenderedFeatures misses the hit. */
export function findAgroStructuresFeatureAtLngLat(
  layer: AgroStructuresLayerLike,
  lng: number,
  lat: number,
): { feature: GeoJsonPolygonalFeature; featureKey: string } | null {
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
  const features = Array.isArray(layer.geojson?.features) ? layer.geojson!.features! : []
  for (let i = 0; i < features.length; i++) {
    const raw = features[i] as { geometry?: { type?: string; coordinates?: unknown } }
    if (!pointInPolygonGeometry(lng, lat, raw.geometry)) continue
    const aoi = featureToPrimaryAoiFeature(raw)
    if (!aoi) continue
    return { feature: aoi, featureKey: computeStableGisFeatureKey(raw, i) }
  }
  return null
}

export function findAgroStructuresFeatureByKey(
  layer: AgroStructuresLayerLike,
  featureKey: string,
): GeoJsonPolygonalFeature | null {
  const features = Array.isArray(layer.geojson?.features) ? layer.geojson!.features! : []
  for (let i = 0; i < features.length; i++) {
    const raw = features[i]
    if (computeStableGisFeatureKey(raw, i) !== featureKey) continue
    return featureToPrimaryAoiFeature(raw)
  }
  return null
}

export function buildAgroStructuresQueryUrl(token?: string, resultOffset = 0): string {
  const base =
    `${AGRO_STRUCTURES_FS21_URL}/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&f=geojson` +
    `&resultRecordCount=${AGRO_STRUCTURES_QUERY_PAGE_SIZE}&resultOffset=${resultOffset}`
  if (!token?.trim()) return base
  return `${base}&token=${encodeURIComponent(token.trim())}`
}

/** ArcGIS envelope query — server-side Structure_Type filter + spatial intersects (viewport lazy load). */
export function buildAgroStructuresBboxQueryUrl(
  bbox: LngLatBBox,
  token?: string,
  resultOffset = 0,
): string {
  const where = encodeURIComponent(agroStructuresSentinelMaskSqlWhere())
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
    `${AGRO_STRUCTURES_FS21_URL}/query?where=${where}&geometry=${geometry}` +
    `&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects` +
    `&outFields=*&returnGeometry=true&outSR=4326&f=geojson` +
    `&resultRecordCount=${AGRO_STRUCTURES_QUERY_PAGE_SIZE}&resultOffset=${resultOffset}`
  if (!token?.trim()) return base
  return `${base}&token=${encodeURIComponent(token.trim())}`
}

/** Fetch Farm Plots + PIVOT features intersecting a WGS84 bounding box (paginated). */
export async function fetchAgroStructuresGeoJsonInBbox(
  bbox: LngLatBBox,
  token?: string,
  signal?: AbortSignal,
): Promise<{ type: 'FeatureCollection'; features: unknown[] }> {
  const features: unknown[] = []
  let offset = 0
  for (let page = 0; page < 20; page++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const res = await fetch(buildAgroStructuresBboxQueryUrl(bbox, token, offset), { signal })
    if (!res.ok) throw new Error(`Agro_Structures bbox query failed (${res.status})`)
    const data = (await res.json()) as {
      type?: string
      features?: unknown[]
      properties?: { exceededTransferLimit?: boolean }
    }
    if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
      throw new Error('Agro_Structures bbox query did not return GeoJSON features.')
    }
    features.push(...filterAgroStructuresSentinelMaskFeatures(data.features))
    if (!data.properties?.exceededTransferLimit || data.features.length < AGRO_STRUCTURES_QUERY_PAGE_SIZE) {
      return { type: 'FeatureCollection', features }
    }
    offset += AGRO_STRUCTURES_QUERY_PAGE_SIZE
  }
  return { type: 'FeatureCollection', features }
}

/** Stable signature for layer-wide AOI mask — changes when features are added/edited/removed. */
export function agroStructuresLayerAoiSignature(geojson: { features?: unknown[] } | null | undefined): string {
  const features = filterAgroStructuresSentinelMaskFeatures(
    Array.isArray(geojson?.features) ? geojson!.features! : [],
  )
  let sig = `st:fp-pivot|n${features.length}`
  for (let i = 0; i < features.length; i++) {
    const props = (features[i] as { properties?: Record<string, unknown> })?.properties ?? {}
    const id = props.OBJECTID ?? props.GlobalID ?? props.globalid ?? props.Farm_Code ?? i
    sig += `|${String(id)}`
  }
  return sig
}

export function countAgroStructuresPolygons(geojson: { features?: unknown[] } | null | undefined): number {
  const features = Array.isArray(geojson?.features) ? geojson!.features! : []
  return filterAgroStructuresSentinelMaskFeatures(features).length
}

/** Layer-wide AOI mask: Farm Plots + PIVOT polygons only (Structure_Type filter before GEOMETRY). */
export function buildAgroStructuresLayerAoiMask(
  geojson: { type?: string; features?: unknown[] } | null | undefined,
): { type: 'FeatureCollection'; features: unknown[] } | null {
  if (!geojson || geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) return null
  const features = filterAgroStructuresSentinelMaskFeatures(geojson.features)
  if (!features.length) return null
  return { type: 'FeatureCollection', features }
}

export async function fetchAgroStructuresGeoJson(token?: string): Promise<{
  type: 'FeatureCollection'
  features: unknown[]
}> {
  const features: unknown[] = []
  let offset = 0
  for (let page = 0; page < 50; page++) {
    const res = await fetch(buildAgroStructuresQueryUrl(token, offset))
    if (!res.ok) throw new Error(`Agro_Structures query failed (${res.status})`)
    const data = (await res.json()) as {
      type?: string
      features?: unknown[]
      properties?: { exceededTransferLimit?: boolean }
    }
    if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
      throw new Error('Agro_Structures did not return GeoJSON features.')
    }
    features.push(...data.features)
    if (!data.properties?.exceededTransferLimit || data.features.length < AGRO_STRUCTURES_QUERY_PAGE_SIZE) {
      return { type: 'FeatureCollection', features }
    }
    offset += AGRO_STRUCTURES_QUERY_PAGE_SIZE
  }
  return { type: 'FeatureCollection', features }
}
