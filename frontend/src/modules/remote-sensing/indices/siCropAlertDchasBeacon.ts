/**
 * Advanced crop alert beacons — CHAS Alert (derived from 10-class raster) + ΔCHAS trend overlay.
 * CHAS = NDVI·NDWI·NDMI·SAVI fusion · Alert = rule engine on raster classes · ΔCHAS = change signal.
 */

import {
  computeChas,
  computeCdsi,
  computeCiReFromNdre,
  estimateSaviFromNdvi,
} from './chasIndex'
import {
  classifyChasFusionToAlert,
  classifyChasFusionToClassIndex,
  type ChasAlertLevel,
} from './chasAlertMapping'
import type { CropAlertFieldResult, CropAlertIndexSnapshot } from './siCropAlertEngine'
import { beaconIconForeground } from './siCropAlertNdviZones'
import { snapshotFromNdviScene } from './siCropAlertNdviTimeSeries'

export {
  computeChas,
  computeCdsi,
  computeCiRe,
  computeCiReFromNdre,
  estimateCiReFromNdvi,
  resolveCiReForChas,
  chasInputsFromDaily,
  computeChasFromDaily,
  CHAS_WEIGHT_NDVI,
  CHAS_WEIGHT_NDMI,
  CHAS_WEIGHT_CI_RE,
  CHAS_FUSION_WEIGHT_NDVI,
  CHAS_FUSION_WEIGHT_NDWI,
  CHAS_FUSION_WEIGHT_NDMI,
  CHAS_FUSION_WEIGHT_SAVI,
  AGRO_CHAS_EXPR,
  AGRO_CHAS_FUSION_EXPR,
  estimateSaviFromNdvi,
  CHAS_FORMULA_DOC,
  CHAS_FORMULA_POPUP,
  CDSI_FORMULA_POPUP,
} from './chasIndex'

/** Aligned with DCHAS alert legend (Layer Live). */
export const DCHAS_DELTA_CRITICAL = -0.15
export const DCHAS_DELTA_STRESS = -0.05

export type DchasRiskTier = 'critical' | 'stress' | 'watch' | 'stable'

export type DchasOrbPulseTier = DchasRiskTier

export type DchasOrbPresentation = {
  tier: DchasRiskTier
  label: string
  color: string
  iconForeground: string
  icon: string
  chasCurrent: number
  chasPrevious: number | null
  deltaChas: number | null
  pulse: {
    tier: DchasOrbPulseTier
    ringCount: number
    /** Blink period in ms — null = steady glow (no blink). */
    blinkMs: number | null
  }
}

/** HVD Stable orb — light lime green (lemon) for dashboard readability. */
export const DCHAS_STABLE_COLOR = '#aeea00'

/** Healthy vigor — bright lime (same as stable orb on map). */
export const DCHAS_HEALTHY_COLOR = DCHAS_STABLE_COLOR

/** Isolated / stable fields — dark green for Decision Support & filters. */
export const DCHAS_ISOLATED_COLOR = '#15803d'

export const DCHAS_RISK_COLORS: Record<DchasRiskTier, string> = {
  critical: '#d32f2f',
  stress: '#ff9800',
  watch: '#ffeb3b',
  stable: DCHAS_STABLE_COLOR,
}

export const DCHAS_RISK_LABELS: Record<DchasRiskTier, string> = {
  critical: 'Critical Risk',
  stress: 'High Stress',
  watch: 'Watch',
  stable: 'Stable / Improving',
}

export const DCHAS_RISK_ICONS: Record<DchasRiskTier, string> = {
  critical: 'fa-triangle-exclamation',
  stress: 'fa-droplet-slash',
  watch: 'fa-eye',
  stable: 'fa-circle-check',
}

/** Orb blink period (ms) — higher frequency = shorter duration. */
export const DCHAS_ORB_BLINK_MS: Record<DchasRiskTier, number | null> = {
  critical: 550,
  stress: 1100,
  watch: 2200,
  stable: null,
}

export const DCHAS_ORB_RING_COUNT: Record<DchasRiskTier, number> = {
  critical: 4,
  stress: 3,
  watch: 2,
  stable: 0,
}

/** Healthy vs isolated stable fields — ACP tables, alerts, and decision cards. */
export function resolveAcpFieldHvdColor(row: {
  alertTier: string
  severity: string
}): string | undefined {
  const tier = normalizeDchasRiskTier(row.alertTier)
  if (tier !== 'stable') return undefined
  return row.severity === 'normal' ? DCHAS_HEALTHY_COLOR : DCHAS_ISOLATED_COLOR
}

