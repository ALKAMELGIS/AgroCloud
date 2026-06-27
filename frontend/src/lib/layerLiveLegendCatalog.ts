/**
 * Layer Live legend specs — color keys for Sentinel Hub WMS layers in Remote Sensing.
 */

import {
  enrichLegendWithAnalyticalResolution,
  isAnalyticalResolutionLayer,
  resolveAnalyticalResolutionMeta,
} from './siAnalyticalResolutionEngine'
import { inferWmsEvalProfile } from './sentinelHubWmsAoiClip'
import {
  isAgroCompositeLayerId,
  isAgroDeltaCompositeLayerId,
  resolveAgroCompositeIndexDef,
} from './agroCompositeIndices'
import {
  agroCompositeClassColorCss,
  resolveAgroCompositeTenClassRamp,
} from './agroCompositeLayerRamps'
import { CHAS_FORMULA_DOC } from './chasIndex'
import { CHAS_ALERT_COLORS, CHAS_ALERT_LEVELS } from './chasAlertMapping'
import {
  SENTINEL_EVI_RAMP,
  SENTINEL_GNDVI_RAMP,
  SENTINEL_MNDWI_RAMP,
  SENTINEL_NDMI_10_CLASS_BREAKS,
  SENTINEL_NDMI_10_CLASS_COLORS,
  SENTINEL_NDMI_MOISTURE_RAMP,
  SENTINEL_NDRE_RAMP,
  SENTINEL_NDSI_RAMP,
  SENTINEL_NDVI_10_CLASS_BREAKS,
  SENTINEL_NDVI_10_CLASS_COLORS,
  SENTINEL_NDVI_AGRICULTURAL_RAMP,
  SENTINEL_NDWI_10_CLASS_BREAKS,
  SENTINEL_NDWI_10_CLASS_COLORS,
  SENTINEL_NDWI_RAMP,
  SENTINEL_SAVI_RAMP,
} from './sentinelHubWmsIndexEvalscripts'

export type LayerLiveLegendKind = 'discrete' | 'gradient' | 'composite' | 'sar' | 'note'

export type LayerLiveLegendClass = {
  label: string
  rangeLabel: string
  color: string
}

export type LayerLiveLegendCompositeBand = {
  band: string
  color: string
}

/** Semantic low / mid / high captions shown in the scientific scale header. */
export type LayerLiveLegendScaleLabels = {
  low: string
  mid: string
  high: string
}

export type LayerLiveLegendSpec = {
  id: string
  title: string
  subtitle?: string
  kind: LayerLiveLegendKind
  classes?: LayerLiveLegendClass[]
  gradientCss?: string
  valueMin?: number
  valueMax?: number
  /** Semantic captions for the 3-cell scale header (matches the NDVI scientific layout). */
  scaleLabels?: LayerLiveLegendScaleLabels
  compositeBands?: LayerLiveLegendCompositeBand[]
  note?: string
}

type RampStop = readonly [number, number]

export function hexNumberToCss(hex: number): string {
  const n = hex >>> 0
  return `#${(n & 0xffffff).toString(16).padStart(6, '0')}`
}

function sampleRampColor(value: number, ramp: RampStop[]): string {
  if (!ramp.length) return '#888888'
  if (value <= ramp[0]![0]) return hexNumberToCss(ramp[0]![1])
  if (value >= ramp[ramp.length - 1]![0]) return hexNumberToCss(ramp[ramp.length - 1]![1])
  for (let i = 0; i < ramp.length - 1; i++) {
    const [v0, c0] = ramp[i]!
    const [v1, c1] = ramp[i + 1]!
    if (value >= v0 && value <= v1) {
      const t = v1 === v0 ? 0 : (value - v0) / (v1 - v0)
      const r0 = (c0 >> 16) & 0xff
      const g0 = (c0 >> 8) & 0xff
      const b0 = c0 & 0xff
      const r1 = (c1 >> 16) & 0xff
      const g1 = (c1 >> 8) & 0xff
      const b1 = c1 & 0xff
      const r = Math.round(r0 + (r1 - r0) * t)
      const g = Math.round(g0 + (g1 - g0) * t)
      const b = Math.round(b0 + (b1 - b0) * t)
      return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
    }
  }
  return hexNumberToCss(ramp[ramp.length - 1]![1])
}

