/**
 * LULC class areas from WMS GetMap — same temporal evalscript path as the map overlay.
 * Counts UINT8 class-index pixels inside the AOI GEOMETRY clip.
 */

import {
  getSentinelHubAccessToken,
  SENTINEL_HUB_PUBLIC_WMS_ACCESS_TOKEN,
} from './sentinelHubAccessToken'
import { getSentinelHubWmsBaseUrl } from './sentinelHubWmsInstance'
import {
  appendSentinelHubWmsAccessToken,
  getSentinelHubWmsLayerCatalog,
  resolveSentinelHubWmsEvalscriptProxyLayerName,
  SENTINEL_HUB_WMS_CATEGORICAL_RESAMPLE_PARAMS,
} from './sentinelHubWmsLayers'
import { evalscriptToBase64Param } from './sentinelHubWmsAoiClip'
import {
  LULC_CLASS_AREA_WMS_MAX_PX,
  LULC_HISTOGRAM_SEARCH_WINDOW_DAYS,
  LULC_MAP_CLASSES,
  LULC_NATIVE_GSD_M,
  resolveLulcClassificationTimeWindow,
} from './siLulcClassification'
import { buildLulcClassIndexWmsEvalscript } from './siLulcClassificationEvalscript'
import { geodesicAreaM2 } from './siLayerClassAreaEngine'

const MIN_PX = 48
const MAX_PX = LULC_CLASS_AREA_WMS_MAX_PX
const WMS_CACHE_TTL_MS = 10 * 60_000

export type LulcWmsClassAreaResult = {
  sceneDate: string
  counts: number[]
  sampleCount: number
  pixelAreaM2: number
  resolutionMeters: number
  analyzedAreaM2: number
  aoiAreaM2: number
}

const wmsResultCache = new Map<string, { expiresAt: number; result: LulcWmsClassAreaResult }>()

let cachedEvalscriptB64: string | null = null
function lulcClassIndexEvalscriptB64(): string {
  if (!cachedEvalscriptB64) {
    cachedEvalscriptB64 = evalscriptToBase64Param(buildLulcClassIndexWmsEvalscript())
  }
  return cachedEvalscriptB64
}

function geometryCacheKey(geometry: GeoJSON.Geometry): string {
  try {
    return JSON.stringify(geometry)
  } catch {
    return String(geometry.type || 'geom')
  }
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

function resolveRasterSize(
  bbox3857: [number, number, number, number],
  targetGsdM: number,
): { width: number; height: number; pixelAreaM2: number } {
  const widthM = Math.max(1, bbox3857[2] - bbox3857[0])
  const heightM = Math.max(1, bbox3857[3] - bbox3857[1])
  const gsd = targetGsdM > 0 ? targetGsdM : LULC_NATIVE_GSD_M
  const width = Math.max(MIN_PX, Math.min(MAX_PX, Math.round(widthM / gsd)))
  const height = Math.max(MIN_PX, Math.min(MAX_PX, Math.round(heightM / gsd)))
  const pixelAreaM2 = (widthM / width) * (heightM / height)
  return { width, height, pixelAreaM2 }
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
    throw new Error(`LULC WMS GetMap failed (${res.status}): ${text.slice(0, 160)}`)
  }
  const blob = await res.blob()
  const bitmap = await createImageBitmap(blob)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D context unavailable.')
    ctx.drawImage(bitmap, 0, 0, width, height)
    return ctx.getImageData(0, 0, width, height).data
  } finally {
    bitmap.close?.()
  }
}

/** Count UINT8 class-index pixels (R channel) with alpha > 0. */
export function countLulcClassPixelsFromRgba(
  data: Uint8ClampedArray,
  classCount = LULC_MAP_CLASSES.length,
): { counts: number[]; sampleCount: number } {
  const counts = new Array<number>(classCount).fill(0)
  let sampleCount = 0
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]!
    if (a < 16) continue
    const cls = data[i]!
    if (cls < 0 || cls >= classCount) continue
    counts[cls]! += 1
    sampleCount += 1
  }
  return { counts, sampleCount }
}

