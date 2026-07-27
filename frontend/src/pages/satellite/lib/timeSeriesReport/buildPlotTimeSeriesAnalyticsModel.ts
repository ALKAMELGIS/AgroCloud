import {
  resolveIndexThresholdProfile,
  type IndexHealthTier,
  type IndexThresholdProfile,
} from '../../../../lib/imageryIndexInterpretationEngine'
import type { SentinelHubDailyIndexMeans } from '../../../../lib/sentinelHubStatisticsApi'
import {
  evaluateImageryLayerDailyValue,
  imageryTimePeriodKey,
  type ImageryTimeAggregation,
} from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import { resolveFieldAreaHa } from '../../../../lib/siMultiLayerAoiTrendAnalysis'
import type { CropAlertFieldInput } from '../../../../lib/siCropAlertEngine'
import type {
  PlotAlertSeverity,
  PlotAlertType,
  PlotAnalyticsAlert,
  PlotAnalyticsRow,
  PlotObservation,
  PlotTimeSeriesAnalyticsMeta,
  PlotTimeSeriesAnalyticsModel,
  PlotTimeSeriesSortField,
  PlotTrend,
} from './plotTimeSeriesAnalyticsTypes'

const EXPORT_VERSION = '1.0.0'

function finite(n: number | null | undefined): number | null {
  return n != null && Number.isFinite(n) ? n : null
}

function meanOf(nums: number[]): number | null {
  if (!nums.length) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function medianOf(nums: number[]): number | null {
  if (!nums.length) return null
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
}

function stdDevOf(nums: number[]): number | null {
  if (nums.length < 2) return null
  const m = meanOf(nums)
  if (m == null) return null
  const v = nums.reduce((s, n) => s + (n - m) ** 2, 0) / nums.length
  return Math.sqrt(v)
}

function classifyBand(value: number, profile: IndexThresholdProfile) {
  for (const band of profile.tiers) {
    if (value >= band.min && value < band.max) return band
  }
  return profile.tiers[profile.tiers.length - 1] ?? profile.tiers[0]!
}

function periodKey(isoDate: string, aggregation: ImageryTimeAggregation): string {
  return imageryTimePeriodKey(isoDate, aggregation)
}

export function aggregateObservations(
  daily: Array<{ date: string; value: number | null }>,
  aggregation: ImageryTimeAggregation,
): PlotObservation[] {
  // Always mean-merge by period key so duplicate Sentinel rows cannot overwrite with a wrong last value.
  const buckets = new Map<string, number[]>()
  for (const row of daily) {
    const v = finite(row.value)
    if (v == null || !row.date) continue
    const key = aggregation === 'day' ? row.date.trim().slice(0, 10) : periodKey(row.date, aggregation)
    if (!key) continue
    const list = buckets.get(key) ?? []
    list.push(v)
    buckets.set(key, list)
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, vals]) => ({
      date,
      value: meanOf(vals),
      source: 'Sentinel Hub',
      qualityFlag: 'ok',
    }))
}

export function computeTrend(values: Array<number | null>): PlotTrend {
  const pts = values.map((v, i) => (v != null && Number.isFinite(v) ? { x: i, y: v } : null)).filter(Boolean) as Array<{
    x: number
    y: number
  }>
  if (pts.length < 2) return 'Unknown'
  const n = pts.length
  const sumX = pts.reduce((s, p) => s + p.x, 0)
  const sumY = pts.reduce((s, p) => s + p.y, 0)
  const sumXY = pts.reduce((s, p) => s + p.x * p.y, 0)
  const sumXX = pts.reduce((s, p) => s + p.x * p.x, 0)
  const denom = n * sumXX - sumX * sumX
  if (denom === 0) return 'Stable'
  const slope = (n * sumXY - sumX * sumY) / denom
  const yRange = Math.max(...pts.map(p => p.y)) - Math.min(...pts.map(p => p.y))
  const threshold = Math.max(1e-4, yRange * 0.02)
  if (slope > threshold) return 'Increasing'
  if (slope < -threshold) return 'Decreasing'
  return 'Stable'
}

function recommendationFor(
  tier: IndexHealthTier | 'unknown',
  trend: PlotTrend,
  layerLabel: string,
): string {
  if (tier === 'critical') {
    return trend === 'Decreasing'
      ? `Immediate field inspection — ${layerLabel} critically low and declining`
      : `Immediate field inspection — ${layerLabel} critically low`
  }
  if (tier === 'stress') {
    return trend === 'Decreasing' ? 'Check irrigation / stress factors' : 'Monitor closely; schedule scouting'
  }
  if (tier === 'moderate') return trend === 'Decreasing' ? 'Monitor' : 'Continue routine monitoring'
  if (tier === 'healthy') return trend === 'Decreasing' ? 'Watch for early decline' : 'No action required'
  return 'Insufficient data — verify imagery coverage'
}

