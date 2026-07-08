import { evaluateImageryLayerDailyValue } from '../pages/dashboards/agroCloudPlatform/acpImageryTimeSeries'
import { geodesicAreaM2, resolveLayerClassBreakdown } from './siLayerClassAreaEngine'
import type { LayerClassAreaResult } from './siLayerClassAreaEngine'
import type { SentinelHubDailyIndexMeans, SentinelHubIndexZonalStats } from './sentinelHubStatisticsApi'

export type IndexHealthTier = 'critical' | 'stress' | 'moderate' | 'healthy'

export type IndexTierBand = {
  tier: IndexHealthTier
  min: number
  max: number
  label: string
  color: string
}

export type IndexThresholdProfile = {
  id: string
  label: string
  /** Higher values = better unless `invertHealth` (e.g. NBR burn). */
  invertHealth?: boolean
  tiers: IndexTierBand[]
}

export type CoverageTierStats = {
  tier: IndexHealthTier
  label: string
  color: string
  areaHa: number
  areaM2: number
  pct: number
}

export type ImageryIndexAction = {
  tone: 'ok' | 'warn' | 'alert'
  text: string
}

export type ImageryIndexInterpretation = {
  layerId: string
  sceneDate: string
  mean: number | null
  min: number | null
  max: number | null
  stdDev: number | null
  meanTier: IndexHealthTier
  meanLabel: string
  meanColor: string
  totalAreaHa: number
  totalAreaM2: number
  coverage: CoverageTierStats[]
  summaryLine: string
  coverageLine: string
  actionsLine: string
  actions: ImageryIndexAction[]
  lines: [string, string?, string?]
  areasFromHistogram: boolean
}

const TIER_ORDER: IndexHealthTier[] = ['healthy', 'moderate', 'stress', 'critical']

const NDVI_PROFILE: IndexThresholdProfile = {
  id: 'NDVI',
  label: 'NDVI',
  tiers: [
    { tier: 'critical', min: -1, max: 0.15, label: 'Bare / no cover', color: '#ef4444' },
    { tier: 'stress', min: 0.15, max: 0.35, label: 'Stressed vegetation', color: '#f97316' },
    { tier: 'moderate', min: 0.35, max: 0.55, label: 'Moderate vigor', color: '#eab308' },
    { tier: 'healthy', min: 0.55, max: 1.05, label: 'Healthy vegetation', color: '#22c55e' },
  ],
}

const EVI_PROFILE: IndexThresholdProfile = {
  id: 'EVI',
  label: 'EVI',
  tiers: [
    { tier: 'critical', min: -1, max: 0.2, label: 'Very low biomass', color: '#ef4444' },
    { tier: 'stress', min: 0.2, max: 0.4, label: 'Low biomass', color: '#f97316' },
    { tier: 'moderate', min: 0.4, max: 0.6, label: 'Moderate biomass', color: '#eab308' },
    { tier: 'healthy', min: 0.6, max: 1.5, label: 'High biomass', color: '#22c55e' },
  ],
}

const SAVI_PROFILE: IndexThresholdProfile = {
  id: 'SAVI',
  label: 'SAVI',
  tiers: [
    { tier: 'critical', min: -0.5, max: 0.15, label: 'Sparse cover', color: '#ef4444' },
    { tier: 'stress', min: 0.15, max: 0.3, label: 'Low density', color: '#f97316' },
    { tier: 'moderate', min: 0.3, max: 0.5, label: 'Moderate density', color: '#eab308' },
    { tier: 'healthy', min: 0.5, max: 1.05, label: 'Dense vegetation', color: '#22c55e' },
  ],
}

const MSAVI_PROFILE: IndexThresholdProfile = {
  id: 'MSAVI',
  label: 'MSAVI',
  tiers: [
    { tier: 'critical', min: -0.5, max: 0.18, label: 'Sparse cover', color: '#ef4444' },
    { tier: 'stress', min: 0.18, max: 0.32, label: 'Low density', color: '#f97316' },
    { tier: 'moderate', min: 0.32, max: 0.52, label: 'Moderate density', color: '#eab308' },
    { tier: 'healthy', min: 0.52, max: 1.05, label: 'Dense vegetation', color: '#22c55e' },
  ],
}

