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
  buildEtIndexExpr,
  etFineHistogramEdges,
  etPercentileClassEdgesFromFineBins,
  etSeasonFactor,
  rebinFineHistogramToClassCounts,
  SENTINEL_ET_10_CLASS_BREAKS,
} from './etIndex'
import {
  SENTINEL_NDMI_10_CLASS_BREAKS,
  SENTINEL_NDVI_10_CLASS_BREAKS,
  SENTINEL_NDWI_10_CLASS_BREAKS,
} from './sentinelHubWmsIndexEvalscripts'
import {
  fetchSentinelIndexClassHistogramForSceneDate,
  type SentinelHubGenericHistogram,
} from './sentinelHubStatisticsApi'
import { isLulcClassificationLayerId } from './siLulcClassification'

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
  /**
   * Class break edges used for this result (length = classes + 1).
   * For ET this is the AOI percentile ramp when available.
   */
  classEdges?: number[]
  /** Classification mode: fixed catalog breaks vs AOI-relative percentiles. */
  classificationMode?: 'fixed' | 'percentile'
}

const CORE_INDEX_EXPR: Record<string, string> = {
  NDVI: 'ndvi',
  NDWI: 'ndwi',
  NDMI: 'ndmi',
  SAVI: 'savi',
  // Placeholder — ET expression is rebuilt per scene date (season factor).
  ET: buildEtIndexExpr(0.85),
}