function priorityScore(opts: {
  latest: number | null
  previous: number | null
  trend: PlotTrend
  missingRatio: number
  profile: IndexThresholdProfile
}): number {
  const { latest, previous, trend, missingRatio, profile } = opts
  if (latest == null) return 100 * missingRatio + 20
  const band = classifyBand(latest, profile)
  const invert = !!profile.invertHealth
  // Normalize within profile span toward "worse = higher priority"
  const allMins = profile.tiers.map(t => t.min)
  const allMaxs = profile.tiers.map(t => t.max)
  const lo = Math.min(...allMins)
  const hi = Math.max(...allMaxs)
  const span = Math.max(1e-6, hi - lo)
  const norm = Math.min(1, Math.max(0, (latest - lo) / span))
  const valueComponent = (invert ? norm : 1 - norm) * 60
  const delta = previous != null ? latest - previous : 0
  const trendComponent =
    trend === 'Decreasing' ? 20 : trend === 'Increasing' ? (invert ? 20 : 0) : 5
  const changeComponent = Math.min(15, Math.abs(delta) / span * 40)
  const missingComponent = missingRatio * 10
  const tierBoost = band.tier === 'critical' ? 15 : band.tier === 'stress' ? 8 : 0
  return Number((valueComponent + trendComponent + changeComponent + missingComponent + tierBoost).toFixed(2))
}

function cropFromField(field: CropAlertFieldInput): string {
  const any = field as CropAlertFieldInput & { cropType?: string; crop?: string }
  return String(any.cropType || any.crop || '').trim() || '—'
}

export function buildPlotAnalyticsRow(input: {
  field: CropAlertFieldInput
  layerId: string
  dailyRows: SentinelHubDailyIndexMeans[]
  timeAggregation: ImageryTimeAggregation
}): PlotAnalyticsRow {
  const profile = resolveIndexThresholdProfile(input.layerId)
  const daily = input.dailyRows.map(row => ({
    date: row.date,
    value: evaluateImageryLayerDailyValue(input.layerId, row),
  }))
  const observations = aggregateObservations(daily, input.timeAggregation)
  const nums = observations.map(o => o.value).filter((v): v is number => v != null)
  const latestValue = [...observations].reverse().find(o => o.value != null)?.value ?? null
  const previousValue =
    [...observations]
      .reverse()
      .filter(o => o.value != null)
      .slice(1, 2)[0]?.value ?? null
  const difference =
    latestValue != null && previousValue != null ? Number((latestValue - previousValue).toFixed(4)) : null
  const trend = computeTrend(observations.map(o => o.value))
  const band = latestValue != null ? classifyBand(latestValue, profile) : null
  const statusTier = (band?.tier ?? 'unknown') as IndexHealthTier | 'unknown'
  const missingRatio =
    observations.length > 0
      ? observations.filter(o => o.value == null).length / observations.length
      : 1
  const score = priorityScore({
    latest: latestValue,
    previous: previousValue,
    trend,
    missingRatio,
    profile,
  })

  return {
    plotId: (() => {
      const oid = String(fieldObjectId(input.field) || '').trim()
      if (oid && !/\.zip/i.test(oid) && !/^custom-\d+/i.test(oid) && !/^vl:/i.test(oid)) {
        return oid
      }
      const label = String(input.field.farmName || '').trim()
      if (label && !/^vl:/i.test(label) && !/\.zip/i.test(label) && !/^custom-\d+/i.test(label)) {
        return label.replace(/^AOI\s*:\s*/i, '').replace(/^[^:]{1,40}:\s*/, '').trim() || label
      }
      return `Plot_${String(input.field.fieldKey || '1').slice(-12)}`
    })(),
    fieldKey: input.field.fieldKey,
    plotName: input.field.farmName || input.field.fieldKey,
    farmName: input.field.farmName || '-',
    cropType: cropFromField(input.field),
    areaHa: resolveFieldAreaHa(input.field.geometry),
    observationCount: nums.length,
    mean: meanOf(nums),
    median: medianOf(nums),
    min: nums.length ? Math.min(...nums) : null,
    max: nums.length ? Math.max(...nums) : null,
    stdDev: stdDevOf(nums),
    latestValue,
    previousValue,
    difference,
    trend,
    status: band?.label ?? 'No data',
    statusTier,
    statusColor: band?.color ?? '#94a3b8',
    priorityScore: score,
    recommendedAction: recommendationFor(statusTier, trend, profile.label),
    observations,
  }
}

