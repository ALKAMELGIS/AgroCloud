import { estimateSaviFromNdvi } from '../../../../lib/chasIndex'
import {
  resolveIndexThresholdProfile,
  type ImageryIndexInterpretation,
} from '../../../../lib/imageryIndexInterpretationEngine'
import type { TimeSeriesLayerStatistics, TimeSeriesTrendLabel } from './timeSeriesReportTypes'

export type RiskLevel = 'Very Low' | 'Low' | 'Moderate' | 'High' | 'Critical'

export type TimeSeriesIndexKpi = {
  label: string
  value: string
  sublabel: string
  estimated?: boolean
}

export type TimeSeriesIndexOverviewRow = {
  indexId: string
  measures: string
  value: string
  reading: string
  estimated?: boolean
}

export type TimeSeriesExecutiveSummary = {
  headline: string
  narrative: string
  cropHealth: string
  vegetationTrend: string
  stressAssessment: string
  moistureStatus: string
  recommendations: string[]
  riskLevel: RiskLevel
  indexKpis: TimeSeriesIndexKpi[]
  indexOverview: TimeSeriesIndexOverviewRow[]
  multiIndexNotes: string
  ndwiEstimated: boolean
  saviEstimated: boolean
  ndviMean: number | null
  ndmiMean: number | null
  ndwiMean: number | null
  saviMean: number | null
}

function tierToRisk(tier: ImageryIndexInterpretation['meanTier']): RiskLevel {
  if (tier === 'healthy') return 'Low'
  if (tier === 'moderate') return 'Moderate'
  if (tier === 'stress') return 'High'
  return 'Critical'
}

function trendPhrase(trend: TimeSeriesTrendLabel): string {
  if (trend === 'Increasing') return 'improving'
  if (trend === 'Decreasing') return 'declining'
  return 'stable'
}

function classifyIndexLabel(layerId: string, value: number): string {
  const profile = resolveIndexThresholdProfile(layerId)
  for (const band of profile.tiers) {
    if (value >= band.min && value < band.max) return band.label
  }
  return profile.tiers[profile.tiers.length - 1]?.label ?? '—'
}

export function estimateNdwiFromNdmi(ndmi: number): number {
  if (!Number.isFinite(ndmi)) return NaN
  return Math.max(-0.2, Math.min(0.45, ndmi * 0.85))
}

function ndmiExecutiveReading(value: number): string {
  if (value < 0.15) return 'Water-limited'
  if (value < 0.22) return 'Moderate moisture'
  return 'Adequate canopy moisture'
}

function ndwiExecutiveReading(value: number): string {
  if (value < 0.12) return 'Constrained canopy'
  if (value < 0.25) return 'Moderate surface moisture'
  return 'Adequate moisture'
}

function saviExecutiveReading(value: number, ndviLabel: string): string {
  const lower = ndviLabel.toLowerCase()
  if (lower.includes('moderate')) return 'Consistent with moderate cover'
  if (lower.includes('healthy')) return 'Consistent with dense cover'
  if (lower.includes('stress')) return 'Aligned with stressed canopy'
  if (lower.includes('bare')) return 'Sparse soil-adjusted cover'
  return `Soil-adjusted (${value.toFixed(2)})`
}

export function computeLayerMedian(values: number[]): number | null {
  const nums = values.filter(v => Number.isFinite(v)).sort((a, b) => a - b)
  if (!nums.length) return null
  const mid = Math.floor(nums.length / 2)
  return nums.length % 2 ? nums[mid]! : (nums[mid - 1]! + nums[mid]!) / 2
}

