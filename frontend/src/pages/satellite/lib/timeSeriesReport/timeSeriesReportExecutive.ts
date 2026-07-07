import { geodesicAreaM2 } from '../../../../lib/siLayerClassAreaEngine'
import type { ImageryIndexInterpretation } from '../../../../lib/imageryIndexInterpretationEngine'
import type {
  TimeSeriesLayerStatistics,
  TimeSeriesReportPayload,
  TimeSeriesTrendLabel,
} from './timeSeriesReportTypes'

export type RiskLevel = 'Very Low' | 'Low' | 'Moderate' | 'High' | 'Critical'

export type TimeSeriesExecutiveSummary = {
  studyArea: string
  areaHa: number | null
  observationCount: number
  indices: string
  periodLabel: string
  aggregationLabel: string
  overallTrend: TimeSeriesTrendLabel
  vegetationCondition: string
  moistureCondition: string
  riskLevel: RiskLevel
  keyFindings: string[]
  recommendations: string[]
  narrative: string
  satelliteInfo: string
}

function median(values: number[]): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

function classifyRisk(
  stats: TimeSeriesLayerStatistics[],
  interpretations: ImageryIndexInterpretation[],
): RiskLevel {
  const primary = stats[0]
  const interp = interpretations[0]
  if (!primary && !interpretations.length) return 'Moderate'

  let score = 0
  if (primary?.trend === 'Decreasing') score += 2
  if (primary?.mean != null && primary.mean < 0.25) score += 2
  else if (primary?.mean != null && primary.mean < 0.35) score += 1

  if (interp?.meanTier === 'critical') score += 3
  else if (interp?.meanTier === 'stress') score += 2
  else if (interp?.meanTier === 'moderate') score += 1

  if (score >= 5) return 'Critical'
  if (score >= 4) return 'High'
  if (score >= 2) return 'Moderate'
  if (score >= 1) return 'Low'
  return 'Very Low'
}

function tierToCondition(tier: string | undefined, fallback: string): string {
  switch (tier) {
    case 'healthy':
      return 'Healthy — favourable vigor'
    case 'moderate':
      return 'Moderate — acceptable with monitoring'
    case 'stress':
      return 'Stressed — intervention advised'
    case 'critical':
      return 'Critical — immediate attention'
    default:
      return fallback
  }
}

function buildRecommendations(
  stats: TimeSeriesLayerStatistics[],
  interpretations: ImageryIndexInterpretation[],
  risk: RiskLevel,
): string[] {
  const recs: string[] = []
  const primary = stats[0]
  const interp = interpretations[0]

  if (risk === 'Very Low' || risk === 'Low') {
    recs.push('Continue routine satellite monitoring on the current schedule.')
  }
  if (primary?.trend === 'Decreasing') {
    recs.push('Inspect areas with declining index values and compare with previous seasons.')
  }
  if (primary?.trend === 'Increasing') {
    recs.push('Maintain current agronomic practices; positive vegetation trend detected.')
  }
  if (interp?.actions?.length) {
    for (const action of interp.actions.slice(0, 2)) recs.push(action.text)
  }
  if (stats.length >= 2) {
    recs.push('Review index correlation (e.g. NDVI vs NDMI) for vegetation–water balance.')
  }
  recs.push('Schedule a follow-up analysis within two weeks during active growth stages.')
  return [...new Set(recs)].slice(0, 5)
}

function buildKeyFindings(
  stats: TimeSeriesLayerStatistics[],
  interpretations: ImageryIndexInterpretation[],
): string[] {
  const findings: string[] = []
  for (const s of stats.slice(0, 3)) {
    if (s.mean != null) {
      findings.push(
        `${s.layerId}: mean ${s.mean.toFixed(3)}, range ${s.min?.toFixed(3) ?? '—'}–${s.max?.toFixed(3) ?? '—'}, trend ${s.trend}.`,
      )
    }
  }
  const interp = interpretations[0]
  if (interp?.coverageLine) findings.push(interp.coverageLine)
  if (findings.length < 3 && interp?.summaryLine) findings.push(interp.summaryLine)
  return findings.slice(0, 4)
}

function buildExecutiveNarrative(
  payload: Pick<
    TimeSeriesReportPayload,
    'fieldName' | 'layerIds' | 'period' | 'layerStats' | 'interpretations' | 'interpretationNarrative'
  >,
  risk: RiskLevel,
  areaHa: number | null,
): string {
  const primary = payload.layerStats[0]
  const interp = payload.interpretations[0]
  const indices = payload.layerIds.join(', ') || 'vegetation indices'

  const paras: string[] = [
    `This executive report evaluates ${indices} dynamics within ${payload.fieldName}${areaHa != null ? ` (${areaHa.toFixed(1)} ha)` : ''} using satellite time-series analysis for ${payload.period.start} to ${payload.period.end}.`,
  ]

  if (primary?.mean != null) {
    paras.push(
      `Average ${primary.layerId} of ${primary.mean.toFixed(3)} indicates ${primary.trend.toLowerCase()} seasonal behaviour with ${primary.observationCount} valid observations in the selected aggregation window.`,
    )
  }

  if (interp?.summaryLine) {
    paras.push(interp.summaryLine)
  } else if (payload.interpretationNarrative) {
    paras.push(payload.interpretationNarrative.split('\n\n')[0] ?? payload.interpretationNarrative)
  } else {
    paras.push('Vegetation indices were processed against the AOI boundary with standard AgroCloud GeoAI workflows.')
  }

  paras.push(`Overall field condition is assessed at ${risk} risk based on trend, index magnitude, and tier classification.`)

  return paras.join('\n\n')
}

export function buildTimeSeriesExecutiveSummary(
  payload: TimeSeriesReportPayload,
  aggregationLabel: string,
): TimeSeriesExecutiveSummary {
  const areaHa = payload.location.geometry
    ? geodesicAreaM2(payload.location.geometry) / 10_000
    : null
  const primary = payload.layerStats[0]
  const ndmi = payload.layerStats.find(s => s.layerId.toUpperCase().includes('NDMI'))
  const moistureInterp = payload.interpretations.find(i =>
    i.layerId.toUpperCase().includes('NDMI'),
  )
  const vegInterp = payload.interpretations[0]

  const riskLevel = classifyRisk(payload.layerStats, payload.interpretations)
  const recommendations = buildRecommendations(payload.layerStats, payload.interpretations, riskLevel)
  const keyFindings = buildKeyFindings(payload.layerStats, payload.interpretations)

  return {
    studyArea: payload.fieldName,
    areaHa,
    observationCount: primary?.observationCount ?? payload.labels.length,
    indices: payload.layerIds.join(', ') || '—',
    periodLabel: `${payload.period.start} – ${payload.period.end}`,
    aggregationLabel,
    overallTrend: primary?.trend ?? 'Stable',
    vegetationCondition: tierToCondition(
      vegInterp?.meanTier,
      primary?.mean != null && primary.mean >= 0.45 ? 'Healthy vegetation vigor' : 'Moderate vegetation vigor',
    ),
    moistureCondition: tierToCondition(
      moistureInterp?.meanTier,
      ndmi?.mean != null && ndmi.mean >= 0.3 ? 'Adequate canopy moisture' : 'Monitor moisture status',
    ),
    riskLevel,
    keyFindings,
    recommendations,
    narrative: buildExecutiveNarrative(payload, riskLevel, areaHa),
    satelliteInfo: 'Sentinel-2 L2A · 10 m · AgroCloud GeoAI processing pipeline',
  }
}

export function computeLayerMedian(values: number[]): number | null {
  return median(values.filter(v => Number.isFinite(v)))
}
