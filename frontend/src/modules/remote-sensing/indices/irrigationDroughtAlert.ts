/**
 * Automated irrigation alert from ISS (Irrigation Stress Score).
 *
 * ISS = 0.40·NDMI + 0.30·NDWI + 0.20·NDVI + 0.10·SAVI
 *
 * Alert rules (10 m Sentinel-2):
 *  < -0.39          → Critical      → Irrigate NOW (20–30 mm)
 *  -0.39 … -0.27    → Severe        → Irrigate within 12 hrs (15–20 mm)
 *  -0.27 … -0.16    → Warning       → Irrigate within 24–48 hrs (10–15 mm)
 *  -0.16 … 0.07     → Watch         → Monitor only (covers elevated + moderate drought)
 *  0.07 … 0.42      → Safe          → No action (ideal + adequate moisture)
 *  > 0.42           → Overwatering  → STOP irrigation, check drainage
 *
 * Trend: if ISS dropped by > 0.05 within ~3 days, escalate one drought level.
 */

import { estimateSaviFromNdvi } from './chasIndex'

export const ISS_SCIENTIFIC_NAME =
  'Irrigation Stress Score (0.40·NDMI + 0.30·NDWI + 0.20·NDVI + 0.10·SAVI)'

export const ISS_EXPR = '0.40 * ndmi + 0.30 * ndwi + 0.20 * ndvi + 0.10 * savi'

export type IrrigationAlertLevel =
  | 'critical'
  | 'severe'
  | 'warning'
  | 'watch'
  | 'safe'
  | 'overwatering'

/** Drop threshold over ~3 days that escalates drought severity one step. */
export const IRRIGATION_TREND_DROP_ESCALATE = 0.05

export const IRRIGATION_ALERT_LEVEL_ORDER: IrrigationAlertLevel[] = [
  'critical',
  'severe',
  'warning',
  'watch',
  'safe',
  'overwatering',
]

/** Drought escalation ladder (overwatering is separate and does not escalate upward). */
const DROUGHT_ESCALATION: IrrigationAlertLevel[] = [
  'safe',
  'watch',
  'warning',
  'severe',
  'critical',
]

export const IRRIGATION_ALERT_LEVEL_COLORS: Record<IrrigationAlertLevel, string> = {
  critical: '#e91e63',
  severe: '#ef6c00',
  warning: '#fbc02d',
  watch: '#26a69a',
  safe: '#43a047',
  overwatering: '#5c6bc0',
}

export const IRRIGATION_ALERT_LEVEL_LABELS: Record<IrrigationAlertLevel, string> = {
  critical: 'Critical',
  severe: 'Severe',
  warning: 'Warning',
  watch: 'Watch',
  safe: 'Safe',
  overwatering: 'Overwatering',
}

export const IRRIGATION_ALERT_ACTIONS: Record<IrrigationAlertLevel, string> = {
  critical: 'Irrigate NOW (20–30 mm)',
  severe: 'Irrigate within 12 hrs (15–20 mm)',
  warning: 'Irrigate within 24–48 hrs (10–15 mm)',
  watch: 'Monitor only',
  safe: 'No action',
  overwatering: 'STOP irrigation, check drainage',
}

export const IRRIGATION_ALERT_STATUS: Record<IrrigationAlertLevel, string> = {
  critical: 'Extreme irrigation stress',
  severe: 'Severe irrigation stress',
  warning: 'High irrigation stress',
  watch: 'Elevated / moderate stress — watch',
  safe: 'Near normal / adequate moisture',
  overwatering: 'Wet / surplus water',
}

/** Priority for irrigation queue (1 = irrigate first). Overwatering last. */
export const IRRIGATION_ALERT_BASE_RANK: Record<IrrigationAlertLevel, number> = {
  critical: 1,
  severe: 2,
  warning: 3,
  watch: 4,
  safe: 5,
  overwatering: 6,
}

export type IrrigationIndexSnapshot = {
  ndvi: number
  ndmi: number
  ndwi: number
  savi?: number
}

export type IrrigationAlertDecision = {
  iss: number
  previousIss: number | null
  deltaIss: number | null
  baseLevel: IrrigationAlertLevel
  alertLevel: IrrigationAlertLevel
  escalated: boolean
  color: string
  label: string
  status: string
  action: string
  priorityRank: number
  message: string
}

