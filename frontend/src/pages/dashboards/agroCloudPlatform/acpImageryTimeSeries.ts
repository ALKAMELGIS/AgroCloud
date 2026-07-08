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
import { estimateEtMmDayFromMoisture } from '../../../lib/etIndex'
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
    case 'ET': {
      const ndmi = row.ndmi != null && Number.isFinite(row.ndmi) ? row.ndmi : null
      let ndwi = row.ndwi != null && Number.isFinite(row.ndwi) ? row.ndwi : null
      if (ndmi == null) return null
      if (ndwi == null) {
        // Same estimate as timeSeriesReportExecutive.estimateNdwiFromNdmi
        ndwi = Math.max(-0.2, Math.min(0.45, ndmi * 0.85))
      }
      if (!Number.isFinite(ndwi)) return null
      const ndvi = row.ndvi != null && Number.isFinite(row.ndvi) ? row.ndvi : null
      return estimateEtMmDayFromMoisture(ndmi, ndwi, {
        sceneDate: row.date,
        ndvi,
      })
    }
    case 'CHAS':
    case 'CHAS_ALERT': {
      const chas = computeChas(chasInputsFromDaily(row))
      return Number.isFinite(chas) ? chas : null
    }
    default:
      break
  }

  if (!isAgroStaticCompositeLayerId(id)) return null
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

export type ImageryTimeAggregation = 'day' | 'week' | 'month' | 'year'

export type AggregatedImageryChart = {
  /** Stable period keys (ISO date for day, YYYY-MM, YYYY-Www, YYYY). */
  labels: string[]
  /** Human-readable x-axis labels. */
  displayLabels: string[]
  series: ImageryTimeSeriesLayerSeries[]
  /** Last observation date in each period — used for map sync & interpretation. */
  periodAnchorDate: Map<string, string>
}

function isoWeekPeriodKey(isoDate: string): string {
  const date = new Date(`${isoDate.slice(0, 10)}T12:00:00Z`)
  if (Number.isNaN(date.getTime())) return isoDate.slice(0, 10)
  const day = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - day)
  const year = date.getUTCFullYear()
  const jan1 = new Date(Date.UTC(year, 0, 1))
  const week = Math.ceil(((date.getTime() - jan1.getTime()) / 86_400_000 + 1) / 7)
  return `${year}-W${String(week).padStart(2, '0')}`
}

export function imageryTimePeriodKey(isoDate: string, aggregation: ImageryTimeAggregation): string {
  const d = isoDate.trim().slice(0, 10)
  if (!d) return ''
  if (aggregation === 'day') return d
  if (aggregation === 'month') return d.slice(0, 7)
  if (aggregation === 'year') return d.slice(0, 4)
  return isoWeekPeriodKey(d)
}

export function formatImageryTimePeriodLabel(key: string, aggregation: ImageryTimeAggregation): string {
  if (aggregation === 'day') return key
  if (aggregation === 'month') return key
  if (aggregation === 'year') return key
  return key.replace('-W', ' W')
}

