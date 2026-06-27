/**
 * Per-class Total Area for index classification legends.
 *
 * Uses the Sentinel Hub Statistical API histogram with the layer's exact class
 * break edges (non-uniform bins → 1 bin per class), so each class count maps
 * directly to a classification class shown on the map. Areas are derived from
 * the 10 m sampling grid (100 m²/pixel) and the geodesic AOI area.
 */

import { CORE_INDICES_BLOCK } from './agroCompositeIndexEvalscripts'
import {
  isAgroCompositeLayerId,
  isAgroDeltaCompositeLayerId,
  resolveAgroCompositeExpr,
} from './agroCompositeIndices'
import { resolveAgroCompositeTenClassRamp } from './agroCompositeLayerRamps'
import {
  SENTINEL_NDMI_10_CLASS_BREAKS,
  SENTINEL_NDVI_10_CLASS_BREAKS,
  SENTINEL_NDWI_10_CLASS_BREAKS,
} from './sentinelHubWmsIndexEvalscripts'
import {
  fetchSentinelIndexClassHistogramForSceneDate,
  type SentinelHubGenericHistogram,
} from './sentinelHubStatisticsApi'

/** Each pixel of the 10 m Statistical API grid covers 100 m². */
export const SENTINEL_STATS_PIXEL_AREA_M2 = 100

/**
 * Pixel ground area (m²) for a sampling grid resolution. The area of each class
 * is `pixel count × pixel area`, so the pixel area must match the grid the
 * histogram was computed on:
 *   • Sentinel-2 (10 m)  → 100 m²/pixel
 *   • Landsat    (30 m)  → 900 m²/pixel
 * Any resolution → res² (e.g. 20 m → 400 m²).
 */
export function pixelAreaM2ForResolution(resolutionMeters?: number | null): number {
  const r = Number(resolutionMeters)
  if (Number.isFinite(r) && r > 0) return r * r
  return SENTINEL_STATS_PIXEL_AREA_M2
}

export type LayerClassBreakdown = {
  /** length = classes + 1 (low → high). */
  edges: number[]
  indexExpr: string
}

export type LayerClassAreaRow = {
  classIndex: number
  /** Number of classified pixels that fell into this class inside the AOI. */
  count: number
  /** count × pixel area (m²). */
  areaM2: number
  /** areaM2 ÷ 10,000. */
  areaHa: number
  /** areaM2 ÷ 1,000,000. */
  areaKm2: number
  /** Share of the classified AOI pixels, 0–100. */
  pctOfAoi: number
}

export type LayerClassAreaResult = {
  rows: LayerClassAreaRow[]
  aoiAreaM2: number
  analyzedAreaM2: number
  sampleCount: number
  sceneDate: string
}

const CORE_INDEX_EXPR: Record<string, string> = {
  NDVI: 'ndvi',
  NDWI: 'ndwi',
  NDMI: 'ndmi',
  SAVI: 'savi',
}

/** Numeric class edges + index expression for a layer, or null if unsupported. */
export function resolveLayerClassBreakdown(layerId: string): LayerClassBreakdown | null {
  const u = String(layerId || '').trim().toUpperCase()
  if (!u) return null

  if (isAgroCompositeLayerId(u) && !isAgroDeltaCompositeLayerId(u) && u !== 'CHAS_ALERT') {
    const ramp = resolveAgroCompositeTenClassRamp(u)
    const expr = resolveAgroCompositeExpr(u)
    if (!ramp || !expr) return null
    return { edges: [ramp.valueMin, ...ramp.breaks, ramp.valueMax], indexExpr: expr }
  }

  const expr = CORE_INDEX_EXPR[u]
  if (!expr) return null

  if (u === 'NDVI') return { edges: [-1, ...SENTINEL_NDVI_10_CLASS_BREAKS, 1], indexExpr: expr }
  if (u === 'NDWI') return { edges: [-1, ...SENTINEL_NDWI_10_CLASS_BREAKS, 1], indexExpr: expr }
  if (u === 'NDMI') return { edges: [-0.8, ...SENTINEL_NDMI_10_CLASS_BREAKS, 0.8], indexExpr: expr }
  // SAVI — equal-width 10 classes over its display range.
  if (u === 'SAVI') {
    const min = -0.5
    const max = 1
    const edges: number[] = []
    for (let i = 0; i <= 10; i += 1) edges.push(Number((min + ((max - min) * i) / 10).toFixed(4)))
    return { edges, indexExpr: expr }
  }
  return null
}

/** True when this layer can report per-class area (single-scene index). */
export function layerSupportsClassArea(layerId: string): boolean {
  return resolveLayerClassBreakdown(layerId) != null
}

