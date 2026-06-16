/**
 * Unified NDVI Alert System — single source for WMS ramp, map beacons, legend, and land interpretation.
 * Rule: NDVI zone = color + icon + label + interpretation (100% aligned).
 * Temporal delta alerts (±0.15) add pulse/badge only — they do not change the land-state color.
 */

import {
  buildLandActivityHistoryFromScenes,
  classifyLandActivity,
  isNoCropActivity,
  landActivityPresentation,
  type LandActivityState,
} from './landActivityClassifier'

export type NdviAlertZoneId =
  | 'bare'
  | 'stress'
  | 'watch'
  | 'healthy'
  | 'growth'
  | 'harvest-ready'

export type NdviAlertZone = {
  id: NdviAlertZoneId
  label: string
  rangeLabel: string
  min: number
  max: number
  color: string
  icon: string
  interpretation: string
}

export type NdviRampStop = [number, number]

export type NdviDeltaAlertType = 'ALERT_RED' | 'ALERT_GREEN' | 'NORMAL'

export type NdviDeltaAlert = {
  type: NdviDeltaAlertType
  icon: string | null
  label: string
}

export const NDVI_DELTA_ALERT_THRESHOLD = 0.15

/** WMS ramp — matches unified zone colors (strictly increasing NDVI). */
export const NDVI_AGRICULTURAL_RAMP: NdviRampStop[] = [
  [-1.0, 0xb71c1c],
  [-0.2, 0xc62828],
  [0.0, 0xd32f2f],
  [0.05, 0xff9800],
  [0.2, 0xff9800],
  [0.25, 0xffeb3b],
  [0.4, 0xffeb3b],
  [0.41, 0xaeea00],
  [0.6, 0xaeea00],
  [0.61, 0x2e7d32],
  [0.75, 0x2e7d32],
  [0.76, 0x1b5e20],
  [1.0, 0x1b5e20],
]

export const NDVI_ALERT_ZONES: NdviAlertZone[] = [
  {
    id: 'bare',
    label: 'FALLOW / FAILURE',
    rangeLabel: '< 0.05',
    min: -1,
    max: 0.05,
    color: '#d32f2f',
    icon: 'fa-xmark',
    interpretation: 'Bare soil or crop failure — no viable vegetation cover detected.',
  },
  {
    id: 'stress',
    label: 'STRESS HIGH',
    rangeLabel: '0.05 – 0.25',
    min: 0.05,
    max: 0.25,
    color: '#ff9800',
    icon: 'fa-droplet-slash',
    interpretation: 'Severe crop stress — water deficit or physiological damage likely.',
  },
  {
    id: 'watch',
    label: 'WATCH',
    rangeLabel: '0.25 – 0.40',
    min: 0.25,
    max: 0.4,
    color: '#ffeb3b',
    icon: 'fa-eye',
    interpretation: 'Early vigor decline — monitor the field without immediate intervention.',
  },
  {
    id: 'healthy',
    label: 'MODERATE HEALTH',
    rangeLabel: '0.40 – 0.60',
    min: 0.4,
    max: 0.6,
    color: '#aeea00',
    icon: 'fa-leaf',
    interpretation: 'Moderate canopy health — stable mid-season crop vigor.',
  },
  {
    id: 'growth',
    label: 'STRONG GROWTH',
    rangeLabel: '0.60 – 0.75',
    min: 0.6,
    max: 0.75,
    color: '#2e7d32',
    icon: 'fa-seedling',
    interpretation: 'Strong biomass accumulation — active crop growth phase.',
  },
  {
    id: 'harvest-ready',
    label: 'HARVEST READY',
    rangeLabel: '≥ 0.75',
    min: 0.75,
    max: 1.05,
    color: '#1b5e20',
    icon: 'fa-wheat-awn',
    interpretation: 'Peak crop maturity — optimal harvest readiness window.',
  },
]

export const NDVI_ZONE_ICONS: Record<NdviAlertZoneId, string> = Object.fromEntries(
  NDVI_ALERT_ZONES.map(z => [z.id, z.icon]),
) as Record<NdviAlertZoneId, string>

export type NdviZonePulseTier =
  | 'calm'
  | 'watch'
  | 'warning'
  | 'urgent'
  | 'harvest-approach'
  | 'improving'