function fieldObjectId(field: CropAlertFieldInput): string {
  return String(field.objectId || field.farmCode || field.fieldKey || 'plot')
}

export function buildPlotAlerts(rows: PlotAnalyticsRow[], layerLabel: string): PlotAnalyticsAlert[] {
  const alerts: PlotAnalyticsAlert[] = []
  for (const row of rows) {
    if (row.observationCount === 0) {
      alerts.push({
        plotId: row.plotId,
        alertType: 'Missing Observations',
        severity: 'High',
        currentValue: null,
        previousValue: null,
        difference: null,
        trend: row.trend,
        recommendation: `No valid ${layerLabel} observations in range — check cloud cover / date range`,
      })
      continue
    }
    const absDiff = row.difference != null ? Math.abs(row.difference) : 0
    const scale = Math.max(0.05, Math.abs(row.mean ?? row.latestValue ?? 0.3) * 0.25)
    if (row.difference != null && absDiff >= scale) {
      const decreasing = (row.difference ?? 0) < 0
      alerts.push({
        plotId: row.plotId,
        alertType: decreasing ? 'Rapid Decrease' : 'Rapid Increase',
        severity: absDiff >= scale * 2 ? 'Critical' : 'High',
        currentValue: row.latestValue,
        previousValue: row.previousValue,
        difference: row.difference,
        trend: row.trend,
        recommendation: decreasing
          ? `Investigate sudden ${layerLabel} drop`
          : `Verify sudden ${layerLabel} rise (growth or data artifact)`,
      })
    } else if (row.statusTier === 'critical' || row.statusTier === 'stress') {
      alerts.push({
        plotId: row.plotId,
        alertType: 'Persistent Low',
        severity: row.statusTier === 'critical' ? 'Critical' : 'Medium',
        currentValue: row.latestValue,
        previousValue: row.previousValue,
        difference: row.difference,
        trend: row.trend,
        recommendation: row.recommendedAction,
      })
    } else if (row.trend === 'Stable' && row.statusTier === 'healthy') {
      alerts.push({
        plotId: row.plotId,
        alertType: 'Stable',
        severity: 'Info',
        currentValue: row.latestValue,
        previousValue: row.previousValue,
        difference: row.difference,
        trend: row.trend,
        recommendation: 'Conditions stable — routine monitoring',
      })
    } else if (row.difference != null && absDiff >= scale * 0.5) {
      alerts.push({
        plotId: row.plotId,
        alertType: 'Significant Change',
        severity: 'Medium',
        currentValue: row.latestValue,
        previousValue: row.previousValue,
        difference: row.difference,
        trend: row.trend,
        recommendation: `Review ${layerLabel} change vs prior observation`,
      })
    }
  }
  const severityRank: Record<PlotAlertSeverity, number> = {
    Critical: 0,
    High: 1,
    Medium: 2,
    Low: 3,
    Info: 4,
  }
  return alerts.sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || a.plotId.localeCompare(b.plotId))
}

export function sortPlotAnalyticsRows(
  rows: PlotAnalyticsRow[],
  sortField: PlotTimeSeriesSortField,
): PlotAnalyticsRow[] {
  const copy = [...rows]
  switch (sortField) {
    case 'value-asc':
      return copy.sort((a, b) => (a.latestValue ?? Infinity) - (b.latestValue ?? Infinity))
    case 'value-desc':
      return copy.sort((a, b) => (b.latestValue ?? -Infinity) - (a.latestValue ?? -Infinity))
    case 'change-desc':
      return copy.sort((a, b) => Math.abs(b.difference ?? 0) - Math.abs(a.difference ?? 0))
    case 'change-asc':
      return copy.sort((a, b) => Math.abs(a.difference ?? 0) - Math.abs(b.difference ?? 0))
    case 'plot-id':
      return copy.sort((a, b) => a.plotId.localeCompare(b.plotId, undefined, { numeric: true }))
    case 'area':
      return copy.sort((a, b) => b.areaHa - a.areaHa)
    case 'priority':
    default:
      return copy.sort((a, b) => b.priorityScore - a.priorityScore)
  }
}

