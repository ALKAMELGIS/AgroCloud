/**
 * Sentinel Hub Statistical API — zonal mean indices inside field AOI polygons.
 * @see https://docs.sentinel-hub.com/api/latest/api/statistical/
 */

import {
  getSentinelHubAccessToken,
  isSentinelHubWmsInstanceAccessToken,
  SENTINEL_HUB_PUBLIC_WMS_ACCESS_TOKEN,
} from './sentinelHubAccessToken'
import {
  configuredApiOrigin,
  ensureBackendAvailable,
  isBackendKnownUnavailable,
  apiUrl,
} from './apiOrigin'
import {
  buildNdviHistogramCalculations,
  CROP_ALERT_NDVI_HISTOGRAM_EVALSCRIPT,
  type NdviHistogramBin,
} from './siCropAlertDominantNdvi'
import { addDaysToIso, localIsoDate, subtractDaysFromIso } from './siSentinelImageryDate'
import { applyAnalyticalResolutionToZonalMean } from './siAnalyticalResolutionEngine'
import {
  isSentinelHubWmsClientStatisticsAvailable,
  postSentinelStatisticsViaWmsClient,
} from './sentinelHubWmsStatisticsClient'

export const SENTINEL_HUB_STATISTICS_URL = 'https://services.sentinel-hub.com/api/v1/statistics'
export const SENTINEL_HUB_OAUTH_URL = 'https://services.sentinel-hub.com/oauth/token'
export const SENTINEL_HUB_STATISTICS_PROXY_PATH = '/api/sentinel-hub/statistics'
export const SENTINEL_HUB_STATISTICS_STATUS_PATH = '/api/sentinel-hub/statistics/status'
/** @deprecated Prefer path constants + apiUrl(); kept for tests/callers that import the old names. */
export const SENTINEL_HUB_STATISTICS_PROXY_URL = SENTINEL_HUB_STATISTICS_PROXY_PATH
export const SENTINEL_HUB_STATISTICS_STATUS_URL = SENTINEL_HUB_STATISTICS_STATUS_PATH

export type SentinelHubStatisticsProxyStatus = {
  configured: boolean
  mode: 'none' | 'statistical-api' | 'wms-zonal'
  wmsReady?: boolean
  publicWmsOnly?: boolean
  oauthConfigured?: boolean
  hint?: string
}

let statsProxyStatusCache: { status: SentinelHubStatisticsProxyStatus; at: number } | null = null
const STATS_PROXY_STATUS_TTL_MS = 60_000

function isAbortError(err: unknown): boolean {
  if (err == null) return false
  if (typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError') {
    return true
  }
  if (err instanceof Error) {
    if (err.name === 'AbortError') return true
    const msg = err.message.toLowerCase()
    if (msg.includes('aborted') || msg.includes('the operation was aborted')) return true
  }
  return false
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError')
  }
}

/** Server-side statistics proxy health (WMS zonal vs Statistical API). */
export async function fetchSentinelHubStatisticsProxyStatus(options?: {
  signal?: AbortSignal
  refresh?: boolean
}): Promise<SentinelHubStatisticsProxyStatus | null> {
  if (
    !options?.refresh &&
    statsProxyStatusCache &&
    Date.now() - statsProxyStatusCache.at < STATS_PROXY_STATUS_TTL_MS
  ) {
    return statsProxyStatusCache.status
  }
  if (!(await mayUseSentinelHubStatisticsProxyAsync())) return null
  try {
    const res = await fetch(apiUrl(SENTINEL_HUB_STATISTICS_STATUS_PATH), {
      headers: { Accept: 'application/json' },
      signal: options?.signal,
    })
    if (!res.ok) return null
    const contentType = res.headers.get('content-type') ?? ''
    if (contentType && !/\bjson\b/i.test(contentType)) return null
    const json = (await res.json()) as SentinelHubStatisticsProxyStatus
    if (!json || typeof json !== 'object' || typeof json.configured !== 'boolean') return null
    statsProxyStatusCache = { status: json, at: Date.now() }
    return json
  } catch {
    return null
  }
}

function extractStatisticsProxyErrorMessage(json: unknown, text: string, status: number): string {
  if (json && typeof json === 'object') {
    const payload = json as Record<string, unknown>
    if (typeof payload.error === 'string' && payload.error.trim()) return payload.error.trim()
    if (payload.error && typeof payload.error === 'object') {
      const nested = payload.error as Record<string, unknown>
      if (typeof nested.message === 'string' && nested.message.trim()) return nested.message.trim()
    }
    if (typeof payload.message === 'string' && payload.message.trim()) return payload.message.trim()
  }
  const trimmed = text.trim()
  if (trimmed && trimmed !== '{}') return trimmed.slice(0, 240)
  if (status === 404) {
    return isStaticDeploymentWithoutBackend() || isBackendKnownUnavailable()
      ? 'Sentinel statistics API is not available on this static host — using browser WMS when possible.'
      : 'Sentinel Hub statistics API route not found — start the AgroCloud backend (npm run dev).'
  }
  if (status === 502 || status === 503) {
    return isStaticDeploymentWithoutBackend() || isBackendKnownUnavailable()
      ? 'Backend API unavailable on this deployment.'
      : 'AgroCloud backend unavailable — run npm run dev from the repo root (API port 3011).'
  }
  if (status === 504) {
    return 'Statistics request timed out — try a shorter date range or fewer fields.'
  }
  return `Sentinel Hub Statistics proxy HTTP ${status}`
}

export const CROP_ALERT_SENTINEL_LOOKBACK_DAYS = 30

export type SentinelHubIndexZonalStats = {
  min: number
  max: number
  mean: number
}

export type SentinelHubSceneZonalStats = {
  ndvi: SentinelHubIndexZonalStats
  ndmi: SentinelHubIndexZonalStats
  ndwi: SentinelHubIndexZonalStats
  evi: SentinelHubIndexZonalStats
  savi?: SentinelHubIndexZonalStats
  ciRe?: SentinelHubIndexZonalStats
  /** Snow NDSI (B03−B11)/(B03+B11) zonal min/max/mean. */
  ndsi?: SentinelHubIndexZonalStats
}

export type SentinelHubDailyIndexMeans = {
  date: string
  ndvi: number | null
  ndwi: number | null
  ndmi: number | null
  evi: number | null
  savi: number | null
  ciRe: number | null
  /** Snow / ice NDSI: (B03−B11)/(B03+B11). */
  ndsi?: number | null
  /** Pixel min/max/mean inside AOI from Statistical API (Layer Live). */
  zonal?: Partial<SentinelHubSceneZonalStats>
}