const GNDVI_PROFILE: IndexThresholdProfile = {
  id: 'GNDVI',
  label: 'GNDVI',
  tiers: [
    { tier: 'critical', min: -1, max: 0.2, label: 'Very low greenness', color: '#ef4444' },
    { tier: 'stress', min: 0.2, max: 0.4, label: 'Low greenness', color: '#f97316' },
    { tier: 'moderate', min: 0.4, max: 0.58, label: 'Moderate greenness', color: '#eab308' },
    { tier: 'healthy', min: 0.58, max: 1.05, label: 'High greenness', color: '#22c55e' },
  ],
}

const NDWI_PROFILE: IndexThresholdProfile = {
  id: 'NDWI',
  label: 'NDWI',
  tiers: [
    { tier: 'critical', min: -1, max: -0.05, label: 'Very dry', color: '#ef4444' },
    { tier: 'stress', min: -0.05, max: 0.1, label: 'Low moisture', color: '#f97316' },
    { tier: 'moderate', min: 0.1, max: 0.25, label: 'Adequate moisture', color: '#eab308' },
    { tier: 'healthy', min: 0.25, max: 1, label: 'Good moisture', color: '#22c55e' },
  ],
}

const NDMI_PROFILE: IndexThresholdProfile = {
  id: 'NDMI',
  label: 'NDMI',
  tiers: [
    { tier: 'critical', min: -0.8, max: -0.15, label: 'Very dry canopy', color: '#ef4444' },
    { tier: 'stress', min: -0.15, max: 0.05, label: 'Low canopy moisture', color: '#f97316' },
    { tier: 'moderate', min: 0.05, max: 0.22, label: 'Adequate canopy moisture', color: '#eab308' },
    { tier: 'healthy', min: 0.22, max: 0.8, label: 'Good canopy moisture', color: '#22c55e' },
  ],
}

/** ET invertHealth: higher ET demand ↔ higher irrigation need / stress for dryland irrigation monitoring. */
const ET_PROFILE: IndexThresholdProfile = {
  id: 'ET',
  label: 'ET',
  invertHealth: true,
  tiers: [
    { tier: 'healthy', min: 0, max: 3, label: 'Low ET demand', color: '#22c55e' },
    { tier: 'moderate', min: 3, max: 5.5, label: 'Moderate ET', color: '#eab308' },
    { tier: 'stress', min: 5.5, max: 7.5, label: 'High ET demand', color: '#f97316' },
    { tier: 'critical', min: 7.5, max: 10.5, label: 'Exceptional ET demand', color: '#ef4444' },
  ],
}

const NDRE_PROFILE: IndexThresholdProfile = {
  id: 'NDRE',
  label: 'NDRE',
  tiers: [
    { tier: 'critical', min: -1, max: 0.18, label: 'Low chlorophyll', color: '#ef4444' },
    { tier: 'stress', min: 0.18, max: 0.32, label: 'Chlorophyll stress', color: '#f97316' },
    { tier: 'moderate', min: 0.32, max: 0.48, label: 'Moderate chlorophyll', color: '#eab308' },
    { tier: 'healthy', min: 0.48, max: 1, label: 'High chlorophyll', color: '#22c55e' },
  ],
}

const NBR_PROFILE: IndexThresholdProfile = {
  id: 'NBR',
  label: 'NBR',
  invertHealth: true,
  tiers: [
    { tier: 'healthy', min: 0.25, max: 1, label: 'Unburned vegetation', color: '#22c55e' },
    { tier: 'moderate', min: 0.1, max: 0.25, label: 'Low severity', color: '#eab308' },
    { tier: 'stress', min: -0.1, max: 0.1, label: 'Moderate severity', color: '#f97316' },
    { tier: 'critical', min: -1, max: -0.1, label: 'Severe burn', color: '#ef4444' },
  ],
}

