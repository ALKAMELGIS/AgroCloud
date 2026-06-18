import type { SentinelHubDailyIndexMeans } from '../../../lib/sentinelHubStatisticsApi'
import { computeChas, chasInputsFromDaily } from '../../../lib/chasIndex'
import {
  buildRemoteSensingLayerSelectGroups,
  flattenRemoteSensingLayerSelectGroups,
  isAgroDeltaCompositeLayerId,
  isAgroStaticCompositeLayerId,
  resolveAgroCompositeExpr,
  resolveAgroStaticLayerIdForDelta,
  type RemoteSensingLayerSelectGroup,
} from '../../../lib/agroCompositeIndices'
import { estimateSaviFromNdvi } from '../../../lib/siCropAlertDchasBeacon'

export type ImageryChartType = 'line' | 'area' | 'bar' | 'pie' | 'scatter'

/** Layer Live index catalog — same groups as Satellite Intelligence Remote Sensing. */
export function buildImageryTimeSeriesLayerGroups(): RemoteSensingLayerSelectGroup[] {
  return buildRemoteSensingLayerSelectGroups([])
}

export function flattenImageryTimeSeriesLayerOptions() {
  return flattenRemoteSensingLayerSelectGroups(buildImageryTimeSeriesLayerGroups())
}

const YEAR_COLORS = [
  '#14b8a6',
  '#38bdf8',
  '#a3e635',
  '#f472b6',
  '#fb923c',
  '#c084fc',
  '#facc15',
  '#60a5fa',
  '#4ade80',
]

type CoreVars = {
  ndvi: number
  ndmi: number
  ndwi: number
  savi: number
  ci_re: number
}

function coreVarsFromDaily(row: SentinelHubDailyIndexMeans): CoreVars | null {
  if (row.ndvi == null || !Number.isFinite(row.ndvi)) return null
  return {
    ndvi: row.ndvi,
    ndmi: row.ndmi != null && Number.isFinite(row.ndmi) ? row.ndmi : 0,
    ndwi: row.ndwi != null && Number.isFinite(row.ndwi) ? row.ndwi : 0,
    savi: estimateSaviFromNdvi(row.ndvi),
    ci_re: row.ciRe != null && Number.isFinite(row.ciRe) ? row.ciRe : 0,
  }
}

function evaluateCompositeExpr(expr: string, vars: CoreVars): number | null {
  try {
    const fn = new Function(
      'ndvi',
      'ndmi',
      'ndwi',
      'savi',
      'ci_re',
      'Math',
      `"use strict"; return (${expr});`,
    )
    const value = fn(vars.ndvi, vars.ndmi, vars.ndwi, vars.savi, vars.ci_re, Math)
    return typeof value === 'number' && Number.isFinite(value) ? value : null
  } catch {
    return null
  }
}

function evaluateStaticLayerDailyValue(layerId: string, row: SentinelHubDailyIndexMeans): number | null {
  const id = layerId.trim().toUpperCase()
  const core = coreVarsFromDaily(row)
  if (!core) return null

  switch (id) {
    case 'NDVI':
      return core.ndvi
    case 'NDMI':
      return row.ndmi != null && Number.isFinite(row.ndmi) ? row.ndmi : null
    case 'NDWI':
      return row.ndwi != null && Number.isFinite(row.ndwi) ? row.ndwi : null
    case 'SAVI':
      return core.savi
    case 'EVI':
      return row.evi != null && Number.isFinite(row.evi) ? row.evi : null
    case 'CHAS': {
      const chas = computeChas(chasInputsFromDaily(row))
      return Number.isFinite(chas) ? chas : null
    }
    default:
      break
  }

  if (!isAgroStaticCompositeLayerId(id)) return null
  if (id === 'CHAS') {
    const chas = computeChas(chasInputsFromDaily(row))
    return Number.isFinite(chas) ? chas : null
  }
  const expr = resolveAgroCompositeExpr(id)
  if (!expr) return null
  return evaluateCompositeExpr(expr, core)
}

/** Layer Live daily value for charts (core, composite, or delta-ready static). */
export function evaluateImageryLayerDailyValue(layerId: string, row: SentinelHubDailyIndexMeans): number | null {
  const id = layerId.trim().toUpperCase()
  if (isAgroDeltaCompositeLayerId(id)) return null
  return evaluateStaticLayerDailyValue(id, row)
}

function meanFieldValueForDate(
  dailyMaps: Map<string, SentinelHubDailyIndexMeans[]>,
  fieldKeys: string[],
  date: string,
  layerId: string,
): number | null {
  const bucket: number[] = []
  for (const key of fieldKeys) {
    const row = dailyMaps.get(key)?.find(d => d.date === date)
    if (!row) continue
    const v = evaluateStaticLayerDailyValue(layerId, row)
    if (v != null && Number.isFinite(v)) bucket.push(v)
  }
  if (!bucket.length) return null
  return bucket.reduce((a, b) => a + b, 0) / bucket.length
}