/**
 * Fetch one LULC class mosaic for the AOI (same TIME window + classify as map) and
 * count per-class pixels → areas.
 */
export async function fetchLulcClassAreasViaWms(options: {
  geometry: GeoJSON.Geometry
  sceneDate: string
  resolutionMeters?: number
  searchWindowDays?: number
  maxCloudCoverage?: number
  signal?: AbortSignal
}): Promise<LulcWmsClassAreaResult | null> {
  if (typeof document === 'undefined' || typeof createImageBitmap === 'undefined') {
    return null
  }

  const sceneDate = String(options.sceneDate || '').trim().slice(0, 10)
  if (!sceneDate) return null

  const targetGsd = options.resolutionMeters ?? LULC_NATIVE_GSD_M
  const lookback = options.searchWindowDays ?? LULC_HISTOGRAM_SEARCH_WINDOW_DAYS
  const cacheKey = `${geometryCacheKey(options.geometry)}|${sceneDate}|${targetGsd}|${lookback}`
  const cached = wmsResultCache.get(cacheKey)
  if (cached && Date.now() < cached.expiresAt) {
    return cached.result
  }

  const bbox3857 = bbox3857FromGeometry(options.geometry)
  const geometryWkt3857 = geometryToWmsClipWkt3857(options.geometry)
  if (!bbox3857) return null

  const { width, height, pixelAreaM2 } = resolveRasterSize(bbox3857, targetGsd)
  const { timeStart, timeEnd } = resolveLulcClassificationTimeWindow(sceneDate, lookback)
  if (!timeStart || !timeEnd) return null

  const accessToken = getSentinelHubAccessToken() || SENTINEL_HUB_PUBLIC_WMS_ACCESS_TOKEN
  const baseUrl = getSentinelHubWmsBaseUrl()
  const layer = resolveSentinelHubWmsEvalscriptProxyLayerName(getSentinelHubWmsLayerCatalog())
  const evalscriptB64 = lulcClassIndexEvalscriptB64()
  const cloudCoverage = options.maxCloudCoverage ?? 65
  const [minX, minY, maxX, maxY] = bbox3857

  const buildUrl = (withGeometry: boolean) => {
    let url =
      `${baseUrl}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0` +
      `&LAYERS=${encodeURIComponent(layer)}` +
      `&CRS=EPSG:3857` +
      `&BBOX=${minX},${minY},${maxX},${maxY}` +
      `&WIDTH=${width}&HEIGHT=${height}` +
      `&FORMAT=image/png&TRANSPARENT=true` +
      `&TIME=${timeStart}/${timeEnd}` +
      `&MAXCC=${cloudCoverage}` +
      SENTINEL_HUB_WMS_CATEGORICAL_RESAMPLE_PARAMS +
      `&SHOWLOGO=false&WARNINGS=false` +
      `&EVALSCRIPT=${encodeURIComponent(evalscriptB64)}`
    if (withGeometry && geometryWkt3857) {
      url += `&GEOMETRY=${encodeURIComponent(geometryWkt3857)}`
    }
    return appendSentinelHubWmsAccessToken(url, accessToken)
  }

  let data: Uint8ClampedArray
  try {
    data = await fetchPngPixels(buildUrl(true), width, height, options.signal)
  } catch (err) {
    if (options.signal?.aborted) throw err
    // Some instances reject GEOMETRY+EVALSCRIPT — bbox-only still useful for compact AOIs.
    data = await fetchPngPixels(buildUrl(false), width, height, options.signal)
  }

  const { counts, sampleCount } = countLulcClassPixelsFromRgba(data)
  if (sampleCount <= 0) return null

  const analyzedAreaM2 = sampleCount * pixelAreaM2
  const result: LulcWmsClassAreaResult = {
    sceneDate,
    counts,
    sampleCount,
    pixelAreaM2,
    resolutionMeters: Math.sqrt(Math.max(pixelAreaM2, 1)),
    analyzedAreaM2,
    aoiAreaM2: geodesicAreaM2(options.geometry),
  }
  wmsResultCache.set(cacheKey, { expiresAt: Date.now() + WMS_CACHE_TTL_MS, result })
  return result
}
