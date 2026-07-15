/**
 * Browser WMS zonal statistics for Time Series on static deploys (GitHub Pages /
 * eliteagrocloud.com) where `/api/sentinel-hub/statistics` does not exist.
 *
 * Mirrors `backend/server/sentinelHubWmsStatisticsEngine.js` time-series path:
 * Planetary Computer STAC scene dates → Sentinel Hub OGC WMS GetMap + EVALSCRIPT
 * → AOI mean NDVI/NDWI/NDMI/NDSI. Uses the public featured-collections token +
 * configured/default WMS instance (no Statistical API OAuth required).
 */

import {
  getSentinelHubAccessToken,
  SENTINEL_HUB_PUBLIC_WMS_ACCESS_TOKEN,
} from './sentinelHubAccessToken'
import {
  getSentinelHubWmsBaseUrl,
  getSentinelHubWmsInstanceId,
} from './sentinelHubWmsInstance'
import {
  appendSentinelHubWmsAccessToken,
  getSentinelHubWmsLayerCatalog,
  resolveSentinelHubWmsEvalscriptProxyLayerName,
} from './sentinelHubWmsLayers'
import { PC_SENTINEL_STAC_SEARCH_URL } from './siSentinelLatestScene'
import { addDaysToIso } from './siSentinelImageryDate'

const WMS_TILE_PIXELS = 256
const MAX_SCENE_FETCHES = 160
const WMS_FETCH_CONCURRENCY = 4

const WMS_ZONAL_STATS_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B02", "B03", "B04", "B08", "B11", "SCL", "dataMask"] }],
    output: { bands: 4, sampleType: "UINT8" }
  };
}
function evaluatePixel(s) {
  var scl = s.SCL;
  var cloud = (scl == 3 || scl == 8 || scl == 9 || scl == 10 || scl == 11);
  if (!s.dataMask || cloud) return [0, 0, 0, 0];
  var dNdvi = s.B08 + s.B04;
  var ndvi = dNdvi > 1e-6 ? (s.B08 - s.B04) / dNdvi : 0;
  var dNdwi = s.B03 + s.B08;
  var ndwi = dNdwi > 1e-6 ? (s.B03 - s.B08) / dNdwi : 0;
  var dNdmi = s.B08 + s.B11;
  var ndmi = dNdmi > 1e-6 ? (s.B08 - s.B11) / dNdmi : 0;
  var dNdSnow = s.B03 + s.B11;
  var ndsi = dNdSnow > 1e-6 ? (s.B03 - s.B11) / dNdSnow : 0;
  function enc(v) {
    if (isNaN(v)) return 0;
    var raw = Math.round((v + 1) * 127);
    return Math.max(1, Math.min(254, raw === 0 ? 1 : raw));
  }
  return [enc(ndvi), enc(ndwi), enc(ndmi), enc(ndsi)];
}`

function evalscriptToBase64(script: string): string {
  const normalized = String(script || '')
    .replace(/\r\n/g, '\n')
    .trim()
  if (typeof btoa === 'function') {
    return btoa(unescape(encodeURIComponent(normalized)))
  }
  return normalized
}

const WMS_STATS_EVALSCRIPT_B64 = evalscriptToBase64(WMS_ZONAL_STATS_EVALSCRIPT)

export function isSentinelHubWmsClientStatisticsAvailable(): boolean {
  return Boolean(getSentinelHubWmsInstanceId().trim())
}

function lngLatToWebMercator(lng: number, lat: number): [number, number] {
  const x = (lng * 20037508.34) / 180
  const y =
    (Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180)) * (20037508.34 / 180)
  return [x, y]
}

function walkLngLat(coords: unknown, points: [number, number][]) {
  if (!coords) return
  if (Array.isArray(coords) && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
    points.push([coords[0], coords[1]])
    return
  }
  if (Array.isArray(coords)) coords.forEach(c => walkLngLat(c, points))
}

function bbox3857FromGeometry(geometry: GeoJSON.Geometry): [number, number, number, number] | null {
  const points: [number, number][] = []
  if ('coordinates' in geometry) walkLngLat(geometry.coordinates, points)
  if (!points.length) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [lng, lat] of points) {
    const [x, y] = lngLatToWebMercator(lng, lat)
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null
  const padX = Math.max(8, (maxX - minX) * 0.02)
  const padY = Math.max(8, (maxY - minY) * 0.02)
  return [minX - padX, minY - padY, maxX + padX, maxY + padY]
}

function ringClosed(ring: number[][]): number[][] {
  if (ring.length < 2) return ring
  const a = ring[0]!
  const b = ring[ring.length - 1]!
  if (a[0] === b[0] && a[1] === b[1]) return ring
  return [...ring, a]
}

function decimateMax(ring: number[][], maxPts: number): number[][] {
  if (ring.length <= maxPts) return ring
  const step = Math.ceil(ring.length / maxPts)
  const out: number[][] = []
  for (let i = 0; i < ring.length; i += step) out.push(ring[i]!)
  const last = ring[ring.length - 1]!
  const prev = out[out.length - 1]!
  if (prev[0] !== last[0] || prev[1] !== last[1]) out.push(last)
  return out
}

function ringWgs84To3857CoordPairs(ring: number[][]): string {
  return ring
    .map(([lng, lat]) => {
      const [x, y] = lngLatToWebMercator(lng!, lat!)
      return `${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(', ')
}

