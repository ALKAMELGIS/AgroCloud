import { sanitizeArcgisDrawingInfoForClient } from '@/modules/gis/layers/arcgisDrawingInfoMapbox'
import {
  AGRO_STRUCTURES_FS21_URL,
  buildAgroStructuresCountryDescriptionMap,
  buildAgroStructuresCountryDescriptionMapFromFeatures,
  resolveAgroStructuresLayerUrl,
} from '@/modules/remote-sensing/imagery/agroStructuresPrimaryAoi'

const QUERY_PAGE_SIZE = 2000
const MAX_PAGES = 50

export type ArcGisTableRow = Record<string, unknown>

export type ArcGisCodedValue = { name: string; code: number | string }

export type DevelopEliteLayerMeta = {
  cropTypeLabels: Map<string, string>
}

function normalizeLayerEndpoint(url: string): string {
  return String(url || '')
    .trim()
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '')
}

function parseAgroStructuresServiceBase(layerUrl: string): string | null {
  const trimmed = normalizeLayerEndpoint(layerUrl)
  const match = trimmed.match(/^(.*\/agro_structures\/featureserver)\/\d+$/i)
  return match ? match[1]! : null
}

/**
 * REST query endpoints for Agro_Structures polygons.
 * Portal layer ids (e.g. /27) are not GeoJSON-queryable; layer 0/21 share Farm_Code with crops table /1.
 */
export function developEliteStructuresQueryLayerUrls(configLayerUrl: string): string[] {
  const trimmed = normalizeLayerEndpoint(configLayerUrl)
  const serviceBase = parseAgroStructuresServiceBase(trimmed)
  if (serviceBase) {
    const layerId = Number(trimmed.split('/').pop())
    if (layerId === 0) return [`${serviceBase}/0`]
    if (layerId === 1) return [`${serviceBase}/0`]
    return [`${serviceBase}/0`, `${serviceBase}/21`]
  }
  const resolved = normalizeLayerEndpoint(resolveAgroStructuresLayerUrl(configLayerUrl))
  const resolvedBase = parseAgroStructuresServiceBase(resolved)
  if (resolvedBase) return [`${resolvedBase}/0`, `${resolvedBase}/21`]
  return [resolved || AGRO_STRUCTURES_FS21_URL]
}

/** Primary polygon layer URL used for queries (first candidate). */
export function resolveDevelopEliteFeatureLayerUrl(layerUrl: string): string {
  return developEliteStructuresQueryLayerUrls(layerUrl)[0] ?? normalizeLayerEndpoint(layerUrl)
}

function layerQueryBase(layerUrl: string): string {
  return resolveDevelopEliteFeatureLayerUrl(layerUrl)
}

function isRetryableQueryHttpError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  return /\((400|404|403)\)/.test(err.message)
}

function appendToken(url: string, token?: string): string {
  if (!token?.trim()) return url
  return `${url}&token=${encodeURIComponent(token.trim())}`
}

export function buildFeatureLayerGeoJsonQueryUrl(
  layerUrl: string,
  resultOffset = 0,
  token?: string,
): string {
  const endpoint = normalizeLayerEndpoint(
    layerUrl.includes('/query?') ? layerUrl.split('/query?')[0]! : resolveDevelopEliteFeatureLayerUrl(layerUrl),
  )
  const base =
    `${endpoint}/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&f=geojson` +
    `&resultRecordCount=${QUERY_PAGE_SIZE}&resultOffset=${resultOffset}`
  return appendToken(base, token)
}

export function buildTableQueryUrl(layerUrl: string, resultOffset = 0, token?: string): string {
  const base =
    `${layerUrl.replace(/\/+$/, '')}/query?where=1%3D1&outFields=*&returnGeometry=false&f=json` +
    `&resultRecordCount=${QUERY_PAGE_SIZE}&resultOffset=${resultOffset}`
  return appendToken(base, token)
}

async function fetchFeatureLayerGeoJsonFromEndpoint(
  queryLayerUrl: string,
  token?: string,
  signal?: AbortSignal,
): Promise<GeoJSON.FeatureCollection> {
  const features: GeoJSON.Feature[] = []
  let offset = 0
  for (let page = 0; page < MAX_PAGES; page++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const res = await fetch(buildFeatureLayerGeoJsonQueryUrl(queryLayerUrl, offset, token), { signal })
    if (!res.ok) throw new Error(`Feature layer query failed (${res.status})`)
    const data = (await res.json()) as {
      type?: string
      features?: GeoJSON.Feature[]
      properties?: { exceededTransferLimit?: boolean }
      error?: { message?: string }
    }
    if (data?.error?.message) throw new Error(data.error.message)
    if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
      throw new Error('Feature layer did not return GeoJSON.')
    }
    features.push(...data.features)
    if (!data.properties?.exceededTransferLimit || data.features.length < QUERY_PAGE_SIZE) {
      return { type: 'FeatureCollection', features }
    }
    offset += QUERY_PAGE_SIZE
  }
  return { type: 'FeatureCollection', features }
}

export async function fetchFeatureLayerGeoJson(
  layerUrl: string,
  token?: string,
  signal?: AbortSignal,
): Promise<GeoJSON.FeatureCollection> {
  const candidates = developEliteStructuresQueryLayerUrls(layerUrl)
  let lastError: Error | null = null
  for (const queryUrl of candidates) {
    try {
      return await fetchFeatureLayerGeoJsonFromEndpoint(queryUrl, token, signal)
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e))
      if (!isRetryableQueryHttpError(lastError)) throw lastError
    }
  }
  throw lastError ?? new Error('Feature layer query failed')
}