const GENERIC_PROFILE: IndexThresholdProfile = {
  id: 'GENERIC',
  label: 'Index',
  tiers: [
    { tier: 'critical', min: -1, max: 0.2, label: 'Low', color: '#ef4444' },
    { tier: 'stress', min: 0.2, max: 0.4, label: 'Below average', color: '#f97316' },
    { tier: 'moderate', min: 0.4, max: 0.6, label: 'Moderate', color: '#eab308' },
    { tier: 'healthy', min: 0.6, max: 2, label: 'Favorable', color: '#22c55e' },
  ],
}

const PROFILE_BY_ID: Record<string, IndexThresholdProfile> = {
  NDVI: NDVI_PROFILE,
  EVI: EVI_PROFILE,
  SAVI: SAVI_PROFILE,
  MSAVI: MSAVI_PROFILE,
  GNDVI: GNDVI_PROFILE,
  NDWI: NDWI_PROFILE,
  NDMI: NDMI_PROFILE,
  ET: ET_PROFILE,
  NDRE: NDRE_PROFILE,
  NBR: NBR_PROFILE,
  CI_RE: NDRE_PROFILE,
  CIRE: NDRE_PROFILE,
}

export function resolveIndexThresholdProfile(layerId: string): IndexThresholdProfile {
  const id = String(layerId || '').trim().toUpperCase()
  return PROFILE_BY_ID[id] ?? { ...GENERIC_PROFILE, id, label: id || 'Index' }
}

function classifyValue(value: number, profile: IndexThresholdProfile): IndexTierBand {
  for (const band of profile.tiers) {
    if (value >= band.min && value < band.max) return band
  }
  const last = profile.tiers[profile.tiers.length - 1]
  return last ?? profile.tiers[0]!
}

function overlapLength(aMin: number, aMax: number, bMin: number, bMax: number): number {
  const low = Math.max(aMin, bMin)
  const high = Math.min(aMax, bMax)
  return Math.max(0, high - low)
}

function estimateTierSharesFromRange(
  min: number,
  max: number,
  profile: IndexThresholdProfile,
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
    const band = classifyValue((lo + hi) / 2, profile)
    shares[band.tier] = 1
    return shares
  }
  for (const band of profile.tiers) {
    shares[band.tier] = overlapLength(lo, hi, band.min, band.max) / span
  }
  const total = Object.values(shares).reduce((s, v) => s + v, 0)
  if (total <= 0) {
    const band = classifyValue((lo + hi) / 2, profile)
    shares[band.tier] = 1
    return shares
  }
  for (const tier of TIER_ORDER) shares[tier] /= total
  return shares
}

function pickZonalForLayer(
  row: SentinelHubDailyIndexMeans,
  layerId: string,
): SentinelHubIndexZonalStats | null {
  const z = row.zonal
  if (!z) return null
  const id = layerId.trim().toUpperCase()
  if (id === 'NDVI') return z.ndvi ?? null
  if (id === 'NDMI') return z.ndmi ?? null
  if (id === 'NDWI') return z.ndwi ?? null
  if (id === 'EVI') return z.evi ?? null
  if (id === 'SAVI') return z.savi ?? null
  if (id === 'NDRE' || id === 'CI_RE' || id === 'CIRE') return z.ciRe ?? null
  return null
}

function resolveDailyRowForDate(
  dailyRows: SentinelHubDailyIndexMeans[],
  sceneDate: string,
): SentinelHubDailyIndexMeans | null {
  const want = sceneDate.trim().slice(0, 10)
  if (!want) return null
  const exact = dailyRows.find(r => r.date === want)
  if (exact) return exact
  let best: SentinelHubDailyIndexMeans | null = null
  let bestDist = Infinity
  for (const row of dailyRows) {
    const dist = Math.abs(Date.parse(`${row.date}T12:00:00Z`) - Date.parse(`${want}T12:00:00Z`))
    if (dist < bestDist) {
      bestDist = dist
      best = row
    }
  }
  return bestDist <= 7 * 86400000 ? best : null
}