export function rampToGradientCss(ramp: RampStop): string {
  if (ramp.length < 2) return sampleRampColor(0, ramp)
  const min = ramp[0]![0]
  const max = ramp[ramp.length - 1]![0]
  const span = max - min || 1
  const stops = ramp
    .map(([v, c]) => `${hexNumberToCss(c)} ${(((v - min) / span) * 100).toFixed(1)}%`)
    .join(', ')
  return `linear-gradient(to right, ${stops})`
}

function formatIndexValue(v: number): string {
  if (Math.abs(v) < 0.01) return v.toFixed(3)
  if (Math.abs(v) < 0.1) return v.toFixed(2)
  return v.toFixed(2)
}

function buildClassesFromBreaks(
  breaks: readonly number[],
  colors: readonly number[],
  labels: readonly string[],
): LayerLiveLegendClass[] {
  const out: LayerLiveLegendClass[] = []
  for (let i = 0; i < colors.length; i++) {
    const lo = i === 0 ? null : breaks[i - 1]!
    const hi = i < breaks.length ? breaks[i]! : null
    let rangeLabel = ''
    if (lo == null && hi != null) rangeLabel = `< ${formatIndexValue(hi)}`
    else if (lo != null && hi != null) rangeLabel = `${formatIndexValue(lo)} – ${formatIndexValue(hi)}`
    else if (lo != null) rangeLabel = `≥ ${formatIndexValue(lo)}`
    out.push({
      label: labels[i] ?? `Class ${i + 1}`,
      rangeLabel,
      color: hexNumberToCss(colors[i]!),
    })
  }
  return out
}

const NDVI_CLASS_LABELS = [
  'Water / No Vegetation',
  'Very low vigor',
  'High stress',
  'Crop stress',
  'Early watch',
  'Watch',
  'Moderate health',
  'Good growth',
  'Strong growth',
  'Very Dense / Vigorous Vegetation',
] as const

const NDWI_CLASS_LABELS = [
  'Very dry',
  'Dry',
  'Moderate dry',
  'Slightly dry',
  'Bare transition',
  'Low moisture',
  'Moist soil',
  'Wet vegetation',
  'Shallow water',
  'Open water',
] as const

const NDMI_CLASS_LABELS = [
  'Severe stress',
  'High stress',
  'Moderate stress',
  'Low stress',
  'Dry canopy',
  'Moist canopy',
  'Good moisture',
  'High moisture',
  'Very wet',
  'Saturated',
] as const

function buildRampDiscreteClasses(
  ramp: RampStop,
  count: number,
  labelPrefix: string,
  labels?: readonly string[],
): LayerLiveLegendClass[] {
  const min = ramp[0]![0]
  const max = ramp[ramp.length - 1]![0]
  const step = (max - min) / count
  const classes: LayerLiveLegendClass[] = []
  for (let i = 0; i < count; i++) {
    const lo = min + step * i
    const hi = i === count - 1 ? max : min + step * (i + 1)
    const mid = (lo + hi) / 2
    classes.push({
      label: labels?.[i] ?? `${labelPrefix} ${i + 1}`,
      rangeLabel:
        i === 0
          ? `< ${formatIndexValue(hi)}`
          : i === count - 1
            ? `≥ ${formatIndexValue(lo)}`
            : `${formatIndexValue(lo)} – ${formatIndexValue(hi)}`,
      color: sampleRampColor(mid, ramp),
    })
  }
  return classes
}

const SCENE_CLASSIFICATION_CLASSES: LayerLiveLegendClass[] = [
  { label: 'No data', rangeLabel: '0', color: '#000000' },
  { label: 'Saturated / defective', rangeLabel: '1', color: '#ff0000' },
  { label: 'Dark area pixels', rangeLabel: '2', color: '#2f2f2f' },
  { label: 'Cloud shadows', rangeLabel: '3', color: '#646464' },
  { label: 'Vegetation', rangeLabel: '4', color: '#00a000' },
  { label: 'Not vegetated', rangeLabel: '5', color: '#ffff00' },
  { label: 'Water', rangeLabel: '6', color: '#0000ff' },
  { label: 'Unclassified', rangeLabel: '7', color: '#808080' },
  { label: 'Cloud medium prob.', rangeLabel: '8', color: '#c0c0c0' },
  { label: 'Cloud high prob.', rangeLabel: '9', color: '#ffffff' },
  { label: 'Thin cirrus', rangeLabel: '10', color: '#00ffff' },
  { label: 'Snow / ice', rangeLabel: '11', color: '#ff00ff' },
]