export function computeIssFromCore(input: {
  ndvi: number
  ndmi: number
  ndwi: number
  savi: number
}): number {
  return 0.4 * input.ndmi + 0.3 * input.ndwi + 0.2 * input.ndvi + 0.1 * input.savi
}

export function computeIrrigationIss(input: IrrigationIndexSnapshot): number {
  const savi =
    input.savi != null && Number.isFinite(input.savi)
      ? input.savi
      : estimateSaviFromNdvi(input.ndvi)
  return computeIssFromCore({
    ndvi: input.ndvi,
    ndmi: input.ndmi,
    ndwi: input.ndwi,
    savi,
  })
}

/** Classify ISS into irrigation alert level (before trend escalation). */
export function classifyIrrigationAlertLevel(iss: number): IrrigationAlertLevel {
  const v = Number.isFinite(iss) ? iss : 0
  if (v < -0.39) return 'critical'
  if (v < -0.27) return 'severe'
  if (v < -0.16) return 'warning'
  if (v < 0.07) return 'watch'
  if (v <= 0.42) return 'safe'
  return 'overwatering'
}

export function escalateIrrigationAlertLevel(
  level: IrrigationAlertLevel,
  deltaIss: number | null | undefined,
): { level: IrrigationAlertLevel; escalated: boolean } {
  const drop = deltaIss != null && Number.isFinite(deltaIss) ? deltaIss : null
  if (drop == null || drop > -IRRIGATION_TREND_DROP_ESCALATE) {
    return { level, escalated: false }
  }
  // Drying fast: move one step toward Critical (never escalate Overwatering into drought ladder from nowhere).
  if (level === 'overwatering') {
    return { level: 'safe', escalated: true }
  }
  const idx = DROUGHT_ESCALATION.indexOf(level)
  if (idx < 0) return { level, escalated: false }
  const next = DROUGHT_ESCALATION[Math.min(DROUGHT_ESCALATION.length - 1, idx + 1)]!
  return { level: next, escalated: next !== level }
}

export function buildIrrigationAlertMessage(input: {
  zoneName: string
  iss: number
  alertLevel: IrrigationAlertLevel
  escalated?: boolean
  deltaIss?: number | null
}): string {
  const action = IRRIGATION_ALERT_ACTIONS[input.alertLevel]
  const status = IRRIGATION_ALERT_STATUS[input.alertLevel]
  const trend =
    input.escalated && input.deltaIss != null
      ? ` ISS fell ${Math.abs(input.deltaIss).toFixed(2)} over recent scenes — alert escalated.`
      : ''
  return `${input.zoneName}: ${status} (ISS ${input.iss.toFixed(2)}). ${action}.${trend}`
}

export function decideIrrigationAlert(input: {
  zoneName: string
  current: IrrigationIndexSnapshot
  previous?: IrrigationIndexSnapshot | null
}): IrrigationAlertDecision {
  const iss = computeIrrigationIss(input.current)
  const previousIss = input.previous ? computeIrrigationIss(input.previous) : null
  const deltaIss =
    previousIss != null && Number.isFinite(previousIss) ? iss - previousIss : null
  const baseLevel = classifyIrrigationAlertLevel(iss)
  const { level: alertLevel, escalated } = escalateIrrigationAlertLevel(baseLevel, deltaIss)
  const color = IRRIGATION_ALERT_LEVEL_COLORS[alertLevel]
  const label = IRRIGATION_ALERT_LEVEL_LABELS[alertLevel]
  const status = IRRIGATION_ALERT_STATUS[alertLevel]
  const action = IRRIGATION_ALERT_ACTIONS[alertLevel]
  const priorityRank = IRRIGATION_ALERT_BASE_RANK[alertLevel]
  const message = buildIrrigationAlertMessage({
    zoneName: input.zoneName,
    iss,
    alertLevel,
    escalated,
    deltaIss,
  })
  return {
    iss: Number(iss.toFixed(4)),
    previousIss: previousIss != null ? Number(previousIss.toFixed(4)) : null,
    deltaIss: deltaIss != null ? Number(deltaIss.toFixed(4)) : null,
    baseLevel,
    alertLevel,
    escalated,
    color,
    label,
    status,
    action,
    priorityRank,
    message,
  }
}