function stdDev(values: number[]): number | null {
  if (values.length < 2) return null
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length
  const sd = Math.sqrt(variance)
  return Number.isFinite(sd) ? sd : null
}

function formatHa(ha: number): string {
  if (!Number.isFinite(ha) || ha <= 0) return '0'
  if (ha >= 100) return ha.toFixed(0)
  if (ha >= 1) return ha.toFixed(1)
  return ha.toFixed(2)
}

function formatM2(m2: number): string {
  if (!Number.isFinite(m2) || m2 <= 0) return '0'
  return Math.round(m2).toLocaleString('en-US')
}

function formatPct(pct: number): string {
  if (!Number.isFinite(pct)) return '0'
  return pct >= 10 ? pct.toFixed(0) : pct.toFixed(1)
}

function buildActions(tier: IndexHealthTier, profile: IndexThresholdProfile): ImageryIndexAction[] {
  const id = profile.id
  if (tier === 'healthy') {
    if (id === 'NDWI' || id === 'NDMI') {
      return [
        { tone: 'ok', text: 'Continue current irrigation schedule.' },
        { tone: 'ok', text: 'Monitor for localized dry patches after heat events.' },
      ]
    }
    if (id === 'NBR') {
      return [
        { tone: 'ok', text: 'Vegetation appears unburned — maintain routine monitoring.' },
        { tone: 'ok', text: 'Document baseline for future disturbance tracking.' },
      ]
    }
    return [
      { tone: 'ok', text: 'Continue current irrigation schedule.' },
      { tone: 'ok', text: 'Maintain fertilization program.' },
    ]
  }
  if (tier === 'moderate') {
    if (id === 'NDWI' || id === 'NDMI') {
      return [
        { tone: 'warn', text: 'Inspect irrigation uniformity.' },
        { tone: 'warn', text: 'Schedule moisture checks in drier zones.' },
      ]
    }
    if (id === 'NDRE' || id === 'CI_RE' || id === 'CIRE') {
      return [
        { tone: 'warn', text: 'Review nitrogen application timing.' },
        { tone: 'warn', text: 'Sample leaves in moderate zones.' },
      ]
    }
    return [
      { tone: 'warn', text: 'Inspect irrigation uniformity.' },
      { tone: 'warn', text: 'Monitor nutrient availability.' },
    ]
  }
  if (tier === 'stress') {
    return [
      { tone: 'warn', text: 'Field inspection recommended.' },
      { tone: 'warn', text: 'Check for pests, disease, or water deficiency.' },
    ]
  }
  return [
    { tone: 'alert', text: 'Immediate field inspection recommended.' },
    { tone: 'alert', text: 'Verify irrigation, drainage, and crop establishment.' },
    { tone: 'alert', text: 'Consider targeted intervention in critical zones.' },
  ]
}

function buildSummaryLine(
  profile: IndexThresholdProfile,
  mean: number,
  meanBand: IndexTierBand,
  sceneDate: string,
  totalAreaHa = 0,
): string {
  const v = mean.toFixed(2)
  const id = profile.id
  if (id === 'NDVI') {
    return `Mean NDVI: ${v} (${meanBand.label.toLowerCase()}). Acquisition ${sceneDate}.`
  }
  if (id === 'NDWI') {
    return `Mean NDWI: ${v}. Surface/water moisture is ${meanBand.label.toLowerCase()} on ${sceneDate}.`
  }
  if (id === 'NDMI') {
    return `Canopy moisture is ${meanBand.label.toLowerCase()} (mean NDMI ${v}) on ${sceneDate}.`
  }
  if (id === 'ET') {
    const lossHaDay = (mean * 10).toFixed(1)
    const lossDay =
      totalAreaHa > 0 ? (mean * totalAreaHa * 10).toFixed(0) : null
    return lossDay != null
      ? `Mean ET: ${v} mm/day (${meanBand.label}) · Water loss ${lossDay} m³/day (${lossHaDay} m³/ha/day) · ${sceneDate}.`
      : `Mean ET: ${v} mm/day (${meanBand.label}) · ${lossHaDay} m³/ha/day · ${sceneDate}.`
  }
  if (id === 'SAVI' || id === 'MSAVI') {
    return `Mean ${profile.label}: ${v} — ${meanBand.label.toLowerCase()} with limited soil influence.`
  }
  if (id === 'NDRE' || id === 'CI_RE' || id === 'CIRE') {
    return `Mean ${profile.label}: ${v} — ${meanBand.label.toLowerCase()} on ${sceneDate}.`
  }
  if (id === 'NBR') {
    return `Mean NBR: ${v} — ${meanBand.label.toLowerCase()} on ${sceneDate}.`
  }
  return `Mean ${profile.label}: ${v} (${meanBand.label.toLowerCase()}) · ${sceneDate}.`
}

