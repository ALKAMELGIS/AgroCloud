/**
 * Pure Agronomic Decision Engine — Sentinel-Grade v3 (STRICT DIVERGENCE).
 * Single dominant signal drives each decision; no multi-label averaging.
 * Includes Land Activity Classifier (planted vs bare / fallow).
 */

import {
  buildLandActivityHistoryFromScenes,
  classifyLandActivity,
  hasActiveVegetationGrowthPattern,
  isNoCropActivity,
  landActivityPresentation,
  qualifiesForCropHealthLabel,
  type LandActivityState,
} from './landActivityClassifier'

export type PureAgronomicHistogramClass = 'healthy' | 'stressed' | 'bare'

export type PureAgronomicHistogramBin = {
  class: PureAgronomicHistogramClass
  ratio: number
}

export type PureAgronomicIndexTriplet = {
  NDVI: number
  NDMI: number
  NDWI: number
}

export type PureAgronomicDecisionInput = {
  current: PureAgronomicIndexTriplet
  history: {
    prev1: PureAgronomicIndexTriplet
    prev2: PureAgronomicIndexTriplet
  }
  histogram: {
    bins: PureAgronomicHistogramBin[]
  }
}

export type VegetationStatus = 'VERY_HEALTHY' | 'HEALTHY' | 'STRESSED' | 'DEGRADED'
export type WaterStatus = 'SEVERE_DROUGHT' | 'MODERATE_DROUGHT' | 'WATERLOGGING' | 'NORMAL'
export type BioticStatus = 'BIOTIC_STRESS' | 'ENVIRONMENTAL_STRESS' | 'NONE'
export type AgronomicTrend = 'IMPROVING' | 'DECLINING' | 'STABLE'
export type PrimarySignal = 'VEGETATION' | 'MOISTURE' | 'SURFACE_WATER'
export type AgronomicDecision =
  | 'IRRIGATION_REQUIRED_IMMEDIATELY'
  | 'DRAINAGE_REQUIRED'
  | 'DISEASE_INSPECTION_REQUIRED'
  | 'EARLY_WARNING_MONITORING'
  | 'FIELD_STABLE'
  | 'NO_CROP_ACTIVITY_DETECTED'
export type AgronomicRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export type PureAgronomicDecisionOutput = {
  land_state: LandActivityState
  show_crop_health_alert: boolean
  vegetation_status: VegetationStatus
  water_status: WaterStatus
  biotic_status: BioticStatus
  trend: AgronomicTrend
  primary_signal: PrimarySignal
  agronomic_decision: AgronomicDecision
  risk_level: AgronomicRiskLevel
  confidence: number
  explanation: {
    primary_driver: string
    secondary_driver: string
    spatial_signal: string
  }
}

export type PureAgronomicSpatialFlags = {
  healthy_ratio: number
  stress_ratio: number
  entropy_proxy: number
  high_alert: boolean
  alert_risk: boolean
  stable_spatial: boolean
}

export type PureAgronomicDeltaTriplet = {
  NDVI: number
  NDMI: number
  NDWI: number
}

const BIOTIC_NDMI_STABLE_THRESHOLD = 0.015

export function computeDeltas(
  current: PureAgronomicIndexTriplet,
  prev1: PureAgronomicIndexTriplet,
): PureAgronomicDeltaTriplet {
  return {
    NDVI: current.NDVI - prev1.NDVI,
    NDMI: current.NDMI - prev1.NDMI,
    NDWI: current.NDWI - prev1.NDWI,
  }
}

