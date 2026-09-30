/**
 * CHAS Alert Layer — derived 4-level mapping from CHAS Raster classes (1–10).
 * Rule engine only; never reclassifies the scientific raster.
 */

import { resolveAgroCompositeTenClassRamp } from './agroCompositeLayerRamps'

export type ChasAlertLevel = 'CRITICAL' | 'ACTIVE' | 'WARNING' | 'SAFE'

export const CHAS_ALERT_LEVELS: readonly ChasAlertLevel[] = ['CRITICAL', 'ACTIVE', 'WARNING', 'SAFE']

export const CHAS_ALERT_LABELS: Record<ChasAlertLevel, string> = {
  CRITICAL: 'Critical — emergency response',
  ACTIVE: 'Active — immediate monitoring',
  WARNING: 'Warning — early stress',
  SAFE: 'Safe — stable condition',
}

export const CHAS_ALERT_COLORS: Record<ChasAlertLevel, string> = {
  CRITICAL: '#d32f2f',
  ACTIVE: '#ff9800',
  WARNING: '#ffeb3b',
  SAFE: '#1a9850',
}

/** RGB 0–1 for evalscript alert overlay (CRITICAL, ACTIVE, WARNING, SAFE). */
export const CHAS_ALERT_RGB_01: readonly [number, number, number][] = [
  [0.827451, 0.184314, 0.184314],
  [1.0, 0.596078, 0.0],
  [1.0, 0.921569, 0.231373],
  [0.101961, 0.596078, 0.313725],
]

/** Map CHAS raster class 1–10 → 4 alert levels. */
export function mapChasClassToAlert(chasClass: number): ChasAlertLevel {
  const c = Math.max(1, Math.min(10, Math.round(chasClass)))
  if (c <= 2) return 'CRITICAL'
  if (c <= 4) return 'ACTIVE'
  if (c <= 6) return 'WARNING'
  return 'SAFE'
}

/** Map evalscript class index 0–9 → alert level. */
export function mapChasClassIndexToAlert(classIndex: number): ChasAlertLevel {
  return mapChasClassToAlert(classIndex + 1)
}

/** Class index 0–9 → alert palette index 0–3 for WMS CHAS_ALERT layer. */
export function chasClassIndexToAlertPaletteIndex(classIndex: number): number {
  const c = Math.max(0, Math.min(9, Math.floor(classIndex)))
  if (c <= 1) return 0
  if (c <= 3) return 1
  if (c <= 5) return 2
  return 3
}

/** Classify continuous CHAS fusion score into raster class index 0–9 (same breaks as WMS). */
export function classifyChasFusionToClassIndex(value: number): number {
  if (!Number.isFinite(value)) return 4
  const ramp = resolveAgroCompositeTenClassRamp('CHAS')
  if (!ramp?.breaks.length) {
    if (value < 0.1) return 0
    if (value < 0.25) return 2
    if (value < 0.4) return 4
    if (value < 0.55) return 6
    return 8
  }
  const breaks = ramp.breaks
  if (value < breaks[0]!) return 0
  for (let i = 1; i < breaks.length; i++) {
    if (value < breaks[i]!) return i
  }
  return 9
}

/** Raster class 1–10 from continuous fusion score. */
export function classifyChasFusionToClass(value: number): number {
  return classifyChasFusionToClassIndex(value) + 1
}

/** Derived alert level from continuous CHAS fusion score (zonal mean → rule engine). */
export function classifyChasFusionToAlert(value: number): ChasAlertLevel {
  return mapChasClassIndexToAlert(classifyChasFusionToClassIndex(value))
}

export function chasAlertLevelColor(level: ChasAlertLevel): string {
  return CHAS_ALERT_COLORS[level]
}
