/**
 * AOI-level Sentinel-2 scene cloud metrics via Sentinel Hub WMS + CLP/CLM/SCL masking.
 * STAC `eo:cloud_cover` is granule-level (~100 km tile) — metadata only, not scene rejection.
 */

import {
  appendSentinelHubWmsAccessToken,
  getSentinelHubWmsLayerCatalog,
  resolveSentinelHubWmsEvalscriptProxyLayerName,
} from './sentinelHubWmsLayers'
import { getSentinelHubWmsBaseUrl, getSentinelHubWmsInstanceId } from './sentinelHubWmsInstance'
import { getDrawnGeometry } from './sentinelHubWmsAoiClip'
import { addDaysToIso } from './siSentinelImageryDate'
import {
  aoiCloudCoverPctFromMaskRgba,
  aoiCloudMaskStatsFromRgba,
  buildSentinelSceneCloudLogEntry,
  logSentinelSceneCloudMetrics,
  SENTINEL_AOI_CLOUD_MASK_EVALSCRIPT,
  SI_SENTINEL_MIN_AOI_CLEAR_FRACTION,
  SI_SENTINEL_WMS_MAXCC,
  type AoiCloudMaskStats,
  type SentinelSceneCloudLogEntry,
} from './sentinelSclCloudMask'

export { SI_SENTINEL_WMS_MAXCC as SI_SENTINEL_WMS_SCENE_MAXCC } from './sentinelSclCloudMask'

export { aoiCloudCoverPctFromMaskRgba, aoiCloudMaskStatsFromRgba }
export type { AoiCloudMaskStats, SentinelSceneCloudLogEntry }

const AOI_CLOUD_CHECK_PIXELS = 128
const AOI_CLOUD_CHECK_CONCURRENCY = 4
const MAX_AOI_CLOUD_SCENE_CHECKS = 160

function evalscriptToBase64(script: string): string {
  const normalized = String(script || '')
    .replace(/\r\n/g, '\n')
    .trim()
  if (typeof btoa === 'function') {
    return btoa(unescape(encodeURIComponent(normalized)))
  }
  return normalized
}

const AOI_CLOUD_MASK_EVALSCRIPT_B64 = evalscriptToBase64(SENTINEL_AOI_CLOUD_MASK_EVALSCRIPT)

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