function geometryToWmsClipWkt3857(geometry: GeoJSON.Geometry): string | null {
  if (geometry.type === 'Polygon') {
    const ring = geometry.coordinates?.[0]
    if (!Array.isArray(ring) || !ring.length) return null
    const simplified = decimateMax(ringClosed(ring as number[][]), 36)
    return `POLYGON((${ringWgs84To3857CoordPairs(simplified)}))`
  }
  if (geometry.type === 'MultiPolygon') {
    const rings = (geometry.coordinates || [])
      .map(poly => {
        const ring = poly?.[0]
        if (!Array.isArray(ring) || !ring.length) return null
        return decimateMax(ringClosed(ring as number[][]), 28)
      })
      .filter((r): r is number[][] => Boolean(r))
    if (!rings.length) return null
    if (rings.length === 1) return `POLYGON((${ringWgs84To3857CoordPairs(rings[0]!)}))`
    const parts = rings.map(r => `((${ringWgs84To3857CoordPairs(r)}))`).join(', ')
    return `MULTIPOLYGON(${parts})`
  }
  return null
}

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

async function fetchPngPixels(
  url: string,
  width: number,
  height: number,
  signal?: AbortSignal,
): Promise<Uint8ClampedArray> {
  const res = await fetch(url, { headers: { Accept: 'image/png' }, signal })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`WMS GetMap failed (${res.status}): ${text.slice(0, 160)}`)
  }
  const blob = await res.blob()
  const bitmap = await createImageBitmap(blob)
  try {
    const canvas = makeCanvas(width, height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D context unavailable.')
    ctx.drawImage(bitmap, 0, 0, width, height)
    return ctx.getImageData(0, 0, width, height).data
  } finally {
    bitmap.close?.()
  }
}

type ZonalMeans = {
  ndvi: number | null
  ndwi: number | null
  ndmi: number | null
  ndsi: number | null
  ndsiMin: number | null
  ndsiMax: number | null
  sampleCount: number
}

function decodeZonalMeansFromRgba(data: Uint8ClampedArray): ZonalMeans {
  let ndviSum = 0
  let ndwiSum = 0
  let ndmiSum = 0
  let ndsiSum = 0
  let ndsiMin = Number.POSITIVE_INFINITY
  let ndsiMax = Number.NEGATIVE_INFINITY
  let count = 0
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!
    const g = data[i + 1]!
    const b = data[i + 2]!
    const a = data[i + 3]!
    if (r === 0 && g === 0 && b === 0 && a === 0) continue
    const ndsiVal = a / 127 - 1
    ndviSum += r / 127 - 1
    ndwiSum += g / 127 - 1
    ndmiSum += b / 127 - 1
    ndsiSum += ndsiVal
    if (ndsiVal < ndsiMin) ndsiMin = ndsiVal
    if (ndsiVal > ndsiMax) ndsiMax = ndsiVal
    count += 1
  }
  if (count === 0) {
    return { ndvi: null, ndwi: null, ndmi: null, ndsi: null, ndsiMin: null, ndsiMax: null, sampleCount: 0 }
  }
  return {
    ndvi: Number((ndviSum / count).toFixed(4)),
    ndwi: Number((ndwiSum / count).toFixed(4)),
    ndmi: Number((ndmiSum / count).toFixed(4)),
    ndsi: Number((ndsiSum / count).toFixed(4)),
    ndsiMin: Number(ndsiMin.toFixed(4)),
    ndsiMax: Number(ndsiMax.toFixed(4)),
    sampleCount: count,
  }
}

