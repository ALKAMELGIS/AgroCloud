/**
 * Sentinel-2 True Color GetMap capture for SegFormer Active-AOI detect.
 * Prefer native TRUE_COLOR / 1_TRUE_COLOR WMS over Mapbox basemap screenshots.
 * Uploaded rasters use the existing `/api/raster/:id/wms` GetMap path.
 * Esri Basemap Satellite stitches World Imagery tiles over the AOI.
 */

import { apiUrl } from '../apiOrigin'
import { getSentinelHubWmsBaseUrl } from '../sentinelHubWmsInstance'
import {
  appendSentinelHubWmsAccessToken,
  getSentinelHubWmsLayerCatalog,
  resolveSentinelHubWmsEvalscriptProxyLayerName,
  resolveSentinelHubWmsGetMapLayerName,
  resolveSentinelHubWmsTimeWindow,
  type SentinelHubWmsLayerInfo,
} from '../sentinelHubWmsLayers'
import {
  buildTreeImageryMosaic,
  lngLatToWorldPx,
  TREE_IMAGERY_PROVIDERS,
} from '../treeDetection/webMercatorTiles'

export type SegFormerCaptureImageSource = 'sentinel-2' | 'basemap' | 'uploaded' | 'esri-basemap'

export type SegFormerS2CaptureResult = {
  image: string
  bbox: [number, number, number, number]
  imageSource: 'sentinel-2'
  sceneDate: string
  layer: string
}

export type SegFormerUploadedRasterCaptureResult = {
  image: string
  bbox: [number, number, number, number]
  imageSource: 'uploaded'
  rasterId: string
  rasterName?: string
}

export type SegFormerEsriBasemapCaptureResult = {
  image: string
  bbox: [number, number, number, number]
  imageSource: 'esri-basemap'
}

const WEB_MERCATOR_R = 6378137
const MAX_MERCATOR_LAT = 85.05112878
/** Prefer ~1–1.5k edge for ADE20K SegFormer input quality. */
export const SEGFORMER_S2_CAPTURE_MAX_EDGE = 1536
/** Field pipeline primary frame — higher res for B5 + SAM2 boundaries. */
export const SEGFORMER_FIELD_S2_CAPTURE_MAX_EDGE = 2048
/** Number of cloud-filtered S2 dates for the temporal crop stage. */
export const SEGFORMER_FIELD_TEMPORAL_DATE_COUNT = 3
const MIN_OPAQUE_RATIO = 0.12

function lngLatTo3857(lng: number, lat: number): [number, number] {
  const clampedLat = Math.max(-MAX_MERCATOR_LAT, Math.min(MAX_MERCATOR_LAT, lat))
  const x = ((lng * Math.PI) / 180) * WEB_MERCATOR_R
  const y = WEB_MERCATOR_R * Math.log(Math.tan(Math.PI / 4 + (clampedLat * Math.PI) / 360))
  return [x, y]
}

export function bbox4326To3857(
  bbox4326: [number, number, number, number],
): [number, number, number, number] {
  const [w, s, e, n] = bbox4326
  const [minX, minY] = lngLatTo3857(w, s)
  const [maxX, maxY] = lngLatTo3857(e, n)
  return [minX, minY, maxX, maxY]
}

/** Aspect-correct pixel size capped at maxEdge (Mapbox Static-style). */
export function resolveSegFormerCapturePixelSize(
  bbox4326: [number, number, number, number],
  maxEdge = SEGFORMER_S2_CAPTURE_MAX_EDGE,
): { width: number; height: number } {
  const [west, south, east, north] = bbox4326
  const midLat = (north + south) / 2
  const lonSpan = Math.max(1e-6, east - west)
  const latSpan = Math.max(1e-6, north - south)
  const aspect = (lonSpan * Math.cos((midLat * Math.PI) / 180)) / latSpan
  const edge = Math.max(256, Math.min(2500, Math.round(maxEdge)))
  let width = edge
  let height = Math.round(edge / Math.max(1e-6, aspect))
  if (aspect < 1) {
    height = edge
    width = Math.round(edge * aspect)
  }
  return {
    width: Math.max(64, Math.min(2500, width)),
    height: Math.max(64, Math.min(2500, height)),
  }
}

/** Prefer TRUE_COLOR / 1_TRUE_COLOR from the live WMS catalog. */
export function resolveSegFormerTrueColorLayerName(
  availableLayers: SentinelHubWmsLayerInfo[] = getSentinelHubWmsLayerCatalog(),
): string {
  const fromIds =
    resolveSentinelHubWmsGetMapLayerName('1_TRUE_COLOR', availableLayers) ||
    resolveSentinelHubWmsGetMapLayerName('TRUE_COLOR', availableLayers)
  const upper = String(fromIds || '').toUpperCase()
  if (upper.includes('TRUE_COLOR') || upper.includes('TRUE-COLOR')) return fromIds
  return resolveSentinelHubWmsEvalscriptProxyLayerName(availableLayers) || '1_TRUE_COLOR'
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result || ''))
    fr.onerror = () => reject(new Error('Failed to read capture PNG'))
    fr.readAsDataURL(blob)
  })
}