/** WMS-fallback classification marker for plain index value histograms. */
function indexValueHistogramMarker(layerId: string, edges: number[]): string | null {
  const u = String(layerId || '').trim().toUpperCase()
  const index = u === 'NDWI' ? 'ndwi' : u === 'NDVI' ? 'ndvi' : u === 'SAVI' ? 'savi' : null
  if (!index) return null
  return JSON.stringify({ mode: 'value', index, edges, outputId: 'idx' })
}

/**
 * Single-band index evalscript (FLOAT32) for the Statistical API histogram.
 * `relaxed` drops the SCL cloud mask so a hazy/partly-cloudy scene still yields
 * valid pixels (used as a fallback when the strict pass classifies 0 pixels).
 */
export function buildLayerIndexEvalscript(
  indexExpr: string,
  marker?: string | null,
  options?: { relaxed?: boolean },
): string {
  const relaxed = options?.relaxed === true
  const markerLine = marker ? `\n// AGRO_CLASS_HISTOGRAM ${marker}` : ''
  const cloudExpr = relaxed ? 'false' : '(scl == 3 || scl == 8 || scl == 9 || scl == 10 || scl == 11)'
  return `//VERSION=3${markerLine}
function setup() {
  return {
    input: [{ bands: ["B03", "B04", "B05", "B08", "B11", "SCL", "dataMask"] }],
    output: [
      { id: "idx", bands: ["idx"], sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 }
    ]
  };
}
function evaluatePixel(samples) {
  var scl = samples.SCL;
  var cloud = ${cloudExpr};
  ${CORE_INDICES_BLOCK}
  var idx = ${indexExpr};
  var valid = samples.dataMask && !cloud && isFinite(idx);
  return { idx: [idx], dataMask: [valid ? 1 : 0] };
}`
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

function ringAreaM2(ring: number[][]): number {
  const R = 6378137
  let total = 0
  const n = ring.length
  if (n < 3) return 0
  for (let i = 0; i < n; i += 1) {
    const p1 = ring[i]!
    const p2 = ring[(i + 1) % n]!
    total += toRad(p2[0]! - p1[0]!) * (2 + Math.sin(toRad(p1[1]!)) + Math.sin(toRad(p2[1]!)))
  }
  return Math.abs((total * R * R) / 2)
}

function polygonAreaM2(rings: number[][][]): number {
  if (!rings.length) return 0
  const outer = ringAreaM2(rings[0] as number[][])
  let holes = 0
  for (let i = 1; i < rings.length; i += 1) holes += ringAreaM2(rings[i] as number[][])
  return Math.max(0, outer - holes)
}

/** Geodesic area (m²) of a GeoJSON Polygon/MultiPolygon (or Feature wrapping one). */
export function geodesicAreaM2(input: GeoJSON.Geometry | GeoJSON.Feature | null | undefined): number {
  if (!input) return 0
  const geom = (input as GeoJSON.Feature).type === 'Feature' ? (input as GeoJSON.Feature).geometry : (input as GeoJSON.Geometry)
  if (!geom) return 0
  if (geom.type === 'Polygon') return polygonAreaM2(geom.coordinates as number[][][])
  if (geom.type === 'MultiPolygon') {
    return (geom.coordinates as number[][][][]).reduce((sum, poly) => sum + polygonAreaM2(poly), 0)
  }
  return 0
}

/**
 * Convert a Statistical API histogram into per-class area rows aligned to the
 * break edges, using the explicit method:
 *   1. count the pixels in each class (histogram bin counts, + over/underflow),
 *   2. area = pixel count × pixel area (`pixelAreaM2`),
 *   3. ha = area ÷ 10,000 · km² = area ÷ 1,000,000.
 * `pixelAreaM2` must match the sampling grid (10 m → 100, 30 m → 900).
 */
export function computeClassAreaRows(
  histogram: SentinelHubGenericHistogram,
  classCount: number,
  pixelAreaM2: number,
): { rows: LayerClassAreaRow[]; analyzedAreaM2: number; sampleCount: number; totalCount: number } {
  const counts = new Array<number>(classCount).fill(0)
  const sorted = [...histogram.bins].sort((a, b) => a.lowEdge - b.lowEdge)
  for (let i = 0; i < sorted.length && i < classCount; i += 1) {
    counts[i] = Math.max(0, Number(sorted[i]!.count) || 0)
  }
  // Out-of-range pixels fold into the nearest extreme class.
  if (classCount > 0) {
    counts[0]! += Math.max(0, histogram.underflow || 0)
    counts[classCount - 1]! += Math.max(0, histogram.overflow || 0)
  }

  const totalCount = counts.reduce((s, c) => s + c, 0)
  const px = pixelAreaM2 > 0 ? pixelAreaM2 : SENTINEL_STATS_PIXEL_AREA_M2
  const analyzedAreaM2 = totalCount * px

  const rows: LayerClassAreaRow[] = counts.map((count, classIndex) => {
    const areaM2 = count * px
    return {
      classIndex,
      count,
      areaM2,
      areaHa: areaM2 / 10_000,
      areaKm2: areaM2 / 1_000_000,
      pctOfAoi: totalCount > 0 ? (count / totalCount) * 100 : 0,
    }
  })

  return { rows, analyzedAreaM2, sampleCount: histogram.sampleCount, totalCount }
}

export type FetchLayerClassAreasOptions = {
  geometry: GeoJSON.Geometry | GeoJSON.Feature
  layerId: string
  sceneDate: string
  maxCloudCoverage?: number
  resolutionMeters?: number
  signal?: AbortSignal
}

/**
 * End-to-end: resolve the layer's FIXED class breaks (from each index's code
 * ramp) → fetch the index histogram inside the AOI → per-class areas aligned to
 * those fixed classes. No dynamic/adaptive ramp generation — the colors and
 * ranges are exactly the ones defined in the index code.
 */
export async function fetchLayerClassAreas(
  options: FetchLayerClassAreasOptions,
): Promise<LayerClassAreaResult | null> {
  const breakdown = resolveLayerClassBreakdown(options.layerId)
  if (!breakdown) return null

  const geometry =
    (options.geometry as GeoJSON.Feature).type === 'Feature'
      ? (options.geometry as GeoJSON.Feature).geometry
      : (options.geometry as GeoJSON.Geometry)
  if (!geometry) return null

  const sceneDate = String(options.sceneDate || '').trim().slice(0, 10)
  if (!sceneDate) return null

  const classCount = breakdown.edges.length - 1
  const resolutionMeters = options.resolutionMeters ?? 10
  const pixelAreaM2 = pixelAreaM2ForResolution(resolutionMeters)
  const marker = indexValueHistogramMarker(options.layerId, breakdown.edges)

  const runHistogram = (relaxed: boolean, maxCloudCoverage?: number) =>
    fetchSentinelIndexClassHistogramForSceneDate({
      geometry,
      sceneDate,
      evalscript: buildLayerIndexEvalscript(breakdown.indexExpr, marker, { relaxed }),
      outputId: 'idx',
      binEdges: breakdown.edges,
      maxCloudCoverage,
      resolutionMeters,
      signal: options.signal,
    })

  // Strict pass (SCL cloud mask). If it classifies zero valid pixels — e.g. a
  // hazy / partly-cloudy scene masked the whole AOI — retry without the cloud
  // mask so the legend reports real per-class areas instead of all-zeros.
  let histogram = await runHistogram(false, options.maxCloudCoverage)
  let computed = histogram ? computeClassAreaRows(histogram, classCount, pixelAreaM2) : null

  if (!computed || computed.totalCount === 0) {
    const relaxedHistogram = await runHistogram(true, Math.max(options.maxCloudCoverage ?? 0, 95))
    if (relaxedHistogram) {
      const relaxedComputed = computeClassAreaRows(relaxedHistogram, classCount, pixelAreaM2)
      if (relaxedComputed.totalCount > 0) {
        histogram = relaxedHistogram
        computed = relaxedComputed
      }
    }
  }

  if (!histogram || !computed) return null

  const aoiAreaM2 = geodesicAreaM2(geometry)
  return {
    rows: computed.rows,
    aoiAreaM2,
    analyzedAreaM2: computed.analyzedAreaM2,
    sampleCount: computed.sampleCount,
    // The engine may resolve a nearby scene when the exact day has no usable
    // acquisition — report the actual scene date that produced the pixels.
    sceneDate: histogram.date || sceneDate,
  }
}

/** Human-readable area: ha with adaptive precision. */
export function formatAreaHa(areaHa: number): string {
  if (!Number.isFinite(areaHa) || areaHa <= 0) return '0'
  if (areaHa >= 100) return areaHa.toFixed(0)
  if (areaHa >= 1) return areaHa.toFixed(1)
  return areaHa.toFixed(2)
}

/** Human-readable area in m² with thousands separators. */
export function formatAreaM2(areaM2: number): string {
  if (!Number.isFinite(areaM2) || areaM2 <= 0) return '0'
  return Math.round(areaM2).toLocaleString('en-US')
}

/** Human-readable area in km² with adaptive precision. */
export function formatAreaKm2(areaKm2: number): string {
  if (!Number.isFinite(areaKm2) || areaKm2 <= 0) return '0'
  if (areaKm2 >= 100) return areaKm2.toFixed(0)
  if (areaKm2 >= 1) return areaKm2.toFixed(2)
  return areaKm2.toFixed(3)
}