function normalizeLayerKey(layerId: string, layerLabel?: string): string {
  return `${layerId} ${layerLabel ?? ''}`.trim().toUpperCase()
}

function isSarLayer(key: string): boolean {
  return /(?:^|[\s_-])(HH|HV|VH|VV)(?:[\s_-]|$)|GAMMA0|SAR\s*URBAN|DECIBEL|LINEAR/i.test(key)
}

function isSceneClassification(key: string): boolean {
  return /SCENE\s*CLASS|SCL|CLASSIFICATION\s*MAP/i.test(key)
}

function buildNdviLegend(): LayerLiveLegendSpec {
  return {
    id: 'ndvi',
    title: 'NDVI',
    subtitle: 'Vegetation vigor (NIR − Red)',
    kind: 'discrete',
    valueMin: -1,
    valueMax: 1,
    scaleLabels: { low: 'Water / dry soil', mid: 'Moderate canopy', high: 'Dense vegetation' },
    gradientCss: rampToGradientCss(SENTINEL_NDVI_AGRICULTURAL_RAMP),
    classes: buildClassesFromBreaks(
      SENTINEL_NDVI_10_CLASS_BREAKS,
      SENTINEL_NDVI_10_CLASS_COLORS,
      NDVI_CLASS_LABELS,
    ),
  }
}

function buildNdwiLegend(): LayerLiveLegendSpec {
  return {
    id: 'ndwi',
    title: 'NDWI',
    subtitle: 'Surface / canopy water (Green − NIR)',
    kind: 'discrete',
    valueMin: -1,
    valueMax: 1,
    scaleLabels: { low: 'Dry / bare soil', mid: 'Damp transition', high: 'Open water' },
    gradientCss: rampToGradientCss(SENTINEL_NDWI_RAMP),
    classes: buildClassesFromBreaks(
      SENTINEL_NDWI_10_CLASS_BREAKS,
      SENTINEL_NDWI_10_CLASS_COLORS,
      NDWI_CLASS_LABELS,
    ),
  }
}

function buildNdmiLegend(): LayerLiveLegendSpec {
  return {
    id: 'ndmi',
    title: 'NDMI',
    subtitle: 'Canopy moisture (NIR − SWIR)',
    kind: 'discrete',
    valueMin: -0.8,
    valueMax: 0.8,
    scaleLabels: { low: 'Moisture stress', mid: 'Moist canopy', high: 'Saturated' },
    gradientCss: rampToGradientCss(SENTINEL_NDMI_MOISTURE_RAMP),
    classes: buildClassesFromBreaks(
      SENTINEL_NDMI_10_CLASS_BREAKS,
      SENTINEL_NDMI_10_CLASS_COLORS,
      NDMI_CLASS_LABELS,
    ),
  }
}

function buildIndexRampLegend(
  id: string,
  title: string,
  subtitle: string,
  ramp: RampStop,
  classCount = 10,
  scaleLabels: LayerLiveLegendScaleLabels = { low: 'Low', mid: 'Moderate', high: 'High' },
  classLabels?: readonly string[],
): LayerLiveLegendSpec {
  return {
    id,
    title,
    subtitle,
    kind: 'discrete',
    valueMin: ramp[0]![0],
    valueMax: ramp[ramp.length - 1]![0],
    scaleLabels,
    gradientCss: rampToGradientCss(ramp),
    classes: buildRampDiscreteClasses(ramp, classCount, title, classLabels),
  }
}

/** Cover-graded class names for SAVI (low value → high value). */
const SAVI_CLASS_LABELS = [
  'Bare / non-veg',
  'Very sparse cover',
  'Sparse cover',
  'Low cover',
  'Low–moderate cover',
  'Moderate cover',
  'Moderate–high cover',
  'High cover',
  'Dense cover',
  'Very dense cover',
] as const