/** Query one FeatureServer layer endpoint (no legacy fallback chain). */
export async function fetchArcgisFeatureLayerGeoJsonExact(
  layerUrl: string,
  token?: string,
  signal?: AbortSignal,
): Promise<GeoJSON.FeatureCollection> {
  const endpoint = normalizeLayerEndpoint(layerUrl)
  return fetchFeatureLayerGeoJsonFromEndpoint(endpoint, token, signal)
}

/** Portal map viewer layer /27 → live Agro_Structures polygons on FeatureServer/21. */
export function developElitePrimaryStructuresLayerUrl(configLayerUrl: string): string {
  const trimmed = normalizeLayerEndpoint(configLayerUrl)
  const serviceBase = parseAgroStructuresServiceBase(trimmed)
  if (serviceBase) return `${serviceBase}/21`
  const resolved = normalizeLayerEndpoint(resolveAgroStructuresLayerUrl(configLayerUrl))
  const resolvedBase = parseAgroStructuresServiceBase(resolved)
  if (resolvedBase) return `${resolvedBase}/21`
  return AGRO_STRUCTURES_FS21_URL
}

export async function fetchArcGisTableRows(
  tableUrl: string,
  token?: string,
  signal?: AbortSignal,
): Promise<ArcGisTableRow[]> {
  const rows: ArcGisTableRow[] = []
  let offset = 0
  for (let page = 0; page < MAX_PAGES; page++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const res = await fetch(buildTableQueryUrl(tableUrl, offset, token), { signal })
    if (!res.ok) throw new Error(`Table query failed (${res.status})`)
    const data = (await res.json()) as {
      features?: Array<{ attributes?: ArcGisTableRow }>
      exceededTransferLimit?: boolean
      error?: { message?: string }
    }
    if (data?.error?.message) throw new Error(data.error.message)
    const batch = (data.features ?? []).map(f => f.attributes ?? {}).filter(a => Object.keys(a).length)
    rows.push(...batch)
    if (!data.exceededTransferLimit || batch.length < QUERY_PAGE_SIZE) return rows
    offset += QUERY_PAGE_SIZE
  }
  return rows
}

function collectCodedValuesFromFields(
  fields: Array<{ name?: string; domain?: { codedValues?: ArcGisCodedValue[] } }> | undefined,
  fieldName: string,
): Map<string, string> {
  const map = new Map<string, string>()
  const want = fieldName.toLowerCase()
  const field = fields?.find(f => String(f.name || '').toLowerCase() === want)
  const coded = field?.domain?.codedValues
  if (!Array.isArray(coded)) return map
  for (const cv of coded) {
    map.set(String(cv.code), String(cv.name))
  }
  return map
}

/** Layer metadata for any FeatureServer endpoint (no Agro_Structures rewrite). */
export async function fetchArcgisLayerDrawingInfoExact(
  layerUrl: string,
  token?: string,
): Promise<Record<string, unknown> | null> {
  try {
    const endpoint = normalizeLayerEndpoint(layerUrl)
    const url = appendToken(`${endpoint}?f=pjson`, token)
    const res = await fetch(url)
    if (!res.ok) return null
    const data = (await res.json()) as { drawingInfo?: unknown; error?: { message?: string } }
    if (data?.error?.message) return null
    if (!data?.drawingInfo) return null
    return sanitizeArcgisDrawingInfoForClient(data.drawingInfo)
  } catch {
    return null
  }
}

export async function fetchFeatureLayerDrawingInfo(
  layerUrl: string,
  token?: string,
): Promise<Record<string, unknown> | null> {
  try {
    const url = appendToken(`${layerQueryBase(layerUrl)}?f=pjson`, token)
    const res = await fetch(url)
    if (!res.ok) return null
    const data = (await res.json()) as { drawingInfo?: unknown; error?: { message?: string } }
    if (data?.error?.message) return null
    if (!data?.drawingInfo) return null
    return sanitizeArcgisDrawingInfoForClient(data.drawingInfo)
  } catch {
    return null
  }
}

/** ArcGIS Country coded-value descriptions (domain name), merged from layer schema + feature rows. */
export async function fetchStructuresCountryLabelMap(
  layerUrl: string,
  features: GeoJSON.Feature[] | undefined,
  token?: string,
): Promise<Map<string, string>> {
  const merged = new Map<string, string>()
  try {
    const url = appendToken(`${layerQueryBase(layerUrl)}?f=pjson`, token)
    const res = await fetch(url)
    if (res.ok) {
      const data = (await res.json()) as Record<string, unknown>
      for (const [code, label] of buildAgroStructuresCountryDescriptionMap(data)) {
        merged.set(code, label)
      }
    }
  } catch {
    /* schema optional */
  }
  for (const [code, label] of buildAgroStructuresCountryDescriptionMapFromFeatures(features)) {
    if (!merged.has(code)) merged.set(code, label)
  }
  return merged
}

export async function fetchCropsTableMeta(tableUrl: string): Promise<DevelopEliteLayerMeta> {
  try {
    const res = await fetch(`${tableUrl.replace(/\/+$/, '')}?f=pjson`)
    if (!res.ok) return { cropTypeLabels: new Map() }
    const data = (await res.json()) as { fields?: Array<{ name?: string; domain?: { codedValues?: ArcGisCodedValue[] } }> }
    return {
      cropTypeLabels: collectCodedValuesFromFields(data.fields, 'Crop_Type'),
    }
  } catch {
    return { cropTypeLabels: new Map() }
  }
}
