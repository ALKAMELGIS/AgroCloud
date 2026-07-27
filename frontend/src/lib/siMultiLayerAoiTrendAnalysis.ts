/**
 * Multi-Layer AOI Trend Analysis — compare multiple AOIs on a single acquisition date.
 * Caches per-field/day statistics to avoid redundant Sentinel Hub requests on toggle.
 */

import type { CropAlertFieldInput } from './siCropAlertEngine'
import type { SentinelHubDailyIndexMeans, SentinelHubIndexZonalStats } from './sentinelHubStatisticsApi'
import {
  evaluateImageryLayerDailyValue,
  type ImageryTimeSeriesLayerSeries,
} from '../pages/dashboards/agroCloudPlatform/acpImageryTimeSeries'
import { geodesicAreaM2 } from './siLayerClassAreaEngine'
import { subtractDaysFromIso } from './siSentinelImageryDate'
import {
  fetchSentinelFieldIndexTimeSeriesForRange,
  hasValidIndexDaily,
  mergeDailyIndexSeries,
} from './sentinelHubStatisticsApi'

export type SiImageryAnalysisMode =
  | 'single-layer-trend'
  | 'multi-layer-aoi-comparison'
  | 'plot-layer-time-series'

/** Lookback window when resolving a single acquisition date (matches time-series panel). */
export const MULTI_LAYER_AOI_LOOKBACK_DAYS = 90
/** Max days from target date to accept a nearest clear scene. */
export const MULTI_LAYER_AOI_MAX_SCENE_OFFSET_DAYS = 30

export type MultiLayerAoiIndexStats = {
  layerId: string
  mean: number | null
  min: number | null
  max: number | null
  median: number | null
  stdDev: number | null
}

export type MultiLayerAoiTrendResult = {
  fieldKey: string
  fieldName: string
  areaHa: number
  sceneDate: string
  dailyRow: SentinelHubDailyIndexMeans | null
  indices: MultiLayerAoiIndexStats[]
}

/** Zonal statistic plotted on the multi-AOI comparison chart. */
export type MultiLayerAoiChartStat = 'max' | 'mean' | 'min'

export function resolveMultiLayerAoiChartStatValue(
  stats: MultiLayerAoiIndexStats | undefined,
  stat: MultiLayerAoiChartStat,
): number | null {
  if (!stats) return null
  const value = stats[stat]
  return value != null && Number.isFinite(value) ? value : null
}

const RESULT_CACHE_MAX = 96
const resultCache = new Map<string, MultiLayerAoiTrendResult>()

function trimCache<K, V>(map: Map<K, V>, max: number): void {
  while (map.size > max) {
    const first = map.keys().next().value
    if (first === undefined) break
    map.delete(first)
  }
}

export function multiLayerAoiTrendCacheKey(
  fieldKey: string,
  sceneDate: string,
  layerIds: string[],
): string {
  const layers = [...layerIds].map(id => id.trim().toUpperCase()).sort().join(',')
  return `${fieldKey}|${sceneDate.slice(0, 10)}|${layers}`
}

function zonalKeyForLayer(layerId: string): keyof NonNullable<SentinelHubDailyIndexMeans['zonal']> | null {
  const id = layerId.trim().toUpperCase()
  switch (id) {
    case 'NDVI':
      return 'ndvi'
    case 'NDMI':
      return 'ndmi'
    case 'NDWI':
      return 'ndwi'
    case 'EVI':
      return 'evi'
    case 'SAVI':
      return 'savi'
    case 'NDSI':
      return 'ndsi'
    default:
      return null
  }
}

function estimateMedianFromZonal(z: SentinelHubIndexZonalStats): number {
  return Number(((z.min + 2 * z.mean + z.max) / 4).toFixed(4))
}

function estimateStdDevFromZonal(z: SentinelHubIndexZonalStats): number {
  const range = z.max - z.min
  if (!Number.isFinite(range) || range <= 0) return 0
  return Number((range / 4).toFixed(4))
}

export function resolveMultiLayerAoiIndexStats(
  layerId: string,
  row: SentinelHubDailyIndexMeans | null | undefined,
): MultiLayerAoiIndexStats {
  if (!row) {
    return { layerId, mean: null, min: null, max: null, median: null, stdDev: null }
  }
  const mean = evaluateImageryLayerDailyValue(layerId, row)
  const zKey = zonalKeyForLayer(layerId)
  const zonal = zKey ? row.zonal?.[zKey] : undefined
  if (zonal && Number.isFinite(zonal.mean)) {
    return {
      layerId,
      mean: mean ?? zonal.mean,
      min: Number.isFinite(zonal.min) ? zonal.min : mean,
      max: Number.isFinite(zonal.max) ? zonal.max : mean,
      median: estimateMedianFromZonal(zonal),
      stdDev: estimateStdDevFromZonal(zonal),
    }
  }
  const v = mean
  return {
    layerId,
    mean: v,
    min: v,
    max: v,
    median: v,
    stdDev: v != null ? 0 : null,
  }
}

export function resolveFieldAreaHa(geometry: GeoJSON.Geometry | null | undefined): number {
  if (!geometry) return 0
  const m2 = geodesicAreaM2(geometry)
  return Number.isFinite(m2) && m2 > 0 ? Number((m2 / 10_000).toFixed(2)) : 0
}