/** STEP 1 — lock dominant delta direction (strict >; ties → VEGETATION > MOISTURE > SURFACE_WATER). */
export function resolvePrimarySignal(deltas: PureAgronomicDeltaTriplet): PrimarySignal {
  const absNdvi = Math.abs(deltas.NDVI)
  const absNdmi = Math.abs(deltas.NDMI)
  const absNdwi = Math.abs(deltas.NDWI)

  if (absNdvi > absNdmi && absNdvi > absNdwi) return 'VEGETATION'
  if (absNdmi > absNdvi && absNdmi > absNdwi) return 'MOISTURE'
  if (absNdwi > absNdvi && absNdwi > absNdmi) return 'SURFACE_WATER'
  if (absNdvi >= absNdmi && absNdvi >= absNdwi) return 'VEGETATION'
  if (absNdmi >= absNdwi) return 'MOISTURE'
  return 'SURFACE_WATER'
}

export function computeTrendScore(deltas: PureAgronomicDeltaTriplet): number {
  return deltas.NDVI * 0.6 + deltas.NDMI * 0.3 + deltas.NDWI * 0.1
}

export function classifyWaterStatus(current: PureAgronomicIndexTriplet): WaterStatus {
  const { NDMI, NDWI } = current
  if (NDMI <= -0.12 && NDWI <= 0.03) return 'SEVERE_DROUGHT'
  if (NDMI > -0.12 && NDMI <= -0.06) return 'MODERATE_DROUGHT'
  if (NDMI >= 0.25 && NDWI >= 0.3) return 'WATERLOGGING'
  return 'NORMAL'
}

export function classifyVegetationStatus(
  current: PureAgronomicIndexTriplet,
  history: { prev1: PureAgronomicIndexTriplet; prev2: PureAgronomicIndexTriplet },
  landState: LandActivityState,
): VegetationStatus {
  if (isNoCropActivity(landState)) return 'DEGRADED'

  let status: VegetationStatus
  if (current.NDVI > 0.65) status = 'VERY_HEALTHY'
  else if (current.NDVI > 0.35) status = 'HEALTHY'
  else if (current.NDVI > 0.18) status = 'STRESSED'
  else status = 'DEGRADED'

  const landHistory = {
    current,
    prev1: history.prev1,
    prev2: history.prev2,
  }

  if (
    (status === 'HEALTHY' || status === 'VERY_HEALTHY') &&
    !qualifiesForCropHealthLabel(current.NDVI, landHistory, landState)
  ) {
    return current.NDVI > 0.18 ? 'STRESSED' : 'DEGRADED'
  }

  return status
}

export function classifyBioticStatus(
  deltas: PureAgronomicDeltaTriplet,
  vegetationStatus: VegetationStatus,
): BioticStatus {
  if (vegetationStatus === 'VERY_HEALTHY') return 'NONE'
  if (deltas.NDVI < 0 && Math.abs(deltas.NDMI) < BIOTIC_NDMI_STABLE_THRESHOLD) {
    return 'BIOTIC_STRESS'
  }
  if (deltas.NDVI < 0 && deltas.NDMI < 0 && deltas.NDWI < 0) {
    return 'ENVIRONMENTAL_STRESS'
  }
  return 'NONE'
}

export function analyzeSpatialHistogram(bins: PureAgronomicHistogramBin[]): PureAgronomicSpatialFlags {
  let healthy_ratio = 0
  let stress_ratio = 0
  let maxRatio = 0

  for (const bin of bins) {
    const ratio = Number.isFinite(bin.ratio) ? Math.max(0, bin.ratio) : 0
    maxRatio = Math.max(maxRatio, ratio)
    if (bin.class === 'healthy') healthy_ratio += ratio
    else if (bin.class === 'stressed' || bin.class === 'bare') stress_ratio += ratio
  }

  const entropy_proxy = 1 - maxRatio
  const high_alert = stress_ratio >= 0.45
  const alert_risk = healthy_ratio <= 0.45

  return {
    healthy_ratio,
    stress_ratio,
    entropy_proxy,
    high_alert,
    alert_risk,
    stable_spatial: !high_alert && !alert_risk,
  }
}

export function classifyTrend(trendScore: number): AgronomicTrend {
  if (trendScore < -0.025) return 'DECLINING'
  if (trendScore > 0.025) return 'IMPROVING'
  return 'STABLE'
}

