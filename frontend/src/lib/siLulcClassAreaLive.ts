/**
 * LULC class-area stats — pixel counts × sampling resolution → ha / m².
 * Uses the same temporal classify rules as the Live Analysis map layer.
 */

import { fetchSentinelIndexClassHistogramForSceneDate } from './sentinelHubStatisticsApi'
import {
  computeClassAreaRows,
  geodesicAreaM2,
  pixelAreaM2ForResolution,
  type LayerClassAreaResult,
  type LayerClassAreaRow,
} from './siLayerClassAreaEngine'
import {
  LULC_CLASS_AREA_FAST_DATES,
  LULC_CLASS_AREA_MAX_DATES,
  LULC_HISTOGRAM_SEARCH_WINDOW_DAYS,
  LULC_MAP_CLASSES,
  LULC_NATIVE_GSD_M,
  isLulcClassificationLayerId,
} from './siLulcClassification'
import {
  LULC_HISTOGRAM_BIN_EDGES,
  buildLulcHistogramEvalscript,
} from './siLulcClassificationEvalscript'
import type { ImageryTimeSeriesLayerSeries } from '../pages/dashboards/agroCloudPlatform/acpImageryTimeSeries'

export type LulcClassAreaRow = LayerClassAreaRow & {
  classId: number
  key: string
  name: string
  color: string
  agricultural: boolean
}

export type LulcClassAreaSceneResult = {
  sceneDate: string
  rows: LulcClassAreaRow[]
  aoiAreaM2: number
  analyzedAreaM2: number
  sampleCount: number
  resolutionMeters: number
  pixelAreaM2: number
}

function unwrapGeometry(
  geometry: GeoJSON.Geometry | GeoJSON.Feature,
): GeoJSON.Geometry | null {
  if ((geometry as GeoJSON.Feature).type === 'Feature') {
    return (geometry as GeoJSON.Feature).geometry ?? null
  }
  return geometry as GeoJSON.Geometry
}

function attachLulcClassMeta(rows: LayerClassAreaRow[]): LulcClassAreaRow[] {
  return rows.map(row => {
    const cls = LULC_MAP_CLASSES[row.classIndex]
    return {
      ...row,
      classId: cls?.id ?? row.classIndex,
      key: cls?.key ?? `class-${row.classIndex}`,
      name: cls?.name ?? `Class ${row.classIndex}`,
      color: cls?.color ?? '#888888',
      agricultural: Boolean(cls?.agricultural),
    }
  })
}

/** Sample observation dates evenly for histogram fetches. */
export function sampleLulcClassAreaDates(
  dates: string[],
  maxDates = LULC_CLASS_AREA_MAX_DATES,
): string[] {
  const unique = [...new Set(dates.map(d => d.trim().slice(0, 10)).filter(Boolean))].sort()
  if (unique.length <= maxDates) return unique
  if (maxDates <= 1) return unique.length ? [unique[unique.length - 1]!] : []
  const out: string[] = []
  for (let i = 0; i < maxDates; i += 1) {
    const idx = Math.round((i * (unique.length - 1)) / (maxDates - 1))
    out.push(unique[idx]!)
  }
  return [...new Set(out)]
}

export function isLulcTimeSeriesSelection(layerIds: string[]): boolean {
  return layerIds.some(id => isLulcClassificationLayerId(id))
}

/**
 * Single-scene LULC class areas inside the AOI.
 * Prefers WMS GetMap + pixel counts (same temporal classify as the map overlay).
 * Falls back to Statistical API histogram when WMS is unavailable.
 */