/**
 * Clip an AOI bbox to a raster extent when both are valid; otherwise return the AOI bbox.
 * Used so uploaded-raster Detect requests stay inside the georeferenced footprint.
 */
export function clipBboxToRasterExtent(
  aoiBbox: [number, number, number, number],
  rasterBbox: { west: number; south: number; east: number; north: number } | null | undefined,
): [number, number, number, number] | null {
  const [aw, as, ae, an] = aoiBbox
  if (!(ae > aw) || !(an > as)) return null
  if (!rasterBbox) return aoiBbox
  const { west, south, east, north } = rasterBbox
  if (![west, south, east, north].every(Number.isFinite) || !(east > west) || !(north > south)) {
    return aoiBbox
  }
  const w = Math.max(aw, west)
  const s = Math.max(as, south)
  const e = Math.min(ae, east)
  const n = Math.min(an, north)
  if (!(e > w) || !(n > s)) return null
  return [w, s, e, n]
}

async function opaquePixelRatio(blob: Blob, width: number, height: number): Promise<number> {
  const bitmap = await createImageBitmap(blob)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return 1
    ctx.drawImage(bitmap, 0, 0, width, height)
    const { data } = ctx.getImageData(0, 0, width, height)
    let opaque = 0
    for (let i = 3; i < data.length; i += 4) {
      if (data[i]! >= 128) opaque += 1
    }
    return opaque / Math.max(1, width * height)
  } finally {
    bitmap.close?.()
  }
}

export type FetchSegFormerSentinel2TrueColorOptions = {
  bbox4326: [number, number, number, number]
  sceneDate: string
  maxEdge?: number
  cloudCoverage?: number
  wmsBaseUrl?: string
  availableLayers?: SentinelHubWmsLayerInfo[]
  signal?: AbortSignal
}

/**
 * Fetch a Sentinel-2 True Color PNG for the AOI bbox via OGC WMS GetMap.
 * Returns null when the request fails or the frame is mostly empty (caller should fall back).
 */
export async function fetchSegFormerSentinel2TrueColor(
  opts: FetchSegFormerSentinel2TrueColorOptions,
): Promise<SegFormerS2CaptureResult | null> {
  const sceneDate = String(opts.sceneDate || '').trim().slice(0, 10)
  if (!sceneDate) return null

  const layers = opts.availableLayers?.length
    ? opts.availableLayers
    : getSentinelHubWmsLayerCatalog()
  const layer = resolveSegFormerTrueColorLayerName(layers)
  const baseUrl = (opts.wmsBaseUrl || '').trim() || getSentinelHubWmsBaseUrl()
  const { timeStart, timeEnd } = resolveSentinelHubWmsTimeWindow('TRUE_COLOR', sceneDate, null)
  if (!timeStart || !timeEnd) return null

  const [west, south, east, north] = opts.bbox4326
  if (!(east > west) || !(north > south)) return null

  const bbox3857 = bbox4326To3857(opts.bbox4326)
  const [minX, minY, maxX, maxY] = bbox3857
  const { width, height } = resolveSegFormerCapturePixelSize(
    opts.bbox4326,
    opts.maxEdge ?? SEGFORMER_S2_CAPTURE_MAX_EDGE,
  )
  const maxcc =
    typeof opts.cloudCoverage === 'number' && Number.isFinite(opts.cloudCoverage)
      ? Math.max(0, Math.min(100, Math.round(opts.cloudCoverage)))
      : 40

  let url =
    `${baseUrl}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0` +
    `&LAYERS=${encodeURIComponent(layer)}` +
    `&BBOX=${minX},${minY},${maxX},${maxY}&CRS=EPSG:3857` +
    `&FORMAT=image/png&TRANSPARENT=true&WIDTH=${width}&HEIGHT=${height}` +
    `&TIME=${timeStart}/${timeEnd}` +
    `&MAXCC=${maxcc}` +
    `&SHOWLOGO=false&WARNINGS=false`
  url = appendSentinelHubWmsAccessToken(url)

  try {
    const res = await fetch(url, {
      headers: { Accept: 'image/png' },
      signal: opts.signal,
    })
    if (!res.ok) return null
    const blob = await res.blob()
    if (!blob.size || !/^image\//i.test(blob.type || 'image/png')) return null
    const opaque = await opaquePixelRatio(blob, width, height)
    if (opaque < MIN_OPAQUE_RATIO) return null
    const image = await blobToDataUrl(blob)
    if (!image.startsWith('data:image/')) return null
    return {
      image,
      bbox: [west, south, east, north],
      imageSource: 'sentinel-2',
      sceneDate,
      layer,
    }
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err
    return null
  }
}

export type SegFormerS2MultiDateFrame = SegFormerS2CaptureResult & {
  /** Index in the returned stack (0 = primary / preferred). */
  stackIndex: number
}

export type SegFormerS2MultiDateStack = {
  /** Primary / median composite frame used for B5 in v1 (first successful date). */
  primary: SegFormerS2CaptureResult
  frames: SegFormerS2MultiDateFrame[]
  dates: string[]
  /** True Color max edge used for the primary frame. */
  maxEdge: number
}

/**
 * Build candidate YYYY-MM-DD dates around a primary scene for temporal crop typing.
 * Spreads roughly monthly steps backward (and one forward) so cloud filtering can pick clear days.
 */
export function buildSegFormerTemporalCandidateDates(
  primarySceneDate: string,
  count = SEGFORMER_FIELD_TEMPORAL_DATE_COUNT,
): string[] {
  const primary = String(primarySceneDate || '').trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(primary)) return []
  const n = Math.max(1, Math.min(8, Math.floor(count) || SEGFORMER_FIELD_TEMPORAL_DATE_COUNT))
  const base = new Date(`${primary}T12:00:00Z`)
  if (Number.isNaN(base.getTime())) return []
  const offsetsDays: number[] = [0]
  // Alternate earlier / later monthly-ish steps.
  for (let i = 1; offsetsDays.length < n + 4; i += 1) {
    offsetsDays.push(-(i * 28))
    offsetsDays.push(i * 28)
  }
  const out: string[] = []
  const seen = new Set<string>()
  for (const d of offsetsDays) {
    if (out.length >= n) break
    const t = new Date(base.getTime() + d * 86400000)
    const iso = t.toISOString().slice(0, 10)
    if (seen.has(iso)) continue
    seen.add(iso)
    out.push(iso)
  }
  return out
}