export type SentinelHubFieldTimeSeries = {
  fieldKey: string
  daily: SentinelHubDailyIndexMeans[]
  fetchedAt: number
  source: 'live' | 'sample'
  /** Populated when Statistical API unavailable but catalog-anchored estimates were used. */
  syntheticFill?: boolean
  error?: string
}

type StatsBandStats = {
  min?: number
  max?: number
  mean?: number
  sampleCount?: number
  noDataCount?: number
}

type StatsApiResponse = {
  status?: string
  error?: { message?: string }
  data?: Array<{
    interval?: { from?: string; to?: string }
    outputs?: Record<
      string,
      {
        bands?: Record<string, { stats?: StatsBandStats }>
      }
    >
  }>
}

let oauthCache: { token: string; expiresAt: number } | null = null

/** Dedup + short TTL cache for identical Statistical API POST bodies. */
const STATS_RESULT_CACHE_TTL_MS = 12 * 60_000
const statsResultCache = new Map<string, { data: SentinelHubDailyIndexMeans[]; expiresAt: number }>()
const statsInFlight = new Map<string, Promise<SentinelHubDailyIndexMeans[]>>()
const histogramResultCache = new Map<string, { data: SentinelHubGenericHistogram[]; expiresAt: number }>()
const histogramInFlight = new Map<string, Promise<SentinelHubGenericHistogram[]>>()

function envClientId(): string {
  const raw = import.meta.env.VITE_SENTINEL_HUB_CLIENT_ID
  return typeof raw === 'string' ? raw.trim() : ''
}

function envClientSecret(): string {
  const raw = import.meta.env.VITE_SENTINEL_HUB_CLIENT_SECRET
  return typeof raw === 'string' ? raw.trim() : ''
}

function isLikelyJwt(token: string): boolean {
  return token.split('.').length >= 3
}

/** Resolve Bearer token: OAuth client credentials, stored JWT, or stored instance token. */
export async function resolveSentinelHubBearerToken(): Promise<string> {
  const stored = getSentinelHubAccessToken()

  const clientId = envClientId()
  const clientSecret = envClientSecret()
  if (clientId && clientSecret) {
    const now = Date.now()
    if (oauthCache && oauthCache.expiresAt > now + 60_000) return oauthCache.token

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    })
    const res = await fetch(SENTINEL_HUB_OAUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
    if (!res.ok) {
      throw new Error(`Sentinel Hub OAuth failed (${res.status})`)
    }
    const json = (await res.json()) as { access_token?: string; expires_in?: number }
    const token = String(json.access_token ?? '').trim()
    if (!token) throw new Error('Sentinel Hub OAuth returned no access_token')
    oauthCache = {
      token,
      expiresAt: now + Math.max(300, Number(json.expires_in) || 3600) * 1000,
    }
    return token
  }

  if (stored && stored !== SENTINEL_HUB_PUBLIC_WMS_ACCESS_TOKEN && isLikelyJwt(stored)) {
    return stored
  }

  throw new Error(
    'Configure Sentinel Hub OAuth (VITE_SENTINEL_HUB_CLIENT_ID/SECRET) or a private access token for field NDVI alerts.',
  )
}

function isSentinelHubStatisticsDirectConfigured(): boolean {
  if (envClientId() && envClientSecret()) return true
  const stored = getSentinelHubAccessToken()
  if (!stored || stored === SENTINEL_HUB_PUBLIC_WMS_ACCESS_TOKEN) return false
  if (isSentinelHubWmsInstanceAccessToken(stored)) return false
  return isLikelyJwt(stored)
}

/**
 * Sync gate for the Node statistics proxy.
 * Dev always allows the Vite-proxied backend. Production only allows it when a backend
 * origin is configured or the same-origin API is not already known to be missing
 * (custom-domain static hosts like eliteagrocloud.com trip the breaker via /api/health).
 */
function mayUseSentinelHubStatisticsProxy(): boolean {
  if (import.meta.env.DEV) return true
  if (configuredApiOrigin()) return true
  if (isBackendKnownUnavailable()) return false
  return true
}

async function mayUseSentinelHubStatisticsProxyAsync(): Promise<boolean> {
  if (!mayUseSentinelHubStatisticsProxy()) return false
  if (import.meta.env.DEV || configuredApiOrigin()) return true
  return ensureBackendAvailable()
}

/** True when Statistical API can authenticate (browser OAuth, private token, server proxy, or client WMS). */
export function isSentinelHubStatisticsConfigured(): boolean {
  return (
    isSentinelHubStatisticsDirectConfigured() ||
    mayUseSentinelHubStatisticsProxy() ||
    isSentinelHubWmsClientStatisticsAvailable()
  )
}

export const CROP_ALERT_MULTI_INDEX_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{
      bands: ["B02", "B03", "B04", "B05", "B08", "B11", "SCL", "dataMask"]
    }],
    output: [
      {
        id: "indices",
        bands: ["ndvi", "ndwi", "ndmi", "evi", "savi", "ci_re", "ndsi"],
        sampleType: "FLOAT32"
      },
      {
        id: "dataMask",
        bands: 1
      }
    ]
  };
}
function evaluatePixel(samples) {
  var scl = samples.SCL;
  var cloud = (scl == 3 || scl == 8 || scl == 9 || scl == 10 || scl == 11);
  var dNdvi = samples.B08 + samples.B04;
  var ndvi = dNdvi > 1e-6 ? (samples.B08 - samples.B04) / dNdvi : NaN;
  var dNdwi = samples.B03 + samples.B08;
  var ndwi = dNdwi > 1e-6 ? (samples.B03 - samples.B08) / dNdwi : NaN;
  var dNdmi = samples.B08 + samples.B11;
  var ndmi = dNdmi > 1e-6 ? (samples.B08 - samples.B11) / dNdmi : NaN;
  var eviDen = samples.B08 + 6.0 * samples.B04 - 7.5 * samples.B02 + 1.0;
  var evi = eviDen > 1e-6 ? 2.5 * (samples.B08 - samples.B04) / eviDen : NaN;
  var L = 0.5;
  var saviDen = samples.B08 + samples.B04 + L;
  var savi = saviDen > 1e-6 ? (samples.B08 - samples.B04) / saviDen * (1.0 + L) : NaN;
  var ci_re = samples.B08 > 1e-6 ? samples.B05 / samples.B08 - 1 : NaN;
  var dNdSnow = samples.B03 + samples.B11;
  var ndsi = dNdSnow > 1e-6 ? (samples.B03 - samples.B11) / dNdSnow : NaN;
  var valid = samples.dataMask && !cloud && (dNdvi > 1e-6 || dNdSnow > 1e-6);
  return {
    indices: [ndvi, ndwi, ndmi, evi, savi, ci_re, ndsi],
    dataMask: [valid ? 1 : 0]
  };
}`

/** Relaxed evalscript — relies on dataFilter maxCloudCoverage, not SCL masking. */
export const CROP_ALERT_RELAXED_INDEX_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{
      bands: ["B02", "B03", "B04", "B05", "B08", "B11", "dataMask"]
    }],
    output: [
      {
        id: "indices",
        bands: ["ndvi", "ndwi", "ndmi", "evi", "savi", "ci_re", "ndsi"],
        sampleType: "FLOAT32"
      },
      {
        id: "dataMask",
        bands: 1
      }
    ]
  };
}
function evaluatePixel(samples) {
  var dNdvi = samples.B08 + samples.B04;
  var ndvi = dNdvi > 1e-6 ? (samples.B08 - samples.B04) / dNdvi : NaN;
  var dNdwi = samples.B03 + samples.B08;
  var ndwi = dNdwi > 1e-6 ? (samples.B03 - samples.B08) / dNdwi : NaN;
  var dNdmi = samples.B08 + samples.B11;
  var ndmi = dNdmi > 1e-6 ? (samples.B08 - samples.B11) / dNdmi : NaN;
  var eviDen = samples.B08 + 6.0 * samples.B04 - 7.5 * samples.B02 + 1.0;
  var evi = eviDen > 1e-6 ? 2.5 * (samples.B08 - samples.B04) / eviDen : NaN;
  var L = 0.5;
  var saviDen = samples.B08 + samples.B04 + L;
  var savi = saviDen > 1e-6 ? (samples.B08 - samples.B04) / saviDen * (1.0 + L) : NaN;
  var ci_re = samples.B08 > 1e-6 ? samples.B05 / samples.B08 - 1 : NaN;
  var dNdSnow = samples.B03 + samples.B11;
  var ndsi = dNdSnow > 1e-6 ? (samples.B03 - samples.B11) / dNdSnow : NaN;
  var valid = samples.dataMask && (dNdvi > 1e-6 || dNdSnow > 1e-6);
  return {
    indices: [ndvi, ndwi, ndmi, evi, savi, ci_re, ndsi],
    dataMask: [valid ? 1 : 0]
  };
}`