export async function fetchLulcClassAreas(options: {
  geometry: GeoJSON.Geometry | GeoJSON.Feature
  sceneDate: string
  resolutionMeters?: number
  searchWindowDays?: number
  signal?: AbortSignal
}): Promise<LulcClassAreaSceneResult | null> {
  const geometry = unwrapGeometry(options.geometry)
  if (!geometry) return null
  const sceneDate = String(options.sceneDate || '').trim().slice(0, 10)
  if (!sceneDate) return null

  const resolutionMeters = options.resolutionMeters ?? LULC_NATIVE_GSD_M
  const searchWindowDays = options.searchWindowDays ?? LULC_HISTOGRAM_SEARCH_WINDOW_DAYS

  // Primary: WMS class-index mosaic — matches Live Analysis colors in the AOI.
  try {
    const { fetchLulcClassAreasViaWms } = await import('./siLulcClassAreaWms')
    const wms = await fetchLulcClassAreasViaWms({
      geometry,
      sceneDate,
      resolutionMeters,
      searchWindowDays,
      signal: options.signal,
    })
    if (wms && wms.sampleCount > 0) {
      const totalCount = wms.sampleCount
      const px = wms.pixelAreaM2
      const rows = attachLulcClassMeta(
        wms.counts.map((count, classIndex) => {
          const areaM2 = count * px
          return {
            classIndex,
            count,
            areaM2,
            areaHa: areaM2 / 10_000,
            areaKm2: areaM2 / 1_000_000,
            pctOfAoi: totalCount > 0 ? (count / totalCount) * 100 : 0,
          }
        }),
      )
      return {
        sceneDate: wms.sceneDate,
        rows,
        aoiAreaM2: wms.aoiAreaM2,
        analyzedAreaM2: wms.analyzedAreaM2,
        sampleCount: wms.sampleCount,
        resolutionMeters: Math.sqrt(px),
        pixelAreaM2: px,
      }
    }
  } catch (err) {
    if (options.signal?.aborted) throw err
    console.warn('[lulc-class-area] WMS path failed, trying Statistical API', err)
  }

  const pixelAreaM2 = pixelAreaM2ForResolution(resolutionMeters)
  const evalscript = buildLulcHistogramEvalscript()

  const histogram = await fetchSentinelIndexClassHistogramForSceneDate({
    geometry,
    sceneDate,
    evalscript,
    outputId: 'idx',
    binEdges: LULC_HISTOGRAM_BIN_EDGES,
    resolutionMeters,
    searchWindowDays,
    mosaicAcrossWindow: true,
    signal: options.signal,
  })
  if (!histogram?.bins?.length) return null

  const { rows, analyzedAreaM2, sampleCount, totalCount } = computeClassAreaRows(
    histogram,
    LULC_MAP_CLASSES.length,
    pixelAreaM2,
    { matchByLowEdge: true, foldExtremes: false },
  )
  if (totalCount <= 0) return null

  return {
    sceneDate,
    rows: attachLulcClassMeta(rows),
    aoiAreaM2: geodesicAreaM2(geometry),
    analyzedAreaM2,
    sampleCount,
    resolutionMeters,
    pixelAreaM2,
  }
}

/** Adapt LULC scene result to the shared LayerClassAreaResult shape (legend UI). */
export function lulcSceneToLayerClassAreaResult(
  scene: LulcClassAreaSceneResult,
): LayerClassAreaResult {
  return {
    rows: scene.rows.map(({ classIndex, count, areaM2, areaHa, areaKm2, pctOfAoi }) => ({
      classIndex,
      count,
      areaM2,
      areaHa,
      areaKm2,
      pctOfAoi,
    })),
    aoiAreaM2: scene.aoiAreaM2,
    analyzedAreaM2: scene.analyzedAreaM2,
    sampleCount: scene.sampleCount,
    sceneDate: scene.sceneDate,
    classificationMode: 'fixed',
  }
}

export type LulcClassAreaTimeSeriesProgress = {
  done: number
  total: number
  message: string
}

/**
 * Multi-date LULC class-area time series for Imagery Time Series charts.
 * Series values are always stored in hectares; convert to m² in the UI when needed.
 * Default `maxDates` is the fast single-scene path for class-share charts.
 */
export async function fetchLulcClassAreaTimeSeries(options: {
  geometry: GeoJSON.Geometry | GeoJSON.Feature
  dates: string[]
  maxDates?: number
  signal?: AbortSignal
  onProgress?: (p: LulcClassAreaTimeSeriesProgress) => void
}): Promise<{ labels: string[]; series: ImageryTimeSeriesLayerSeries[] }> {
  const maxDates = options.maxDates ?? LULC_CLASS_AREA_FAST_DATES
  const dates = sampleLulcClassAreaDates(options.dates, maxDates)
  if (!dates.length) return { labels: [], series: [] }

  const classValues = LULC_MAP_CLASSES.map(() => [] as Array<number | null>)
  const labels: string[] = []

  for (let i = 0; i < dates.length; i += 1) {
    if (options.signal?.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError')
    }
    const sceneDate = dates[i]!
    options.onProgress?.({
      done: i,
      total: dates.length,
      message:
        dates.length === 1
          ? 'Computing LULC class share…'
          : `LULC class areas ${i + 1}/${dates.length}…`,
    })

    let scene: LulcClassAreaSceneResult | null = null
    try {
      scene = await fetchLulcClassAreas({
        geometry: options.geometry,
        sceneDate,
        signal: options.signal,
      })
    } catch (err) {
      if (options.signal?.aborted) throw err
      scene = null
    }

    labels.push(sceneDate)
    for (let c = 0; c < LULC_MAP_CLASSES.length; c += 1) {
      const row = scene?.rows.find(r => r.classIndex === c)
      classValues[c]!.push(row && Number.isFinite(row.areaHa) ? row.areaHa : null)
    }
  }

  options.onProgress?.({
    done: dates.length,
    total: dates.length,
    message: 'LULC class areas ready',
  })

  const series: ImageryTimeSeriesLayerSeries[] = LULC_MAP_CLASSES.map((cls, index) => ({
    layerId: `LULC:${cls.key}`,
    values: classValues[index]!,
    label: cls.name,
    color: cls.color,
    valueUnit: 'ha' as const,
  }))

  return { labels, series }
}