/** Classify NDVI into a unified land-state zone (color + icon + label). */
export function classifyNdviLandZone(ndvi: number): NdviAlertZone {
  const value = Number.isFinite(ndvi) ? ndvi : 0
  if (value < 0.05) return NDVI_ALERT_ZONES[0]!
  if (value < 0.25) return NDVI_ALERT_ZONES[1]!
  if (value < 0.4) return NDVI_ALERT_ZONES[2]!
  if (value < 0.6) return NDVI_ALERT_ZONES[3]!
  if (value < 0.75) return NDVI_ALERT_ZONES[4]!
  return NDVI_ALERT_ZONES[5]!
}

/** @deprecated Use classifyNdviLandZone — kept for exports. */
export function resolveNdviAlertZone(ndvi: number): NdviAlertZone {
  return classifyNdviLandZone(ndvi)
}

export function resolveNdviAbsoluteDelta(sceneValues: number[]): number | null {
  if (sceneValues.length < 2) return null
  const latest = sceneValues[0]!
  const previous = sceneValues[1]!
  if (!Number.isFinite(latest) || !Number.isFinite(previous)) return null
  return latest - previous
}

/** Temporal alert — rapid decline or improvement only. */
export function resolveNdviDeltaAlert(delta: number | null): NdviDeltaAlert {
  if (delta == null || !Number.isFinite(delta)) {
    return { type: 'NORMAL', icon: null, label: 'Stable' }
  }
  if (delta <= -NDVI_DELTA_ALERT_THRESHOLD) {
    return { type: 'ALERT_RED', icon: 'fa-triangle-exclamation', label: 'Rapid Decline' }
  }
  if (delta >= NDVI_DELTA_ALERT_THRESHOLD) {
    return { type: 'ALERT_GREEN', icon: 'fa-circle-check', label: 'Improving' }
  }
  return { type: 'NORMAL', icon: null, label: 'Stable' }
}

/** Icon glyph color on zone-colored orb (matches legend + map beacons). */
export function beaconIconForeground(zoneColor: string): string {
  const hex = zoneColor.replace('#', '').trim()
  if (hex.length !== 6) return '#f8fafc'
  const r = Number.parseInt(hex.slice(0, 2), 16)
  const g = Number.parseInt(hex.slice(2, 4), 16)
  const b = Number.parseInt(hex.slice(4, 6), 16)
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return '#f8fafc'
  const luma = 0.299 * r + 0.587 * g + 0.114 * b
  return luma > 148 ? '#1e293b' : '#f8fafc'
}

export function pulseProfileForNdviZone(
  zoneId: NdviAlertZoneId,
  deltaAlert: NdviDeltaAlert,
): { tier: NdviZonePulseTier; ringCount: number } {
  if (deltaAlert.type === 'ALERT_RED') return { tier: 'urgent', ringCount: 4 }
  if (deltaAlert.type === 'ALERT_GREEN') return { tier: 'improving', ringCount: 1 }
  switch (zoneId) {
    case 'bare':
      return { tier: 'urgent', ringCount: 3 }
    case 'stress':
      return { tier: 'warning', ringCount: 3 }
    case 'watch':
      return { tier: 'watch', ringCount: 2 }
    case 'harvest-ready':
      return { tier: 'harvest-approach', ringCount: 2 }
    case 'growth':
      return { tier: 'calm', ringCount: 1 }
    case 'healthy':
    default:
      return { tier: 'calm', ringCount: 0 }
  }
}

function hexToRgb(hex: number): [number, number, number] {
  return [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff]
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)))
  return `#${[clamp(r), clamp(g), clamp(b)].map(c => c.toString(16).padStart(2, '0')).join('')}`
}

/** Interpolate WMS ramp color at NDVI value. */
export function sampleNdviRampColor(ndvi: number): string {
  const value = Number.isFinite(ndvi) ? ndvi : 0
  const ramp = NDVI_AGRICULTURAL_RAMP
  if (value <= ramp[0]![0]) return rgbToHex(...hexToRgb(ramp[0]![1]))
  if (value >= ramp[ramp.length - 1]![0]) return rgbToHex(...hexToRgb(ramp[ramp.length - 1]![1]))

  for (let i = 0; i < ramp.length - 1; i++) {
    const [v0, c0] = ramp[i]!
    const [v1, c1] = ramp[i + 1]!
    if (value >= v0 && value <= v1) {
      const t = v1 === v0 ? 0 : (value - v0) / (v1 - v0)
      const [r0, g0, b0] = hexToRgb(c0)
      const [r1, g1, b1] = hexToRgb(c1)
      return rgbToHex(r0 + (r1 - r0) * t, g0 + (g1 - g0) * t, b0 + (b1 - b0) * t)
    }
  }

  return classifyNdviLandZone(value).color
}

