/**
 * FTW AOI pipeline — raster mosaic (union) from PMTiles vectors, then server vectorize.
 * Eliminates visible PMTiles tile seams by painting one binary mask before polygonize.
 */

import {
  loadFtwFeaturesForBbox,
  pickFtwZoomForBbox,
  type LngLatBbox,
  type LoadFtwFeaturesOptions,
} from './ftwPmtilesFeatures'
import { apiUrl } from '../apiOrigin'
import type { FtwGlobalYear } from './ftwGlobalConfig'
import { hideFtwTileBoundariesOnly } from './ftwHideTileBoundaries'
import type { FieldBoundaryResult } from './fieldBoundaryClient'

const MOSAIC_MAX_EDGE = 2048

function extractPolygonRings(f: GeoJSON.Feature): GeoJSON.Position[][] {
  const g = f.geometry
  if (!g) return []
  if (g.type === 'Polygon') return g.coordinates?.length ? [g.coordinates[0]!] : []
  if (g.type === 'MultiPolygon') {
    return (g.coordinates ?? [])
      .map(p => p?.[0])
      .filter((r): r is GeoJSON.Position[] => Array.isArray(r) && r.length >= 4)
  }
  return []
}

export type FtwRasterMosaic = {
  mask: Uint8Array
  /** Max confidence_mean per pixel (0 where background). Same length as mask. */
  confidence?: Float32Array
  width: number
  height: number
  bbox: LngLatBbox
}

