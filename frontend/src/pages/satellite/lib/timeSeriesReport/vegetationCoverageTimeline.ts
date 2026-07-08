import {
  resolveIndexThresholdProfile,
  type IndexHealthTier,
} from '../../../../lib/imageryIndexInterpretationEngine'
import {
  fetchLayerClassAreas,
  geodesicAreaM2,
  resolveLayerClassBreakdown,
  type LayerClassAreaResult,
} from '../../../../lib/siLayerClassAreaEngine'
import type { SentinelHubDailyIndexMeans } from '../../../../lib/sentinelHubStatisticsApi'
import { evaluateImageryLayerDailyValue } from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import type { ImageryTimeSeriesLayerSeries } from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import type { TimeSeriesTrendLabel } from './timeSeriesReportTypes'

const VEG_TIERS = new Set<IndexHealthTier>(['healthy', 'moderate', 'stress'])
const TIER_ORDER: IndexHealthTier[] = ['healthy', 'moderate', 'stress', 'critical']
const MAX_HISTOGRAM_DATES = 8

export type VegetationCoverageClassShare = {
  tier: IndexHealthTier
  label: string
  color: string
  pct: number
  areaHa: number
  areaM2: number
}

export type VegetationCoveragePoint = {
  date: string
  periodLabel: string
  ndviMean: number | null
  ndviMin: number | null
  ndviMax: number | null
  vegetationCoveragePct: number
  vegetationAreaHa: number
  vegetationAreaM2: number
  bareCoveragePct: number
  bareAreaHa: number
  aoiAreaHa: number
  aoiAreaM2: number
  dominantClass: string
  dominantTier: IndexHealthTier | null
  classes: VegetationCoverageClassShare[]
  source: 'histogram' | 'zonal-estimate' | 'mean-estimate'
  trend: TimeSeriesTrendLabel
}

function classifyValue(
  value: number,
  profile: ReturnType<typeof resolveIndexThresholdProfile>,
): { tier: IndexHealthTier; label: string; color: string } {
  for (const band of profile.tiers) {
    if (value >= band.min && value < band.max) {
      return { tier: band.tier, label: band.label, color: band.color }
    }
  }
  const last = profile.tiers[profile.tiers.length - 1]!
  return { tier: last.tier, label: last.label, color: last.color }
}

function overlapLength(aMin: number, aMax: number, bMin: number, bMax: number): number {
  const low = Math.max(aMin, bMin)
  const high = Math.min(aMax, bMax)
  return Math.max(0, high - low)
}

function estimateSharesFromRange(
  min: number,
  max: number,
  profile: ReturnType<typeof resolveIndexThresholdProfile>,
): Record<IndexHealthTier, number> {
  const lo = Math.min(min, max)
  const hi = Math.max(min, max)
  const span = hi - lo
  const shares: Record<IndexHealthTier, number> = {
    critical: 0,
    stress: 0,
    moderate: 0,
    healthy: 0,
  }
  if (span <= 1e-6) {
    shares[classifyValue((lo + hi) / 2, profile).tier] = 1
    return shares
  }
  for (const band of profile.tiers) {
    shares[band.tier] = overlapLength(lo, hi, band.min, band.max) / span
  }
  const total = Object.values(shares).reduce((s, v) => s + v, 0)
  if (total <= 0) {
    shares[classifyValue((lo + hi) / 2, profile).tier] = 1
    return shares
  }
  for (const tier of TIER_ORDER) shares[tier] /= total
  return shares
}

function sharesToClasses(
  shares: Record<IndexHealthTier, number>,
  profile: ReturnType<typeof resolveIndexThresholdProfile>,
  aoiAreaM2: number,
): VegetationCoverageClassShare[] {
  return TIER_ORDER.map(tier => {
    const band = profile.tiers.find(t => t.tier === tier) ?? profile.tiers[0]!
    const pct = shares[tier] * 100
    const areaM2 = (aoiAreaM2 * pct) / 100
    return {
      tier,
      label: band.label,
      color: band.color,
      pct,
      areaHa: areaM2 / 10_000,
      areaM2,
    }
  })
}

function histogramToClasses(
  histogram: LayerClassAreaResult,
  profile: ReturnType<typeof resolveIndexThresholdProfile>,
  aoiAreaM2: number,
): VegetationCoverageClassShare[] {
  const shares: Record<IndexHealthTier, number> = {
    critical: 0,
    stress: 0,
    moderate: 0,
    healthy: 0,
  }
  const breakdown = resolveLayerClassBreakdown('NDVI')
  if (breakdown) {
    for (const row of histogram.rows) {
      const low = breakdown.edges[row.classIndex]
      const high = breakdown.edges[row.classIndex + 1]
      const mid = low != null && high != null ? (low + high) / 2 : 0
      shares[classifyValue(mid, profile).tier] += row.pctOfAoi / 100
    }
  } else {
    for (const row of histogram.rows) {
      const mid = -1 + ((row.classIndex + 0.5) / Math.max(histogram.rows.length, 1)) * 2
      shares[classifyValue(mid, profile).tier] += row.pctOfAoi / 100
    }
  }
  const total = Object.values(shares).reduce((s, v) => s + v, 0) || 1
  for (const tier of TIER_ORDER) shares[tier] /= total
  return sharesToClasses(shares, profile, aoiAreaM2)
}