function allDeltasSameSign(deltas: PureAgronomicDeltaTriplet): boolean {
  const signs = [deltas.NDVI, deltas.NDMI, deltas.NDWI].map(v => Math.sign(v))
  return signs[0] === signs[1] && signs[1] === signs[2]
}

export function computeConfidence(
  deltas: PureAgronomicDeltaTriplet,
  spatial: PureAgronomicSpatialFlags,
): number {
  const signalStrength = Math.min(
    1,
    Math.max(0, Math.max(Math.abs(deltas.NDVI), Math.abs(deltas.NDMI), Math.abs(deltas.NDWI)) * 3),
  )
  const spatialSeparation = Math.min(1, Math.max(0, 1 - spatial.entropy_proxy))
  const temporalConsistency = allDeltasSameSign(deltas) ? 1 : 0.5

  const confidence =
    0.5 * signalStrength + 0.3 * spatialSeparation + 0.2 * temporalConsistency

  return Math.min(1, Math.max(0, confidence))
}

export function resolveAgronomicDecision(
  landState: LandActivityState,
  waterStatus: WaterStatus,
  vegetationStatus: VegetationStatus,
  bioticStatus: BioticStatus,
  trend: AgronomicTrend,
): AgronomicDecision {
  if (isNoCropActivity(landState)) return 'NO_CROP_ACTIVITY_DETECTED'
  if (waterStatus === 'SEVERE_DROUGHT') return 'IRRIGATION_REQUIRED_IMMEDIATELY'
  if (waterStatus === 'WATERLOGGING') return 'DRAINAGE_REQUIRED'
  if (vegetationStatus === 'DEGRADED' && bioticStatus === 'BIOTIC_STRESS') {
    return 'DISEASE_INSPECTION_REQUIRED'
  }
  if (trend === 'DECLINING') return 'EARLY_WARNING_MONITORING'
  return 'FIELD_STABLE'
}

export function resolveRiskLevel(
  landState: LandActivityState,
  waterStatus: WaterStatus,
  vegetationStatus: VegetationStatus,
  bioticStatus: BioticStatus,
  trend: AgronomicTrend,
  spatial: PureAgronomicSpatialFlags,
): AgronomicRiskLevel {
  if (isNoCropActivity(landState)) return 'LOW'
  if (
    waterStatus === 'SEVERE_DROUGHT' ||
    waterStatus === 'WATERLOGGING' ||
    (vegetationStatus === 'DEGRADED' && bioticStatus === 'BIOTIC_STRESS')
  ) {
    return 'CRITICAL'
  }
  if (vegetationStatus === 'STRESSED' && trend === 'DECLINING') {
    return 'HIGH'
  }
  if (waterStatus === 'MODERATE_DROUGHT' || spatial.alert_risk) {
    return 'MEDIUM'
  }
  if (
    (vegetationStatus === 'HEALTHY' || vegetationStatus === 'VERY_HEALTHY') &&
    (trend === 'STABLE' || trend === 'IMPROVING')
  ) {
    return 'LOW'
  }
  return 'MEDIUM'
}

function buildPrimaryDriver(
  primarySignal: PrimarySignal,
  current: PureAgronomicIndexTriplet,
  deltas: PureAgronomicDeltaTriplet,
  agronomicDecision: AgronomicDecision,
): string {
  switch (primarySignal) {
    case 'VEGETATION':
      return `Vegetation collapse signal — NDVI=${current.NDVI.toFixed(3)} (ΔNDVI=${deltas.NDVI.toFixed(3)}) drives ${agronomicDecision}`
    case 'MOISTURE':
      return `Moisture stress signal — NDMI=${current.NDMI.toFixed(3)} (ΔNDMI=${deltas.NDMI.toFixed(3)}) drives ${agronomicDecision}`
    case 'SURFACE_WATER':
      return `Surface water signal — NDWI=${current.NDWI.toFixed(3)} (ΔNDWI=${deltas.NDWI.toFixed(3)}) drives ${agronomicDecision}`
  }
}