function buildTrueColorLegend(title: string): LayerLiveLegendSpec {
  return {
    id: 'true-color',
    title,
    subtitle: 'Natural color composite',
    kind: 'composite',
    compositeBands: [
      { band: 'Red (B04)', color: '#ef4444' },
      { band: 'Green (B03)', color: '#22c55e' },
      { band: 'Blue (B02)', color: '#3b82f6' },
    ],
    note: 'Photographic true-color — not an index scale.',
  }
}

function buildFalseColorLegend(title: string, urban = false): LayerLiveLegendSpec {
  return {
    id: urban ? 'false-color-urban' : 'false-color',
    title,
    subtitle: urban ? 'Urban false color' : 'Vegetation false color',
    kind: 'composite',
    compositeBands: [
      { band: 'NIR (B08)', color: '#ef4444' },
      { band: 'Red (B04)', color: '#22c55e' },
      { band: 'Green (B03)', color: '#3b82f6' },
    ],
    note: 'Healthy vegetation appears red; water and bare soil differ by band mix.',
  }
}

function buildSwirLegend(): LayerLiveLegendSpec {
  return {
    id: 'swir',
    title: 'SWIR',
    subtitle: 'Short-wave infrared composite',
    kind: 'composite',
    compositeBands: [
      { band: 'SWIR (B12)', color: '#ef4444' },
      { band: 'NIR (B8A)', color: '#22c55e' },
      { band: 'Red (B04)', color: '#3b82f6' },
    ],
  }
}

function buildSarLegend(title: string): LayerLiveLegendSpec {
  return {
    id: 'sar',
    title,
    subtitle: 'Radar backscatter',
    kind: 'sar',
    gradientCss: 'linear-gradient(to right, #1a1a1a 0%, #808080 50%, #f5f5f5 100%)',
    classes: [
      { label: 'Low backscatter', rangeLabel: 'dark', color: '#1a1a1a' },
      { label: 'Medium', rangeLabel: 'mid', color: '#808080' },
      { label: 'High backscatter', rangeLabel: 'bright', color: '#f5f5f5' },
    ],
    note: 'Decibel gamma0 layers use log-scaled radar intensity.',
  }
}

function buildPresetLegend(title: string): LayerLiveLegendSpec {
  return {
    id: 'preset',
    title,
    subtitle: 'Sentinel Hub preset visualization',
    kind: 'note',
    note: 'Uses the hosted Sentinel Hub color composite — switch layers to compare visual appearance on the map.',
  }
}

const LEGEND_BY_PROFILE: Record<string, () => LayerLiveLegendSpec> = {
  ndvi: buildNdviLegend,
  ndwi: buildNdwiLegend,
  ndmi: buildNdmiLegend,
  mndwi: () =>
    buildIndexRampLegend('mndwi', 'MNDWI', 'Modified water index', SENTINEL_MNDWI_RAMP, 10, {
      low: 'Dry land',
      mid: 'Wet soil',
      high: 'Open water',
    }),
  ndsi: () =>
    buildIndexRampLegend('ndsi', 'NDSI', 'Snow / ice index', SENTINEL_NDSI_RAMP, 10, {
      low: 'No snow',
      mid: 'Partial snow',
      high: 'Snow / ice',
    }),
  evi: () =>
    buildIndexRampLegend('evi', 'EVI', 'Enhanced vegetation index', SENTINEL_EVI_RAMP, 10, {
      low: 'Bare / sparse',
      mid: 'Moderate canopy',
      high: 'Dense vegetation',
    }),
  savi: () =>
    buildIndexRampLegend(
      'savi',
      'SAVI',
      'Soil-adjusted vegetation — 10 classes; reduced soil brightness bias.',
      SENTINEL_SAVI_RAMP,
      10,
      { low: 'Sparse cover', mid: 'Moderate cover', high: 'Dense cover' },
      SAVI_CLASS_LABELS,
    ),
  gndvi: () =>
    buildIndexRampLegend('gndvi', 'GNDVI', 'Green NDVI', SENTINEL_GNDVI_RAMP, 10, {
      low: 'Low chlorophyll',
      mid: 'Moderate',
      high: 'High chlorophyll',
    }),
  ndre: () =>
    buildIndexRampLegend('ndre', 'NDRE', 'Red-edge chlorophyll proxy', SENTINEL_NDRE_RAMP, 10, {
      low: 'Low chlorophyll',
      mid: 'Moderate',
      high: 'High chlorophyll',
    }),
}