function buildCoverageLine(
  profile: IndexThresholdProfile,
  coverage: CoverageTierStats[],
  totalAreaHa: number,
): string {
  const healthy = coverage.find(c => c.tier === 'healthy')
  const moderate = coverage.find(c => c.tier === 'moderate')
  const stress = coverage.find(c => c.tier === 'stress')
  const critical = coverage.find(c => c.tier === 'critical')
  const id = profile.id

  if (healthy && healthy.pct >= 50) {
    const secondary =
      moderate && moderate.pct >= 5 ? moderate : stress && stress.pct >= 5 ? stress : critical
    if (secondary && secondary.pct >= 3) {
      return `~${formatHa(healthy.areaHa)} ha (${formatPct(healthy.pct)}%) ${healthy.label.toLowerCase()}, ${formatHa(secondary.areaHa)} ha (${formatPct(secondary.pct)}%) ${secondary.label.toLowerCase()} · ${formatM2(totalAreaHa * 10000)} m² total.`
    }
    return `~${formatHa(healthy.areaHa)} ha (${formatPct(healthy.pct)}%) of the field shows ${id === 'NDWI' || id === 'NDMI' ? 'favorable moisture' : 'favorable conditions'} · ${formatM2(totalAreaHa * 10000)} m².`
  }

  const dominant = [...coverage].sort((a, b) => b.pct - a.pct)[0]
  if (!dominant || dominant.pct <= 0) {
    return `Field area ~${formatHa(totalAreaHa)} ha (${formatM2(totalAreaHa * 10000)} m²).`
  }
  return `Dominant class: ${dominant.label.toLowerCase()} (~${formatHa(dominant.areaHa)} ha, ${formatPct(dominant.pct)}%).`
}

function coverageFromHistogram(
  profile: IndexThresholdProfile,
  histogram: LayerClassAreaResult,
  totalAreaM2: number,
): CoverageTierStats[] {
  const shares: Record<IndexHealthTier, number> = {
    critical: 0,
    stress: 0,
    moderate: 0,
    healthy: 0,
  }
  const breakdown = resolveLayerClassBreakdown(profile.id)
  if (!breakdown) {
    return coverageFromShares(
      profile,
      { critical: 0.25, stress: 0.25, moderate: 0.25, healthy: 0.25 },
      totalAreaM2,
    )
  }

  for (const row of histogram.rows) {
    const low = breakdown.edges[row.classIndex]
    const high = breakdown.edges[row.classIndex + 1]
    const mid = low != null && high != null ? (low + high) / 2 : 0
    const band = classifyValue(mid, profile)
    shares[band.tier] += row.pctOfAoi
  }

  const totalPct = Object.values(shares).reduce((s, v) => s + v, 0) || 1
  return TIER_ORDER.map(tier => {
    const band = profile.tiers.find(t => t.tier === tier) ?? profile.tiers[0]!
    const pct = (shares[tier] / totalPct) * 100
    const areaM2 = (totalAreaM2 * pct) / 100
    return {
      tier,
      label: band.label,
      color: band.color,
      areaHa: areaM2 / 10_000,
      areaM2,
      pct,
    }
  })
}

