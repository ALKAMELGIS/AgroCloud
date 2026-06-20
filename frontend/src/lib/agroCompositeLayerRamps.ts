/**
 * Layer-specific 10-class color ramps for AgroCloud composite indices (Layer Live + WMS).
 * Every composite layer owns a unique anchor palette — no shared ramps between layers.
 * CHAS / ΔCHAS retain dedicated alert ramps; NDVI/NDMI/NDWI/SAVI use Sentinel profiles elsewhere.
 */

import { isAgroDeltaCompositeLayerId } from './agroCompositeIndices'
import { AGRO_UNIQUE_LAYER_RAMP_PALETTES, type AgroLayerRampAnchor } from './agroCompositeLayerRampPalettes'

/** Preserved shared kinds — CHAS scientific raster + alert-derived layers. */
export type AgroCompositeRampKind = 'scientific' | 'alert' | 'alert_delta' | 'alert_derived' | `unique:${string}`

type Anchor = AgroLayerRampAnchor

/** CHAS 10-class scientific stress gradient (Class 1 extreme → Class 10 optimal). */
const CHAS_SCIENTIFIC_ANCHORS: Anchor[] = [
  { t: 0, hex: 0x7f0000, label: 'Class 1 · Extreme stress' },
  { t: 0.11, hex: 0xb22222, label: 'Class 2 · Severe stress' },
  { t: 0.22, hex: 0xd73027, label: 'Class 3 · High stress' },
  { t: 0.33, hex: 0xf46d43, label: 'Class 4 · Moderate stress' },
  { t: 0.44, hex: 0xfdae61, label: 'Class 5 · Early stress' },
  { t: 0.55, hex: 0xfee08b, label: 'Class 6 · Watch' },
  { t: 0.66, hex: 0xd9ef8b, label: 'Class 7 · Fair' },
  { t: 0.77, hex: 0xa6d96a, label: 'Class 8 · Good' },
  { t: 0.88, hex: 0x66bb6a, label: 'Class 9 · Healthy' },
  { t: 1, hex: 0x1a9850, label: 'Class 10 · Optimal' },
]

const CHAS_SCIENTIFIC_CLASS_LABELS: readonly string[] = [
  'Class 1 · Extreme stress',
  'Class 2 · Severe stress',
  'Class 3 · High stress',
  'Class 4 · Moderate stress',
  'Class 5 · Early stress',
  'Class 6 · Watch',
  'Class 7 · Fair',
  'Class 8 · Good',
  'Class 9 · Healthy',
  'Class 10 · Optimal',
]

/** 🚨 Crop alert score — red → orange → yellow → green (CHAS 0–1). Unchanged. */
const ALERT_ANCHORS: Anchor[] = [
  { t: 0, hex: 0xd73027, label: 'Critical' },
  { t: 0.2, hex: 0xe34a33, label: 'Critical' },
  { t: 0.25, hex: 0xf46d43, label: 'Critical edge' },
  { t: 0.33, hex: 0xfdae61, label: 'Stress' },
  { t: 0.4, hex: 0xfdb863, label: 'Watch' },
  { t: 0.5, hex: 0xfee08b, label: 'Watch' },
  { t: 0.6, hex: 0xd9ef8b, label: 'Fair' },
  { t: 0.75, hex: 0x66bb6a, label: 'Healthy' },
  { t: 1, hex: 0x1a9850, label: 'Healthy' },
]

/** 🚨 ΔCHAS change detection — decline red → stable yellow → gain green. Unchanged. */
const ALERT_DELTA_ANCHORS: Anchor[] = [
  { t: 0, hex: 0xd73027, label: 'Critical decline' },
  { t: 0.25, hex: 0xf46d43, label: 'Major decline' },
  { t: 0.375, hex: 0xfdae61, label: 'Stress decline' },
  { t: 0.4375, hex: 0xfee08b, label: 'Watch' },
  { t: 0.5, hex: 0xfff9c4, label: 'Stable' },
  { t: 0.625, hex: 0xc5e1a5, label: 'Slight gain' },
  { t: 0.75, hex: 0x66bb6a, label: 'Gain' },
  { t: 1, hex: 0x1a9850, label: 'Strong gain' },
]