function buildMonthlyAverages(rows: PlotAnalyticsRow[]): PlotTimeSeriesAnalyticsModel['monthlyAverages'] {
  const buckets = new Map<string, number[]>()
  for (const row of rows) {
    for (const obs of row.observations) {
      if (obs.value == null) continue
      const month = obs.date.length >= 7 ? obs.date.slice(0, 7) : obs.date
      const list = buckets.get(month) ?? []
      list.push(obs.value)
      buckets.set(month, list)
    }
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, vals]) => ({ month, average: meanOf(vals), count: vals.length }))
}

function buildCropSummary(rows: PlotAnalyticsRow[]): PlotTimeSeriesAnalyticsModel['cropSummary'] {
  const map = new Map<string, number[]>()
  for (const row of rows) {
    const crop = row.cropType || '—'
    const list = map.get(crop) ?? []
    if (row.latestValue != null) list.push(row.latestValue)
    map.set(crop, list)
  }
  return [...map.entries()]
    .map(([cropType, vals]) => ({
      cropType,
      average: meanOf(vals),
      plotCount: rows.filter(r => (r.cropType || '—') === cropType).length,
    }))
    .sort((a, b) => a.cropType.localeCompare(b.cropType))
}

export function buildPlotTimeSeriesAnalyticsModel(input: {
  plots: CropAlertFieldInput[]
  layerId: string
  dailyByFieldKey: Map<string, SentinelHubDailyIndexMeans[]>
  fromDate: string
  toDate: string
  timeAggregation: ImageryTimeAggregation
  farmName?: string
  aoiName?: string
  sortField?: PlotTimeSeriesSortField
}): PlotTimeSeriesAnalyticsModel {
  const profile = resolveIndexThresholdProfile(input.layerId)
  const rowsRaw = input.plots.map(field =>
    buildPlotAnalyticsRow({
      field,
      layerId: input.layerId,
      dailyRows: input.dailyByFieldKey.get(field.fieldKey) ?? [],
      timeAggregation: input.timeAggregation,
    }),
  )
  const rows = sortPlotAnalyticsRows(rowsRaw, input.sortField ?? 'priority')
  const latestVals = rows.map(r => r.latestValue).filter((v): v is number => v != null)
  const alerts = buildPlotAlerts(rows, profile.label)

  const statusCountsMap = new Map<string, number>()
  for (const row of rows) {
    statusCountsMap.set(row.status, (statusCountsMap.get(row.status) ?? 0) + 1)
  }

  const chartDates = [
    ...new Set(rows.flatMap(r => r.observations.filter(o => o.value != null).map(o => o.date))),
  ].sort()
  const farmAverageSeries = chartDates.map(date => {
    const vals: number[] = []
    for (const row of rows) {
      const hit = row.observations.find(o => o.date === date)
      if (hit?.value != null) vals.push(hit.value)
    }
    return meanOf(vals)
  })

  const meta: PlotTimeSeriesAnalyticsMeta = {
    farmName: input.farmName?.trim() || rows[0]?.farmName || 'Farm',
    aoiName: input.aoiName?.trim() || `${rows.length} plots`,
    layerId: input.layerId,
    layerLabel: profile.label,
    fromDate: input.fromDate,
    toDate: input.toDate,
    generatedAt: new Date().toISOString(),
    timeAggregation: input.timeAggregation,
    coordinateSystem: 'EPSG:4326',
    dataSource: 'Sentinel Hub / Sentinel-2',
    platformVersion: 'AgroCloud Satellite Intelligence',
    exportVersion: EXPORT_VERSION,
    plotCount: rows.length,
  }

  return {
    meta,
    rows,
    alerts,
    kpis: {
      averageValue: meanOf(latestVals),
      lowestValue: latestVals.length ? Math.min(...latestVals) : null,
      highestValue: latestVals.length ? Math.max(...latestVals) : null,
      healthyCount: rows.filter(r => r.statusTier === 'healthy').length,
      moderateCount: rows.filter(r => r.statusTier === 'moderate').length,
      stressCount: rows.filter(r => r.statusTier === 'stress').length,
      criticalCount: rows.filter(r => r.statusTier === 'critical').length,
    },
    monthlyAverages: buildMonthlyAverages(rows),
    statusCounts: [...statusCountsMap.entries()].map(([status, count]) => ({ status, count })),
    cropSummary: buildCropSummary(rows),
    chartDates,
    farmAverageSeries,
  }
}

export type { PlotAlertType }