/** Snow NDSI only — validity from B03+B11 (no NDVI / vegetation requirement). */
export const SNOW_NDSI_INDEX_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B03", "B11", "SCL", "dataMask"] }],
    output: [
      { id: "indices", bands: ["ndsi"], sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 }
    ]
  };
}
function evaluatePixel(samples) {
  var scl = samples.SCL;
  var cloud = (scl == 3 || scl == 8 || scl == 9 || scl == 10 || scl == 11);
  if (!samples.dataMask || cloud) return { indices: [NaN], dataMask: [0] };
  var d = samples.B03 + samples.B11;
  if (d <= 1e-6) return { indices: [NaN], dataMask: [0] };
  return { indices: [(samples.B03 - samples.B11) / d], dataMask: [1] };
}`

/** Relaxed snow NDSI — cloud filter only via maxCloudCoverage. */
export const SNOW_NDSI_RELAXED_INDEX_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B03", "B11", "dataMask"] }],
    output: [
      { id: "indices", bands: ["ndsi"], sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 }
    ]
  };
}
function evaluatePixel(samples) {
  if (!samples.dataMask) return { indices: [NaN], dataMask: [0] };
  var d = samples.B03 + samples.B11;
  if (d <= 1e-6) return { indices: [NaN], dataMask: [0] };
  return { indices: [(samples.B03 - samples.B11) / d], dataMask: [1] };
}`

/** Raw Sentinel-2 L2A reflectance bands for Layer Live pixel inspect. */
export const CROP_ALERT_RAW_BAND_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{
      bands: ["B02", "B03", "B04", "B08", "B11", "SCL", "dataMask"]
    }],
    output: [
      {
        id: "bands",
        bands: ["B02", "B03", "B04", "B08", "B11"],
        sampleType: "FLOAT32"
      },
      {
        id: "dataMask",
        bands: 1
      }
    ]
  };
}
function evaluatePixel(samples) {
  var scl = samples.SCL;
  var cloud = (scl == 3 || scl == 8 || scl == 9 || scl == 10 || scl == 11);
  var valid = samples.dataMask && !cloud;
  return {
    bands: [samples.B02, samples.B03, samples.B04, samples.B08, samples.B11],
    dataMask: [valid ? 1 : 0]
  };
}`

export const CROP_ALERT_RELAXED_RAW_BAND_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{
      bands: ["B02", "B03", "B04", "B08", "B11", "dataMask"]
    }],
    output: [
      {
        id: "bands",
        bands: ["B02", "B03", "B04", "B08", "B11"],
        sampleType: "FLOAT32"
      },
      {
        id: "dataMask",
        bands: 1
      }
    ]
  };
}
function evaluatePixel(samples) {
  var valid = samples.dataMask;
  return {
    bands: [samples.B02, samples.B03, samples.B04, samples.B08, samples.B11],
    dataMask: [valid ? 1 : 0]
  };
}`

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

/** Simplify polygon geometry for Statistical API payload size limits. */
export function simplifyGeometryForSentinelStats(geometry: GeoJSON.Geometry | null | undefined): GeoJSON.Geometry | null {
  if (!geometry) return null
  if (geometry.type === 'Polygon') {
    const ring = geometry.coordinates[0]
    if (!ring?.length) return null
    const simplified = decimateRing(ring as number[][], 36)
    return { type: 'Polygon', coordinates: [simplified] }
  }
  if (geometry.type === 'MultiPolygon') {
    const polys = geometry.coordinates
      .map(poly => {
        const ring = poly?.[0]
        if (!ring?.length) return null
        return [decimateRing(ring as number[][], 28)] as number[][][]
      })
      .filter(Boolean) as number[][][][]
    if (!polys.length) return null
    return { type: 'MultiPolygon', coordinates: polys }
  }
  return geometry
}

function intervalStartIso(interval: { from?: string; to?: string } | undefined): string | null {
  const from = interval?.from
  if (typeof from !== 'string' || from.length < 10) return null
  return from.slice(0, 10)
}

function readNamedOutputBandStats(
  outputs: NonNullable<StatsApiResponse['data']>[number],
  outputId: string,
  band: string,
): SentinelHubIndexZonalStats | null {
  const stats = outputs?.outputs?.[outputId]?.bands?.[band]?.stats
  const meanRaw = stats?.mean
  if (typeof meanRaw !== 'number' || !Number.isFinite(meanRaw)) return null
  const sampleCount = stats?.sampleCount ?? 0
  const noDataCount = stats?.noDataCount ?? 0
  if (sampleCount > 0 && sampleCount === noDataCount) return null
  const mean = Number(applyAnalyticalResolutionToZonalMean(meanRaw, Math.max(1, sampleCount)).toFixed(4))
  const minRaw = typeof stats?.min === 'number' && Number.isFinite(stats.min) ? stats.min : mean
  const maxRaw = typeof stats?.max === 'number' && Number.isFinite(stats.max) ? stats.max : mean
  const min = Number(Math.min(minRaw, maxRaw).toFixed(4))
  const max = Number(Math.max(minRaw, maxRaw).toFixed(4))
  return { min, max, mean }
}