/** Client-side re-bucketing of daily chart series into week / month / year means. */
export function aggregateImageryChartByTimePeriod(
  labels: string[],
  series: ImageryTimeSeriesLayerSeries[],
  aggregation: ImageryTimeAggregation,
): AggregatedImageryChart {
  if (!labels.length || !series.length) {
    return { labels: [], displayLabels: [], series: [], periodAnchorDate: new Map() }
  }
  if (aggregation === 'day') {
    return {
      labels: [...labels],
      displayLabels: [...labels],
      series: series.map(s => ({ layerId: s.layerId, values: [...s.values] })),
      periodAnchorDate: new Map(labels.map(d => [d, d])),
    }
  }

  type Bucket = { dates: string[]; layerValues: Map<string, number[]> }
  const buckets = new Map<string, Bucket>()
  const order: string[] = []

  for (let i = 0; i < labels.length; i += 1) {
    const date = labels[i]!
    const key = imageryTimePeriodKey(date, aggregation)
    if (!key) continue
    if (!buckets.has(key)) {
      buckets.set(key, { dates: [], layerValues: new Map() })
      order.push(key)
    }
    const bucket = buckets.get(key)!
    bucket.dates.push(date)
    for (const entry of series) {
      const value = entry.values[i]
      if (value == null || !Number.isFinite(value)) continue
      const arr = bucket.layerValues.get(entry.layerId) ?? []
      arr.push(value)
      bucket.layerValues.set(entry.layerId, arr)
    }
  }

  order.sort((a, b) => {
    const da = buckets.get(a)!.dates.sort()[0] ?? a
    const db = buckets.get(b)!.dates.sort()[0] ?? b
    return da.localeCompare(db)
  })

  const periodAnchorDate = new Map<string, string>()
  for (const key of order) {
    const dates = [...buckets.get(key)!.dates].sort()
    periodAnchorDate.set(key, dates[dates.length - 1] ?? key)
  }

  const aggSeries = series.map(entry => ({
    layerId: entry.layerId,
    values: order.map(key => {
      const vals = buckets.get(key)!.layerValues.get(entry.layerId) ?? []
      return meanOf(vals) ?? NaN
    }),
  }))

  return {
    labels: order,
    displayLabels: order.map(k => formatImageryTimePeriodLabel(k, aggregation)),
    series: aggSeries,
    periodAnchorDate,
  }
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

/** Keep only dates where at least one layer has a finite zonal mean. */
export function pruneImageryTimeSeriesToObservations(
  labels: string[],
  series: ImageryTimeSeriesLayerSeries[],
): { labels: string[]; series: ImageryTimeSeriesLayerSeries[] } {
  if (!labels.length || !series.length) return { labels: [], series: [] }
  const keepIndexes: number[] = []
  for (let i = 0; i < labels.length; i++) {
    const hasValue = series.some(s => {
      const v = s.values[i]
      return v != null && Number.isFinite(v)
    })
    if (hasValue) keepIndexes.push(i)
  }
  if (!keepIndexes.length) {
    return { labels: [], series: series.map(s => ({ layerId: s.layerId, values: [] })) }
  }
  return {
    labels: keepIndexes.map(i => labels[i]!),
    series: series.map(s => ({
      layerId: s.layerId,
      values: keepIndexes.map(i => s.values[i]!),
    })),
  }
}

export function pruneSingleLayerImagerySeries(
  labels: string[],
  values: number[],
): { labels: string[]; values: number[] } {
  const pruned = pruneImageryTimeSeriesToObservations(labels, [{ layerId: 'L', values }])
  return { labels: pruned.labels, values: pruned.series[0]?.values ?? [] }
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

export type ImageryCorrelationPoint = { x: number; y: number; date: string }

export type LinearRegressionResult = {
  slope: number
  intercept: number
  r: number
  r2: number
  n: number
}

export type ScatterRelationshipStrength = 'strong' | 'moderate' | 'weak' | 'none'
export type ScatterRelationshipDirection = 'positive' | 'negative' | 'none'

export type ScatterRelationshipPresentation = {
  strength: ScatterRelationshipStrength
  direction: ScatterRelationshipDirection
  label: string
}

export type ImageryCorrelationScatterAnalysis = {
  xLayerId: string
  yLayerId: string
  points: ImageryCorrelationPoint[]
  regression: LinearRegressionResult
  relationship: ScatterRelationshipPresentation
  gisInsight: string
  agroInsight: string
  regressionLine: ImageryScatterPoint[]
}

const SCATTER_RELATION_EPSILON = 0.015

/** Pair observations by scene date for X vs Y correlation scatter. */
export function buildImageryCorrelationPairs(
  labels: string[],
  xValues: number[],
  yValues: number[],
): ImageryCorrelationPoint[] {
  const points: ImageryCorrelationPoint[] = []
  for (let i = 0; i < labels.length; i++) {
    const x = xValues[i]
    const y = yValues[i]
    if (x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y)) continue
    points.push({ x, y, date: labels[i]! })
  }
  return points
}

/** Ordinary least-squares regression with Pearson r and R². */
export function computeLinearRegression(
  points: Array<{ x: number; y: number }>,
): LinearRegressionResult | null {
  const finite = points.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y))
  if (finite.length < 2) return null

  const n = finite.length
  const sumX = finite.reduce((sum, p) => sum + p.x, 0)
  const sumY = finite.reduce((sum, p) => sum + p.y, 0)
  const sumXY = finite.reduce((sum, p) => sum + p.x * p.y, 0)
  const sumX2 = finite.reduce((sum, p) => sum + p.x * p.x, 0)
  const sumY2 = finite.reduce((sum, p) => sum + p.y * p.y, 0)

  const denom = n * sumX2 - sumX * sumX
  if (Math.abs(denom) < 1e-12) return null

  const slope = (n * sumXY - sumX * sumY) / denom
  const intercept = (sumY - slope * sumX) / n

  const ssTot = sumY2 - (sumY * sumY) / n
  const ssRes = finite.reduce((sum, p) => {
    const predicted = slope * p.x + intercept
    return sum + (p.y - predicted) ** 2
  }, 0)
  const r2 = ssTot > 1e-12 ? Math.max(0, Math.min(1, 1 - ssRes / ssTot)) : 0
  const r = slope >= 0 ? Math.sqrt(r2) : -Math.sqrt(r2)

  return { slope, intercept, r, r2, n }
}

export function buildRegressionLinePoints(
  regression: LinearRegressionResult,
  points: Array<{ x: number; y: number }>,
): ImageryScatterPoint[] {
  if (!points.length) return []
  const xs = points.map(p => p.x)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const span = maxX - minX
  const pad = span > 0 ? span * 0.06 : Math.max(Math.abs(minX) * 0.05, 0.02)
  const x1 = minX - pad
  const x2 = maxX + pad
  return [
    { x: x1, y: regression.slope * x1 + regression.intercept },
    { x: x2, y: regression.slope * x2 + regression.intercept },
  ]
}