async function fetchMaskRgba(
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

export function isSentinelAoiSceneCloudFilterAvailable(): boolean {
  return Boolean(getSentinelHubWmsInstanceId().trim())
}

export async function fetchAoiCloudMaskStatsForSceneDate(
  geometry: GeoJSON.Geometry,
  sceneDate: string,
  signal?: AbortSignal,
  options?: { originalCloudCoverage?: number | null },
): Promise<{ stats: AoiCloudMaskStats; log: SentinelSceneCloudLogEntry } | null> {
  const bbox3857 = bbox3857FromGeometry(geometry)
  const geometryWkt3857 = geometryToWmsClipWkt3857(geometry)
  if (!bbox3857 || !geometryWkt3857) return null

  const layer = resolveSentinelHubWmsEvalscriptProxyLayerName(getSentinelHubWmsLayerCatalog())
  const [minX, minY, maxX, maxY] = bbox3857
  const px = AOI_CLOUD_CHECK_PIXELS
  const timeEnd = addDaysToIso(sceneDate, 1)
  let url =
    `${getSentinelHubWmsBaseUrl()}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0` +
    `&LAYERS=${encodeURIComponent(layer)}` +
    `&BBOX=${minX},${minY},${maxX},${maxY}&CRS=EPSG:3857` +
    `&FORMAT=image/png&TRANSPARENT=true&WIDTH=${px}&HEIGHT=${px}` +
    `&TIME=${sceneDate}/${timeEnd}` +
    `&MAXCC=${SI_SENTINEL_WMS_MAXCC}` +
    `&GEOMETRY=${encodeURIComponent(geometryWkt3857)}` +
    `&SHOWLOGO=false&WARNINGS=false` +
    `&EVALSCRIPT=${encodeURIComponent(AOI_CLOUD_MASK_EVALSCRIPT_B64)}`
  url = appendSentinelHubWmsAccessToken(url)

  try {
    const data = await fetchMaskRgba(url, px, px, signal)
    const stats = aoiCloudMaskStatsFromRgba(data)
    const log = buildSentinelSceneCloudLogEntry(sceneDate, stats, {
      sceneId: sceneDate,
      originalCloudCoverage: options?.originalCloudCoverage ?? null,
    })
    logSentinelSceneCloudMetrics(log)
    return { stats, log }
  } catch {
    return null
  }
}

export async function fetchAoiCloudCoverPctForSceneDate(
  geometry: GeoJSON.Geometry,
  sceneDate: string,
  signal?: AbortSignal,
): Promise<number | null> {
  const row = await fetchAoiCloudMaskStatsForSceneDate(geometry, sceneDate, signal)
  return row?.stats.aoiCloudCoverPct ?? null
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
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

export type AoiFilteredSceneDate = {
  date: string
  aoiCloudCoverPct: number
  aoiClearCoverPct: number
  usable: boolean
}

/**
 * Rank scene dates by AOI clear pixel fraction (pixel-level SCL/CLM/CLP mask).
 * Does NOT reject scenes solely for high granule or AOI cloud % — only when zero clear pixels.
 * `maxAoiCloudCoverPct` is advisory for ranking preference (prefer clearer scenes first).
 */
export async function filterSentinelSceneDatesByAoiCloud(
  aoi: unknown,
  candidateDates: string[],
  maxAoiCloudCoverPct: number,
  options?: { signal?: AbortSignal; originalCloudByDate?: Record<string, number> },
): Promise<{
  sceneIsos: string[]
  sceneCloudByDate: Record<string, number>
  sceneClearByDate: Record<string, number>
  sceneLogs: SentinelSceneCloudLogEntry[]
}> {
  const dates = [...new Set(candidateDates.map(d => d.trim().slice(0, 10)).filter(Boolean))].sort(
    (a, b) => b.localeCompare(a),
  )

  if (!dates.length) {
    return { sceneIsos: [], sceneCloudByDate: {}, sceneClearByDate: {}, sceneLogs: [] }
  }

  const geometry = getDrawnGeometry(aoi as Parameters<typeof getDrawnGeometry>[0])
  if (!geometry || !isSentinelAoiSceneCloudFilterAvailable()) {
    return { sceneIsos: dates, sceneCloudByDate: {}, sceneClearByDate: {}, sceneLogs: [] }
  }

  const toCheck = dates.slice(0, MAX_AOI_CLOUD_SCENE_CHECKS)
  const results = await mapPool(toCheck, AOI_CLOUD_CHECK_CONCURRENCY, async date => {
    if (options?.signal?.aborted) return null
    const row = await fetchAoiCloudMaskStatsForSceneDate(geometry, date, options?.signal, {
      originalCloudCoverage: options?.originalCloudByDate?.[date] ?? null,
    })
    if (!row) return null
    const { stats, log } = row
    if (stats.aoiCloudCoverPct == null) return null
    return {
      date,
      aoiCloudCoverPct: stats.aoiCloudCoverPct,
      aoiClearCoverPct: stats.aoiClearCoverPct ?? 0,
      usable: log.usable,
      log,
    }
  })

  const ranked = results
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .sort((a, b) => {
      if (a.usable !== b.usable) return a.usable ? -1 : 1
      return b.aoiClearCoverPct - a.aoiClearCoverPct || a.aoiCloudCoverPct - b.aoiCloudCoverPct
    })

  const sceneCloudByDate: Record<string, number> = {}
  const sceneClearByDate: Record<string, number> = {}
  const sceneLogs: SentinelSceneCloudLogEntry[] = []
  const sceneIsos: string[] = []

  for (const row of ranked) {
    sceneCloudByDate[row.date] = row.aoiCloudCoverPct
    sceneClearByDate[row.date] = row.aoiClearCoverPct
    sceneLogs.push(row.log)
    // Never drop a scene — rank by clear fraction; pixel mask gates analytics only.
    sceneIsos.push(row.date)
  }

  // Append dates the WMS probe skipped or failed — keep full STAC catalog on the map.
  for (const date of dates) {
    if (!sceneIsos.includes(date)) sceneIsos.push(date)
  }

  sceneIsos.sort((a, b) => {
    const clearA = sceneClearByDate[a] ?? -1
    const clearB = sceneClearByDate[b] ?? -1
    if (clearA !== clearB) return clearB - clearA
    return b.localeCompare(a)
  })

  return { sceneIsos, sceneCloudByDate, sceneClearByDate, sceneLogs }
}

export { SI_SENTINEL_MIN_AOI_CLEAR_FRACTION }