function readBandStats(
  outputs: NonNullable<StatsApiResponse['data']>[number],
  band: string,
): SentinelHubIndexZonalStats | null {
  return readNamedOutputBandStats(outputs, 'indices', band)
}

function readBandMean(outputs: NonNullable<StatsApiResponse['data']>[number], band: string): number | null {
  return readBandStats(outputs, band)?.mean ?? null
}

function buildMultiIndexStatisticsCalculations(): Record<string, unknown> {
  return {
    indices: {
      statistics: {
        ndvi: {},
        ndwi: {},
        ndmi: {},
        evi: {},
        savi: {},
        ci_re: {},
        ndsi: {},
      },
    },
  }
}

function buildSnowNdsiStatisticsCalculations(): Record<string, unknown> {
  return {
    indices: {
      statistics: {
        ndsi: {},
      },
    },
  }
}

export type ImageryStatisticsFetchMode = 'multi' | 'snow-ndsi'

export function resolveImageryStatisticsFetchMode(layerIds: string[] | undefined): ImageryStatisticsFetchMode {
  const ids = (layerIds?.length ? layerIds : ['NDVI']).map(id => id.trim().toUpperCase())
  if (ids.length === 1 && ids[0] === 'NDSI') return 'snow-ndsi'
  return 'multi'
}

export function imageryStatisticsFetchNeedsSnowNdsi(layerIds: string[] | undefined): boolean {
  return (layerIds ?? []).some(id => id.trim().toUpperCase() === 'NDSI')
}

function buildRawBandStatisticsCalculations(): Record<string, unknown> {
  return {
    bands: {
      statistics: {
        B02: {},
        B03: {},
        B04: {},
        B08: {},
        B11: {},
      },
    },
  }
}

function buildRawBandStatisticsRequestBody(
  geom: GeoJSON.Geometry,
  fromIso: string,
  toIso: string,
  options?: { maxCloudCoverage?: number; relaxedCloudMask?: boolean },
): Record<string, unknown> {
  return {
    input: {
      bounds: {
        geometry: geom,
        properties: { crs: 'http://www.opengis.net/def/crs/EPSG/0/4326' },
      },
      data: [
        {
          type: 'sentinel-2-l2a',
          dataFilter: {
            mosaickingOrder: 'leastCC',
            maxCloudCoverage: options?.maxCloudCoverage ?? 65,
          },
        },
      ],
    },
    aggregation: {
      timeRange: {
        from: `${fromIso}T00:00:00Z`,
        to: `${toIso}T00:00:00Z`,
      },
      aggregationInterval: { of: 'P1D' },
      evalscript: options?.relaxedCloudMask
        ? CROP_ALERT_RELAXED_RAW_BAND_EVALSCRIPT
        : CROP_ALERT_RAW_BAND_EVALSCRIPT,
      resx: 10,
      resy: 10,
    },
    calculations: buildRawBandStatisticsCalculations(),
  }
}

export type SentinelHubRawBandStats = {
  B02: SentinelHubIndexZonalStats | null
  B03: SentinelHubIndexZonalStats | null
  B04: SentinelHubIndexZonalStats | null
  B08: SentinelHubIndexZonalStats | null
  B11: SentinelHubIndexZonalStats | null
}

export async function fetchSentinelRawBandStatsForSceneDate(
  geometry: GeoJSON.Geometry,
  sceneDate: string,
  options?: { maxCloudCoverage?: number; relaxedCloudMask?: boolean; signal?: AbortSignal },
): Promise<SentinelHubRawBandStats | null> {
  const geom = simplifyGeometryForSentinelStats(geometry)
  if (!geom) return null
  const fromIso = sceneDate.trim().slice(0, 10)
  const toIso = addDaysToIso(fromIso, 1)
  const json = await postSentinelStatisticsDirect(
    buildRawBandStatisticsRequestBody(geom, fromIso, toIso, options),
    options?.signal,
  )
  const outputs = json.data?.[0]
  if (!outputs) return null

  return {
    B02: readNamedOutputBandStats(outputs, 'bands', 'B02'),
    B03: readNamedOutputBandStats(outputs, 'bands', 'B03'),
    B04: readNamedOutputBandStats(outputs, 'bands', 'B04'),
    B08: readNamedOutputBandStats(outputs, 'bands', 'B08'),
    B11: readNamedOutputBandStats(outputs, 'bands', 'B11'),
  }
}

export function parseSentinelHubStatsResponse(json: StatsApiResponse): SentinelHubDailyIndexMeans[] {
  if (!Array.isArray(json.data)) return []
  const out: SentinelHubDailyIndexMeans[] = []
  for (const row of json.data) {
    const date = intervalStartIso(row.interval)
    if (!date) continue
    const ndviStats = readBandStats(row, 'ndvi')
    const ndmiStats = readBandStats(row, 'ndmi')
    const ndwiStats = readBandStats(row, 'ndwi')
    const eviStats = readBandStats(row, 'evi')
    const saviStats = readBandStats(row, 'savi')
    const ciReStats = readBandStats(row, 'ci_re')
    const ndsiStats = readBandStats(row, 'ndsi')
    const zonal: Partial<SentinelHubSceneZonalStats> = {}
    if (ndviStats) zonal.ndvi = ndviStats
    if (ndmiStats) zonal.ndmi = ndmiStats
    if (ndwiStats) zonal.ndwi = ndwiStats
    if (eviStats) zonal.evi = eviStats
    if (saviStats) zonal.savi = saviStats
    if (ciReStats) zonal.ciRe = ciReStats
    if (ndsiStats) zonal.ndsi = ndsiStats
    out.push({
      date,
      ndvi: ndviStats?.mean ?? null,
      ndwi: ndwiStats?.mean ?? null,
      ndmi: ndmiStats?.mean ?? null,
      evi: eviStats?.mean ?? null,
      savi: saviStats?.mean ?? null,
      ciRe: ciReStats?.mean ?? null,
      ndsi: ndsiStats?.mean ?? null,
      zonal: Object.keys(zonal).length ? zonal : undefined,
    })
  }
  out.sort((a, b) => a.date.localeCompare(b.date))
  return out
}

