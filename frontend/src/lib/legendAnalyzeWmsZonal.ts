/**
 * Immediate WMS zonal statistics for Layer Live Analyze panel (active scene).
 * Tiled GetMap for large AOIs — same Live WMS path as map tiles.
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
import { addDaysToIso } from './siSentinelImageryDate'
import { SI_SENTINEL_WMS_MAXCC, wmsCloudMaskGuardLines } from './sentinelSclCloudMask'

/** Histogram class-area stats are too slow above this AOI size — WMS uses tiling instead. */
export const LEGEND_ANALYZE_LARGE_AOI_HA = 1200

const WMS_TILE_PIXELS = 256
const WMS_FETCH_CONCURRENCY = 4
const MAX_WMS_ZONAL_TILES = 16

export type LegendWmsZonalStats = {
  min: number | null
  max: number | null
  average: number | null
}

const WMS_ZONAL_STATS_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B02", "B03", "B04", "B08", "B11", "SCL", "CLM", "CLP", "dataMask"] }],
    output: { bands: 4, sampleType: "UINT8" }
  };
}
function evaluatePixel(s) {
  ${wmsCloudMaskGuardLines('s')}
  var dNdvi = s.B08 + s.B04;
  var ndvi = dNdvi > 1e-6 ? (s.B08 - s.B04) / dNdvi : 0;
  var dNdwi = s.B03 + s.B08;
  var ndwi = dNdwi > 1e-6 ? (s.B03 - s.B08) / dNdwi : 0;
  var dNdmi = s.B08 + s.B11;
  var ndmi = dNdmi > 1e-6 ? (s.B08 - s.B11) / dNdmi : 0;
  function enc(v) {
    if (isNaN(v)) return 0;
    return Math.max(0, Math.min(254, Math.round((v + 1) * 127)));
  }
  return [enc(ndvi), enc(ndwi), enc(ndmi), 255];
}`

const WMS_ZONAL_EXT_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B03", "B04", "B05", "B08", "B11", "SCL", "CLM", "CLP", "dataMask"] }],
    output: { bands: 4, sampleType: "UINT8" }
  };
}
function evaluatePixel(s) {
  ${wmsCloudMaskGuardLines('s')}
  var dNdsi = s.B11 + s.B08;
  var ndsi = dNdsi > 1e-6 ? (s.B11 - s.B08) / dNdsi : 0;
  var dNdre = s.B08 + s.B05;
  var ndre = dNdre > 1e-6 ? (s.B08 - s.B05) / dNdre : 0;
  var si = Math.sqrt(Math.max(0, s.B03 * s.B04));
  function enc(v) {
    if (isNaN(v)) return 0;
    return Math.max(0, Math.min(254, Math.round((v + 1) * 127)));
  }
  function enc01(v) {
    if (isNaN(v)) return 0;
    return Math.max(0, Math.min(254, Math.round(v * 254)));
  }
  return [enc(ndsi), enc(ndre), enc01(si), 255];
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
const WMS_STATS_EXT_EVALSCRIPT_B64 = evalscriptToBase64(WMS_ZONAL_EXT_EVALSCRIPT)

/** Layer aliases → canonical WMS zonal key (matches analyze panel configs). */
const WMS_ZONAL_LAYER_ALIASES: Record<string, string> = {
  DNDVI: 'NDVI',
  DNDMI: 'NDMI',
  DNDWI: 'NDWI',
  DMNDWI: 'MNDWI',
  NDII: 'NDMI',
  NDRE: 'NDVI',
  CIRE: 'NDVI',
  CI_RE: 'NDVI',
  EVI: 'NDVI',
  GNDVI: 'NDVI',
  MSAVI: 'SAVI',
  NDSI: 'SSI',
  SI: 'SSI',
  DSSI: 'SSI',
}

export function normalizeLegendWmsZonalLayerKey(layerId: string | undefined): string {
  const raw = String(layerId || '')
    .trim()
    .toUpperCase()
  if (!raw) return ''
  const stripped = raw.length > 1 && raw.startsWith('D') && WMS_ZONAL_LAYER_ALIASES[`D${raw.slice(1)}`]
    ? raw.slice(1)
    : raw
  return WMS_ZONAL_LAYER_ALIASES[stripped] ?? stripped
}

export function isLegendAnalyzeWmsZonalAvailable(): boolean {
  return Boolean(getSentinelHubWmsInstanceId().trim())
}

export function layerSupportsLegendWmsZonal(layerId: string | undefined): boolean {
  return resolveWmsZonalChannel(layerId) != null
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

export function bbox3857FromGeometry(
  geometry: GeoJSON.Geometry,
): [number, number, number, number] | null {
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

export function bbox3857ToWktPolygon(bbox: [number, number, number, number]): string {
  const [minX, minY, maxX, maxY] = bbox
  return `POLYGON((${minX.toFixed(2)} ${minY.toFixed(2)}, ${maxX.toFixed(2)} ${minY.toFixed(2)}, ${maxX.toFixed(2)} ${maxY.toFixed(2)}, ${minX.toFixed(2)} ${maxY.toFixed(2)}, ${minX.toFixed(2)} ${minY.toFixed(2)}))`
}

/** Split a Web Mercator bbox into a capped grid for tiled WMS zonal stats. */
export function splitBbox3857ForZonalTiles(
  bbox: [number, number, number, number],
  areaHa: number,
): [number, number, number, number][] {
  const [minX, minY, maxX, maxY] = bbox
  if (maxX <= minX || maxY <= minY) return [bbox]

  if (areaHa <= LEGEND_ANALYZE_LARGE_AOI_HA) return [bbox]

  const targetTiles = Math.min(MAX_WMS_ZONAL_TILES, Math.max(4, Math.ceil(areaHa / 800)))
  const side = Math.ceil(Math.sqrt(targetTiles))
  const cols = side
  const rows = side
  const stepX = (maxX - minX) / cols
  const stepY = (maxY - minY) / rows
  const tiles: [number, number, number, number][] = []
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      tiles.push([
        minX + c * stepX,
        minY + r * stepY,
        minX + (c + 1) * stepX,
        minY + (r + 1) * stepY,
      ])
    }
  }
  return tiles.slice(0, MAX_WMS_ZONAL_TILES)
}

type ChannelIndex = 0 | 1 | 2

type TileIndexStats = {
  min: number
  max: number
  mean: number
  sampleCount: number
}

function decodeChannelIndexStats(data: Uint8ClampedArray, channel: ChannelIndex): TileIndexStats | null {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  let sum = 0
  let count = 0
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!
    const g = data[i + 1]!
    const b = data[i + 2]!
    const a = data[i + 3]!
    if (a < 128 || (r === 0 && g === 0 && b === 0)) continue
    const raw = channel === 0 ? r : channel === 1 ? g : b
    const v = raw / 127 - 1
    if (!Number.isFinite(v)) continue
    min = Math.min(min, v)
    max = Math.max(max, v)
    sum += v
    count += 1
  }
  if (count === 0) return null
  return {
    min,
    max,
    mean: sum / count,
    sampleCount: count,
  }
}

function decodeSaviFromCore(data: Uint8ClampedArray): TileIndexStats | null {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  let sum = 0
  let count = 0
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!
    const a = data[i + 3]!
    if (a < 128 || r === 0) continue
    const ndvi = r / 127 - 1
    const savi = (1 + 0.5) * ndvi / (1 + 0.5 * Math.abs(ndvi) + 1e-6)
    if (!Number.isFinite(savi)) continue
    min = Math.min(min, savi)
    max = Math.max(max, savi)
    sum += savi
    count += 1
  }
  if (count === 0) return null
  return { min, max, mean: sum / count, sampleCount: count }
}

function decodeSiFromExt(data: Uint8ClampedArray): TileIndexStats | null {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  let sum = 0
  let count = 0
  for (let i = 0; i < data.length; i += 4) {
    const b = data[i + 2]!
    const a = data[i + 3]!
    if (a < 128) continue
    const v = b / 254
    if (!Number.isFinite(v)) continue
    min = Math.min(min, v)
    max = Math.max(max, v)
    sum += v
    count += 1
  }
  if (count === 0) return null
  return { min, max, mean: sum / count, sampleCount: count }
}

export function mergeTileIndexStats(tiles: TileIndexStats[]): TileIndexStats | null {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  let sum = 0
  let count = 0
  for (const tile of tiles) {
    if (tile.sampleCount <= 0) continue
    min = Math.min(min, tile.min)
    max = Math.max(max, tile.max)
    sum += tile.mean * tile.sampleCount
    count += tile.sampleCount
  }
  if (count === 0) return null
  return {
    min,
    max,
    mean: sum / count,
    sampleCount: count,
  }
}

function resolveWmsZonalChannel(layerId: string): {
  evalB64: string
  channel?: ChannelIndex
  savi?: boolean
  si?: boolean
} | null {
  const id = normalizeLegendWmsZonalLayerKey(layerId)
  switch (id) {
    case 'NDVI':
    case 'NBR':
      return { evalB64: WMS_STATS_EVALSCRIPT_B64, channel: 0 }
    case 'NDWI':
    case 'MNDWI':
    case 'AWEI':
      return { evalB64: WMS_STATS_EVALSCRIPT_B64, channel: 1 }
    case 'NDMI':
      return { evalB64: WMS_STATS_EVALSCRIPT_B64, channel: 2 }
    case 'SAVI':
      return { evalB64: WMS_STATS_EVALSCRIPT_B64, savi: true }
    case 'SSI':
      return { evalB64: WMS_STATS_EXT_EVALSCRIPT_B64, channel: 0 }
    default:
      return null
  }
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

async function fetchTileStats(
  tileBbox: [number, number, number, number],
  sceneDate: string,
  spec: NonNullable<ReturnType<typeof resolveWmsZonalChannel>>,
  signal?: AbortSignal,
): Promise<TileIndexStats | null> {
  const accessToken = getSentinelHubAccessToken() || SENTINEL_HUB_PUBLIC_WMS_ACCESS_TOKEN
  const baseUrl = getSentinelHubWmsBaseUrl()
  const layer = resolveSentinelHubWmsEvalscriptProxyLayerName(getSentinelHubWmsLayerCatalog())
  const [minX, minY, maxX, maxY] = tileBbox
  const geometryWkt = bbox3857ToWktPolygon(tileBbox)
  const timeEnd = addDaysToIso(sceneDate, 1)
  let url =
    `${baseUrl}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0` +
    `&LAYERS=${encodeURIComponent(layer)}` +
    `&CRS=EPSG:3857` +
    `&BBOX=${minX},${minY},${maxX},${maxY}` +
    `&WIDTH=${WMS_TILE_PIXELS}&HEIGHT=${WMS_TILE_PIXELS}` +
    `&FORMAT=image/png&TRANSPARENT=true` +
    `&TIME=${sceneDate}/${timeEnd}` +
    `&MAXCC=${SI_SENTINEL_WMS_MAXCC}` +
    `&GEOMETRY=${encodeURIComponent(geometryWkt)}` +
    `&SHOWLOGO=false&WARNINGS=false` +
    `&EVALSCRIPT=${encodeURIComponent(spec.evalB64)}`
  url = appendSentinelHubWmsAccessToken(url, accessToken)

  const data = await fetchPngPixels(url, WMS_TILE_PIXELS, WMS_TILE_PIXELS, signal)
  if (spec.savi) return decodeSaviFromCore(data)
  if (spec.si) return decodeSiFromExt(data)
  if (spec.channel != null) return decodeChannelIndexStats(data, spec.channel)
  return null
}

/**
 * WMS zonal min/max/mean for the active scene and layer inside an AOI.
 * Uses tiled GetMap when AOI exceeds {@link LEGEND_ANALYZE_LARGE_AOI_HA}.
 */
export async function fetchLegendAnalyzeWmsZonalStats(
  geometry: GeoJSON.Geometry,
  sceneDate: string,
  layerId: string,
  options?: { signal?: AbortSignal; areaHa?: number },
): Promise<LegendWmsZonalStats | null> {
  if (!isLegendAnalyzeWmsZonalAvailable()) return null
  const day = String(sceneDate || '').trim().slice(0, 10)
  if (!day) return null
  const spec = resolveWmsZonalChannel(layerId)
  if (!spec) return null

  const bbox = bbox3857FromGeometry(geometry)
  if (!bbox) return null

  const areaHa = options?.areaHa ?? 0
  const tiles = splitBbox3857ForZonalTiles(bbox, areaHa)

  const results = await mapPool(tiles, WMS_FETCH_CONCURRENCY, async tileBbox => {
    if (options?.signal?.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError')
    }
    try {
      return await fetchTileStats(tileBbox, day, spec, options?.signal)
    } catch (err) {
      if (options?.signal?.aborted) throw err
      return null
    }
  })

  const merged = mergeTileIndexStats(results.filter((r): r is TileIndexStats => Boolean(r)))
  if (!merged || merged.sampleCount === 0) return null

  return {
    min: Number(merged.min.toFixed(4)),
    max: Number(merged.max.toFixed(4)),
    average: Number(merged.mean.toFixed(4)),
  }
}
