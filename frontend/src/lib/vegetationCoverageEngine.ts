/**
 * Vegetation coverage analytics from NDVI histograms and time-series means.
 */

import { resolveLayerClassBreakdown } from './siLayerClassAreaEngine'
import type { LayerClassAreaResult } from './siLayerClassAreaEngine'
import { geodesicAreaM2 } from './siLayerClassAreaEngine'

export type VegetationCoverageClassId =
  | 'dense'
  | 'moderate'
  | 'sparse'
  | 'very_sparse'
  | 'bare_soil'
  | 'water'

export type VegetationCoverageClass = {
  id: VegetationCoverageClassId
  label: string
  color: string
  areaHa: number
  pct: number
}

export type VegetationCoverageSummary = {
  sceneDate: string
  totalAoiHa: number
  analyzedHa: number
  vegetatedHa: number
  nonVegetatedHa: number
  vegetationCoveragePct: number
  bareSoilPct: number
  waterPct: number
  cloudShadowPct: number
  classes: VegetationCoverageClass[]
  fromHistogram: boolean
}

export type VegetationCoverageTrendPoint = {
  date: string
  vegetatedHa: number
  coveragePct: number
}

export type VegetationCoverageComparison = {
  rows: Array<{ date: string; vegetatedHa: number; coveragePct: number }>
  gainHa: number
  lossHa: number
  netChangeHa: number
  coverageIncreasePct: number
}

export type VegetationCoverageInsights = {
  narrative: string[]
  recommendations: string[]
}

const CLASS_DEFS: Array<{
  id: VegetationCoverageClassId
  label: string
  color: string
  min: number
  max: number
}> = [
  { id: 'water', label: 'Water', color: '#1e88e5', min: -Infinity, max: -0.05 },
  { id: 'bare_soil', label: 'Bare Soil', color: '#d4a574', min: -0.05, max: 0.1 },
  { id: 'very_sparse', label: 'Very Sparse Vegetation', color: '#fdd835', min: 0.1, max: 0.2 },
  { id: 'sparse', label: 'Sparse Vegetation', color: '#9ccc65', min: 0.2, max: 0.4 },
  { id: 'moderate', label: 'Moderate Vegetation', color: '#43a047', min: 0.4, max: 0.6 },
  { id: 'dense', label: 'Dense Vegetation', color: '#1b5e20', min: 0.6, max: Infinity },
]

const VEGETATED_IDS = new Set<VegetationCoverageClassId>(['dense', 'moderate', 'sparse', 'very_sparse'])

function classifyNdviMidpoint(mid: number): VegetationCoverageClassId {
  for (const def of CLASS_DEFS) {
    if (mid >= def.min && mid < def.max) return def.id
  }
  return mid >= 0.6 ? 'dense' : 'bare_soil'
}

function emptyClasses(): VegetationCoverageClass[] {
  return CLASS_DEFS.map(def => ({
    id: def.id,
    label: def.label,
    color: def.color,
    areaHa: 0,
    pct: 0,
  }))
}

function buildSummaryFromClassHa(
  sceneDate: string,
  totalAoiHa: number,
  analyzedHa: number,
  classHa: Record<VegetationCoverageClassId, number>,
  fromHistogram: boolean,
): VegetationCoverageSummary {
  const analyzedTotalHa = Object.values(classHa).reduce((s, v) => s + v, 0)
  const baseHa = analyzedTotalHa > 0 ? analyzedTotalHa : totalAoiHa

  const classes: VegetationCoverageClass[] = CLASS_DEFS.map(def => {
    const areaHa = classHa[def.id] ?? 0
    return {
      id: def.id,
      label: def.label,
      color: def.color,
      areaHa,
      pct: baseHa > 0 ? (areaHa / baseHa) * 100 : 0,
    }
  })

  const vegetatedHa = CLASS_DEFS.filter(d => VEGETATED_IDS.has(d.id)).reduce(
    (s, d) => s + (classHa[d.id] ?? 0),
    0,
  )
  const nonVegetatedHa = Math.max(0, baseHa - vegetatedHa)
  const bareSoilHa = classHa.bare_soil ?? 0
  const waterHa = classHa.water ?? 0
  const cloudShadowHa = Math.max(0, totalAoiHa - analyzedHa)

  return {
    sceneDate,
    totalAoiHa,
    analyzedHa,
    vegetatedHa,
    nonVegetatedHa,
    vegetationCoveragePct: baseHa > 0 ? (vegetatedHa / baseHa) * 100 : 0,
    bareSoilPct: baseHa > 0 ? (bareSoilHa / baseHa) * 100 : 0,
    waterPct: baseHa > 0 ? (waterHa / baseHa) * 100 : 0,
    cloudShadowPct: totalAoiHa > 0 ? (cloudShadowHa / totalAoiHa) * 100 : 0,
    classes,
    fromHistogram,
  }
}