const ALERT_CLASS_LABELS: readonly string[] = [
  'Critical · red',
  'Critical low',
  'Critical high',
  'Stress · orange',
  'Stress high',
  'Watch · yellow',
  'Watch high',
  'Fair · light green',
  'Healthy · green',
  'Optimal · green',
]

const ALERT_DELTA_CLASS_LABELS: readonly string[] = [
  'Critical decline · Δ ≤ −0.15',
  'Major decline',
  'Moderate decline',
  'Stress · Δ ≤ −0.05',
  'Stable low',
  'Stable · watch',
  'Slight gain',
  'Moderate gain',
  'Major gain',
  'Strong gain · green',
]

const PRESERVED_ALERT_LAYER_CONFIG: Record<
  string,
  { kind: AgroCompositeRampKind; valueMin: number; valueMax: number; anchors: Anchor[]; labels: readonly string[]; subtitle: string }
> = {
  CHAS: {
    kind: 'scientific',
    valueMin: -0.2,
    valueMax: 0.85,
    anchors: CHAS_SCIENTIFIC_ANCHORS,
    labels: CHAS_SCIENTIFIC_CLASS_LABELS,
    subtitle: 'CHAS 10-class raster · NDVI+NDWI+NDMI+SAVI fusion · pixel mosaic',
  },
  CHAS_ALERT: {
    kind: 'alert_derived',
    valueMin: -0.2,
    valueMax: 0.85,
    anchors: ALERT_ANCHORS,
    labels: ['Critical', 'Critical', 'Active', 'Active', 'Warning', 'Warning', 'Safe', 'Safe', 'Safe', 'Safe'],
    subtitle: 'CHAS Alert · derived 4-level (Critical / Active / Warning / Safe)',
  },
  DCHAS: {
    kind: 'alert_delta',
    valueMin: -0.4,
    valueMax: 0.4,
    anchors: ALERT_DELTA_ANCHORS,
    labels: ALERT_DELTA_CLASS_LABELS,
    subtitle: 'ΔCHAS change detection · sudden crop decline',
  },
}

export type AgroCompositeLayerRampConfig = {
  kind: AgroCompositeRampKind
  valueMin: number
  valueMax: number
  anchors: Anchor[]
  labels: readonly string[]
  subtitle: string
}

export type AgroCompositeTenClassRamp = {
  layerId: string
  kind: AgroCompositeRampKind
  subtitle: string
  valueMin: number
  valueMax: number
  breaks: number[]
  classValues: number[]
  classColors: number[]
  classLabels: string[]
  classRgb01: [number, number, number][]
  gradientStops: Array<[number, number]>
}

function hexToRgb01(hex: number): [number, number, number] {
  return [((hex >> 16) & 0xff) / 255, ((hex >> 8) & 0xff) / 255, (hex & 0xff) / 255]
}

function blendHex(from: number, to: number, t: number): number {
  const clamp = Math.max(0, Math.min(1, t))
  const [r0, g0, b0] = hexToRgb01(from)
  const [r1, g1, b1] = hexToRgb01(to)
  const r = Math.round((r0 + (r1 - r0) * clamp) * 255)
  const g = Math.round((g0 + (g1 - g0) * clamp) * 255)
  const b = Math.round((b0 + (b1 - b0) * clamp) * 255)
  return ((r << 16) | (g << 8) | b) >>> 0
}

function sampleAnchors(anchors: Anchor[], t: number): number {
  if (!anchors.length) return 0x888888
  if (t <= anchors[0]!.t) return anchors[0]!.hex
  if (t >= anchors[anchors.length - 1]!.t) return anchors[anchors.length - 1]!.hex
  for (let i = 0; i < anchors.length - 1; i++) {
    const a0 = anchors[i]!
    const a1 = anchors[i + 1]!
    if (t >= a0.t && t <= a1.t) {
      const span = a1.t - a0.t
      return blendHex(a0.hex, a1.hex, span > 0 ? (t - a0.t) / span : 0)
    }
  }
  return anchors[anchors.length - 1]!.hex
}