export function buildMultiLayerAoiTrendResult(
  field: CropAlertFieldInput,
  sceneDate: string,
  layerIds: string[],
  dailyRow: SentinelHubDailyIndexMeans | null,
): MultiLayerAoiTrendResult {
  const requestedDay = sceneDate.trim().slice(0, 10)
  const resolvedDay = dailyRow?.date?.trim().slice(0, 10) || requestedDay
  return {
    fieldKey: field.fieldKey,
    fieldName: field.farmName || field.fieldKey,
    areaHa: resolveFieldAreaHa(field.geometry),
    sceneDate: resolvedDay,
    dailyRow,
    indices: layerIds.map(layerId => resolveMultiLayerAoiIndexStats(layerId, dailyRow)),
  }
}

function rowHasLayerData(row: SentinelHubDailyIndexMeans, layerIds: string[]): boolean {
  if (!layerIds.length) {
    return row.ndvi != null || row.ndmi != null || row.ndwi != null || row.evi != null
  }
  return layerIds.some(id => {
    const v = evaluateImageryLayerDailyValue(id, row)
    return v != null && Number.isFinite(v)
  })
}

export function pickDailyRowForScene(
  rows: SentinelHubDailyIndexMeans[],
  sceneDate: string,
  layerIds: string[] = [],
): SentinelHubDailyIndexMeans | null {
  const day = sceneDate.trim().slice(0, 10)
  const usable = rows.filter(row => rowHasLayerData(row, layerIds))
  if (!usable.length) return null

  const exact = usable.find(r => r.date.slice(0, 10) === day)
  if (exact) return exact

  let best: SentinelHubDailyIndexMeans | null = null
  let bestDist = Infinity
  const target = Date.parse(`${day}T12:00:00Z`)
  for (const row of usable) {
    const dist = Math.abs(Date.parse(`${row.date.slice(0, 10)}T12:00:00Z`) - target)
    if (dist < bestDist) {
      bestDist = dist
      best = row
    }
  }
  const maxOffsetMs = MULTI_LAYER_AOI_MAX_SCENE_OFFSET_DAYS * 86400000
  return bestDist <= maxOffsetMs ? best : null
}

/** Fetch zonal stats for one field, resolving nearest clear scene to target date. */
export async function fetchMultiLayerAoiFieldDailyRow(
  field: CropAlertFieldInput,
  targetSceneDate: string,
  layerIds: string[],
  options?: { signal?: AbortSignal; lookbackDays?: number; fromIso?: string },
): Promise<SentinelHubDailyIndexMeans | null> {
  if (!field.geometry) return null
  const day = targetSceneDate.trim().slice(0, 10)
  if (!day) return null
  const lookback = options?.lookbackDays ?? MULTI_LAYER_AOI_LOOKBACK_DAYS
  let fromIso = options?.fromIso?.trim().slice(0, 10) || subtractDaysFromIso(day, lookback)
  if (fromIso >= day) fromIso = subtractDaysFromIso(day, lookback)

  let rows = await fetchSentinelFieldIndexTimeSeriesForRange({
    geometry: field.geometry,
    fromIso,
    toIso: day,
    maxCloudCoverage: 65,
    layerIds,
    signal: options?.signal,
  })

  let picked = pickDailyRowForScene(rows, day, layerIds)
  if (picked || options?.signal?.aborted) return picked

  const relaxed = await fetchSentinelFieldIndexTimeSeriesForRange({
    geometry: field.geometry,
    fromIso,
    toIso: day,
    maxCloudCoverage: 95,
    relaxedCloudMask: true,
    layerIds,
    signal: options?.signal,
  })
  rows = mergeDailyIndexSeries(rows, relaxed)
  if (!hasValidIndexDaily(rows)) return null
  return pickDailyRowForScene(rows, day, layerIds)
}

export function getCachedMultiLayerAoiTrendResult(
  field: CropAlertFieldInput,
  sceneDate: string,
  layerIds: string[],
  dailyRow: SentinelHubDailyIndexMeans | null,
): MultiLayerAoiTrendResult {
  const key = multiLayerAoiTrendCacheKey(field.fieldKey, sceneDate, layerIds)
  const hit = resultCache.get(key)
  if (hit) return hit
  const result = buildMultiLayerAoiTrendResult(field, sceneDate, layerIds, dailyRow)
  resultCache.set(key, result)
  trimCache(resultCache, RESULT_CACHE_MAX)
  return result
}


export function buildMultiLayerAoiTrendChartSeries(
  results: MultiLayerAoiTrendResult[],
  layerIds: string[],
  stat: MultiLayerAoiChartStat = 'mean',
): { aoiLabels: string[]; layerSeries: ImageryTimeSeriesLayerSeries[] } {
  const aoiLabels = results.map(r => r.fieldName)
  const layerSeries: ImageryTimeSeriesLayerSeries[] = layerIds.map(layerId => {
    const id = layerId.trim().toUpperCase()
    const values = results.map(result => {
      const stats = result.indices.find(i => i.layerId.trim().toUpperCase() === id)
      return resolveMultiLayerAoiChartStatValue(stats, stat)
    })
    return {
      layerId: id,
      values,
    }
  })
  return { aoiLabels, layerSeries }
}

export function clearMultiLayerAoiTrendCache(): void {
  resultCache.clear()
}
