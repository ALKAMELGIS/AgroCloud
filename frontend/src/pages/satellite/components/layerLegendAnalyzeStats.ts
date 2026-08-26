import {
  resolveIndexThresholdProfile,
  type IndexHealthTier,
} from '../../../lib/imageryIndexInterpretationEngine'
import type { LayerLiveLegendSpec } from '../../../lib/layerLiveLegendCatalog'
import type { LayerClassAreaResult } from '../../../lib/siLayerClassAreaEngine'
import {
  resolveAnalyzeIndexConfig,
  type AnalyzeTerritoryLevel,
  type LayerLegendAnalyzeIndexConfig,
} from './layerLegendAnalyzeIndexConfig'

const TIER_SCORE: Record<IndexHealthTier, number> = {
  healthy: 85,
  moderate: 58,
  stress: 36,
  critical: 14,
}

export type LayerLegendAnalyzeStats = {
  config: LayerLegendAnalyzeIndexConfig
  healthScore: number | null
  territoryLevel: AnalyzeTerritoryLevel | null
  territoryLevelLabel: string | null
  territoryLevelColor: string | null
  insight: string | null
  min: number | null
  max: number | null
  average: number | null
  /** Share of AOI in the lowest (critical) health tier (%). */
  lowPct: number | null
  stressedPct: number | null
}

function tierToTerritoryLevel(tier: IndexHealthTier): AnalyzeTerritoryLevel {
  switch (tier) {
    case 'healthy':
      return 'Healthy'
    case 'moderate':
      return 'Moderate'
    case 'stress':
      return 'Warning'
    case 'critical':
      return 'Critical'
    default:
      return 'Moderate'
  }
}

function classifyMidpoint(
  mid: number,
  profile: ReturnType<typeof resolveIndexThresholdProfile>,
): IndexHealthTier {
  for (const band of profile.tiers) {
    if (mid >= band.min && mid < band.max) return band.tier
  }
  const last = profile.tiers[profile.tiers.length - 1]
  return last?.tier ?? 'moderate'
}

function aoiOccupiedValueRange(result: LayerClassAreaResult): { min: number | null; max: number | null } {
  const edges = result.classEdges
  if (!edges?.length || edges.length < 2 || !result.rows.length) {
    return { min: null, max: null }
  }
  let min: number | null = null
  let max: number | null = null
  for (let i = 0; i < result.rows.length; i++) {
    const row = result.rows[i]
    const lo = edges[i]
    const hi = edges[i + 1]
    if (!row || row.count <= 0 || lo == null || hi == null) continue
    min = min == null ? lo : Math.min(min, lo)
    max = max == null ? hi : Math.max(max, hi)
  }
  return { min, max }
}

function hasAoiSamples(result: LayerClassAreaResult | null | undefined): boolean {
  if (!result?.rows?.length) return false
  return result.rows.some(row => (row.count ?? 0) > 0)
}

function weightedIndexMean(result: LayerClassAreaResult): number | null {
  const edges = result.classEdges
  if (!edges?.length || edges.length < 2 || !result.rows.length) return null
  let sum = 0
  let weight = 0
  for (let i = 0; i < result.rows.length; i++) {
    const row = result.rows[i]
    const lo = edges[i]
    const hi = edges[i + 1]
    if (!row || row.count <= 0 || lo == null || hi == null) continue
    const mid = (lo + hi) / 2
    sum += mid * row.count
    weight += row.count
  }
  if (weight <= 0) return null
  return sum / weight
}

function computeLowPct(
  result: LayerClassAreaResult,
  profile: ReturnType<typeof resolveIndexThresholdProfile>,
): number | null {
  const edges = result.classEdges
  if (!edges?.length || edges.length < 2 || !result.rows.length) return null
  let low = 0
  for (let i = 0; i < result.rows.length; i++) {
    const row = result.rows[i]
    const lo = edges[i]
    const hi = edges[i + 1]
    if (!row || lo == null || hi == null) continue
    const mid = (lo + hi) / 2
    const tier = classifyMidpoint(mid, profile)
    if (tier === 'critical') {
      low += row.pctOfAoi ?? 0
    }
  }
  return Number(Math.min(100, low).toFixed(0))
}