export type FetchSegFormerSentinel2MultiDateStackOptions = {
  bbox4326: [number, number, number, number]
  /** Preferred / current RS scene date (YYYY-MM-DD). */
  primarySceneDate: string
  /** Explicit candidate dates; defaults to {@link buildSegFormerTemporalCandidateDates}. */
  candidateDates?: string[]
  /** How many successful cloud-filtered frames to keep (default 3). */
  dateCount?: number
  /** Max edge for the primary / B5 frame (default field 2048). */
  primaryMaxEdge?: number
  /** Max edge for additional temporal frames (default 1024 — lighter). */
  temporalMaxEdge?: number
  cloudCoverage?: number
  wmsBaseUrl?: string
  availableLayers?: SentinelHubWmsLayerInfo[]
  signal?: AbortSignal
}

/**
 * Fetch up to N cloud-filtered Sentinel-2 True Color frames for the field temporal stage.
 * B5 runs on `primary` (first successful / preferred date) in v1; `frames` feed crop typing.
 * Returns null when no usable primary frame is available.
 */
export async function fetchSegFormerSentinel2MultiDateStack(
  opts: FetchSegFormerSentinel2MultiDateStackOptions,
): Promise<SegFormerS2MultiDateStack | null> {
  const dateCount = Math.max(
    1,
    Math.min(8, Math.floor(opts.dateCount ?? SEGFORMER_FIELD_TEMPORAL_DATE_COUNT) || 3),
  )
  const primaryMaxEdge = opts.primaryMaxEdge ?? SEGFORMER_FIELD_S2_CAPTURE_MAX_EDGE
  const temporalMaxEdge = opts.temporalMaxEdge ?? Math.min(1024, primaryMaxEdge)
  const candidates =
    opts.candidateDates?.filter(d => /^\d{4}-\d{2}-\d{2}$/.test(String(d || '').trim().slice(0, 10)))
      .map(d => String(d).trim().slice(0, 10)) ||
    buildSegFormerTemporalCandidateDates(opts.primarySceneDate, dateCount + 2)

  if (!candidates.length) return null

  const frames: SegFormerS2MultiDateFrame[] = []
  for (const sceneDate of candidates) {
    if (frames.length >= dateCount) break
    if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const isPrimarySlot = frames.length === 0
    const shot = await fetchSegFormerSentinel2TrueColor({
      bbox4326: opts.bbox4326,
      sceneDate,
      maxEdge: isPrimarySlot ? primaryMaxEdge : temporalMaxEdge,
      cloudCoverage: opts.cloudCoverage,
      wmsBaseUrl: opts.wmsBaseUrl,
      availableLayers: opts.availableLayers,
      signal: opts.signal,
    })
    if (!shot) continue
    frames.push({ ...shot, stackIndex: frames.length })
  }

  if (!frames.length) return null
  return {
    primary: frames[0]!,
    frames,
    dates: frames.map(f => f.sceneDate),
    maxEdge: primaryMaxEdge,
  }
}