/** Short X-axis labels for composition charts (Water, Trees, Crops, …). */
export const LULC_COMPOSITION_SHORT_LABELS: Record<string, string> = {
  water: 'Water',
  trees: 'Trees',
  flooded: 'Flooded',
  crops: 'Crops',
  built: 'Built',
  bare: 'Bare',
  snow: 'Snow',
  clouds: 'Clouds',
  rangeland: 'Range',
}

export type LulcClassCompositionStat = {
  key: string
  name: string
  shortLabel: string
  color: string
  areaHa: number
  areaM2: number
  /** Pixel count at native 10 m GSD (areaHa × 100). */
  pixelCount: number
  /** Share of total classified pixels / area for the scene (%). */
  pctOfTotal: number
}

/**
 * Build LULC class statistics for one date index from hectare series.
 * Area (ha) → pixel count via 10 m GSD (100 m²/px → count = ha × 100).
 * Percentage = class area ÷ sum(class areas) × 100.
 *
 * When `includeAllClasses` is true (default), every map class appears in legend
 * order — even at 0% — so the chart always shows the full LULC schema.
 */
export function buildLulcClassCompositionStats(
  series: ImageryTimeSeriesLayerSeries[],
  dateIndex: number,
  options?: { minPct?: number; includeAllClasses?: boolean },
): LulcClassCompositionStat[] {
  const minPct = options?.minPct ?? 0
  const includeAll = options?.includeAllClasses !== false

  const byKey = new Map<string, { name: string; color: string; areaHa: number }>()
  for (const entry of series) {
    const raw = entry.values[dateIndex]
    const key = entry.layerId.includes(':')
      ? entry.layerId.split(':')[1]!
      : entry.layerId.toLowerCase()
    const areaHa =
      raw != null && Number.isFinite(raw) && Number(raw) > 0 ? Number(raw) : 0
    byKey.set(key, {
      name: entry.label || key,
      color: entry.color || '#888888',
      areaHa,
    })
  }

  const sourceClasses = includeAll
    ? LULC_MAP_CLASSES.map(cls => ({
        key: cls.key,
        name: cls.name,
        color: cls.color,
        areaHa: byKey.get(cls.key)?.areaHa ?? 0,
      }))
    : [...byKey.entries()]
        .map(([key, row]) => ({ key, ...row }))
        .filter(r => r.areaHa > 0)

  const totalHa = sourceClasses.reduce((s, r) => s + r.areaHa, 0)
  if (totalHa <= 0 && !includeAll) return []
  if (totalHa <= 0 && includeAll) {
    return sourceClasses.map(r => ({
      key: r.key,
      name: r.name,
      shortLabel: LULC_COMPOSITION_SHORT_LABELS[r.key] || r.name,
      color: r.color,
      areaHa: 0,
      areaM2: 0,
      pixelCount: 0,
      pctOfTotal: 0,
    }))
  }

  const rows = sourceClasses.map(r => {
    const pctOfTotal = totalHa > 0 ? (r.areaHa / totalHa) * 100 : 0
    const areaM2 = r.areaHa * 10_000
    return {
      key: r.key,
      name: r.name,
      shortLabel: LULC_COMPOSITION_SHORT_LABELS[r.key] || r.name,
      color: r.color,
      areaHa: r.areaHa,
      areaM2,
      pixelCount: Math.round(r.areaHa * 100),
      pctOfTotal,
    }
  })

  if (includeAll) return rows
  return rows.filter(r => r.pctOfTotal >= minPct).sort((a, b) => b.pctOfTotal - a.pctOfTotal)
}

/** Total classified pixels across composition rows. */
export function lulcCompositionTotalPixels(rows: LulcClassCompositionStat[]): number {
  return rows.reduce((s, r) => s + r.pixelCount, 0)
}