/** Latest Layer Live scene zonal min/max/mean inside field AOI. */
export function pickSceneZonalStatsFromDaily(
  daily: SentinelHubDailyIndexMeans[],
  sceneDate: string,
): (SentinelHubSceneZonalStats & { sceneDate: string }) | null {
  const want = sceneDate.trim().slice(0, 10)
  const row = daily.find(d => d.date === want)
  if (!row?.zonal?.ndvi || !row.zonal.ndmi || !row.zonal.ndwi) return null
  return {
    sceneDate: row.date,
    ndvi: row.zonal.ndvi,
    ndmi: row.zonal.ndmi,
    ndwi: row.zonal.ndwi,
    evi: row.zonal.evi ?? {
      min: row.zonal.ndvi.min,
      max: row.zonal.ndvi.max,
      mean: row.zonal.ndvi.mean,
    },
    ciRe: row.zonal.ciRe,
  }
}

export type FetchSentinelFieldStatsOptions = {
  geometry: GeoJSON.Geometry
  referenceDate: string
  lookbackDays?: number
  maxCloudCoverage?: number
  relaxedCloudMask?: boolean
  signal?: AbortSignal
}

export function hasValidIndexDaily(daily: SentinelHubDailyIndexMeans[]): boolean {
  return daily.some(
    d =>
      d.ndvi != null ||
      d.ndwi != null ||
      d.ndmi != null ||
      d.ndsi != null ||
      d.evi != null ||
      d.savi != null ||
      d.ciRe != null,
  )
}

export function mergeDailyIndexSeries(
  ...groups: SentinelHubDailyIndexMeans[][]
): SentinelHubDailyIndexMeans[] {
  const byDate = new Map<string, SentinelHubDailyIndexMeans>()
  for (const group of groups) {
    for (const row of group) {
      const prev = byDate.get(row.date)
      if (!prev) {
        byDate.set(row.date, row)
        continue
      }
      byDate.set(row.date, {
        date: row.date,
        ndvi: row.ndvi ?? prev.ndvi,
        ndwi: row.ndwi ?? prev.ndwi,
        ndmi: row.ndmi ?? prev.ndmi,
        evi: row.evi ?? prev.evi,
        savi: row.savi ?? prev.savi,
        ciRe: row.ciRe ?? prev.ciRe,
        ndsi: row.ndsi ?? prev.ndsi,
        zonal: row.zonal ?? prev.zonal,
      })
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

/** Scene dates from STAC catalog (newest first, on/before reference). */
export function pickCatalogSceneDatesForFetch(
  catalogSceneIsos: string[],
  referenceDate: string,
  maxScenes = 8,
): string[] {
  const ref = referenceDate.trim()
  return [...new Set(catalogSceneIsos.map(iso => iso.trim().slice(0, 10)).filter(Boolean))]
    .filter(d => d <= ref)
    .sort((a, b) => b.localeCompare(a))
    .slice(0, maxScenes)
}

async function postSentinelStatisticsDirect(
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<StatsApiResponse> {
  throwIfAborted(signal)
  const token = await resolveSentinelHubBearerToken()
  throwIfAborted(signal)
  const res = await fetch(SENTINEL_HUB_STATISTICS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  })

  const text = await res.text()
  let json: StatsApiResponse
  try {
    json = JSON.parse(text) as StatsApiResponse
  } catch {
    throw new Error(text.slice(0, 240) || `Sentinel Hub Statistics HTTP ${res.status}`)
  }

  if (!res.ok) {
    throw new Error(json.error?.message || text.slice(0, 240) || `Sentinel Hub Statistics HTTP ${res.status}`)
  }

  return json
}

async function postSentinelStatisticsViaProxy(
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<StatsApiResponse> {
  throwIfAborted(signal)
  const res = await fetch(apiUrl(SENTINEL_HUB_STATISTICS_PROXY_PATH), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  })

  const text = await res.text()
  let json: StatsApiResponse & { error?: string | { message?: string } }
  try {
    json = JSON.parse(text) as StatsApiResponse & { error?: string | { message?: string } }
  } catch {
    throw new Error(text.slice(0, 240) || `Sentinel Hub Statistics proxy HTTP ${res.status}`)
  }

  if (!res.ok) {
    const message = extractStatisticsProxyErrorMessage(json, text, res.status)
    if (res.status === 404 && message.includes('Route not found')) {
      throw new Error(
        'Sentinel Hub statistics API route is unavailable — restart the AgroCloud backend (npm run dev:clean).',
      )
    }
    throw new Error(message)
  }

  return json
}

async function postSentinelStatisticsRequest(
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<SentinelHubDailyIndexMeans[]> {
  const cacheKey = JSON.stringify(body)
  const cached = statsResultCache.get(cacheKey)
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data
  }

  const inFlight = statsInFlight.get(cacheKey)
  if (inFlight) {
    return inFlight
  }

  const promise = (async (): Promise<SentinelHubDailyIndexMeans[]> => {
    const storeAndReturn = (json: StatsApiResponse) => {
      const daily = parseSentinelHubStatsResponse(json)
      statsResultCache.set(cacheKey, {
        data: daily,
        expiresAt: Date.now() + STATS_RESULT_CACHE_TTL_MS,
      })
      return daily
    }

    // In local dev, prefer the backend proxy (WMS zonal or server OAuth) over browser-direct calls.
    if (import.meta.env.DEV && (await mayUseSentinelHubStatisticsProxyAsync())) {
      try {
        const json = await postSentinelStatisticsViaProxy(body, signal)
        return storeAndReturn(json)
      } catch (proxyErr) {
        if (isAbortError(proxyErr) || signal?.aborted) throw proxyErr
        if (!isSentinelHubStatisticsDirectConfigured() && !isSentinelHubWmsClientStatisticsAvailable()) {
          throw proxyErr
        }
        /* fall through to direct Statistical API / client WMS when configured */
      }
    }

    if (isSentinelHubStatisticsDirectConfigured()) {
      try {
        const json = await postSentinelStatisticsDirect(body, signal)
        return storeAndReturn(json)
      } catch (directErr) {
        if (isAbortError(directErr) || signal?.aborted) throw directErr
        /* fall through to server proxy / client WMS */
      }
    }

    if (await mayUseSentinelHubStatisticsProxyAsync()) {
      try {
        const json = await postSentinelStatisticsViaProxy(body, signal)
        return storeAndReturn(json)
      } catch (proxyErr) {
        if (isAbortError(proxyErr) || signal?.aborted) throw proxyErr
        /* fall through to browser WMS on static hosts */
      }
    }

    // Static production (GitHub Pages / eliteagrocloud.com): no Node `/api` — use browser WMS zonal.
    if (isSentinelHubWmsClientStatisticsAvailable()) {
      const json = await postSentinelStatisticsViaWmsClient(body, signal)
      return storeAndReturn(json as StatsApiResponse)
    }

    throw new Error(
      'Configure Sentinel Hub OAuth (VITE_SENTINEL_HUB_CLIENT_ID/SECRET) or a private access token for field NDVI alerts.',
    )
  })()

  statsInFlight.set(cacheKey, promise)
  try {
    return await promise
  } finally {
    statsInFlight.delete(cacheKey)
  }
}

async function mapPoolStatistics<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!items.length) return []
  const out: R[] = new Array(items.length)
  let next = 0
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await worker(items[i]!, i)
    }
  })
  await Promise.all(runners)
  return out
}