/** Map NDVI histogram bins to vegetation coverage classes. */
export function buildVegetationCoverageFromHistogram(
  histogram: LayerClassAreaResult,
  geometry: GeoJSON.Geometry | GeoJSON.Feature | null | undefined,
  sceneDate: string,
): VegetationCoverageSummary {
  const breakdown = resolveLayerClassBreakdown('NDVI')
  const totalAoiHa = geodesicAreaM2(geometry) / 10_000
  const analyzedHa = histogram.analyzedAreaM2 / 10_000
  const classHa = Object.fromEntries(CLASS_DEFS.map(d => [d.id, 0])) as Record<
    VegetationCoverageClassId,
    number
  >

  if (!breakdown || !histogram.rows.length) {
    return buildSummaryFromClassHa(sceneDate, totalAoiHa, analyzedHa, classHa, false)
  }

  const { edges } = breakdown
  for (const row of histogram.rows) {
    const low = edges[row.classIndex] ?? -1
    const high = edges[row.classIndex + 1] ?? 1
    const mid = (low + high) / 2
    const classId = classifyNdviMidpoint(mid)
    classHa[classId] = (classHa[classId] ?? 0) + row.areaHa
  }

  return buildSummaryFromClassHa(sceneDate, totalAoiHa, analyzedHa, classHa, true)
}

/** Estimate coverage from a single NDVI mean when histogram is unavailable. */
export function estimateVegetationCoverageFromMean(
  ndviMean: number,
  geometry: GeoJSON.Geometry | GeoJSON.Feature | null | undefined,
  sceneDate: string,
): VegetationCoverageSummary {
  const totalAoiHa = geodesicAreaM2(geometry) / 10_000
  const classHa = Object.fromEntries(CLASS_DEFS.map(d => [d.id, 0])) as Record<
    VegetationCoverageClassId,
    number
  >

  if (!Number.isFinite(ndviMean)) {
    return buildSummaryFromClassHa(sceneDate, totalAoiHa, totalAoiHa, classHa, false)
  }

  const primary = classifyNdviMidpoint(ndviMean)
  classHa[primary] = totalAoiHa * 0.55
  if (primary !== 'dense' && ndviMean > 0.35) classHa.moderate = totalAoiHa * 0.25
  if (primary !== 'bare_soil' && ndviMean < 0.45) classHa.bare_soil = totalAoiHa * 0.12
  const assigned = Object.values(classHa).reduce((s, v) => s + v, 0)
  classHa[primary] += Math.max(0, totalAoiHa - assigned)

  return buildSummaryFromClassHa(sceneDate, totalAoiHa, totalAoiHa, classHa, false)
}

/** Approximate vegetation coverage trend from NDVI means over time. */
export function buildVegetationCoverageTrend(
  labels: string[],
  ndviValues: number[],
  totalAoiHa: number,
): VegetationCoverageTrendPoint[] {
  const points: VegetationCoverageTrendPoint[] = []
  for (let i = 0; i < labels.length; i += 1) {
    const ndvi = ndviValues[i]
    if (ndvi == null || !Number.isFinite(ndvi)) continue
    const coveragePct = Math.max(0, Math.min(100, ((ndvi - 0.08) / 0.62) * 100))
    const vegetatedHa = (totalAoiHa * coveragePct) / 100
    points.push({ date: labels[i]!, vegetatedHa, coveragePct })
  }
  return points
}