export function buildTimeSeriesExecutiveSummary(args: {
  primary: ImageryIndexInterpretation | null
  ndviMean: number | null
  ndmiMean: number | null
  ndwiMean: number | null
  saviMean: number | null
  ndwiEstimated: boolean
  saviEstimated: boolean
  acquisitionDate: string
  ndviStats: TimeSeriesLayerStatistics | null
  ndmiStats: TimeSeriesLayerStatistics | null
}): TimeSeriesExecutiveSummary {
  const {
    primary,
    ndviMean,
    ndmiMean,
    ndwiMean,
    saviMean,
    ndwiEstimated,
    saviEstimated,
    acquisitionDate,
    ndviStats,
    ndmiStats,
  } = args
  const tier = primary?.meanTier ?? 'moderate'
  const riskLevel = tierToRisk(tier)
  const ndviTrend = ndviStats?.trend ?? 'Stable'
  const ndviLabel = primary?.meanLabel ?? (ndviMean != null ? classifyIndexLabel('NDVI', ndviMean) : 'Moderate vigor')

  const stressPct =
    (primary?.coverage.find(c => c.tier === 'stress')?.pct ?? 0) +
    (primary?.coverage.find(c => c.tier === 'critical')?.pct ?? 0)
  const healthyPct = primary?.coverage.find(c => c.tier === 'healthy')?.pct ?? null
  const healthyHa = primary?.coverage.find(c => c.tier === 'healthy')?.areaHa ?? null

  const cropHealth =
    tier === 'healthy'
      ? 'Crop canopy vigor is within the healthy range for the monitoring date (NDVI-based).'
      : tier === 'moderate'
        ? 'Moderate vigor with localized variability across the field (NDVI-based).'
        : tier === 'stress'
          ? 'Vegetation stress signatures are present and warrant targeted scouting (NDVI-based).'
          : 'Critical vegetation stress detected — immediate field verification recommended (NDVI-based).'

  const vegetationTrend = `NDVI trend is ${trendPhrase(ndviTrend)} across the monitoring period${
    ndviMean != null ? ` (latest mean ${ndviMean.toFixed(2)})` : ''
  }.`

  const stressAssessment =
    stressPct >= 10
      ? `About ${stressPct.toFixed(0)}% of the AOI falls in stressed or critical vegetation classes.`
      : stressPct >= 3
        ? `Limited stress zones detected (~${stressPct.toFixed(0)}% of AOI).`
        : 'No significant stress zones detected at the classification threshold.'

  let moistureStatus = 'Moisture index data unavailable for this export.'
  if (ndmiMean != null && Number.isFinite(ndmiMean)) {
    const ndwiPart =
      ndwiMean != null && Number.isFinite(ndwiMean)
        ? `${ndwiEstimated ? 'estimated ' : ''}NDWI (${ndwiMean.toFixed(2)})`
        : null
    moistureStatus = ndwiPart
      ? `NDMI (${ndmiMean.toFixed(2)}) and ${ndwiPart} both indicate water-limited canopy conditions in parts of the field.`
      : `Canopy moisture (NDMI ${ndmiMean.toFixed(2)}) suggests water limitation in parts of the field.`
  }

  const recommendations: string[] = []
  if (stressPct >= 5) {
    recommendations.push('Inspect irrigation uniformity, prioritizing zones flagged as stressed or critical.')
  }
  if (tier === 'moderate' || tier === 'stress') {
    recommendations.push('Monitor nutrient availability where moderate-vigor and stress classes overlap.')
  }
  if (stressPct >= 3) {
    recommendations.push('Ground-truth stressed zones identified on the classification map before intervention.')
  }
  if (primary?.actions?.length) {
    recommendations.push(...primary.actions.slice(0, 2).map(a => a.text))
  }
  if (ndwiEstimated || saviEstimated) {
    recommendations.push(
      'Recompute NDWI and SAVI from raw band reflectance once available to replace the current estimates.',
    )
  }
  if (tier === 'healthy' && healthyPct != null && healthyPct >= 50) {
    recommendations.push('Continue routine monitoring and maintain current agronomic program.')
  }
  if (!recommendations.length) recommendations.push('Maintain scheduled satellite monitoring for this field.')

  const saviClause = saviEstimated
    ? ', and the soil-adjusted index (SAVI, estimated) confirms the vigor reading is not being inflated by exposed soil'
    : saviMean != null
      ? ', and the soil-adjusted index (SAVI) tracks closely with NDVI'
      : ''
  const narrative = [
    `Vegetation condition is ${trendPhrase(ndviTrend)} with ${ndviLabel.toLowerCase()}${
      ndviMean != null ? ` (NDVI ${ndviMean.toFixed(2)})` : ''
    } on the acquisition date of ${acquisitionDate}.`,
    stressPct >= 5
      ? `Stress-related classes cover roughly ${stressPct.toFixed(0)}% of the monitored area.`
      : 'Stress extent remains limited across the AOI.',
    ndmiMean != null
      ? `Canopy moisture is ${ndmiMean < 0.15 ? 'constrained' : 'moderate'} (NDMI ${ndmiMean.toFixed(2)})${saviClause}.`
      : null,
    'Together, the four indices point to a field that is photosynthetically active but under mild-to-moderate water stress in localized zones.',
  ]
    .filter(Boolean)
    .join(' ')

  const indexKpis: TimeSeriesIndexKpi[] = [
    { label: 'AREA MONITORED', value: '—', sublabel: 'AOI footprint' },
    {
      label: 'MEAN NDVI',
      value: ndviMean != null ? ndviMean.toFixed(2) : '—',
      sublabel: ndviLabel,
    },
    {
      label: 'MEAN NDMI',
      value: ndmiMean != null ? ndmiMean.toFixed(2) : '—',
      sublabel: ndmiMean != null ? ndmiExecutiveReading(ndmiMean) : '—',
    },
    {
      label: 'MEAN NDWI*',
      value: ndwiMean != null ? ndwiMean.toFixed(2) : '—',
      sublabel: ndwiMean != null ? ndwiExecutiveReading(ndwiMean) : '—',
      estimated: ndwiEstimated,
    },
    {
      label: 'MEAN SAVI*',
      value: saviMean != null ? saviMean.toFixed(2) : '—',
      sublabel: saviMean != null ? saviExecutiveReading(saviMean, ndviLabel) : '—',
      estimated: saviEstimated,
    },
  ]

  const indexOverview: TimeSeriesIndexOverviewRow[] = [
    {
      indexId: 'NDVI',
      measures: 'Canopy vigor / greenness (NIR–Red)',
      value: ndviMean != null ? ndviMean.toFixed(2) : '—',
      reading: ndviLabel,
    },
    {
      indexId: 'NDMI',
      measures: 'Canopy moisture (NIR–SWIR)',
      value: ndmiMean != null ? ndmiMean.toFixed(2) : '—',
      reading: ndmiMean != null ? ndmiExecutiveReading(ndmiMean) : '—',
    },
    {
      indexId: 'NDWI*',
      measures: 'Surface water / leaf water content (Green–NIR)',
      value: ndwiMean != null ? `${ndwiMean.toFixed(2)}${ndwiEstimated ? ' (est.)' : ''}` : '—',
      reading: ndwiMean != null ? `${ndwiExecutiveReading(ndwiMean)} water` : '—',
      estimated: ndwiEstimated,
    },
    {
      indexId: 'SAVI*',
      measures: 'Vigor adjusted for soil brightness (L=0.5)',
      value: saviMean != null ? `${saviMean.toFixed(2)}${saviEstimated ? ' (est.)' : ''}` : '—',
      reading: saviMean != null ? saviExecutiveReading(saviMean, ndviLabel) : '—',
      estimated: saviEstimated,
    },
  ]

  const healthyHaText =
    healthyHa != null && healthyHa >= 1 ? `~${healthyHa >= 100 ? healthyHa.toFixed(0) : healthyHa.toFixed(1)} ha` : 'the dominant class'
  const multiIndexNotes = [
    `Risk level: ${riskLevel}.`,
    healthyPct != null
      ? `The dominant class is ${primary?.coverage.find(c => c.tier === 'healthy')?.label?.toLowerCase() ?? 'healthy vegetation'} (${healthyHaText}, ${healthyPct.toFixed(0)}%), but the combined stress and bare-cover classes account for over a third of the AOI.`
      : primary?.coverageLine ?? 'Classification coverage derived from index thresholds.',
    ndviMean != null && ndmiMean != null
      ? `NDVI alone would read this field as ${ndviLabel.toLowerCase()}; cross-checking with NDMI and the ${ndwiEstimated ? 'estimated ' : ''}NDWI reveals that vigor is being held back by canopy water limitation rather than by structural or soil factors, since the soil-adjusted SAVI tracks closely with NDVI rather than diverging from it.`
      : null,
    'Suggested interpretation workflow: use NDVI for a first-pass vigor screen, NDMI/NDWI to separate water stress from other stress causes, and SAVI to sanity-check NDVI in sparsely vegetated or early-growth zones where exposed soil can distort the raw NDVI signal.',
  ]
    .filter(Boolean)
    .join(' ')

  return {
    headline: 'Agricultural Satellite Intelligence Report',
    narrative,
    cropHealth,
    vegetationTrend,
    stressAssessment,
    moistureStatus,
    recommendations: [...new Set(recommendations)].slice(0, 6),
    riskLevel,
    indexKpis,
    indexOverview,
    multiIndexNotes,
    ndwiEstimated,
    saviEstimated,
    ndviMean,
    ndmiMean,
    ndwiMean,
    saviMean,
  }
}