function finishPoint(
  date: string,
  periodLabel: string,
  ndviMean: number | null,
  ndviMin: number | null,
  ndviMax: number | null,
  classes: VegetationCoverageClassShare[],
  aoiAreaM2: number,
  source: VegetationCoveragePoint['source'],
): VegetationCoveragePoint {
  const profile = resolveIndexThresholdProfile('NDVI')
  const vegetationCoveragePct = classes.filter(c => VEG_TIERS.has(c.tier)).reduce((s, c) => s + c.pct, 0)
  const bare = classes.find(c => c.tier === 'critical')
  const bareCoveragePct = bare?.pct ?? Math.max(0, 100 - vegetationCoveragePct)
  const aoiAreaHa = aoiAreaM2 / 10_000
  const vegetationAreaHa = (aoiAreaHa * vegetationCoveragePct) / 100
  const dominant = [...classes].sort((a, b) => b.pct - a.pct)[0]
  const meanBand =
    ndviMean != null && Number.isFinite(ndviMean) ? classifyValue(ndviMean, profile) : null

  return {
    date,
    periodLabel,
    ndviMean,
    ndviMin,
    ndviMax,
    vegetationCoveragePct,
    vegetationAreaHa,
    vegetationAreaM2: vegetationAreaHa * 10_000,
    bareCoveragePct,
    bareAreaHa: (aoiAreaHa * bareCoveragePct) / 100,
    aoiAreaHa,
    aoiAreaM2,
    dominantClass: dominant?.label ?? meanBand?.label ?? '—',
    dominantTier: dominant?.tier ?? meanBand?.tier ?? null,
    classes,
    source,
    trend: 'Stable',
  }
}

function assignTrends(points: VegetationCoveragePoint[]): VegetationCoveragePoint[] {
  return points.map((p, i) => {
    if (i === 0) return { ...p, trend: 'Stable' as const }
    const prev = points[i - 1]!.vegetationCoveragePct
    const delta = p.vegetationCoveragePct - prev
    let trend: TimeSeriesTrendLabel = 'Stable'
    if (delta > 2) trend = 'Increasing'
    else if (delta < -2) trend = 'Decreasing'
    return { ...p, trend }
  })
}

function resolveNdviForDate(
  date: string,
  dailyRows: SentinelHubDailyIndexMeans[],
  seriesMean?: number | null,
): { mean: number | null; min: number | null; max: number | null } {
  const row = dailyRows.find(d => d.date?.slice(0, 10) === date.slice(0, 10))
  const zonal = row?.zonal?.ndvi
  const mean =
    zonal?.mean ??
    (row ? evaluateImageryLayerDailyValue('NDVI', row) : null) ??
    (seriesMean != null && Number.isFinite(seriesMean) ? seriesMean : null)
  return {
    mean,
    min: zonal?.min ?? mean,
    max: zonal?.max ?? mean,
  }
}

export function computeVegetationCoveragePoint(options: {
  date: string
  periodLabel?: string
  aoiAreaM2: number
  ndviMean: number | null
  ndviMin?: number | null
  ndviMax?: number | null
  histogram?: LayerClassAreaResult | null
}): VegetationCoveragePoint | null {
  const { date, aoiAreaM2 } = options
  if (!date || aoiAreaM2 <= 0) return null
  const profile = resolveIndexThresholdProfile('NDVI')
  const mean = options.ndviMean
  if (mean == null || !Number.isFinite(mean)) return null

  const min = options.ndviMin ?? mean
  const max = options.ndviMax ?? mean
  let classes: VegetationCoverageClassShare[]
  let source: VegetationCoveragePoint['source']

  if (options.histogram?.rows?.length) {
    classes = histogramToClasses(options.histogram, profile, aoiAreaM2)
    source = 'histogram'
  } else {
    const shares = estimateSharesFromRange(min ?? mean, max ?? mean, profile)
    classes = sharesToClasses(shares, profile, aoiAreaM2)
    source = options.ndviMin != null && options.ndviMax != null ? 'zonal-estimate' : 'mean-estimate'
  }

  return finishPoint(
    date,
    options.periodLabel ?? date,
    mean,
    min,
    max,
    classes,
    aoiAreaM2,
    source,
  )
}