/** Map dashboard / engine tier strings to ΔCHAS orb tiers for HVD icons. */
export function normalizeDchasRiskTier(tier: string): DchasRiskTier {
  switch (tier) {
    case 'critical':
      return 'critical'
    case 'stress':
    case 'warning':
      return 'stress'
    case 'watch':
      return 'watch'
    default:
      return 'stable'
  }
}

/** Map derived CHAS alert level → dashboard orb tier. */
export function mapChasAlertLevelToDchasTier(level: ChasAlertLevel): DchasRiskTier {
  switch (level) {
    case 'CRITICAL':
      return 'critical'
    case 'ACTIVE':
      return 'stress'
    case 'WARNING':
      return 'watch'
    default:
      return 'stable'
  }
}

/** Build CHAS fusion inputs from a crop alert index snapshot. */
export function chasInputsFromSnapshot(snapshot: CropAlertIndexSnapshot): {
  ndvi: number
  ndmi: number
  ndwi?: number | null
  savi?: number | null
  ciRe?: number | null
  ndre?: number | null
} {
  return {
    ndvi: snapshot.ndvi,
    ndmi: snapshot.ndmi,
    ndwi: snapshot.ndwi,
    savi:
      snapshot.savi != null && Number.isFinite(snapshot.savi)
        ? snapshot.savi
        : estimateSaviFromNdvi(snapshot.ndvi),
    ciRe: snapshot.ciRe,
    ndre: snapshot.ndre,
  }
}

export type CdsiInsightTier = 'healthy' | 'stable' | 'warning' | 'critical'

export const CDSI_INSIGHT_TIERS: readonly CdsiInsightTier[] = ['healthy', 'stable', 'warning', 'critical']

export const CDSI_INSIGHT_LABELS: Record<CdsiInsightTier, string> = {
  healthy: 'Healthy',
  stable: 'Stable',
  warning: 'Warning',
  critical: 'Critical',
}

export const CDSI_INSIGHT_EMOJI: Record<CdsiInsightTier, string> = {
  healthy: '🌱',
  stable: '🌿',
  warning: '⚠️',
  critical: '🚨',
}

/** Font Awesome vector icons for popup CDSI badge (replaces emoji for crisp rendering). */
export const CDSI_INSIGHT_FA_ICONS: Record<CdsiInsightTier, string> = {
  healthy: 'fa-solid fa-seedling',
  stable: 'fa-solid fa-leaf',
  warning: 'fa-solid fa-triangle-exclamation',
  critical: 'fa-solid fa-bell',
}

export const CDSI_INSIGHT_COLORS: Record<CdsiInsightTier, string> = {
  healthy: DCHAS_STABLE_COLOR,
  stable: '#65a30d',
  warning: '#f59e0b',
  critical: '#dc2626',
}

/** Absolute CDSI / CHAS alert tier — derived from 10-class raster rule engine (not raw thresholds). */
export function classifyCdsiInsightTier(cdsi: number): CdsiInsightTier {
  if (!Number.isFinite(cdsi)) return 'warning'
  const alert = classifyChasFusionToAlert(cdsi)
  if (alert === 'CRITICAL') return 'critical'
  if (alert === 'ACTIVE' || alert === 'WARNING') return 'warning'
  const cls = classifyChasFusionToClassIndex(cdsi)
  return cls >= 8 ? 'healthy' : 'stable'
}

export function resolveSmartCropInsightNeed(tier: CdsiInsightTier, deltaChas: number | null): string {
  if (tier === 'critical') {
    if (deltaChas != null && deltaChas <= DCHAS_DELTA_CRITICAL) {
      return 'Urgent intervention — sharp CDSI decline vs previous scene.'
    }
    return 'Critical crop health — immediate field inspection required.'
  }
  if (tier === 'warning') return 'Monitor closely — irrigation or agronomic review may be needed.'
  if (tier === 'stable') return 'Stable canopy — continue routine monitoring.'
  return 'Healthy vigor — no immediate action required.'
}

export function computeDeltaChas(currentChas: number, previousChas: number): number {
  return Number((currentChas - previousChas).toFixed(4))
}

/** Classify agricultural risk from ΔCHAS only. */
export function classifyDchasRiskTier(deltaChas: number | null): DchasRiskTier {
  if (deltaChas == null || !Number.isFinite(deltaChas)) return 'watch'
  if (deltaChas <= DCHAS_DELTA_CRITICAL) return 'critical'
  if (deltaChas <= DCHAS_DELTA_STRESS) return 'stress'
  if (deltaChas <= 0) return 'watch'
  return 'stable'
}

