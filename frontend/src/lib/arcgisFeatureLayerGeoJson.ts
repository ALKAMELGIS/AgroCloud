import { isWorldCountriesLayerUrl } from './worldCountriesLayer'

export type GisHostedFeatureLayerGeoJson = {
  type: 'FeatureCollection'
  features: Array<{
    type: 'Feature'
    properties?: Record<string, unknown>
    geometry?: { type: string; coordinates?: unknown }
  }>
}

export type ArcGisFeatureLayerFetchProgress = {
  phase: 'metadata' | 'page'
  page: number
  featureCount: number
}

export type FetchArcGisFeatureLayerGeoJsonOptions = {
  token?: string
  returnGeometry?: boolean
  onProgress?: (progress: ArcGisFeatureLayerFetchProgress) => void
  signal?: AbortSignal
  /** Per-page fetch timeout (ms). */
  timeoutMs?: number
}

type ArcGisLayerMeta = {
  geometryType?: string
  maxRecordCount?: number
  type?: string
}

type QueryProfile = {
  pageSize: number
  maxAllowableOffset?: string
  outFields: string
  geometryPrecision?: number
}

const DEFAULT_PAGE_SIZE = 2000
const DEFAULT_TIMEOUT_MS = 120_000
const MAX_PAGES = 100

function normalizeServiceUrl(serviceUrl: string): string {
  return serviceUrl.trim().replace(/\/+$/, '')
}

function isTableLayer(meta: ArcGisLayerMeta | null): boolean {
  return String(meta?.type ?? '').toLowerCase() === 'table'
}

function isPolygonLayer(meta: ArcGisLayerMeta | null): boolean {
  const g = String(meta?.geometryType ?? '').toLowerCase()
  return g.includes('polygon')
}

/** Tune query size/simplification for heavy global polygon layers (e.g. World_Countries). */
export function resolveArcGisFeatureLayerQueryProfile(
  serviceUrl: string,
  meta: ArcGisLayerMeta | null,
  featureCount?: number,
): QueryProfile {
  if (isWorldCountriesLayerUrl(serviceUrl)) {
    return {
      pageSize: 100,
      maxAllowableOffset: '0.2',
      outFields: 'OBJECTID,COUNTRY,ISO_CC,CONTINENT,LAND_TYPE,Status,COUNTRYAFF',
      geometryPrecision: 4,
    }
  }

  const count = featureCount ?? 0
  if (isPolygonLayer(meta) && count > 250) {
    return {
      pageSize: Math.min(500, meta?.maxRecordCount ?? 500),
      maxAllowableOffset: count > 1000 ? '0.05' : '0.01',
      outFields: '*',
      geometryPrecision: 5,
    }
  }

  if (isPolygonLayer(meta)) {
    return {
      pageSize: Math.min(DEFAULT_PAGE_SIZE, meta?.maxRecordCount ?? DEFAULT_PAGE_SIZE),
      maxAllowableOffset: '0.005',
      outFields: '*',
      geometryPrecision: 6,
    }
  }

  return {
    pageSize: Math.min(DEFAULT_PAGE_SIZE, meta?.maxRecordCount ?? DEFAULT_PAGE_SIZE),
    outFields: '*',
  }
}

async function fetchArcGisJson<T>(
  url: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController()
  const linkedSignal = signal
  const onAbort = () => controller.abort()
  if (linkedSignal) {
    if (linkedSignal.aborted) controller.abort()
    else linkedSignal.addEventListener('abort', onAbort, { once: true })
  }

  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) {
      throw new Error(`ArcGIS request failed (${res.status})`)
    }
    return (await res.json()) as T
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(
        `ArcGIS request timed out after ${Math.round(timeoutMs / 1000)}s. The layer geometry may be too large — try a token, a smaller layer, or add from GIS Content after publish.`,
      )
    }
    if (err instanceof TypeError) {
      throw new Error('Failed to fetch from ArcGIS service. Check the URL, network connection, and token.')
    }
    throw err
  } finally {
    window.clearTimeout(timeout)
    if (linkedSignal) linkedSignal.removeEventListener('abort', onAbort)
  }
}

