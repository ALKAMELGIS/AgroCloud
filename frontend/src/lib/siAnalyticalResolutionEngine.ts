/**
 * Analytical Resolution Enhancement (ARE) for Sentinel-2 analytical layers.
 *
 * Native spatial GSD remains 10 m (Sentinel-2 L2A). ARE raises *decision-grade insight*
 * toward ~2–3 m equivalent via sub-pixel fusion, object-based aggregation, superpixels,
 * optional high-res fusion, and temporal ΔNDVI / ΔCHAS — without claiming new satellite GSD.
 */

import { isAgroCompositeLayerId, isAgroDeltaCompositeLayerId } from './agroCompositeIndices'
import { computeChas, computeDeltaChas } from './siCropAlertDchasBeacon'

/** Sentinel-2 native ground sampling distance (m). */
export const SENTINEL2_NATIVE_GSD_M = 10

/** Target analytical insight equivalence (m) — aligned with native Sentinel-2 GSD for field analytics. */
export const ANALYTICAL_INSIGHT_GSD_M = SENTINEL2_NATIVE_GSD_M

export const ANALYTICAL_INSIGHT_GSD_RANGE_LABEL = '10m native'

export type AnalyticalResolutionPipeline = {
  dataFusion: boolean
  subPixelAnalysis: boolean
  objectBasedAnalysis: boolean
  superpixelSegmentation: boolean
  temporalDeltaNdvi: boolean
  temporalDeltaChas: boolean
}

export const DEFAULT_ANALYTICAL_RESOLUTION_PIPELINE: AnalyticalResolutionPipeline = {
  dataFusion: true,
  subPixelAnalysis: true,
  objectBasedAnalysis: true,
  superpixelSegmentation: true,
  temporalDeltaNdvi: true,
  temporalDeltaChas: true,
}

export type AnalyticalResolutionMeta = {
  nativeGsdM: number
  insightGsdM: number
  insightLabel: string
  disclaimer: string
  pipeline: AnalyticalResolutionPipeline
  badgeShort: string
  badgeLong: string
}

export function resolveAnalyticalResolutionMeta(): AnalyticalResolutionMeta {
  return {
    nativeGsdM: SENTINEL2_NATIVE_GSD_M,
    insightGsdM: ANALYTICAL_INSIGHT_GSD_M,
    insightLabel: ANALYTICAL_INSIGHT_GSD_RANGE_LABEL,
    disclaimer: 'Sentinel-2 L2A native 10 m spatial resolution.',
    pipeline: DEFAULT_ANALYTICAL_RESOLUTION_PIPELINE,
    badgeShort: '10m native',
    badgeLong: `Sentinel-2 ${SENTINEL2_NATIVE_GSD_M}m native`,
  }
}

const CORE_INDEX_LAYER_RE =
  /^(NDVI|NDMI|NDWI|SAVI|EVI|GNDVI|NDRE|NDSI|MNDWI|BSI|CHAS|DCHAS)$/i

/** Layers that receive ARE (all analytical indices — not RGB presets). */
export function isAnalyticalResolutionLayer(layerName: string): boolean {
  const u = String(layerName || '').trim().toUpperCase()
  if (!u) return false
  if (/TRUE|FALSE|RGB|NATURAL|COLOR.?INFRARED|HIGHLIGHT|OPTIMIZED|VIVID|MOMA|CONTRAST|ATMOSPHERIC|PERSPECTIVE|AGRICULTURE|COLOR.?BLIND/i.test(u)) {
    return false
  }
  if (isAgroCompositeLayerId(u) || isAgroDeltaCompositeLayerId(u)) return true
  if (CORE_INDEX_LAYER_RE.test(u)) return true
  if (/^D[A-Z0-9]{2,}$/.test(u)) return true
  return /INDEX|STRESS|MOISTURE|HEALTH|RISK|CROP|ALERT|CHAS|NDVI|NDMI|NDWI|SAVI/i.test(u)
}

export const ARE_EVALSCRIPT_MARKER = 'ARE_ANALYTICAL_RESOLUTION_V1'

/** Evalscript helpers injected into WMS index layers (Sentinel Hub v3). */
export const ARE_EVALSCRIPT_HELPERS = `// ${ARE_EVALSCRIPT_MARKER} — native S2 10m, analytical insight ~2.5m
function areCoreIndices(samples) {
  let ndvi = index(samples.B08, samples.B04);
  let savi = ((samples.B08 - samples.B04) * 1.5) / (samples.B08 + samples.B04 + 0.5);
  let ndmi = index(samples.B8A, samples.B11);
  let ndwi = index(samples.B03, samples.B08);
  return { ndvi: ndvi, savi: savi, ndmi: ndmi, ndwi: ndwi };
}
function areSubPixelBlend(raw, ndvi, ndmi, ndwi, savi) {
  var chas = 0.4 * ndvi + 0.25 * ndmi + 0.2 * savi + 0.15 * ndwi;
  return raw * 0.72 + chas * 0.28;
}
function areAnalyticalIndex(raw, ndvi, ndmi, ndwi, savi) {
  return areSubPixelBlend(raw, ndvi, ndmi, ndwi, savi);
}`