export type BuildVegetationCoverageTimelineInput = {
  geometry: GeoJSON.Geometry | null | undefined
  chartLabels: string[]
  displayLabels: string[]
  periodAnchorDates?: Record<string, string>
  dailyRows: SentinelHubDailyIndexMeans[]
  ndviSeries?: ImageryTimeSeriesLayerSeries | null
  /** When true, sample dates and fetch NDVI class histograms for higher accuracy (Excel export). */
  enrichWithHistograms?: boolean
  signal?: AbortSignal
}

function pickSampleIndices(count: number, max: number): number[] {
  if (count <= max) return Array.from({ length: count }, (_, i) => i)
  const out: number[] = []
  for (let i = 0; i < max; i += 1) {
    out.push(Math.round((i * (count - 1)) / (max - 1)))
  }
  return [...new Set(out)].sort((a, b) => a - b)
}

/**
 * Per-acquisition Vegetation Coverage for the active AOI using NDVI classification.
 * Each date is computed independently (zonal/mean estimate; optional histogram enrich).
 */
export async function buildVegetationCoverageTimeline(
  input: BuildVegetationCoverageTimelineInput,
): Promise<VegetationCoveragePoint[]> {
  const geometry = input.geometry ?? null
  const aoiAreaM2 = geometry ? geodesicAreaM2(geometry) : 0
  if (aoiAreaM2 <= 0 || !input.chartLabels.length) return []

  const ndviValues = input.ndviSeries?.values ?? []
  const periodPoints: Array<{
    periodKey: string
    periodLabel: string
    sceneDate: string
    seriesMean: number | null
  }> = []

  for (let i = 0; i < input.chartLabels.length; i += 1) {
    const periodKey = input.chartLabels[i]!
    const sceneDate = (input.periodAnchorDates?.[periodKey] ?? periodKey).trim().slice(0, 10)
    const v = ndviValues[i]
    const seriesMean = v != null && Number.isFinite(v) ? v : null
    periodPoints.push({
      periodKey,
      periodLabel: input.displayLabels[i] ?? periodKey,
      sceneDate,
      seriesMean,
    })
  }

  // One row per unique scene date (latest period label wins).
  const byDate = new Map<string, (typeof periodPoints)[0]>()
  for (const p of periodPoints) {
    if (!p.sceneDate) continue
    byDate.set(p.sceneDate, p)
  }
  const unique = [...byDate.values()].sort((a, b) => a.sceneDate.localeCompare(b.sceneDate))

  let points: VegetationCoveragePoint[] = []
  for (const p of unique) {
    const ndvi = resolveNdviForDate(p.sceneDate, input.dailyRows, p.seriesMean)
    const point = computeVegetationCoveragePoint({
      date: p.sceneDate,
      periodLabel: p.periodLabel,
      aoiAreaM2,
      ndviMean: ndvi.mean,
      ndviMin: ndvi.min,
      ndviMax: ndvi.max,
    })
    if (point) points.push(point)
  }

  if (input.enrichWithHistograms && geometry && points.length) {
    const sampleIdx = pickSampleIndices(points.length, MAX_HISTOGRAM_DATES)
    const enriched = await Promise.all(
      sampleIdx.map(async idx => {
        const base = points[idx]!
        try {
          const histogram = await fetchLayerClassAreas({
            geometry,
            layerId: 'NDVI',
            sceneDate: base.date,
            signal: input.signal,
          })
          if (!histogram?.rows?.length) return null
          return computeVegetationCoveragePoint({
            date: base.date,
            periodLabel: base.periodLabel,
            aoiAreaM2,
            ndviMean: base.ndviMean,
            ndviMin: base.ndviMin,
            ndviMax: base.ndviMax,
            histogram,
          })
        } catch {
          return null
        }
      }),
    )
    const next = [...points]
    sampleIdx.forEach((idx, j) => {
      const e = enriched[j]
      if (e) next[idx] = e
    })
    points = next
  }

  return assignTrends(points)
}

/** Map timeline points onto chart period keys for Coverage % dataset. */
export function vegetationCoverageSeriesForChart(
  chartLabels: string[],
  periodAnchorDates: Record<string, string> | undefined,
  timeline: VegetationCoveragePoint[],
): Array<number | null> {
  const byDate = new Map(timeline.map(p => [p.date, p.vegetationCoveragePct]))
  return chartLabels.map(key => {
    const scene = (periodAnchorDates?.[key] ?? key).trim().slice(0, 10)
    const pct = byDate.get(scene)
    return pct != null && Number.isFinite(pct) ? Number(pct.toFixed(2)) : null
  })
}

export function latestVegetationCoverageSummary(timeline: VegetationCoveragePoint[]): VegetationCoveragePoint | null {
  if (!timeline.length) return null
  return timeline[timeline.length - 1] ?? null
}