/** Alias used by crop-alert legend and map chrome. */
export const getColorByValue = sampleNdviRampColor

/** Land Interpretation Layer — unified NDVI explanation for popups and reports. */
export function buildLandInterpretationLayer(
  ndvi: number,
  sceneValues: number[],
): string[] {
  const zone = classifyNdviLandZone(ndvi)
  const delta = resolveNdviAbsoluteDelta(sceneValues)
  const deltaAlert = resolveNdviDeltaAlert(delta)

  const lines = [
    `${zone.label} — NDVI ${ndvi.toFixed(2)} (${zone.rangeLabel})`,
    zone.interpretation,
  ]

  if (delta != null) {
    lines.push(`Change vs previous scene: ${delta >= 0 ? '+' : ''}${delta.toFixed(2)}`)
  }

  if (deltaAlert.type === 'ALERT_RED') {
    lines.push('Alert: rapid NDVI decline detected — investigate stress or management issues.')
  } else if (deltaAlert.type === 'ALERT_GREEN') {
    lines.push('Alert: significant NDVI improvement — vegetation recovery in progress.')
  }

  return lines
}

export type UnifiedFieldPresentation = {
  zone: NdviAlertZone
  color: string
  icon: string
  label: string
  interpretation: string
  ndviDelta: number | null
  deltaAlert: NdviDeltaAlert
  pulse: { tier: NdviZonePulseTier; ringCount: number }
  landInterpretation: string[]
  landState: LandActivityState
  showCropHealthAlert: boolean
}

export type UnifiedFieldPresentationOptions = {
  ndmi?: number
  ndwi?: number
}

/** Unified map beacon + popup presentation with agricultural context (planted vs bare). */
export function resolveUnifiedFieldPresentation(
  ndvi: number,
  sceneValues: number[] = [],
  options?: UnifiedFieldPresentationOptions,
): UnifiedFieldPresentation {
  const ndmi = options?.ndmi ?? 0
  const ndwi = options?.ndwi ?? 0
  const landHistory = buildLandActivityHistoryFromScenes(
    { NDVI: ndvi, NDMI: ndmi, NDWI: ndwi },
    sceneValues,
  )
  const landState = classifyLandActivity(landHistory)
  const landCtx = landActivityPresentation(landState)

  const zone = classifyNdviLandZone(ndvi)
  const ndviDelta = resolveNdviAbsoluteDelta(sceneValues)
  const deltaAlert = isNoCropActivity(landState)
    ? { type: 'NORMAL' as const, icon: null, label: 'No crop activity' }
    : resolveNdviDeltaAlert(ndviDelta)

  if (isNoCropActivity(landState)) {
    return {
      zone,
      color: landCtx.color,
      icon: landCtx.icon,
      label: landCtx.label,
      interpretation: landCtx.interpretation,
      ndviDelta,
      deltaAlert,
      pulse: { tier: 'calm', ringCount: 0 },
      landInterpretation: [landCtx.interpretation, `NDVI ${ndvi.toFixed(2)} — bare/fallow land`],
      landState,
      showCropHealthAlert: false,
    }
  }

  return {
    zone,
    color: sampleNdviRampColor(ndvi),
    icon: zone.icon,
    label: zone.label,
    interpretation: zone.interpretation,
    ndviDelta,
    deltaAlert,
    pulse: pulseProfileForNdviZone(zone.id, deltaAlert),
    landInterpretation: buildLandInterpretationLayer(ndvi, sceneValues),
    landState,
    showCropHealthAlert: landCtx.showCropHealthAlert,
  }
}

/** @deprecated Use resolveUnifiedFieldPresentation */
export function resolveCropAlertBeaconColor(_status: string, ndvi: number): string {
  return classifyNdviLandZone(ndvi).color
}

/** @deprecated Use resolveUnifiedFieldPresentation */
export function resolveCropAlertBeaconPresentation(
  _status: string,
  ndvi: number,
  sceneValues: number[] = [],
): Omit<UnifiedFieldPresentation, 'landInterpretation' | 'interpretation' | 'label' | 'ndviDelta'> & {
  zone: NdviAlertZone
  color: string
  icon: string
  pulse: { tier: NdviZonePulseTier; ringCount: number }
} {
  const p = resolveUnifiedFieldPresentation(ndvi, sceneValues)
  return {
    zone: p.zone,
    color: p.color,
    icon: p.icon,
    pulse: p.pulse,
    deltaAlert: p.deltaAlert,
  }
}