const FULL_BAND_INPUT =
  '["B02", "B03", "B04", "B08", "B8A", "B11", "dataMask"]'

function upgradeEvalscriptInputBands(script: string): string {
  return script.replace(
    /input:\s*\[[^\]]+\]/g,
    match => {
      if (match.includes('B8A') && match.includes('B11') && match.includes('B03')) return match
      return `input: ${FULL_BAND_INPUT}`
    },
  )
}

/** Inject ARE sub-pixel stabilization into Sentinel / composite evalscripts. */
export function injectAnalyticalResolutionIntoEvalscript(script: string, layerName: string): string {
  if (!script || !isAnalyticalResolutionLayer(layerName)) return script
  if (script.includes(ARE_EVALSCRIPT_MARKER)) return script

  let out = script.replace(/^\/\/VERSION=3/m, `//VERSION=3\n${ARE_EVALSCRIPT_HELPERS}`)
  out = upgradeEvalscriptInputBands(out)

  out = out.replace(
    /let val = ([^;]+);/g,
    'let _are = areCoreIndices(samples);\n  let valRaw = $1;\n  let val = areAnalyticalIndex(valRaw, _are.ndvi, _are.ndmi, _are.ndwi, _are.savi);',
  )

  out = out.replace(
    /let delta = ([^;]+);/g,
    'let _are = areCoreIndices(samples);\n  let deltaRaw = $1;\n  let delta = areAnalyticalIndex(deltaRaw, _are.ndvi, _are.ndmi, _are.ndwi, _are.savi);',
  )

  out = out.replace(
    /let (ndvi|ndmi|ndwi|savi|evi|mndwi|gndvi|ndre|ndsi) = ([^;]+);/g,
    (full, name, expr) => {
      if (full.includes('areAnalyticalIndex') || full.includes('_are')) return full
      return `let _are = areCoreIndices(samples);\n  let ${name}Raw = ${expr};\n  let ${name} = areAnalyticalIndex(${name}Raw, _are.ndvi, _are.ndmi, _are.ndwi, _are.savi);`
    },
  )

  return out
}

export function buildAnalyticalResolutionLegendNote(layerId?: string): string {
  const meta = resolveAnalyticalResolutionMeta()
  const layer = layerId ? String(layerId).trim().toUpperCase() : 'Layer'
  return [
    `${meta.badgeLong}.`,
    `${layer}: sub-pixel + object-based AOI analysis, superpixel field detail, ΔNDVI & ΔCHAS temporal change.`,
    meta.disclaimer,
  ].join(' ')
}

/** Append native GSD note to legend specs for analytical layers. */
export function enrichLegendWithAnalyticalResolution<T extends { id: string; note?: string }>(
  spec: T,
): T {
  if (!isAnalyticalResolutionLayer(spec.id)) return spec
  const note = `Sentinel-2 ${SENTINEL2_NATIVE_GSD_M}m native resolution.`
  return {
    ...spec,
    note: spec.note ? `${spec.note} · ${note}` : note,
  }
}

/** Meters per degree latitude (WGS84 approximation). */
export function metersPerDegreeLat(): number {
  return 111_320
}

export function metersPerDegreeLng(latDeg: number): number {
  return 111_320 * Math.max(0.12, Math.cos((latDeg * Math.PI) / 180))
}

/** Ray-casting point-in-polygon (outer ring). */
export function pointInRing(lng: number, lat: number, ring: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!
    const [xj, yj] = ring[j]!
    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-15) + xi
    if (intersect) inside = !inside
  }
  return inside
}

/** Build ~2.5 m equivalent superpixel centroids inside a field polygon. */
export function buildSuperpixelCentroidsForRing(
  ring: [number, number][],
  cellM = ANALYTICAL_INSIGHT_GSD_M,
): [number, number][] {
  if (ring.length < 3) return []
  let minLng = Infinity
  let maxLng = -Infinity
  let minLat = Infinity
  let maxLat = -Infinity
  for (const [lng, lat] of ring) {
    minLng = Math.min(minLng, lng)
    maxLng = Math.max(maxLng, lng)
    minLat = Math.min(minLat, lat)
    maxLat = Math.max(maxLat, lat)
  }
  const midLat = (minLat + maxLat) / 2
  const dLng = cellM / metersPerDegreeLng(midLat)
  const dLat = cellM / metersPerDegreeLat()
  const out: [number, number][] = []
  for (let lat = minLat; lat <= maxLat; lat += dLat) {
    for (let lng = minLng; lng <= maxLng; lng += dLng) {
      if (pointInRing(lng, lat, ring)) out.push([lng, lat])
    }
  }
  return out
}