export function buildVegetationCoverageComparison(
  summaries: VegetationCoverageSummary[],
): VegetationCoverageComparison | null {
  if (summaries.length < 2) return null
  const rows = summaries.map(s => ({
    date: s.sceneDate,
    vegetatedHa: s.vegetatedHa,
    coveragePct: s.vegetationCoveragePct,
  }))
  const first = rows[0]!
  const last = rows[rows.length - 1]!
  const netChangeHa = last.vegetatedHa - first.vegetatedHa
  const gainHa = netChangeHa > 0 ? netChangeHa : 0
  const lossHa = netChangeHa < 0 ? Math.abs(netChangeHa) : 0
  const coverageIncreasePct = last.coveragePct - first.coveragePct
  return { rows, gainHa, lossHa, netChangeHa, coverageIncreasePct }
}

export function buildVegetationCoverageInsights(
  summary: VegetationCoverageSummary,
): VegetationCoverageInsights {
  const narrative: string[] = []
  const recommendations: string[] = []
  const cov = summary.vegetationCoveragePct
  const bare = summary.bareSoilPct
  const sparse = summary.classes.find(c => c.id === 'sparse')?.pct ?? 0
  const verySparse = summary.classes.find(c => c.id === 'very_sparse')?.pct ?? 0

  if (cov >= 65) {
    narrative.push(
      `Approximately ${cov.toFixed(1)}% of the AOI is covered by vegetation, indicating good crop establishment and canopy development.`,
    )
  } else if (cov >= 40) {
    narrative.push(
      `Vegetation covers ${cov.toFixed(1)}% of the AOI — moderate canopy with room for growth or partial bare areas.`,
    )
  } else {
    narrative.push(
      `Only ${cov.toFixed(1)}% of the AOI shows vegetated cover — investigate establishment, irrigation, or recent disturbance.`,
    )
  }

  if (bare >= 8) {
    narrative.push(
      `Bare soil occupies ${bare.toFixed(1)}% of the field, primarily along field edges and recently cultivated areas.`,
    )
    recommendations.push('Inspect bare soil areas for irrigation or germination issues.')
  }

  if (sparse + verySparse >= 12) {
    narrative.push(
      `Sparse vegetation zones (${(sparse + verySparse).toFixed(1)}%) may benefit from targeted scouting.`,
    )
    recommendations.push('Increase monitoring in sparse vegetation zones.')
  } else if (cov >= 60) {
    narrative.push('Only minor non-vegetated patches were detected, suggesting overall healthy field conditions.')
  }

  if (summary.cloudShadowPct >= 5) {
    narrative.push(
      `${summary.cloudShadowPct.toFixed(1)}% of the AOI was excluded due to cloud or shadow — interpret with caution.`,
    )
  }

  if (summary.waterPct >= 3) {
    narrative.push(`Water bodies account for ${summary.waterPct.toFixed(1)}% of classified pixels within the AOI.`)
  }

  if (cov >= 55 && recommendations.length === 0) {
    recommendations.push('Continue routine monitoring of healthy vegetation.')
  }
  recommendations.push('Schedule follow-up analysis after the next satellite acquisition.')

  return { narrative, recommendations: [...new Set(recommendations)] }
}

export function formatCoverageHa(ha: number): string {
  if (!Number.isFinite(ha) || ha <= 0) return '0'
  if (ha >= 100) return ha.toFixed(1)
  return ha.toFixed(2)
}

export function formatCoveragePct(pct: number): string {
  if (!Number.isFinite(pct)) return '0'
  return pct >= 10 ? pct.toFixed(1) : pct.toFixed(1)
}

export function formatCoverageDate(iso: string): string {
  const d = new Date(`${iso.trim().slice(0, 10)}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}