function buildAgroCompositeLegendNote(layerId: string, isDelta: boolean): string | undefined {
  const u = String(layerId || '').trim().toUpperCase()
  if (u === 'CHAS') {
    return `CHAS = ${CHAS_FORMULA_DOC} · 10-class pixel raster (Class 1 extreme stress → Class 10 optimal)`
  }
  if (u === 'CHAS_ALERT') {
    return 'Derived from CHAS raster classes · Classes 1–2 Critical · 3–4 Active · 5–6 Warning · 7–10 Safe · no re-fusion'
  }
  if (u === 'DCHAS') {
    return 'ΔCHAS = CHAS(t₂) − CHAS(t₁) · trend overlay only · 🔴 Δ ≤ −0.15 · 🟠 Δ ≤ −0.05'
  }
  if (isDelta) return 'Δ > 0 → improvement · Δ < 0 → degradation · Δ ≈ 0 → stable'
  return 'Composite from NDVI, NDMI, NDWI, SAVI'
}

function buildChasAlertLegendClasses(): LayerLiveLegendClass[] {
  return CHAS_ALERT_LEVELS.map(level => ({
    label: level,
    rangeLabel:
      level === 'CRITICAL'
        ? 'CHAS class 1–2'
        : level === 'ACTIVE'
          ? 'CHAS class 3–4'
          : level === 'WARNING'
            ? 'CHAS class 5–6'
            : 'CHAS class 7–10',
    color: CHAS_ALERT_COLORS[level],
  }))
}

function buildChasAlertLegend(layerId: string): LayerLiveLegendSpec | null {
  const def = resolveAgroCompositeIndexDef(layerId)
  if (!def) return null
  return {
    id: layerId,
    title: def.label,
    subtitle: 'Derived 4-level alert overlay (rule engine on CHAS raster)',
    kind: 'discrete',
    classes: buildChasAlertLegendClasses(),
    note: buildAgroCompositeLegendNote(layerId, false),
  }
}

function buildCompositeTenClassLegendClasses(
  ramp: NonNullable<ReturnType<typeof resolveAgroCompositeTenClassRamp>>,
): LayerLiveLegendClass[] {
  return ramp.classLabels.map((label, i) => {
    const lo = i === 0 ? null : ramp.breaks[i - 1]!
    const hi = i < ramp.breaks.length ? ramp.breaks[i]! : null
    let rangeLabel = ''
    if (lo == null && hi != null) rangeLabel = `< ${formatIndexValue(hi)}`
    else if (lo != null && hi != null) rangeLabel = `${formatIndexValue(lo)} – ${formatIndexValue(hi)}`
    else if (lo != null) rangeLabel = `≥ ${formatIndexValue(lo)}`
    return {
      label,
      rangeLabel,
      color: agroCompositeClassColorCss(ramp.classColors[i]!),
    }
  })
}

function buildAgroCompositeLegend(layerId: string): LayerLiveLegendSpec | null {
  const u = String(layerId || '').trim().toUpperCase()
  if (u === 'CHAS_ALERT') return buildChasAlertLegend(layerId)
  const def = resolveAgroCompositeIndexDef(layerId)
  if (!def) return null
  const ramp = resolveAgroCompositeTenClassRamp(layerId)
  if (!ramp) return null
  const isDelta = isAgroDeltaCompositeLayerId(layerId)
  const title = isDelta ? def.deltaLabel : def.label
  const lowLabel = ramp.classLabels[0]?.trim() || (isDelta ? 'Decline' : 'Low')
  const highLabel = ramp.classLabels[ramp.classLabels.length - 1]?.trim() || (isDelta ? 'Improvement' : 'High')
  return {
    id: layerId,
    title,
    subtitle: ramp.subtitle,
    kind: 'discrete',
    gradientCss: rampToGradientCss(ramp.gradientStops),
    valueMin: ramp.valueMin,
    valueMax: ramp.valueMax,
    scaleLabels: { low: lowLabel, mid: isDelta ? 'Stable' : 'Moderate', high: highLabel },
    classes: buildCompositeTenClassLegendClasses(ramp),
    note: buildAgroCompositeLegendNote(layerId, isDelta),
  }
}

