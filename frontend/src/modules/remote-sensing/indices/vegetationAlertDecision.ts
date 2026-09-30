/**
 * Vegetation Alert Decision System — field AOI indices (NDVI, NDWI, NDMI, SAVI).
 * Used for popups, live alerts, and the interactive fields list.
 */

import type { CropAlertIndexSnapshot, CropAlertSeverity, CropAlertStatus } from './siCropAlertEngine'
import { estimateSaviFromNdvi } from './siCropAlertDchasBeacon'

export type VegetationAlertRuleId = 1 | 2 | 3 | 4 | 5

export type VegetationAlertDecision = {
  ruleId: VegetationAlertRuleId | null
  statusLabel: string
  status: CropAlertStatus
  severity: CropAlertSeverity
  action: string
  explanation: string
}

export const VEGETATION_ALERT_ACTIONS = {
  healthy: 'No action required. Maintain normal irrigation and monitoring.',
  waterStress: 'Increase irrigation within 24–48 hours.',
  earlyStress: 'Inspect soil conditions and improve fertilization.',
  criticalStress: 'Immediate irrigation required. Check for pests or disease.',
  degradedLand: 'Soil rehabilitation or crop replacement required.',
  monitor: 'Continue routine monitoring and verify indices at next scene.',
} as const

export const VEGETATION_ALERT_COLORS: Record<string, string> = {
  HEALTHY: '#aeea00',
  'WATER STRESS': '#f59e0b',
  'EARLY STRESS': '#eab308',
  'CRITICAL STRESS': '#dc2626',
  'DEGRADED LAND': '#1f2937',
  MONITOR: '#64748b',
  'NO CROP ACTIVITY': '#94a3b8',
}

function indexSummary(current: CropAlertIndexSnapshot): string {
  const savi = estimateSaviFromNdvi(current.ndvi)
  return `NDVI ${current.ndvi.toFixed(2)} · NDWI ${current.ndwi.toFixed(2)} · NDMI ${current.ndmi.toFixed(2)} · SAVI ${savi.toFixed(2)}`
}

export function saviDecreasePct(
  current: CropAlertIndexSnapshot,
  previous: CropAlertIndexSnapshot,
): number {
  const cur = estimateSaviFromNdvi(current.ndvi)
  const prev = estimateSaviFromNdvi(previous.ndvi)
  if (prev <= 0.001) return 0
  return ((prev - cur) / prev) * 100
}

/** Map vegetation status to HVD icon tier for lists and live alerts. */
export function mapVegetationAlertTier(status: CropAlertStatus, severity: CropAlertSeverity): string {
  if (status === 'healthy') return 'healthy'
  if (status === 'watch') return 'watch'
  if (status === 'water-stress') return 'stress'
  if (status === 'critical' || status === 'bare-soil' || status === 'no-vegetation') return 'critical'
  if (severity === 'normal') return 'stable'
  return 'watch'
}

export function resolveVegetationAlertColor(statusLabel: string): string {
  return VEGETATION_ALERT_COLORS[statusLabel] ?? '#64748b'
}

/**
 * Evaluate the five vegetation alert rules (most severe first).
 * Rule 3 compares SAVI drop vs the previous Sentinel scene when available.
 */
export function decideVegetationAlert(
  current: CropAlertIndexSnapshot,
  previous?: CropAlertIndexSnapshot | null,
): VegetationAlertDecision {
  const ndvi = current.ndvi
  const ndwi = current.ndwi
  const ndmi = current.ndmi
  const savi = estimateSaviFromNdvi(ndvi)
  const saviDrop = previous ? saviDecreasePct(current, previous) : 0
  const reason = indexSummary(current)

  // Rule 5 — Low Vegetation / Soil Degradation
  if (ndvi < 0.2 && savi < 0.1) {
    return {
      ruleId: 5,
      statusLabel: 'DEGRADED LAND',
      status: 'bare-soil',
      severity: 'critical',
      action: VEGETATION_ALERT_ACTIONS.degradedLand,
      explanation: reason,
    }
  }

  // Rule 4 — Critical Stress Condition
  if (ndvi < 0.4 && ndwi < 0.15) {
    return {
      ruleId: 4,
      statusLabel: 'CRITICAL STRESS',
      status: 'critical',
      severity: 'critical',
      action: VEGETATION_ALERT_ACTIONS.criticalStress,
      explanation: reason,
    }
  }

  // Rule 2 — Water Stress Warning
  if (ndwi < 0.2 || ndmi < 0.15) {
    return {
      ruleId: 2,
      statusLabel: 'WATER STRESS',
      status: 'water-stress',
      severity: 'high',
      action: VEGETATION_ALERT_ACTIONS.waterStress,
      explanation: reason,
    }
  }

  // Rule 3 — Early Vegetation Stress
  if (ndvi >= 0.4 && ndvi <= 0.7 && saviDrop > 20) {
    return {
      ruleId: 3,
      statusLabel: 'EARLY STRESS',
      status: 'watch',
      severity: 'warning',
      action: VEGETATION_ALERT_ACTIONS.earlyStress,
      explanation: `${reason} · SAVI Δ −${saviDrop.toFixed(0)}%`,
    }
  }

  // Rule 1 — Healthy Crop Condition
  if (ndvi > 0.7 && ndwi > 0.3 && ndmi > 0.2) {
    return {
      ruleId: 1,
      statusLabel: 'HEALTHY',
      status: 'healthy',
      severity: 'normal',
      action: VEGETATION_ALERT_ACTIONS.healthy,
      explanation: reason,
    }
  }

  return {
    ruleId: null,
    statusLabel: 'MONITOR',
    status: 'watch',
    severity: 'warning',
    action: VEGETATION_ALERT_ACTIONS.monitor,
    explanation: reason,
  }
}