function buildSecondaryDriver(
  trendScore: number,
  trend: AgronomicTrend,
  spatial: PureAgronomicSpatialFlags,
): string {
  const spatialNote = spatial.high_alert
    ? 'supporting spatial stress concentration'
    : spatial.alert_risk
      ? 'supporting low healthy canopy fraction'
      : 'spatial pattern is stable'
  return `TrendScore=${trendScore.toFixed(3)} (${trend}); ${spatialNote}`
}

function buildSpatialSignal(spatial: PureAgronomicSpatialFlags): string {
  const dominance =
    spatial.stress_ratio > spatial.healthy_ratio
      ? 'stress-dominant field mosaic'
      : spatial.healthy_ratio > spatial.stress_ratio
        ? 'healthy-dominant field mosaic'
        : 'mixed spatial mosaic'

  const parts = [
    dominance,
    `healthy=${(spatial.healthy_ratio * 100).toFixed(0)}%`,
    `stress+bare=${(spatial.stress_ratio * 100).toFixed(0)}%`,
  ]
  if (spatial.high_alert) parts.push('HIGH_ALERT')
  else if (spatial.alert_risk) parts.push('ALERT_RISK')
  else parts.push('STABLE_SPATIAL')
  return parts.join('; ')
}

export function evaluatePureAgronomicDecision(
  input: PureAgronomicDecisionInput,
): PureAgronomicDecisionOutput {
  const landHistory = {
    current: input.current,
    prev1: input.history.prev1,
    prev2: input.history.prev2,
  }
  const land_state = classifyLandActivity(landHistory)
  const show_crop_health_alert = !isNoCropActivity(land_state)

  const deltas = computeDeltas(input.current, input.history.prev1)
  const primary_signal = resolvePrimarySignal(deltas)
  const trendScore = computeTrendScore(deltas)
  const water_status = classifyWaterStatus(input.current)
  const vegetation_status = classifyVegetationStatus(
    input.current,
    input.history,
    land_state,
  )
  const biotic_status = classifyBioticStatus(deltas, vegetation_status)
  const spatial = analyzeSpatialHistogram(input.histogram.bins)
  const trend = classifyTrend(trendScore)
  const agronomic_decision = resolveAgronomicDecision(
    land_state,
    water_status,
    vegetation_status,
    biotic_status,
    trend,
  )
  const risk_level = resolveRiskLevel(
    land_state,
    water_status,
    vegetation_status,
    biotic_status,
    trend,
    spatial,
  )
  const confidence = computeConfidence(deltas, spatial)

  const landPresentation = landActivityPresentation(land_state)
  const primary_driver = isNoCropActivity(land_state)
    ? `${landPresentation.label} — no crop activity; NDVI=${input.current.NDVI.toFixed(3)}, NDMI≈${input.current.NDMI.toFixed(3)}, NDWI≈${input.current.NDWI.toFixed(3)}`
    : buildPrimaryDriver(primary_signal, input.current, deltas, agronomic_decision)

  return {
    land_state,
    show_crop_health_alert,
    vegetation_status,
    water_status,
    biotic_status,
    trend,
    primary_signal,
    agronomic_decision,
    risk_level,
    confidence,
    explanation: {
      primary_driver,
      secondary_driver: isNoCropActivity(land_state)
        ? `Flat NDVI temporal pattern; growth pattern=${hasActiveVegetationGrowthPattern(landHistory) ? 'yes' : 'no'}`
        : buildSecondaryDriver(trendScore, trend, spatial),
      spatial_signal: buildSpatialSignal(spatial),
    },
  }
}

export {
  buildLandActivityHistoryFromScenes,
  classifyLandActivity,
  hasActiveVegetationGrowthPattern,
  isNoCropActivity,
  landActivityPresentation,
  qualifiesForCropHealthLabel,
  type LandActivityState,
} from './landActivityClassifier'