/** Resolve legend spec for a Sentinel Hub WMS layer id / label. */
export function resolveLayerLiveLegendSpec(
  layerId: string,
  layerLabel?: string,
): LayerLiveLegendSpec | null {
  const key = normalizeLayerKey(layerId, layerLabel)
  const title = (layerLabel || layerId || 'Layer').trim() || 'Layer'

  if (isAgroCompositeLayerId(layerId)) {
    const composite = buildAgroCompositeLegend(layerId)
    return composite ? enrichLegendWithAnalyticalResolution(composite) : null
  }

  if (isSceneClassification(key)) {
    return {
      id: layerId,
      title,
      subtitle: 'Sentinel-2 scene classification (SCL)',
      kind: 'discrete',
      classes: SCENE_CLASSIFICATION_CLASSES,
    }
  }

  if (isSarLayer(key)) {
    return { ...buildSarLegend(title), id: layerId }
  }

  if (/RGB\s*RATIO/i.test(key)) {
    return {
      id: layerId,
      title,
      subtitle: 'Band ratio composite',
      kind: 'note',
      note: 'Ratio of visible bands — bright areas indicate higher relative reflectance in the ratio numerator.',
    }
  }

  if (/FALSE\s*COLOR.*URBAN|URBAN.*FALSE/i.test(key)) {
    return { ...buildFalseColorLegend(title, true), id: layerId, title }
  }

  if (/FALSE\s*COLOR|COLOR.?INFRARED/i.test(key)) {
    return { ...buildFalseColorLegend(title), id: layerId, title }
  }

  if (/^SWIR\b|\bSWIR\b/i.test(key)) {
    return { ...buildSwirLegend(), id: layerId, title }
  }

  if (/TRUE\s*COLOR|NATURAL\s*COLOR|OPTIMIZED\s*NATURAL|HIGHLIGHT/i.test(key)) {
    return { ...buildTrueColorLegend(title), id: layerId, title }
  }

  if (/ENHANCED\s*VIS|VIVID|CONTRAST|MOMA|AGRICULTURE|COLOR.?BLIND|ATMOSPHERIC|PERSPECTIVE/i.test(key)) {
    return { ...buildPresetLegend(title), id: layerId, title }
  }

  const profile = inferWmsEvalProfile(layerId)
  if (profile === 'native') {
    return { ...buildPresetLegend(title), id: layerId, title }
  }

  if (profile === 'true_color') {
    return { ...buildTrueColorLegend(title), id: layerId, title }
  }

  if (profile === 'false_color') {
    return { ...buildFalseColorLegend(title), id: layerId, title }
  }

  const builder = LEGEND_BY_PROFILE[profile]
  if (builder) {
    const spec = builder()
    return enrichLegendWithAnalyticalResolution({
      ...spec,
      id: layerId,
      title: spec.title === profile.toUpperCase() ? title : spec.title,
    })
  }

  return enrichLegendWithAnalyticalResolution({
    id: layerId,
    title,
    kind: 'note',
    note: 'No custom index ramp — display follows the Sentinel Hub layer definition.',
  })
}

/** Build legend list for all layers in the Remote Sensing dropdown (deduped by spec id). */
export function buildLayerLiveLegendList(
  layers: Array<{ id: string; label?: string }>,
): LayerLiveLegendSpec[] {
  const seen = new Set<string>()
  const out: LayerLiveLegendSpec[] = []
  for (const layer of layers) {
    const spec = resolveLayerLiveLegendSpec(layer.id, layer.label)
    if (!spec) continue
    const dedupeKey = `${spec.kind}:${spec.title}:${spec.subtitle ?? ''}`
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)
    out.push(spec)
  }
  return out
}