/** Union-rasterize FTW polygons into one binary mask (overlapping tiles → single fill). */
export function rasterizeFtwFeaturesUnion(
  features: GeoJSON.Feature[],
  bbox: LngLatBbox,
  maxEdge = MOSAIC_MAX_EDGE,
): FtwRasterMosaic {
  const [west, south, east, north] = bbox
  const lonSpan = Math.max(east - west, 1e-9)
  const latSpan = Math.max(north - south, 1e-9)
  const aspect = lonSpan / latSpan

  let width = maxEdge
  let height = Math.max(1, Math.round(maxEdge / aspect))
  if (height > maxEdge) {
    height = maxEdge
    width = Math.max(1, Math.round(maxEdge * aspect))
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not create mosaic canvas.')

  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, width, height)

  const toPx = (lng: number, lat: number): [number, number] => [
    ((lng - west) / lonSpan) * width,
    ((north - lat) / latSpan) * height,
  ]

  const mask = new Uint8Array(width * height)
  const confidence = new Float32Array(width * height)

  const sorted = [...features].sort((a, b) => featureConfidence(a) - featureConfidence(b))

  for (const f of sorted) {
    const conf = featureConfidence(f)
    ctx.fillStyle = '#ffffff'
    for (const ring of extractPolygonRings(f)) {
      if (ring.length < 4) continue
      ctx.beginPath()
      ring.forEach(([lng, lat], idx) => {
        const [x, y] = toPx(lng, lat)
        if (idx === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.closePath()
      ctx.fill('evenodd')
    }
    const img = ctx.getImageData(0, 0, width, height)
    for (let i = 0; i < width * height; i++) {
      if (img.data[i * 4]! > 127) {
        mask[i] = 1
        confidence[i] = Math.max(confidence[i]!, conf)
      }
    }
  }

  return { mask, confidence, width, height, bbox }
}

function featureConfidence(f: GeoJSON.Feature): number {
  const p = (f.properties ?? {}) as Record<string, unknown>
  const c = Number(p.confidence_mean ?? p.confidence ?? 0)
  return Number.isFinite(c) ? c : 0
}

export function mosaicMaskToPngDataUrl(mosaic: FtwRasterMosaic): string {
  const { mask, width, height } = mosaic
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not encode mosaic PNG.')
  const img = ctx.createImageData(width, height)
  for (let i = 0; i < width * height; i++) {
    const v = mask[i] ? 255 : 0
    const o = i * 4
    img.data[o] = v
    img.data[o + 1] = v
    img.data[o + 2] = v
    img.data[o + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  return canvas.toDataURL('image/png')
}

export type FtwMosaicVectorizeRequest = {
  year: FtwGlobalYear
  thresholdPct: number
  bbox: LngLatBbox
  aoi?: GeoJSON.Geometry | GeoJSON.FeatureCollection | null
  minAreaM2?: number
  signal?: AbortSignal
}

export async function buildFtwAoiRasterMosaic(
  options: FtwMosaicVectorizeRequest,
): Promise<{ mosaic: FtwRasterMosaic; features: GeoJSON.Feature[] }> {
  const loadOpts: LoadFtwFeaturesOptions = {
    year: options.year,
    thresholdPct: options.thresholdPct,
    bbox: options.bbox,
    signal: options.signal,
  }
  const features = await loadFtwFeaturesForBbox(loadOpts)
  if (!features.length) {
    throw new Error('No FTW field polygons in this AOI at the current confidence threshold.')
  }
  const reference = hideFtwTileBoundariesOnly(features, pickFtwZoomForBbox(options.bbox))
  const mosaic = rasterizeFtwFeaturesUnion(reference, options.bbox)
  return { mosaic, features: reference }
}

/** Sample max confidence from the continuous raster inside a polygon bbox. */
export function sampleFtwMosaicConfidence(
  mosaic: FtwRasterMosaic,
  feature: GeoJSON.Feature,
): number {
  const grid = mosaic.confidence
  if (!grid?.length) return 0
  const g = feature.geometry
  if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) return 0
  const ring =
    g.type === 'Polygon'
      ? g.coordinates[0]
      : g.coordinates?.[0]?.[0]
  if (!ring?.length) return 0

  const [west, south, east, north] = mosaic.bbox
  const { width, height } = mosaic
  let minC = width
  let minR = height
  let maxC = 0
  let maxR = 0
  for (const [lon, lat] of ring) {
    if (lon == null || lat == null) continue
    const col = Math.round(((lon - west) / Math.max(east - west, 1e-12)) * Math.max(width - 1, 1))
    const row = Math.round(((north - lat) / Math.max(north - south, 1e-12)) * Math.max(height - 1, 1))
    minC = Math.min(minC, col)
    maxC = Math.max(maxC, col)
    minR = Math.min(minR, row)
    maxR = Math.max(maxR, row)
  }
  let best = 0
  for (let row = minR; row <= maxR; row++) {
    for (let col = minC; col <= maxC; col++) {
      const i = row * width + col
      if (mosaic.mask[i]) best = Math.max(best, grid[i]!)
    }
  }
  return best
}

export async function vectorizeFtwMosaic(
  mosaic: FtwRasterMosaic,
  options: Pick<FtwMosaicVectorizeRequest, 'aoi' | 'minAreaM2' | 'signal'> & {
    preserveGeometry?: boolean
  },
): Promise<FieldBoundaryResult> {
  const maskPng = mosaicMaskToPngDataUrl(mosaic)
  const res = await fetch(apiUrl('/api/agri-field-boundary/ftw-mosaic-vectorize'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mask: maskPng,
      bbox: mosaic.bbox,
      width: mosaic.width,
      height: mosaic.height,
      min_area_m2: Math.min(options.minAreaM2 ?? 500, 150),
      aoi: options.aoi ?? undefined,
      preserve_geometry: options.preserveGeometry !== false,
    }),
    signal: options.signal,
  })
  const json = (await res.json()) as Record<string, unknown>
  if (!res.ok) {
    throw new Error(String(json.error || json.detail || `FTW mosaic vectorize failed (${res.status}).`))
  }
  return json as FieldBoundaryResult
}

/** Full AOI pipeline: PMTiles → union raster → polygonize once (geometry from raster only). */
export async function detectFtwAoiMosaicVectorize(
  options: FtwMosaicVectorizeRequest,
): Promise<{ result: FieldBoundaryResult; featureCountLoaded: number }> {
  const { mosaic, features } = await buildFtwAoiRasterMosaic(options)
  const result = await vectorizeFtwMosaic(mosaic, { ...options, preserveGeometry: true })
  return { result, featureCountLoaded: features.length }
}