async function fetchArcGisLayerMeta(serviceUrl: string, token?: string): Promise<ArcGisLayerMeta | null> {
  const base = normalizeServiceUrl(serviceUrl)
  const params = new URLSearchParams({ f: 'json' })
  const auth = token?.trim()
  if (auth) params.set('token', auth)
  try {
    const data = await fetchArcGisJson<ArcGisLayerMeta & { error?: { message?: string } }>(
      `${base}?${params.toString()}`,
      30_000,
    )
    if (data?.error?.message) throw new Error(data.error.message)
    return data
  } catch {
    return null
  }
}

async function fetchArcGisFeatureCount(serviceUrl: string, token?: string): Promise<number | undefined> {
  const base = normalizeServiceUrl(serviceUrl)
  const params = new URLSearchParams({
    where: '1=1',
    returnCountOnly: 'true',
    f: 'json',
  })
  const auth = token?.trim()
  if (auth) params.set('token', auth)
  try {
    const data = await fetchArcGisJson<{ count?: number; error?: { message?: string } }>(
      `${base}/query?${params.toString()}`,
      30_000,
    )
    if (typeof data?.count === 'number' && Number.isFinite(data.count)) return data.count
  } catch {
    /* optional */
  }
  return undefined
}

function buildQueryUrl(
  serviceUrl: string,
  profile: QueryProfile,
  offset: number,
  token: string | undefined,
  returnGeometry: boolean,
): string {
  const params = new URLSearchParams({
    where: '1=1',
    outFields: profile.outFields,
    returnGeometry: returnGeometry ? 'true' : 'false',
    outSR: '4326',
    f: 'geojson',
    resultRecordCount: String(profile.pageSize),
    resultOffset: String(offset),
  })
  if (returnGeometry && profile.maxAllowableOffset) {
    params.set('maxAllowableOffset', profile.maxAllowableOffset)
  }
  if (returnGeometry && profile.geometryPrecision != null) {
    params.set('geometryPrecision', String(profile.geometryPrecision))
  }
  const auth = token?.trim()
  if (auth) params.set('token', auth)
  return `${normalizeServiceUrl(serviceUrl)}/query?${params.toString()}`
}

/**
 * Paginated ArcGIS FeatureServer → GeoJSON with geometry simplification for heavy polygon layers.
 */
export async function fetchArcGisFeatureLayerGeoJson(
  serviceUrl: string,
  options: FetchArcGisFeatureLayerGeoJsonOptions = {},
): Promise<GisHostedFeatureLayerGeoJson> {
  const url = normalizeServiceUrl(serviceUrl)
  if (!url) throw new Error('ArcGIS layer URL is required.')

  const token = options.token
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const returnGeometry = options.returnGeometry !== false

  options.onProgress?.({ phase: 'metadata', page: 0, featureCount: 0 })
  const [meta, featureCount] = await Promise.all([
    fetchArcGisLayerMeta(url, token),
    fetchArcGisFeatureCount(url, token),
  ])

  const profile = resolveArcGisFeatureLayerQueryProfile(url, meta, featureCount)
  const geometry = returnGeometry && !isTableLayer(meta)
  const features: GisHostedFeatureLayerGeoJson['features'] = []
  let offset = 0

  for (let page = 1; page <= MAX_PAGES; page++) {
    const queryUrl = buildQueryUrl(url, profile, offset, token, geometry)
    const data = await fetchArcGisJson<{
      type?: string
      features?: GisHostedFeatureLayerGeoJson['features']
      error?: { message?: string; details?: string[] }
      properties?: { exceededTransferLimit?: boolean }
    }>(queryUrl, timeoutMs, options.signal)

    if (data?.error?.message) {
      const details = Array.isArray(data.error.details) ? data.error.details.join(' ') : ''
      throw new Error([data.error.message, details].filter(Boolean).join(' '))
    }
    if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
      throw new Error('ArcGIS service did not return GeoJSON features.')
    }

    features.push(...data.features)
    options.onProgress?.({ phase: 'page', page, featureCount: features.length })

    const pageFull = data.features.length >= profile.pageSize
    const exceeded = Boolean(data.properties?.exceededTransferLimit)
    if (!pageFull && !exceeded) break
    offset += profile.pageSize
  }

  return { type: 'FeatureCollection', features }
}
