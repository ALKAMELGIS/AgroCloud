/**
 * AOI-level Sentinel-2 scene cloud filtering via Sentinel Hub WMS + CLP/CLM/SCL masking.
 * STAC `eo:cloud_cover` is granule-level (~100 km tile) — not suitable for field AOIs.
 */

import {
  appendSentinelHubWmsAccessToken,
  getSentinelHubWmsLayerCatalog,
  resolveSentinelHubWmsEvalscriptProxyLayerName,
} from './sentinelHubWmsLayers'
import { getSentinelHubWmsBaseUrl, getSentinelHubWmsInstanceId } from './sentinelHubWmsInstance'
import { getDrawnGeometry } from './sentinelHubWmsAoiClip'
import { addDaysToIso } from './siSentinelImageryDate'

/** Never reject a Sentinel-2 granule at tile level — cloud gating is AOI pixel masks. */
export const SI_SENTINEL_WMS_SCENE_MAXCC = 100

const AOI_CLOUD_CHECK_PIXELS = 128
const AOI_CLOUD_CHECK_CONCURRENCY = 4
const MAX_AOI_CLOUD_SCENE_CHECKS = 160

const AOI_CLOUD_MASK_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["SCL", "CLM", "CLP", "dataMask"] }],
    output: { bands: 4, sampleType: "UINT8" }
  };
}
function evaluatePixel(s) {
  var scl = s.SCL;
  var cloud = (scl == 0 || scl == 1 || scl == 3 || scl == 8 || scl == 9 || scl == 10 || scl == 11) || s.CLM == 1 || s.CLP > 25;
  if (!s.dataMask) return [0, 0, 0, 0];
  return cloud ? [255, 0, 0, 255] : [0, 255, 0, 255];
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

const AOI_CLOUD_MASK_EVALSCRIPT_B64 = evalscriptToBase64(AOI_CLOUD_MASK_EVALSCRIPT)

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

/** Decode green=clear / red=cloud mask PNG into AOI cloud cover % (null when no AOI pixels). */
export function aoiCloudCoverPctFromMaskRgba(data: Uint8ClampedArray): number | null {
  let clear = 0
  let cloud = 0
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!
    const g = data[i + 1]!
    const a = data[i + 3]!
    if (a < 128) continue
    if (g > 200 && r < 80) clear += 1
    else if (r > 200 && g < 80) cloud += 1
  }
  const total = clear + cloud
  if (total === 0) return null
  return Math.round((cloud / total) * 1000) / 10
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

export async function fetchAoiCloudCoverPctForSceneDate(
  geometry: GeoJSON.Geometry,
  sceneDate: string,
  signal?: AbortSignal,
): Promise<number | null> {
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
    `&MAXCC=${SI_SENTINEL_WMS_SCENE_MAXCC}` +
    `&GEOMETRY=${encodeURIComponent(geometryWkt3857)}` +
    `&SHOWLOGO=false&WARNINGS=false` +
    `&EVALSCRIPT=${encodeURIComponent(AOI_CLOUD_MASK_EVALSCRIPT_B64)}`
  url = appendSentinelHubWmsAccessToken(url)

  try {
    const data = await fetchMaskRgba(url, px, px, signal)
    return aoiCloudCoverPctFromMaskRgba(data)
  } catch {
    return null
  }
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
}

/**
 * Keep scene dates whose AOI cloud cover (CLP/CLM/SCL) is ≤ maxAoiCloudCoverPct.
 * When WMS is unavailable, returns all candidate dates unchanged.
 */
export async function filterSentinelSceneDatesByAoiCloud(
  aoi: unknown,
  candidateDates: string[],
  maxAoiCloudCoverPct: number,
  options?: { signal?: AbortSignal },
): Promise<{ sceneIsos: string[]; sceneCloudByDate: Record<string, number> }> {
  const ceiling = Math.max(0, Math.min(100, Number(maxAoiCloudCoverPct) || 0))
  const dates = [...new Set(candidateDates.map(d => d.trim().slice(0, 10)).filter(Boolean))].sort(
    (a, b) => b.localeCompare(a),
  )

  if (!dates.length || ceiling >= 100) {
    return { sceneIsos: dates, sceneCloudByDate: {} }
  }

  const geometry = getDrawnGeometry(aoi as Parameters<typeof getDrawnGeometry>[0])
  if (!geometry || !isSentinelAoiSceneCloudFilterAvailable()) {
    return { sceneIsos: dates, sceneCloudByDate: {} }
  }

  const toCheck = dates.slice(0, MAX_AOI_CLOUD_SCENE_CHECKS)
  const results = await mapPool(toCheck, AOI_CLOUD_CHECK_CONCURRENCY, async date => {
    if (options?.signal?.aborted) return null
    const pct = await fetchAoiCloudCoverPctForSceneDate(geometry, date, options?.signal)
    if (pct == null) return null
    return { date, aoiCloudCoverPct: pct }
  })

  const sceneCloudByDate: Record<string, number> = {}
  const sceneIsos: string[] = []
  for (const row of results) {
    if (!row || row.aoiCloudCoverPct > ceiling) continue
    sceneCloudByDate[row.date] = row.aoiCloudCoverPct
    sceneIsos.push(row.date)
  }

  sceneIsos.sort((a, b) => b.localeCompare(a))
  return { sceneIsos, sceneCloudByDate }
}