function buildStatisticsRequestBody(
  geom: GeoJSON.Geometry,
  fromIso: string,
  toIso: string,
  options?: { maxCloudCoverage?: number; relaxedCloudMask?: boolean; layerIds?: string[] },
): Record<string, unknown> {
  const mode = resolveImageryStatisticsFetchMode(options?.layerIds)
  const relaxed = options?.relaxedCloudMask
  const evalscript =
    mode === 'snow-ndsi'
      ? relaxed
        ? SNOW_NDSI_RELAXED_INDEX_EVALSCRIPT
        : SNOW_NDSI_INDEX_EVALSCRIPT
      : relaxed
        ? CROP_ALERT_RELAXED_INDEX_EVALSCRIPT
        : CROP_ALERT_MULTI_INDEX_EVALSCRIPT
  const calculations =
    mode === 'snow-ndsi' ? buildSnowNdsiStatisticsCalculations() : buildMultiIndexStatisticsCalculations()
  return {
    input: {
      bounds: {
        geometry: geom,
        properties: { crs: 'http://www.opengis.net/def/crs/EPSG/0/4326' },
      },
      data: [
        {
          type: 'sentinel-2-l2a',
          dataFilter: {
            mosaickingOrder: 'leastCC',
            maxCloudCoverage: options?.maxCloudCoverage ?? 65,
          },
        },
      ],
    },
    aggregation: {
      timeRange: {
        from: `${fromIso}T00:00:00Z`,
        to: `${toIso}T00:00:00Z`,
      },
      aggregationInterval: { of: 'P1D' },
      evalscript,
      resx: 10,
      resy: 10,
    },
    calculations,
  }
}

export async function fetchSentinelFieldIndexForSceneDate(
  geometry: GeoJSON.Geometry,
  sceneDate: string,
  options?: { maxCloudCoverage?: number; relaxedCloudMask?: boolean; signal?: AbortSignal },
): Promise<SentinelHubDailyIndexMeans | null> {
  const geom = simplifyGeometryForSentinelStats(geometry)
  if (!geom) return null
  const fromIso = sceneDate.trim().slice(0, 10)
  const toIso = addDaysToIso(fromIso, 1)
  const daily = await postSentinelStatisticsRequest(
    buildStatisticsRequestBody(geom, fromIso, toIso, options),
    options?.signal,
  )
  return daily.find(d => d.date === fromIso) ?? daily[0] ?? null
}

export async function fetchSentinelFieldIndexByCatalogScenes(
  options: {
    geometry: GeoJSON.Geometry
    sceneDates: string[]
    maxCloudCoverage?: number
    signal?: AbortSignal
  },
): Promise<SentinelHubDailyIndexMeans[]> {
  const dates = options.sceneDates.slice(0, 8)
  if (!dates.length) return []

  const rows = await mapPoolStatistics(dates, 4, async sceneDate => {
    if (options?.signal?.aborted) return null
    try {
      let row = await fetchSentinelFieldIndexForSceneDate(options.geometry, sceneDate, {
        maxCloudCoverage: options.maxCloudCoverage ?? 90,
        relaxedCloudMask: false,
        signal: options?.signal,
      })
      if (!row || row.ndvi == null) {
        row = await fetchSentinelFieldIndexForSceneDate(options.geometry, sceneDate, {
          maxCloudCoverage: 95,
          relaxedCloudMask: true,
          signal: options?.signal,
        })
      }
      if (row && (row.ndvi != null || row.ndwi != null || row.ndmi != null)) return row
    } catch {
      /* try next scene */
    }
    return null
  })

  return rows
    .filter((row): row is SentinelHubDailyIndexMeans => row != null)
    .sort((a, b) => a.date.localeCompare(b.date))
}

export async function fetchSentinelFieldIndexTimeSeries(
  options: FetchSentinelFieldStatsOptions,
): Promise<SentinelHubDailyIndexMeans[]> {
  if (!options?.geometry) return []
  const geom = simplifyGeometryForSentinelStats(options.geometry)
  if (!geom) return []

  const lookback = options.lookbackDays ?? CROP_ALERT_SENTINEL_LOOKBACK_DAYS
  /** Fetch through end of today (exclusive upper bound = tomorrow 00:00 UTC). */
  const todayIso = localIsoDate()
  const toIso = addDaysToIso(todayIso, 1)
  const fromIso = subtractDaysFromIso(todayIso, lookback)

  return postSentinelStatisticsRequest(
    buildStatisticsRequestBody(geom, fromIso, toIso, {
      maxCloudCoverage: options.maxCloudCoverage,
      relaxedCloudMask: options.relaxedCloudMask,
    }),
    options?.signal,
  )
}

export type FetchSentinelFieldIndexRangeOptions = {
  geometry: GeoJSON.Geometry
  fromIso: string
  toIso: string
  maxCloudCoverage?: number
  relaxedCloudMask?: boolean
  signal?: AbortSignal
  layerIds?: string[]
}

/** Zonal mean indices for an explicit calendar range (inclusive end date). */
export async function fetchSentinelFieldIndexTimeSeriesForRange(
  options: FetchSentinelFieldIndexRangeOptions,
): Promise<SentinelHubDailyIndexMeans[]> {
  if (!options?.geometry) return []
  const geom = simplifyGeometryForSentinelStats(options.geometry)
  if (!geom) return []

  const fromIso = String(options.fromIso || '').trim().slice(0, 10)
  const endIso = String(options.toIso || '').trim().slice(0, 10)
  if (!fromIso || !endIso || endIso < fromIso) return []

  const toExclusive = addDaysToIso(endIso, 1)
  return postSentinelStatisticsRequest(
    buildStatisticsRequestBody(geom, fromIso, toExclusive, {
      maxCloudCoverage: options.maxCloudCoverage,
      relaxedCloudMask: options.relaxedCloudMask,
      layerIds: options.layerIds,
    }),
    options?.signal,
  )
}

export function pickDailyIndexValue(
  daily: SentinelHubDailyIndexMeans[],
  targetIso: string,
  key: keyof Pick<SentinelHubDailyIndexMeans, 'ndvi' | 'ndwi' | 'ndmi' | 'evi'>,
): number | null {
  if (!daily.length) return null
  const exact = daily.find(d => d.date === targetIso)
  if (exact && exact[key] != null) return exact[key]

  let best: SentinelHubDailyIndexMeans | null = null
  let bestDist = Infinity
  for (const row of daily) {
    if (row[key] == null) continue
    const dist = Math.abs(new Date(row.date).getTime() - new Date(targetIso).getTime())
    if (dist < bestDist) {
      bestDist = dist
      best = row
    }
  }
  return best?.[key] ?? null
}