/** Numeric class edges + index expression for a layer, or null if unsupported. */
export function resolveLayerClassBreakdown(layerId: string): LayerClassBreakdown | null {
  const u = String(layerId || '').trim().toUpperCase()
  if (!u) return null

  if (isAgroCompositeLayerId(u) && !isAgroDeltaCompositeLayerId(u) && u !== 'CHAS_ALERT' && u !== 'STRESS_ZONES') {
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
  if (u === 'ET') {
    // Absolute fallback edges; AOI percentile edges replace these after the fine histogram pass.
    return { edges: [0, ...SENTINEL_ET_10_CLASS_BREAKS, 10], indexExpr: buildEtIndexExpr(0.85) }
  }
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

/** True when this layer can report per-class area (single-scene index or LULC). */
export function layerSupportsClassArea(layerId: string): boolean {
  if (isLulcClassificationLayerId(layerId)) return true
  return resolveLayerClassBreakdown(layerId) != null
}

/** WMS-fallback classification marker for plain index value histograms. */
function indexValueHistogramMarker(layerId: string, edges: number[]): string | null {
  const u = String(layerId || '').trim().toUpperCase()
  const index =
    u === 'NDWI'
      ? 'ndwi'
      : u === 'NDVI'
        ? 'ndvi'
        : u === 'SAVI'
          ? 'savi'
          : u === 'ET'
            ? 'et'
            : u === 'LST'
              ? 'lst'
              : null
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
    input: [{ bands: ["B02", "B03", "B04", "B05", "B06", "B08", "B11", "B12", "SCL", "dataMask"] }],
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
 *
 * `matchByLowEdge` maps each bin via `floor(lowEdge)` → class index (required for
 * discrete LULC indices when the API omits empty bins). `foldExtremes` adds
 * underflow/overflow into the first/last class (index layers); disable for LULC
 * so underflow is not counted as Water.
 */
export function computeClassAreaRows(
  histogram: SentinelHubGenericHistogram,
  classCount: number,
  pixelAreaM2: number,
  options?: { matchByLowEdge?: boolean; foldExtremes?: boolean },
): { rows: LayerClassAreaRow[]; analyzedAreaM2: number; sampleCount: number; totalCount: number } {
  const counts = new Array<number>(classCount).fill(0)
  const sorted = [...histogram.bins].sort((a, b) => a.lowEdge - b.lowEdge)
  const matchByLowEdge = options?.matchByLowEdge === true
  const foldExtremes = options?.foldExtremes !== false

  if (matchByLowEdge) {
    for (const bin of sorted) {
      const idx = Math.floor(Number(bin.lowEdge))
      if (!Number.isFinite(idx) || idx < 0 || idx >= classCount) continue
      counts[idx]! += Math.max(0, Number(bin.count) || 0)
    }
  } else {
    for (let i = 0; i < sorted.length && i < classCount; i += 1) {
      counts[i] = Math.max(0, Number(sorted[i]!.count) || 0)
    }
  }

  if (foldExtremes && classCount > 0) {
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
 * End-to-end: resolve class breaks → fetch index histogram inside the AOI →
 * per-class areas. Most layers use FIXED catalog breaks. ET uses a fine
 * histogram then AOI-relative percentiles (deciles) so Very Low…Exceptional
 * each get ~10% of the AOI distribution for that scene date.
 */
export async function fetchLayerClassAreas(
  options: FetchLayerClassAreasOptions,
): Promise<LayerClassAreaResult | null> {
  if (isLulcClassificationLayerId(options.layerId)) {
    // Dynamic import avoids a circular dependency with siLulcClassAreaLive.
    const { fetchLulcClassAreas, lulcSceneToLayerClassAreaResult } = await import('./siLulcClassAreaLive')
    const scene = await fetchLulcClassAreas({
      geometry: options.geometry,
      sceneDate: options.sceneDate,
      resolutionMeters: options.resolutionMeters,
      signal: options.signal,
    })
    return scene ? lulcSceneToLayerClassAreaResult(scene) : null
  }

  const breakdown = resolveLayerClassBreakdown(options.layerId)
  if (!breakdown) return null

  const geometry =
    (options.geometry as GeoJSON.Feature).type === 'Feature'
      ? (options.geometry as GeoJSON.Feature).geometry
      : (options.geometry as GeoJSON.Geometry)
  if (!geometry) return null

  const sceneDate = String(options.sceneDate || '').trim().slice(0, 10)
  if (!sceneDate) return null

  if (options.signal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError')
  }

  const layerU = String(options.layerId || '').trim().toUpperCase()
  const isEt = layerU === 'ET'
  const season = isEt ? etSeasonFactor(sceneDate) : 0.85
  const indexExpr = isEt ? buildEtIndexExpr(season) : breakdown.indexExpr
  const classCount = isEt ? 10 : breakdown.edges.length - 1
  const histEdges = isEt ? etFineHistogramEdges(15, 0.25) : breakdown.edges
  const resolutionMeters = options.resolutionMeters ?? 10
  const pixelAreaM2 = pixelAreaM2ForResolution(resolutionMeters)
  const marker = indexValueHistogramMarker(options.layerId, isEt ? histEdges : breakdown.edges)

  const runHistogram = (opts: {
    relaxed: boolean
    maxCloudCoverage?: number
    searchWindowDays?: number
    edges: number[]
    expr: string
  }) =>
    fetchSentinelIndexClassHistogramForSceneDate({
      geometry,
      sceneDate,
      evalscript: buildLayerIndexEvalscript(opts.expr, marker, { relaxed: opts.relaxed }),
      outputId: 'idx',
      binEdges: opts.edges,
      maxCloudCoverage: opts.maxCloudCoverage,
      resolutionMeters,
      searchWindowDays: opts.searchWindowDays,
      signal: options.signal,
    })

  const finishFixed = (
    histogram: SentinelHubGenericHistogram | null,
  ): { histogram: SentinelHubGenericHistogram; computed: ReturnType<typeof computeClassAreaRows> } | null => {
    if (!histogram) return null
    const computed = computeClassAreaRows(histogram, classCount, pixelAreaM2)
    return computed.totalCount > 0 ? { histogram, computed } : null
  }

  const finishEtPercentile = (
    histogram: SentinelHubGenericHistogram | null,
  ): {
    histogram: SentinelHubGenericHistogram
    computed: ReturnType<typeof computeClassAreaRows>
    edges: number[]
    mode: 'fixed' | 'percentile'
  } | null => {
    if (!histogram || !histogram.bins.length) return null
    const pctEdges = etPercentileClassEdgesFromFineBins(histogram.bins, 10)
    const edges = pctEdges ?? [0, ...SENTINEL_ET_10_CLASS_BREAKS, 10]
    const mode: 'fixed' | 'percentile' = pctEdges ? 'percentile' : 'fixed'
    const finalCounts = rebinFineHistogramToClassCounts(histogram.bins, edges)

    const totalCount = finalCounts.reduce((s, c) => s + c, 0)
    if (totalCount <= 0) return null
    const px = pixelAreaM2 > 0 ? pixelAreaM2 : SENTINEL_STATS_PIXEL_AREA_M2
    const rows: LayerClassAreaRow[] = finalCounts.map((count, classIndex) => {
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
    return {
      histogram,
      edges,
      mode,
      computed: {
        rows,
        analyzedAreaM2: totalCount * px,
        sampleCount: histogram.sampleCount,
        totalCount,
      },
    }
  }

  // Fast path: one widened request (±12 days, relaxed cloud mask).
  let etHit:
    | {
        histogram: SentinelHubGenericHistogram
        computed: ReturnType<typeof computeClassAreaRows>
        edges: number[]
        mode: 'fixed' | 'percentile'
      }
    | null = null
  let fixedHit:
    | { histogram: SentinelHubGenericHistogram; computed: ReturnType<typeof computeClassAreaRows> }
    | null = null

  const first = await runHistogram({
    relaxed: true,
    maxCloudCoverage: Math.max(options.maxCloudCoverage ?? 0, 95),
    searchWindowDays: 12,
    edges: histEdges,
    expr: indexExpr,
  })

  if (isEt) {
    etHit = finishEtPercentile(first)
  } else {
    fixedHit = finishFixed(first)
  }

  if (options.signal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError')
  }

  if (!(isEt ? etHit : fixedHit)) {
    const second = await runHistogram({
      relaxed: false,
      maxCloudCoverage: options.maxCloudCoverage,
      edges: histEdges,
      expr: indexExpr,
    })
    if (isEt) etHit = finishEtPercentile(second)
    else fixedHit = finishFixed(second)
  }

  if (options.signal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError')
  }

  if (!(isEt ? etHit : fixedHit)) {
    const third = await runHistogram({
      relaxed: true,
      maxCloudCoverage: 100,
      searchWindowDays: 12,
      edges: histEdges,
      expr: indexExpr,
    })
    if (!third) return null
    if (isEt) {
      etHit = finishEtPercentile(third)
      if (!etHit) {
        etHit = {
          histogram: third,
          edges: [0, ...SENTINEL_ET_10_CLASS_BREAKS, 10],
          mode: 'fixed',
          computed: computeClassAreaRows(third, 10, pixelAreaM2),
        }
      }
    } else {
      fixedHit = { histogram: third, computed: computeClassAreaRows(third, classCount, pixelAreaM2) }
    }
  }

  const histogram = isEt ? etHit!.histogram : fixedHit!.histogram
  const computed = isEt ? etHit!.computed : fixedHit!.computed
  const aoiAreaM2 = geodesicAreaM2(geometry)
  return {
    rows: computed.rows,
    aoiAreaM2,
    analyzedAreaM2: computed.analyzedAreaM2,
    sampleCount: computed.sampleCount,
    sceneDate: histogram.date || sceneDate,
    classEdges: isEt ? etHit!.edges : breakdown.edges,
    classificationMode: isEt ? etHit!.mode : 'fixed',
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