function resolveLayerRampDefinition(layerId: string): AgroCompositeLayerRampConfig | null {
  const u = String(layerId || '').trim().toUpperCase()
  if (!u) return null

  const preserved = PRESERVED_ALERT_LAYER_CONFIG[u]
  if (preserved) return preserved

  const palette = AGRO_UNIQUE_LAYER_RAMP_PALETTES[u]
  if (!palette) return null

  return {
    kind: `unique:${u}`,
    valueMin: palette.valueMin,
    valueMax: palette.valueMax,
    anchors: palette.anchors,
    labels: palette.classLabels,
    subtitle: palette.subtitle,
  }
}

export function buildTenClassRampFromConfig(
  config: AgroCompositeLayerRampConfig,
  layerId = 'UNKNOWN',
): AgroCompositeTenClassRamp {
  const { valueMin, valueMax } = config
  const span = valueMax - valueMin || 1
  const breaks: number[] = []
  const classValues: number[] = []
  const classColors: number[] = []
  const classLabels: string[] = []
  const classRgb01: [number, number, number][] = []

  for (let i = 0; i < 10; i++) {
    const lo = valueMin + (span * i) / 10
    const hi = valueMin + (span * (i + 1)) / 10
    const mid = (lo + hi) / 2
    const t = i / 9
    const color = sampleAnchors(config.anchors, t)
    classValues.push(mid)
    classColors.push(color)
    classRgb01.push(hexToRgb01(color))
    classLabels.push(config.labels[i] ?? `Class ${i + 1}`)
    if (i < 9) breaks.push(Number(hi.toFixed(2)))
  }

  const gradientStops: Array<[number, number]> = classValues.map((v, i) => [v, classColors[i]!])

  return {
    layerId,
    kind: config.kind,
    subtitle: config.subtitle,
    valueMin,
    valueMax,
    breaks,
    classValues,
    classColors,
    classLabels,
    classRgb01,
    gradientStops,
  }
}

export function resolveAgroCompositeLayerRampConfig(layerId: string): AgroCompositeLayerRampConfig | null {
  return resolveLayerRampDefinition(layerId)
}

export function resolveAgroCompositeTenClassRamp(layerId: string): AgroCompositeTenClassRamp | null {
  const config = resolveLayerRampDefinition(layerId)
  if (!config) return null
  return buildTenClassRampFromConfig(config, String(layerId || '').trim().toUpperCase())
}

/** CSS hex for legend UI. */
export function agroCompositeClassColorCss(hex: number): string {
  return `#${(hex >>> 0).toString(16).padStart(6, '0')}`
}

/** Fingerprint for uniqueness checks — serialized 10-class colors. */
export function agroCompositeRampColorFingerprint(layerId: string): string | null {
  const ramp = resolveAgroCompositeTenClassRamp(layerId)
  if (!ramp) return null
  return ramp.classColors.map(c => c.toString(16).padStart(6, '0')).join('-')
}

/** All composite layer ids with unique ramp definitions (excludes Sentinel core indices). */
export function listAgroCompositeRampLayerIds(): string[] {
  return [...Object.keys(AGRO_UNIQUE_LAYER_RAMP_PALETTES), ...Object.keys(PRESERVED_ALERT_LAYER_CONFIG)].sort()
}

/** @deprecated Shared kind anchors removed — kept for type imports only. */
export const AGRO_COMPOSITE_RAMP_KIND_ANCHORS = {
  alert: ALERT_ANCHORS,
  alert_delta: ALERT_DELTA_ANCHORS,
} as const

/** @deprecated Use resolveAgroCompositeLayerRampConfig per layer id. */
export const AGRO_STATIC_LAYER_RAMP_CONFIG: Record<string, Pick<AgroCompositeLayerRampConfig, 'kind' | 'valueMin' | 'valueMax'>> =
  Object.fromEntries(
    listAgroCompositeRampLayerIds()
      .filter(id => !isAgroDeltaCompositeLayerId(id) || id === 'DCHAS')
      .map(id => {
        const cfg = resolveLayerRampDefinition(id)!
        return [id, { kind: cfg.kind, valueMin: cfg.valueMin, valueMax: cfg.valueMax }]
      }),
  )

/** @deprecated Delta layers now have per-layer palettes in AGRO_UNIQUE_LAYER_RAMP_PALETTES. */
export const AGRO_DELTA_LAYER_RAMP_CONFIG = {
  kind: 'unique:DELTA' as AgroCompositeRampKind,
  valueMin: -0.4,
  valueMax: 0.4,
}