/** Exact calendar day only — used by Crop Alert Engine (no nearest-date fallback). */
export function pickDailyIndexValueExact(
  daily: SentinelHubDailyIndexMeans[],
  targetIso: string,
  key: keyof Pick<SentinelHubDailyIndexMeans, 'ndvi' | 'ndwi' | 'ndmi' | 'evi'>,
): number | null {
  const row = daily.find(d => d.date === targetIso.trim())
  if (!row) return null
  const v = row[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

export type SentinelHubNdviHistogram = {
  date: string
  bins: NdviHistogramBin[]
  overflow: number
  underflow: number
  sampleCount: number
  mean: number | null
}

type StatsHistogramBand = {
  histogram?: {
    overflow?: number
    underflow?: number
    bins?: Array<{ lowEdge?: number; highEdge?: number; count?: number }>
  }
  stats?: StatsBandStats
}

function readNdviHistogramBand(
  outputs: NonNullable<StatsApiResponse['data']>[number],
): StatsHistogramBand | null {
  const indices = outputs?.outputs?.ndvi?.bands?.ndvi ?? outputs?.outputs?.indices?.bands?.ndvi
  return indices ?? null
}

export function parseSentinelHubNdviHistogramResponse(json: StatsApiResponse): SentinelHubNdviHistogram[] {
  if (!Array.isArray(json.data)) return []
  const out: SentinelHubNdviHistogram[] = []
  for (const row of json.data) {
    const date = intervalStartIso(row.interval)
    if (!date) continue
    const band = readNdviHistogramBand(row)
    const hist = band?.histogram
    const meanRaw = band?.stats?.mean
    const mean = typeof meanRaw === 'number' && Number.isFinite(meanRaw) ? Number(meanRaw.toFixed(4)) : null
    const bins: NdviHistogramBin[] = (hist?.bins ?? [])
      .map(b => ({
        lowEdge: Number(b.lowEdge),
        highEdge: Number(b.highEdge),
        count: Number(b.count) || 0,
      }))
      .filter(b => Number.isFinite(b.lowEdge) && Number.isFinite(b.highEdge))
    out.push({
      date,
      bins,
      overflow: Number(hist?.overflow) || 0,
      underflow: Number(hist?.underflow) || 0,
      sampleCount: Number(band?.stats?.sampleCount) || 0,
      mean,
    })
  }
  return out
}

function buildNdviHistogramRequestBody(
  geom: GeoJSON.Geometry,
  fromIso: string,
  toIso: string,
  options?: { maxCloudCoverage?: number },
): Record<string, unknown> {
  return {
    input: {
      bounds: {
        geometry: geom,
        properties: { crs: 'http://www.opengis.net/def/crs/EPSG/0/4326' },
      },
      data: [
        {
          type: 'sentinel-2-l2a',
          dataFilter: {
            mosaickingOrder: 'leastCC',
            maxCloudCoverage: options?.maxCloudCoverage ?? 65,
          },
        },
      ],
    },
    aggregation: {
      timeRange: {
        from: `${fromIso}T00:00:00Z`,
        to: `${toIso}T00:00:00Z`,
      },
      aggregationInterval: { of: 'P1D' },
      evalscript: CROP_ALERT_NDVI_HISTOGRAM_EVALSCRIPT,
      resx: 10,
      resy: 10,
    },
    calculations: buildNdviHistogramCalculations(),
  }
}

async function postSentinelHistogramRequest(
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<SentinelHubNdviHistogram[]> {
  if (isSentinelHubStatisticsDirectConfigured()) {
    try {
      const json = await postSentinelStatisticsDirect(body, signal)
      return parseSentinelHubNdviHistogramResponse(json)
    } catch (err) {
      if (isAbortError(err) || signal?.aborted) throw err
      /* fall through to server proxy */
    }
  }

  if (await mayUseSentinelHubStatisticsProxyAsync()) {
    const json = await postSentinelStatisticsViaProxy(body, signal)
    return parseSentinelHubNdviHistogramResponse(json)
  }

  throw new Error(
    'Configure Sentinel Hub OAuth (VITE_SENTINEL_HUB_CLIENT_ID/SECRET) or a private access token for field NDVI alerts.',
  )
}

export type SentinelHubGenericHistogram = {
  date: string
  bins: NdviHistogramBin[]
  overflow: number
  underflow: number
  sampleCount: number
}

function readNamedHistogramBand(
  outputs: NonNullable<StatsApiResponse['data']>[number],
  outputId: string,
): StatsHistogramBand | null {
  const band = (outputs?.outputs as Record<string, { bands?: Record<string, StatsHistogramBand> }> | undefined)?.[
    outputId
  ]?.bands?.[outputId]
  return band ?? null
}

function parseGenericHistogramResponse(json: StatsApiResponse, outputId: string): SentinelHubGenericHistogram[] {
  if (!Array.isArray(json.data)) return []
  const out: SentinelHubGenericHistogram[] = []
  for (const row of json.data) {
    const date = intervalStartIso(row.interval)
    if (!date) continue
    const band = readNamedHistogramBand(row, outputId)
    const hist = band?.histogram
    const bins: NdviHistogramBin[] = (hist?.bins ?? [])
      .map(b => ({ lowEdge: Number(b.lowEdge), highEdge: Number(b.highEdge), count: Number(b.count) || 0 }))
      .filter(b => Number.isFinite(b.lowEdge) && Number.isFinite(b.highEdge))
    out.push({
      date,
      bins,
      overflow: Number(hist?.overflow) || 0,
      underflow: Number(hist?.underflow) || 0,
      sampleCount: Number(band?.stats?.sampleCount) || 0,
    })
  }
  return out
}

function buildGenericIndexHistogramRequestBody(options: {
  geom: GeoJSON.Geometry
  fromIso: string
  toIso: string
  evalscript: string
  outputId: string
  binEdges: number[]
  maxCloudCoverage?: number
  resolutionMeters?: number
}): Record<string, unknown> {
  const res = Math.max(10, options.resolutionMeters ?? 10)
  return {
    input: {
      bounds: {
        geometry: options.geom,
        properties: { crs: 'http://www.opengis.net/def/crs/EPSG/0/4326' },
      },
      data: [
        {
          type: 'sentinel-2-l2a',
          dataFilter: {
            mosaickingOrder: 'leastCC',
            maxCloudCoverage: options.maxCloudCoverage ?? 65,
          },
        },
      ],
    },
    aggregation: {
      timeRange: { from: `${options.fromIso}T00:00:00Z`, to: `${options.toIso}T00:00:00Z` },
      aggregationInterval: { of: 'P1D' },
      evalscript: options.evalscript,
      resx: res,
      resy: res,
    },
    calculations: {
      [options.outputId]: {
        histograms: { [options.outputId]: { bins: options.binEdges } },
        statistics: { [options.outputId]: {} },
      },
    },
  }
}

async function postGenericHistogramRequest(
  body: Record<string, unknown>,
  outputId: string,
  signal?: AbortSignal,
): Promise<SentinelHubGenericHistogram[]> {
  throwIfAborted(signal)
  const cacheKey = JSON.stringify(body)
  const cached = histogramResultCache.get(cacheKey)
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data
  }

  // Never join an in-flight request that can be aborted by another caller —
  // sharing a signalled fetch causes "signal is aborted" to leak into active legends.
  if (!signal) {
    const inFlight = histogramInFlight.get(cacheKey)
    if (inFlight) {
      return inFlight
    }
  }

  const promise = (async (): Promise<SentinelHubGenericHistogram[]> => {
    let rows: SentinelHubGenericHistogram[]
    if (isSentinelHubStatisticsDirectConfigured()) {
      try {
        const json = await postSentinelStatisticsDirect(body, signal)
        rows = parseGenericHistogramResponse(json, outputId)
        histogramResultCache.set(cacheKey, {
          data: rows,
          expiresAt: Date.now() + STATS_RESULT_CACHE_TTL_MS,
        })
        return rows
      } catch (err) {
        if (isAbortError(err) || signal?.aborted) throw err
        /* fall through to proxy */
      }
    }
    if (await mayUseSentinelHubStatisticsProxyAsync()) {
      const json = await postSentinelStatisticsViaProxy(body, signal)
      rows = parseGenericHistogramResponse(json, outputId)
      histogramResultCache.set(cacheKey, {
        data: rows,
        expiresAt: Date.now() + STATS_RESULT_CACHE_TTL_MS,
      })
      return rows
    }
    throw new Error(
      'Configure Sentinel Hub OAuth (VITE_SENTINEL_HUB_CLIENT_ID/SECRET) or a private access token for class-area statistics.',
    )
  })()

  if (!signal) {
    histogramInFlight.set(cacheKey, promise)
  }
  try {
    return await promise
  } finally {
    if (!signal) {
      histogramInFlight.delete(cacheKey)
    }
  }
}

/** Total classified pixels in a histogram row (bins + over/underflow). */
function histogramRowTotal(row: SentinelHubGenericHistogram): number {
  const bins = row.bins.reduce((sum, b) => sum + (Number(b.count) || 0), 0)
  return bins + (Number(row.overflow) || 0) + (Number(row.underflow) || 0)
}

function daysBetweenIso(a: string, b: string): number {
  const ta = Date.parse(`${a}T00:00:00Z`)
  const tb = Date.parse(`${b}T00:00:00Z`)
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return 0
  return Math.abs(ta - tb) / 86_400_000
}

/**
 * Pick the most usable acquisition from a windowed result: prefer the exact day
 * when it carries pixels, otherwise the day with the most classified pixels,
 * lightly biased toward the day nearest the requested scene date.
 */
function pickBestHistogramRow(
  rows: SentinelHubGenericHistogram[],
  targetIso: string,
): SentinelHubGenericHistogram | null {
  if (!rows.length) return null
  const exact = rows.find(r => r.date === targetIso)
  if (exact && histogramRowTotal(exact) > 0) return exact
  let best: SentinelHubGenericHistogram | null = null
  let bestScore = -1
  for (const row of rows) {
    const total = histogramRowTotal(row)
    if (total <= 0) continue
    // Coverage dominates; nearness only breaks ties between similarly-covered days.
    const score = total - daysBetweenIso(row.date, targetIso)
    if (score > bestScore) {
      bestScore = score
      best = row
    }
  }
  return best ?? exact ?? rows[0] ?? null
}

/**
 * Per-class pixel histogram for any single-band index evalscript inside an AOI.
 * `binEdges` are passed verbatim to the Statistical API (supports non-uniform class breaks),
 * so each returned bin maps 1:1 to a classification class.
 *
 * When `searchWindowDays > 0` the request widens to `[sceneDate − window, sceneDate + 1]`
 * and returns the nearest acquisition that actually carries pixels. This is essential
 * because Sentinel-2's ~5-day revisit means the exact scene day frequently has no
 * acquisition over the AOI — without the window the class-area legend reads all zeros.
 */
export async function fetchSentinelIndexClassHistogramForSceneDate(options: {
  geometry: GeoJSON.Geometry
  sceneDate: string
  evalscript: string
  outputId: string
  binEdges: number[]
  maxCloudCoverage?: number
  resolutionMeters?: number
  searchWindowDays?: number
  signal?: AbortSignal
}): Promise<SentinelHubGenericHistogram | null> {
  const geom = simplifyGeometryForSentinelStats(options.geometry)
  if (!geom || options.binEdges.length < 2) return null
  const sceneIso = options.sceneDate.trim().slice(0, 10)
  if (!sceneIso) return null
  const windowDays = Math.max(0, Math.round(options.searchWindowDays ?? 0))
  const fromIso = windowDays > 0 ? subtractDaysFromIso(sceneIso, windowDays) : sceneIso
  const toIso = addDaysToIso(sceneIso, 1)
  const rows = await postGenericHistogramRequest(
    buildGenericIndexHistogramRequestBody({
      geom,
      fromIso,
      toIso,
      evalscript: options.evalscript,
      outputId: options.outputId,
      binEdges: options.binEdges,
      maxCloudCoverage: options.maxCloudCoverage,
      resolutionMeters: options.resolutionMeters,
    }),
    options.outputId,
    options.signal,
  )
  if (windowDays > 0) return pickBestHistogramRow(rows, sceneIso)
  return rows.find(r => r.date === sceneIso) ?? rows[0] ?? null
}

/** Fetch NDVI pixel histogram for one scene date (dominant-class source of truth). */
export async function fetchSentinelFieldNdviHistogramForSceneDate(
  geometry: GeoJSON.Geometry,
  sceneDate: string,
  options?: { maxCloudCoverage?: number; signal?: AbortSignal },
): Promise<SentinelHubNdviHistogram | null> {
  const geom = simplifyGeometryForSentinelStats(geometry)
  if (!geom) return null
  const fromIso = sceneDate.trim().slice(0, 10)
  const toIso = addDaysToIso(fromIso, 1)
  const rows = await postSentinelHistogramRequest(
    buildNdviHistogramRequestBody(geom, fromIso, toIso, options),
    options?.signal,
  )
  return rows.find(r => r.date === fromIso) ?? rows[0] ?? null
}