async function fetchPcSceneDates(
  geometry: GeoJSON.Geometry,
  fromIso: string,
  toIso: string,
  maxCloudCoverage: number,
  signal?: AbortSignal,
): Promise<string[]> {
  const body: Record<string, unknown> = {
    collections: ['sentinel-2-l2a'],
    intersects: geometry,
    datetime: `${fromIso.slice(0, 10)}T00:00:00Z/${toIso.slice(0, 10)}T23:59:59Z`,
    limit: 500,
    sortby: [{ field: 'datetime', direction: 'asc' }],
  }
  if (Number.isFinite(maxCloudCoverage)) {
    body.query = { 'eo:cloud_cover': { lt: maxCloudCoverage } }
  }

  const res = await fetch(PC_SENTINEL_STAC_SEARCH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Planetary Computer STAC search failed (${res.status}): ${text.slice(0, 180)}`)
  }
  const json = (await res.json()) as { features?: Array<{ properties?: { datetime?: string } }> }
  const features = Array.isArray(json.features) ? json.features : []
  const dates = [
    ...new Set(
      features
        .map(f => {
          const dt = f?.properties?.datetime
          return typeof dt === 'string' && dt.length >= 10 ? dt.slice(0, 10) : null
        })
        .filter((d): d is string => Boolean(d)),
    ),
  ].sort((a, b) => a.localeCompare(b))
  return dates.slice(0, MAX_SCENE_FETCHES)
}

async function mapPool<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  if (!items.length) return []
  const out: R[] = new Array(items.length)
  let next = 0
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await worker(items[i]!)
    }
  })
  await Promise.all(runners)
  return out
}

type StatsApiCompatibleResponse = {
  status: 'OK'
  data: Array<{
    interval: { from: string; to: string }
    outputs: {
      indices: {
        bands: Record<
          string,
          {
            stats: {
              mean: number | null
              min?: number | null
              max?: number | null
              sampleCount: number
              noDataCount: number
            }
          }
        >
      }
    }
  }>
}

function buildCompatibleResponse(
  rows: Array<ZonalMeans & { date: string }>,
): StatsApiCompatibleResponse {
  return {
    status: 'OK',
    data: rows.map(row => ({
      interval: {
        from: `${row.date}T00:00:00Z`,
        to: `${addDaysToIso(row.date, 1)}T00:00:00Z`,
      },
      outputs: {
        indices: {
          bands: {
            ndvi: {
              stats: {
                mean: row.ndvi,
                sampleCount: row.sampleCount,
                noDataCount: row.ndvi == null ? row.sampleCount : 0,
              },
            },
            ndwi: {
              stats: {
                mean: row.ndwi,
                sampleCount: row.sampleCount,
                noDataCount: row.ndwi == null ? row.sampleCount : 0,
              },
            },
            ndmi: {
              stats: {
                mean: row.ndmi,
                sampleCount: row.sampleCount,
                noDataCount: row.ndmi == null ? row.sampleCount : 0,
              },
            },
            ndsi: {
              stats: {
                mean: row.ndsi,
                min: row.ndsiMin ?? row.ndsi,
                max: row.ndsiMax ?? row.ndsi,
                sampleCount: row.sampleCount,
                noDataCount: row.ndsi == null ? row.sampleCount : 0,
              },
            },
            evi: {
              stats: {
                mean: null,
                sampleCount: row.sampleCount,
                noDataCount: row.sampleCount,
              },
            },
          },
        },
      },
    })),
  }
}

/**
 * Run AOI time-series statistics entirely in the browser (static hosting safe).
 * Accepts the same Statistical API request body shape the proxy expects.
 */
export async function postSentinelStatisticsViaWmsClient(
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<StatsApiCompatibleResponse> {
  if (!isSentinelHubWmsClientStatisticsAvailable()) {
    throw new Error('Sentinel Hub WMS instance is not configured for client-side statistics.')
  }

  const input = body.input as { bounds?: { geometry?: GeoJSON.Geometry }; data?: unknown[] } | undefined
  const geometry = input?.bounds?.geometry
  if (!geometry || typeof geometry !== 'object') {
    throw new Error('Statistics request missing input.bounds.geometry.')
  }

  const aggregation = body.aggregation as { timeRange?: { from?: string; to?: string } } | undefined
  const fromIso = String(aggregation?.timeRange?.from || '').slice(0, 10)
  const toIso = String(aggregation?.timeRange?.to || '').slice(0, 10)
  if (!fromIso || !toIso) {
    throw new Error('Statistics request missing aggregation.timeRange.')
  }

  const dataFilter = (input?.data?.[0] as { dataFilter?: { maxCloudCoverage?: number } } | undefined)
    ?.dataFilter
  const cloudCoverage =
    typeof dataFilter?.maxCloudCoverage === 'number' && Number.isFinite(dataFilter.maxCloudCoverage)
      ? dataFilter.maxCloudCoverage
      : 80

  const bbox3857 = bbox3857FromGeometry(geometry)
  const geometryWkt3857 = geometryToWmsClipWkt3857(geometry)
  if (!bbox3857) {
    throw new Error('Could not derive WMS bbox from AOI geometry.')
  }

  const accessToken = getSentinelHubAccessToken() || SENTINEL_HUB_PUBLIC_WMS_ACCESS_TOKEN
  const baseUrl = getSentinelHubWmsBaseUrl()
  const layer = resolveSentinelHubWmsEvalscriptProxyLayerName(getSentinelHubWmsLayerCatalog())
  const sceneDates = await fetchPcSceneDates(geometry, fromIso, toIso, cloudCoverage, signal)

  if (!sceneDates.length) {
    return buildCompatibleResponse([])
  }

  const [minX, minY, maxX, maxY] = bbox3857
  const rows = await mapPool(sceneDates, WMS_FETCH_CONCURRENCY, async sceneDate => {
    if (signal?.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError')
    }
    let url =
      `${baseUrl}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0` +
      `&LAYERS=${encodeURIComponent(layer)}` +
      `&CRS=EPSG:3857` +
      `&BBOX=${minX},${minY},${maxX},${maxY}` +
      `&WIDTH=${WMS_TILE_PIXELS}&HEIGHT=${WMS_TILE_PIXELS}` +
      `&FORMAT=image/png&TRANSPARENT=true` +
      `&TIME=${sceneDate}/${addDaysToIso(sceneDate, 1)}` +
      `&MAXCC=${cloudCoverage}` +
      `&SHOWLOGO=false&WARNINGS=false` +
      `&EVALSCRIPT=${encodeURIComponent(WMS_STATS_EVALSCRIPT_B64)}`
    if (geometryWkt3857) {
      url += `&GEOMETRY=${encodeURIComponent(geometryWkt3857)}`
    }
    url = appendSentinelHubWmsAccessToken(url, accessToken)

    try {
      const pixels = await fetchPngPixels(url, WMS_TILE_PIXELS, WMS_TILE_PIXELS, signal)
      const stats = decodeZonalMeansFromRgba(pixels)
      if (stats.sampleCount === 0) return null
      return { date: sceneDate, ...stats }
    } catch (err) {
      if (signal?.aborted) throw err
      console.warn('[wms-stats-client] scene failed', sceneDate, err)
      return null
    }
  })

  const valid = rows
    .filter((row): row is ZonalMeans & { date: string } => Boolean(row))
    .sort((a, b) => a.date.localeCompare(b.date))

  return buildCompatibleResponse(valid)
}