/** Rough LOW % when only zonal min/max/mean are available (no histogram). */
function estimateLowPctFromZonal(
  min: number | null,
  average: number,
  profile: ReturnType<typeof resolveIndexThresholdProfile>,
): number | null {
  if (min == null || !Number.isFinite(min)) return null
  const minTier = classifyMidpoint(min, profile)
  if (minTier !== 'critical') return 0
  const avgTier = classifyMidpoint(average, profile)
  if (avgTier === 'critical') return 100
  if (avgTier === 'stress') return 45
  if (avgTier === 'moderate') return 20
  return 8
}

function computeStressedPct(
  result: LayerClassAreaResult,
  profile: ReturnType<typeof resolveIndexThresholdProfile>,
): number | null {
  const edges = result.classEdges
  if (!edges?.length || edges.length < 2 || !result.rows.length) return null
  let stressed = 0
  for (let i = 0; i < result.rows.length; i++) {
    const row = result.rows[i]
    const lo = edges[i]
    const hi = edges[i + 1]
    if (!row || lo == null || hi == null) continue
    const mid = (lo + hi) / 2
    const tier = classifyMidpoint(mid, profile)
    if (tier === 'stress' || tier === 'critical') {
      stressed += row.pctOfAoi ?? 0
    }
  }
  return Number(Math.min(100, stressed).toFixed(0))
}

function bandForAverage(
  average: number,
  profile: ReturnType<typeof resolveIndexThresholdProfile>,
) {
  for (const band of profile.tiers) {
    if (average >= band.min && average < band.max) return band
  }
  return profile.tiers[profile.tiers.length - 1] ?? profile.tiers[0]!
}

export type LayerLegendIndexStatsFallback = {
  min: number | null
  max: number | null
  average: number | null
}

export function computeLayerLegendAnalyzeStats(input: {
  layerId?: string
  spec: LayerLiveLegendSpec
  areaResult: LayerClassAreaResult | null
  /** Zonal min/max/mean when histogram class areas are unavailable. */
  indexStats?: LayerLegendIndexStatsFallback | null
}): LayerLegendAnalyzeStats {
  const config = resolveAnalyzeIndexConfig(input.layerId, input.spec.title)
  const profile = resolveIndexThresholdProfile(config.key)
  const occupiedRange = input.areaResult ? aoiOccupiedValueRange(input.areaResult) : { min: null, max: null }
  let average = input.areaResult ? weightedIndexMean(input.areaResult) : null
  let min = occupiedRange.min
  let max = occupiedRange.max
  let stressedPct =
    input.areaResult && hasAoiSamples(input.areaResult)
      ? computeStressedPct(input.areaResult, profile)
      : null
  let lowPct =
    input.areaResult && hasAoiSamples(input.areaResult)
      ? computeLowPct(input.areaResult, profile)
      : null

  if (average == null || !Number.isFinite(average)) {
    const fallback = input.indexStats
    if (fallback?.average != null && Number.isFinite(fallback.average)) {
      average = fallback.average
      min = fallback.min ?? average
      max = fallback.max ?? average
    }
  }

  if (average == null || !Number.isFinite(average)) {
    return {
      config,
      healthScore: null,
      territoryLevel: null,
      territoryLevelLabel: null,
      territoryLevelColor: null,
      insight: null,
      min,
      max,
      average: null,
      lowPct,
      stressedPct,
    }
  }

  if (lowPct == null && input.indexStats) {
    lowPct = estimateLowPctFromZonal(min, average, profile)
  }

  const band = bandForAverage(average, profile)
  const territoryLevel = tierToTerritoryLevel(band.tier)
  const healthScore = TIER_SCORE[band.tier] ?? null

  return {
    config,
    healthScore,
    territoryLevel,
    territoryLevelLabel: config.levelLabels[territoryLevel].toUpperCase(),
    territoryLevelColor: band.color,
    insight: config.insights[territoryLevel],
    min,
    max,
    average,
    lowPct,
    stressedPct,
  }
}

export function formatLegendStatValue(v: number | null | undefined, digits = 4): string {
  if (v == null || !Number.isFinite(v)) return '—'
  if (Number.isInteger(v)) return String(v)
  return v.toFixed(digits).replace(/\.?0+$/, '')
}

export function formatLowPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return String(Math.round(v))
}

export function formatStressedPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return `${Math.round(v)}%`
}