export function aggregateImageryTimeSeries(
  dailyMaps: Map<string, SentinelHubDailyIndexMeans[]>,
  fieldKeys: string[],
  layerId: string,
): { labels: string[]; values: number[] } {
  const id = layerId.trim().toUpperCase()
  const dateSet = new Set<string>()
  for (const key of fieldKeys) {
    for (const row of dailyMaps.get(key) ?? []) dateSet.add(row.date)
  }
  const labels = [...dateSet].sort()
  const values: number[] = []

  if (isAgroDeltaCompositeLayerId(id)) {
    const staticId = resolveAgroStaticLayerIdForDelta(id)
    if (!staticId) return { labels, values: labels.map(() => NaN) }
    let prev: number | null = null
    for (const date of labels) {
      const current = meanFieldValueForDate(dailyMaps, fieldKeys, date, staticId)
      if (current == null || !Number.isFinite(current)) {
        values.push(NaN)
        continue
      }
      values.push(prev == null ? NaN : Number((current - prev).toFixed(4)))
      prev = current
    }
    return { labels, values }
  }

  for (const date of labels) {
    const mean = meanFieldValueForDate(dailyMaps, fieldKeys, date, id)
    values.push(mean == null ? NaN : mean)
  }
  return { labels, values }
}

export type YearSplitSeries = { year: number; labels: string[]; values: number[] }

export function splitSeriesByYear(labels: string[], values: number[]): YearSplitSeries[] {
  const byYear = new Map<number, { labels: string[]; values: number[] }>()
  for (let i = 0; i < labels.length; i++) {
    const date = labels[i]!
    const value = values[i]
    if (value == null || !Number.isFinite(value)) continue
    const year = Number(date.slice(0, 4))
    if (!Number.isFinite(year)) continue
    const monthDay = date.slice(5)
    if (!byYear.has(year)) byYear.set(year, { labels: [], values: [] })
    const entry = byYear.get(year)!
    entry.labels.push(monthDay)
    entry.values.push(value)
  }
  return [...byYear.entries()]
    .sort(([a], [b]) => a - b)
    .map(([year, data]) => ({ year, ...data }))
}

export function yearSplitChartColors(): string[] {
  return YEAR_COLORS
}

export function imageryLayerChartColor(index: number): string {
  return YEAR_COLORS[index % YEAR_COLORS.length]!
}

export type ImageryTimeSeriesLayerSeries = {
  layerId: string
  values: number[]
}

/** Multi-layer timeline — shared sorted date axis, one value array per layer. */
export function aggregateImageryTimeSeriesMulti(
  dailyMaps: Map<string, SentinelHubDailyIndexMeans[]>,
  fieldKeys: string[],
  layerIds: string[],
): { labels: string[]; series: ImageryTimeSeriesLayerSeries[] } {
  const ids = [...new Set(layerIds.map(id => id.trim().toUpperCase()).filter(Boolean))]
  if (!ids.length) return { labels: [], series: [] }

  const dateSet = new Set<string>()
  for (const key of fieldKeys) {
    for (const row of dailyMaps.get(key) ?? []) dateSet.add(row.date)
  }
  const labels = [...dateSet].sort()
  const series = ids.map(layerId => ({
    layerId,
    values: labels.map(date => {
      const mean = meanFieldValueForDate(dailyMaps, fieldKeys, date, layerId)
      return mean == null ? NaN : mean
    }),
  }))
  return { labels, series }
}

export function defaultImageryDateRange(referenceIso: string, lookbackDays = 90): { from: string; to: string } {
  const to = referenceIso.slice(0, 10)
  const end = new Date(`${to}T12:00:00Z`)
  end.setUTCDate(end.getUTCDate() - lookbackDays)
  const from = end.toISOString().slice(0, 10)
  return { from, to }
}

function finiteValues(values: number[]): number[] {
  return values.filter(v => Number.isFinite(v))
}

function meanOf(values: number[]): number | null {
  const finite = finiteValues(values)
  if (!finite.length) return null
  return finite.reduce((sum, v) => sum + v, 0) / finite.length
}

/** Monthly mean buckets for a single layer — keeps pie slices readable. */
export function bucketImagerySeriesByMonth(
  labels: string[],
  values: number[],
): { labels: string[]; values: number[] } {
  const buckets = new Map<string, number[]>()
  for (let i = 0; i < labels.length; i++) {
    const value = values[i]
    if (value == null || !Number.isFinite(value)) continue
    const month = String(labels[i] ?? '').slice(0, 7)
    if (!month) continue
    const bucket = buckets.get(month) ?? []
    bucket.push(value)
    buckets.set(month, bucket)
  }
  const sorted = [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  return {
    labels: sorted.map(([month]) => month),
    values: sorted.map(([, bucket]) => meanOf(bucket) ?? 0),
  }
}

/** Pie — multi-layer: mean share per layer; single layer: monthly means. */
export function buildImageryPieChartSlices(
  labels: string[],
  series: ImageryTimeSeriesLayerSeries[],
): { labels: string[]; values: number[] } {
  if (!series.length) return { labels: [], values: [] }
  if (series.length === 1) {
    return bucketImagerySeriesByMonth(labels, series[0]!.values)
  }
  return {
    labels: series.map(entry => entry.layerId),
    values: series.map(entry => meanOf(entry.values) ?? 0),
  }
}

export type ImageryScatterPoint = { x: number; y: number }

/** Scatter — x = epoch ms from scene date, y = index value per layer. */
export function buildImageryScatterPoints(
  labels: string[],
  values: number[],
): ImageryScatterPoint[] {
  const points: ImageryScatterPoint[] = []
  for (let i = 0; i < labels.length; i++) {
    const y = values[i]
    if (y == null || !Number.isFinite(y)) continue
    const parsed = Date.parse(`${labels[i]}T12:00:00Z`)
    if (!Number.isFinite(parsed)) continue
    points.push({ x: parsed, y })
  }
  return points
}