export function classifyScatterRelationship(regression: LinearRegressionResult): ScatterRelationshipPresentation {
  const absR = Math.abs(regression.r)
  if (absR < 0.15) {
    return { strength: 'none', direction: 'none', label: 'No clear relationship' }
  }

  const strength: ScatterRelationshipStrength =
    absR >= 0.7 ? 'strong' : absR >= 0.4 ? 'moderate' : 'weak'
  const direction: ScatterRelationshipDirection =
    regression.r >= SCATTER_RELATION_EPSILON
      ? 'positive'
      : regression.r <= -SCATTER_RELATION_EPSILON
        ? 'negative'
        : 'none'

  const strengthLabel =
    strength === 'strong' ? 'Strong' : strength === 'moderate' ? 'Moderate' : 'Weak'
  const directionLabel =
    direction === 'positive'
      ? 'Positive'
      : direction === 'negative'
        ? 'Negative'
        : 'Neutral'

  return {
    strength,
    direction,
    label: `${strengthLabel} ${directionLabel} Relationship`,
  }
}

function layerPairKey(a: string, b: string): string {
  return `${a.trim().toUpperCase()}|${b.trim().toUpperCase()}`
}

function buildLayerPairAgroInsight(
  xLayerId: string,
  yLayerId: string,
  relationship: ScatterRelationshipPresentation,
  regression: LinearRegressionResult,
): string {
  const key = layerPairKey(xLayerId, yLayerId)
  const reverseKey = layerPairKey(yLayerId, xLayerId)
  const pct = Math.round(regression.r2 * 100)
  const { strength, direction } = relationship

  const templates: Record<string, Partial<Record<ScatterRelationshipDirection, string>>> = {
    'NDVI|NDMI': {
      positive:
        strength === 'strong'
          ? 'Canopy vigor and canopy moisture index move together — uniform crop health with limited decoupled water stress across the field.'
          : 'Vegetation greenness and moisture index generally rise together — biomass gains align with canopy water status.',
      negative:
        'Biomass increases while canopy moisture falls — early water-stress decoupling; review irrigation scheduling before yield loss.',
    },
    'NDVI|NDWI': {
      positive:
        'Surface water / canopy water signal tracks vegetation density — healthy transpiration balance supports productivity.',
      negative:
        'Higher NDVI with lower NDWI suggests moisture deficit under active canopy — prioritize targeted irrigation or scouting.',
    },
    'NDVI|CHAS': {
      positive:
        'Integrated crop health score rises with NDVI — Sentinel layers agree on improving agronomic condition.',
      negative:
        'Vegetation index improves while composite health score weakens — check nutrient, pest, or moisture constraints not captured by NDVI alone.',
    },
    'NDMI|NDWI': {
      positive:
        'Canopy moisture and water index co-vary — consistent hydrological status across the parcel.',
      negative:
        'Moisture indices diverge — possible canopy stress, drainage heterogeneity, or mixed crop stages within the AOI.',
    },
  }

  const picked =
    templates[key]?.[direction === 'none' ? 'positive' : direction] ??
    templates[reverseKey]?.[direction === 'none' ? 'positive' : direction]

  if (picked) return picked

  if (strength === 'none') {
    return `${yLayerId} does not explain a stable share of ${xLayerId} variation in this window — treat layers independently for management decisions.`
  }

  const coupling =
    direction === 'negative'
      ? 'inverse coupling'
      : direction === 'positive'
        ? 'co-movement'
        : 'mixed coupling'
  return `${yLayerId} explains ~${pct}% of ${xLayerId} variance (R²=${regression.r2.toFixed(3)}) — ${coupling} may drive productivity swings in this period.`
}

export function buildScatterGisInsight(
  xLayerId: string,
  yLayerId: string,
  regression: LinearRegressionResult,
  relationship: ScatterRelationshipPresentation,
): string {
  const pct = Math.round(regression.r2 * 100)
  return `GIS · r=${regression.r.toFixed(3)} · R²=${regression.r2.toFixed(3)} (${pct}%) · n=${regression.n} scenes · slope ${regression.slope.toFixed(4)} Δ${yLayerId}/Δ${xLayerId} · ${relationship.label}`
}

export function buildScatterAgroInsight(
  xLayerId: string,
  yLayerId: string,
  regression: LinearRegressionResult,
  relationship: ScatterRelationshipPresentation,
): string {
  return `Agro · ${buildLayerPairAgroInsight(xLayerId, yLayerId, relationship, regression)}`
}

/** Correlation scatter analysis — X = first layer, Y = second layer, aligned by scene date. */
export function buildImageryCorrelationScatterAnalysis(
  labels: string[],
  xLayerId: string,
  xValues: number[],
  yLayerId: string,
  yValues: number[],
): ImageryCorrelationScatterAnalysis | null {
  const points = buildImageryCorrelationPairs(labels, xValues, yValues)
  const regression = computeLinearRegression(points)
  if (!regression) return null

  const relationship = classifyScatterRelationship(regression)
  return {
    xLayerId,
    yLayerId,
    points,
    regression,
    relationship,
    gisInsight: buildScatterGisInsight(xLayerId, yLayerId, regression, relationship),
    agroInsight: buildScatterAgroInsight(xLayerId, yLayerId, regression, relationship),
    regressionLine: buildRegressionLinePoints(regression, points),
  }
}