function coverageFromShares(
  profile: IndexThresholdProfile,
  shares: Record<IndexHealthTier, number>,
  totalAreaM2: number,
): CoverageTierStats[] {
  return TIER_ORDER.map(tier => {
    const band = profile.tiers.find(t => t.tier === tier) ?? profile.tiers[0]!
    const pct = shares[tier] * 100
    const areaM2 = (totalAreaM2 * pct) / 100
    return {
      tier,
      label: band.label,
      color: band.color,
      areaHa: areaM2 / 10_000,
      areaM2,
      pct,
    }
  })
}

export type BuildImageryIndexInterpretationInput = {
  layerId: string
  sceneDate: string
  geometry: GeoJSON.Geometry | null | undefined
  dailyRows: SentinelHubDailyIndexMeans[]
  chartLabels: string[]
  chartValues: number[]
  histogram?: LayerClassAreaResult | null
}

export function buildImageryIndexInterpretation(
  input: BuildImageryIndexInterpretationInput,
): ImageryIndexInterpretation | null {
  const layerId = String(input.layerId || '').trim().toUpperCase()
  const sceneDate = String(input.sceneDate || '').trim().slice(0, 10)
  if (!layerId || !sceneDate) return null

  const profile = resolveIndexThresholdProfile(layerId)
  const totalAreaM2 = input.geometry ? geodesicAreaM2(input.geometry) : 0
  const totalAreaHa = totalAreaM2 / 10_000

  const row = resolveDailyRowForDate(input.dailyRows, sceneDate)
  const zonal = row ? pickZonalForLayer(row, layerId) : null

  const chartIdx = input.chartLabels.indexOf(sceneDate)
  const chartMean =
    chartIdx >= 0 && Number.isFinite(input.chartValues[chartIdx]!)
      ? input.chartValues[chartIdx]!
      : null

  const dailyMean = row ? evaluateImageryLayerDailyValue(layerId, row) : null
  const mean = chartMean ?? zonal?.mean ?? dailyMean
  if (mean == null || !Number.isFinite(mean)) return null

  const min = zonal?.min ?? mean
  const max = zonal?.max ?? mean
  const nearbyValues = input.chartValues.filter(v => Number.isFinite(v))
  const std = stdDev(nearbyValues)

  const meanBand = classifyValue(mean, profile)
  const actions = buildActions(meanBand.tier, profile)

  let coverage: CoverageTierStats[]
  let areasFromHistogram = false
  if (input.histogram?.rows?.length && totalAreaM2 > 0) {
    coverage = coverageFromHistogram(profile, input.histogram, totalAreaM2)
    areasFromHistogram = true
  } else if (totalAreaM2 > 0) {
    const shares = estimateTierSharesFromRange(min, max, profile)
    coverage = coverageFromShares(profile, shares, totalAreaM2)
  } else {
    coverage = TIER_ORDER.map(tier => {
      const band = profile.tiers.find(t => t.tier === tier) ?? profile.tiers[0]!
      return { tier, label: band.label, color: band.color, areaHa: 0, areaM2: 0, pct: 0 }
    })
  }

  const resolvedDate = input.histogram?.sceneDate ?? row?.date ?? sceneDate
  const summaryLine = buildSummaryLine(profile, mean, meanBand, resolvedDate, totalAreaHa)
  const coverageLine = buildCoverageLine(profile, coverage, totalAreaHa)
  const actionsLine = actions
    .slice(0, 3)
    .map(a => `${a.tone === 'ok' ? '✓' : '⚠'} ${a.text}`)
    .join(' ')

  const lines: [string, string?, string?] = [summaryLine, coverageLine, actionsLine]

  return {
    layerId,
    sceneDate: resolvedDate,
    mean,
    min,
    max,
    stdDev: std,
    meanTier: meanBand.tier,
    meanLabel: meanBand.label,
    meanColor: meanBand.color,
    totalAreaHa,
    totalAreaM2,
    coverage,
    summaryLine,
    coverageLine,
    actionsLine,
    actions,
    lines,
    areasFromHistogram,
  }
}