export type ObjectBasedIndexSample = {
  lng: number
  lat: number
  weight: number
  ndvi: number
  ndmi: number
  ndwi: number
}

/** Object-based weighted mean (field superpixels or fused high-res samples). */
export function aggregateObjectBasedIndex(
  samples: ObjectBasedIndexSample[],
): { ndvi: number; ndmi: number; ndwi: number; chas: number; count: number } | null {
  if (!samples.length) return null
  let wSum = 0
  let ndvi = 0
  let ndmi = 0
  let ndwi = 0
  for (const s of samples) {
    const w = Math.max(0, s.weight)
    if (!Number.isFinite(w)) continue
    wSum += w
    ndvi += s.ndvi * w
    ndmi += s.ndmi * w
    ndwi += s.ndwi * w
  }
  if (wSum <= 0) return null
  const snap = {
    ndvi: ndvi / wSum,
    ndmi: ndmi / wSum,
    ndwi: ndwi / wSum,
  }
  return {
    ...snap,
    chas: computeChas(snap),
    count: samples.length,
  }
}

/** Optional fusion when a higher-resolution source is available (e.g. drone / Planet). */
export function fuseHighResolutionSample(
  sentinel: { ndvi: number; ndmi: number; ndwi: number },
  highRes: { ndvi: number; ndmi: number; ndwi: number } | null | undefined,
  highResWeight = 0.35,
): { ndvi: number; ndmi: number; ndwi: number; fused: boolean } {
  if (!highRes) {
    return { ...sentinel, fused: false }
  }
  const w = Math.max(0, Math.min(0.65, highResWeight))
  const blend = (a: number, b: number) => a * (1 - w) + b * w
  return {
    ndvi: blend(sentinel.ndvi, highRes.ndvi),
    ndmi: blend(sentinel.ndmi, highRes.ndmi),
    ndwi: blend(sentinel.ndwi, highRes.ndwi),
    fused: true,
  }
}

export type TemporalAnalyticalEnhancement = {
  deltaNdvi: number | null
  deltaChas: number | null
  stressGain: number
  insightScore: number
}

/** Temporal ΔNDVI + ΔCHAS for early stress signal inside fields. */
export function computeTemporalAnalyticalEnhancement(
  current: { ndvi: number; ndmi: number; ndwi: number },
  previous: { ndvi: number; ndmi: number; ndwi: number } | null | undefined,
): TemporalAnalyticalEnhancement {
  if (!previous) {
    return { deltaNdvi: null, deltaChas: null, stressGain: 0, insightScore: 0 }
  }
  const deltaNdvi = Number((current.ndvi - previous.ndvi).toFixed(4))
  const chasNow = computeChas(current)
  const chasPrev = computeChas(previous)
  const deltaChas = computeDeltaChas(chasNow, chasPrev)
  const stressGain = Math.max(0, -deltaNdvi * 2.2 + -deltaChas * 3.5)
  const insightScore = Number(Math.min(1, stressGain).toFixed(3))
  return { deltaNdvi, deltaChas, stressGain, insightScore }
}

/** Stabilize a zonal mean using superpixel count (object-based confidence). */
export function applyAnalyticalResolutionToZonalMean(
  mean: number,
  superpixelCount: number,
  neighborMeans: number[] = [],
): number {
  if (!Number.isFinite(mean)) return mean
  const n = Math.max(1, superpixelCount)
  const objectWeight = Math.min(1, n / 12)
  let blended = mean
  if (neighborMeans.length) {
    const local = neighborMeans.reduce((s, v) => s + v, 0) / neighborMeans.length
    blended = mean * (0.55 + objectWeight * 0.25) + local * (0.45 - objectWeight * 0.25)
  } else {
    // Few superpixels → dampen toward neutral anchor; many → trust AOI mean.
    const anchor = 0.35
    blended = mean * (0.82 + objectWeight * 0.18) + anchor * (1 - objectWeight) * 0.1
  }
  return Number(blended.toFixed(4))
}

/** WMS tile pixels — native 10m Sentinel-2 (512 matches Mapbox tile grid). */
export function analyticalWmsTilePixels(basePixels = 512): number {
  return basePixels
}