export type FetchSegFormerUploadedRasterPreviewOptions = {
  rasterId: string
  bbox4326: [number, number, number, number]
  /** Optional raster footprint — AOI is clipped to this when provided. */
  rasterBbox?: { west: number; south: number; east: number; north: number } | null
  rasterName?: string | null
  maxEdge?: number
  signal?: AbortSignal
  /** Override WMS base (defaults to `/api/raster/:id/wms`). */
  wmsUrl?: string | null
}

/**
 * Fetch an RGB preview of an uploaded `/api/raster` record clipped to the Active AOI.
 * Uses the server WMS GetMap endpoint (EPSG:3857), same pixel-size helper as S2 capture.
 */
export async function fetchSegFormerUploadedRasterPreview(
  opts: FetchSegFormerUploadedRasterPreviewOptions,
): Promise<SegFormerUploadedRasterCaptureResult | null> {
  const rasterId = String(opts.rasterId || '').trim()
  if (!rasterId) return null

  const clipped = clipBboxToRasterExtent(opts.bbox4326, opts.rasterBbox)
  if (!clipped) return null
  const [west, south, east, north] = clipped
  if (!(east > west) || !(north > south)) return null

  const bbox3857 = bbox4326To3857(clipped)
  const [minX, minY, maxX, maxY] = bbox3857
  const { width, height } = resolveSegFormerCapturePixelSize(
    clipped,
    opts.maxEdge ?? SEGFORMER_S2_CAPTURE_MAX_EDGE,
  )

  const base = (opts.wmsUrl || '').trim() || apiUrl(`/api/raster/${encodeURIComponent(rasterId)}/wms`)
  const url =
    `${base}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0` +
    `&LAYERS=raster` +
    `&BBOX=${minX},${minY},${maxX},${maxY}&CRS=EPSG:3857` +
    `&FORMAT=image/png&TRANSPARENT=true&WIDTH=${width}&HEIGHT=${height}`

  try {
    const res = await fetch(url, {
      headers: { Accept: 'image/png' },
      signal: opts.signal,
    })
    if (!res.ok) return null
    const blob = await res.blob()
    if (!blob.size || !/^image\//i.test(blob.type || 'image/png')) return null
    const opaque = await opaquePixelRatio(blob, width, height)
    if (opaque < MIN_OPAQUE_RATIO) return null
    const image = await blobToDataUrl(blob)
    if (!image.startsWith('data:image/')) return null
    return {
      image,
      bbox: [west, south, east, north],
      imageSource: 'uploaded',
      rasterId,
      rasterName: opts.rasterName?.trim() || undefined,
    }
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err
    return null
  }
}

export type FetchSegFormerEsriBasemapOptions = {
  bbox4326: [number, number, number, number]
  maxEdge?: number
  signal?: AbortSignal
}

/**
 * Stitch Esri World Imagery tiles over the AOI bbox for GeoAI Detect.
 * Uses the same CORS-safe mosaic path as Tree Detections / report snapshots.
 */
export async function fetchSegFormerEsriBasemap(
  opts: FetchSegFormerEsriBasemapOptions,
): Promise<SegFormerEsriBasemapCaptureResult | null> {
  const [west, south, east, north] = opts.bbox4326
  if (!(east > west) || !(north > south)) return null

  const { width, height } = resolveSegFormerCapturePixelSize(
    opts.bbox4326,
    opts.maxEdge ?? SEGFORMER_S2_CAPTURE_MAX_EDGE,
  )
  const lngLatBBox = { west, south, east, north }

  try {
    const mosaic = await buildTreeImageryMosaic({
      bbox: lngLatBBox,
      provider: TREE_IMAGERY_PROVIDERS.esri,
      maxTiles: 64,
      maxZoom: 19,
      signal: opts.signal,
    })
    if (!mosaic) return null

    const [wx0, wyNorth] = lngLatToWorldPx(west, north, mosaic.zoom)
    const [wx1, wySouth] = lngLatToWorldPx(east, south, mosaic.zoom)
    const sx = wx0 - mosaic.originWorldPxX
    const sy = wyNorth - mosaic.originWorldPxY
    const sw = Math.max(wx1 - wx0, 1)
    const sh = Math.max(wySouth - wyNorth, 1)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#1e293b'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(mosaic.canvas, sx, sy, sw, sh, 0, 0, width, height)

    const image = canvas.toDataURL('image/png')
    if (!image.startsWith('data:image/')) return null
    return {
      image,
      bbox: [west, south, east, north],
      imageSource: 'esri-basemap',
    }
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err
    return null
  }
}