export function resolvePreviousSnapshotForDchas(result: CropAlertFieldResult): CropAlertIndexSnapshot | null {
  if (result.chasPreviousSnapshot) return result.chasPreviousSnapshot
  if (result.ndviSceneDates.length >= 2) {
    const ndviSeriesScenes = result.ndviSceneValues
    if (ndviSeriesScenes.length >= 2) {
      return {
        ndvi: ndviSeriesScenes[1]!,
        ndmi: result.previous7.ndmi,
        ndwi: result.previous7.ndwi,
        evi: result.previous7.evi,
        ciRe: result.previous7.ciRe,
        ndre: result.previous7.ndre,
      }
    }
  }
  return result.previous7
}

export function resolveDchasMetrics(result: CropAlertFieldResult): {
  chasCurrent: number
  chasPrevious: number | null
  deltaChas: number | null
} {
  if (
    result.chasCurrent != null &&
    result.deltaChas != null &&
    Number.isFinite(result.chasCurrent) &&
    Number.isFinite(result.deltaChas)
  ) {
    return {
      chasCurrent: result.chasCurrent,
      chasPrevious: result.chasPrevious ?? null,
      deltaChas: result.deltaChas,
    }
  }

  const chasCurrent = computeChas(chasInputsFromSnapshot(result.current))
  const prevSnap = resolvePreviousSnapshotForDchas(result)
  const chasPrevious = prevSnap ? computeChas(chasInputsFromSnapshot(prevSnap)) : null
  const deltaChas = chasPrevious != null ? computeDeltaChas(chasCurrent, chasPrevious) : null
  return { chasCurrent, chasPrevious, deltaChas }
}

/** Full orb presentation — primary tier from CHAS Alert; ΔCHAS escalates pulse only. */
export function resolveDchasOrbPresentation(result: CropAlertFieldResult): DchasOrbPresentation {
  const { chasCurrent, chasPrevious, deltaChas } = resolveDchasMetrics(result)
  let tier = mapChasAlertLevelToDchasTier(classifyChasFusionToAlert(chasCurrent))
  if (deltaChas != null && deltaChas <= DCHAS_DELTA_CRITICAL && tier !== 'critical') {
    tier = 'critical'
  } else if (deltaChas != null && deltaChas <= DCHAS_DELTA_STRESS && tier === 'stable') {
    tier = 'stress'
  }
  const color = DCHAS_RISK_COLORS[tier]
  const blinkMs = DCHAS_ORB_BLINK_MS[tier]

  return {
    tier,
    label: DCHAS_RISK_LABELS[tier],
    color,
    iconForeground: beaconIconForeground(color),
    icon: DCHAS_RISK_ICONS[tier],
    chasCurrent,
    chasPrevious,
    deltaChas,
    pulse: {
      tier,
      ringCount: DCHAS_ORB_RING_COUNT[tier],
      blinkMs,
    },
  }
}

/** Resolve CHAS metrics when building field results from Sentinel series. */
export function computeDchasMetricsFromSnapshots(
  current: CropAlertIndexSnapshot,
  previous: CropAlertIndexSnapshot | null | undefined,
): { chasCurrent: number; chasPrevious: number | null; deltaChas: number | null; previousSnapshot: CropAlertIndexSnapshot | null } {
  const chasCurrent = computeChas(chasInputsFromSnapshot(current))
  const previousSnapshot = previous ?? null
  const chasPrevious = previousSnapshot ? computeChas(chasInputsFromSnapshot(previousSnapshot)) : null
  const deltaChas = chasPrevious != null ? computeDeltaChas(chasCurrent, chasPrevious) : null
  return { chasCurrent, chasPrevious, deltaChas, previousSnapshot }
}

/** Prefer scene₂ snapshot from NDVI series when available (matches DCHAS ORBIT logic). */
export function pickDchasPreviousSnapshot(
  current: CropAlertIndexSnapshot,
  previous7: CropAlertIndexSnapshot,
  ndviSeries: { scenes: Array<{ date: string; ndvi: number; ndwi: number | null; ndmi: number | null }> } | null | undefined,
): CropAlertIndexSnapshot {
  const scene = ndviSeries?.scenes[1]
  if (scene) return snapshotFromNdviScene(scene)
  return previous7
}
