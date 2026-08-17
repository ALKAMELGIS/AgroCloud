/**
 * Map raw GeoJSON properties onto the Agricultural Object Intelligence dictionary.
 * Geometry-derived fields always win for centroid/area/coordinates when computable.
 */

import { geodesicAreaM2 } from '../../../../lib/siLayerClassAreaEngine'
import {
  AGRI_OBJECT_FIELD_DEFS,
  formatAgriCell,
  NOT_AVAILABLE,
  readPropCaseInsensitive,
  type AgriObjectFieldKey,
} from './agriculturalObjectIntelligenceSchema'

export type AgriMappedSource = 'layer' | 'geometry' | 'missing'

export type AgriMappedField = {
  key: AgriObjectFieldKey
  label: string
  value: string | number
  source: AgriMappedSource
}

function computeCentroid(geometry: GeoJSON.Geometry | null | undefined): [number, number] | null {
  if (!geometry) return null
  const pts: number[][] = []
  const walk = (c: unknown) => {
    if (!c) return
    if (typeof (c as number[])[0] === 'number' && typeof (c as number[])[1] === 'number') {
      pts.push(c as number[])
      return
    }
    if (Array.isArray(c)) c.forEach(walk)
  }
  walk((geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon).coordinates)
  if (!pts.length) return null
  let sx = 0
  let sy = 0
  for (const [x, y] of pts) {
    sx += x
    sy += y
  }
  return [sx / pts.length, sy / pts.length]
}

/** WKT POLYGON / MULTIPOLYGON for EXAMPLE-style boundary column. */
export function geometryToWkt(geometry: GeoJSON.Geometry | null | undefined, digits = 5): string {
  if (!geometry) return NOT_AVAILABLE
  const fmt = (n: number) => Number(n).toFixed(digits)
  const ringToText = (ring: number[][]) => ring.map(([x, y]) => `${fmt(x)} ${fmt(y)}`).join(', ')
  try {
    if (geometry.type === 'Polygon') {
      const outer = geometry.coordinates[0]
      if (!outer?.length) return NOT_AVAILABLE
      return `POLYGON((${ringToText(outer)}))`
    }
    if (geometry.type === 'MultiPolygon') {
      const parts = geometry.coordinates
        .map(poly => {
          const outer = poly[0]
          if (!outer?.length) return null
          return `((${ringToText(outer)}))`
        })
        .filter(Boolean)
      if (!parts.length) return NOT_AVAILABLE
      return `MULTIPOLYGON(${parts.join(', ')})`
    }
    if (geometry.type === 'Point') {
      const [x, y] = geometry.coordinates
      return `POINT(${fmt(x)} ${fmt(y)})`
    }
    // Fallback compact GeoJSON for uncommon types
    return JSON.stringify(geometry)
  } catch {
    return NOT_AVAILABLE
  }
}

function areaHaFromPropsOrGeom(
  props: Record<string, unknown>,
  geometry: GeoJSON.Geometry | null | undefined,
): { value: number | typeof NOT_AVAILABLE; source: AgriMappedSource } {
  const raw = readPropCaseInsensitive(props, [
    'area_ha',
    'shape_area',
    'area',
    'hectares',
    'ha',
  ])
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    // Heuristic: Shape_Area often in m² when very large
    const ha = raw > 1000 ? raw / 10_000 : raw
    return { value: Number(ha.toFixed(4)), source: 'layer' }
  }
  if (typeof raw === 'string' && raw.trim()) {
    const n = Number(raw)
    if (Number.isFinite(n) && n > 0) {
      const ha = n > 1000 ? n / 10_000 : n
      return { value: Number(ha.toFixed(4)), source: 'layer' }
    }
  }
  if (geometry) {
    const m2 = geodesicAreaM2(geometry)
    if (Number.isFinite(m2) && m2 > 0) {
      return { value: Number((m2 / 10_000).toFixed(4)), source: 'geometry' }
    }
  }
  return { value: NOT_AVAILABLE, source: 'missing' }
}

/**
 * Map one feature's properties (+ optional geometry) onto every dictionary field.
 * Missing attributes stay `Not Available` — never invented.
 */
export function mapLayerAttributesToAgriFields(input: {
  props?: Record<string, unknown> | null
  geometry?: GeoJSON.Geometry | null
  fallbackObjectId?: string
  fallbackName?: string
}): AgriMappedField[] {
  const props = (input.props ?? {}) as Record<string, unknown>
  const geom = input.geometry ?? null
  const centroid = computeCentroid(geom)
  const area = areaHaFromPropsOrGeom(props, geom)

  const out: AgriMappedField[] = []
  for (const def of AGRI_OBJECT_FIELD_DEFS) {
    if (def.key === 'boundaryCoordinates') {
      out.push({
        key: def.key,
        label: def.label,
        value: geom ? geometryToWkt(geom) : NOT_AVAILABLE,
        source: geom ? 'geometry' : 'missing',
      })
      continue
    }
    if (def.key === 'centroidLatitude') {
      const fromLayer = readPropCaseInsensitive(props, def.aliases)
      if (fromLayer != null && fromLayer !== '') {
        out.push({ key: def.key, label: def.label, value: formatAgriCell(fromLayer), source: 'layer' })
      } else if (centroid) {
        out.push({
          key: def.key,
          label: def.label,
          value: Number(centroid[1].toFixed(6)),
          source: 'geometry',
        })
      } else {
        out.push({ key: def.key, label: def.label, value: NOT_AVAILABLE, source: 'missing' })
      }
      continue
    }
    if (def.key === 'centroidLongitude') {
      const fromLayer = readPropCaseInsensitive(props, def.aliases)
      if (fromLayer != null && fromLayer !== '') {
        out.push({ key: def.key, label: def.label, value: formatAgriCell(fromLayer), source: 'layer' })
      } else if (centroid) {
        out.push({
          key: def.key,
          label: def.label,
          value: Number(centroid[0].toFixed(6)),
          source: 'geometry',
        })
      } else {
        out.push({ key: def.key, label: def.label, value: NOT_AVAILABLE, source: 'missing' })
      }
      continue
    }
    if (def.key === 'estimatedAreaHa') {
      out.push({ key: def.key, label: def.label, value: area.value, source: area.source })
      continue
    }
    if (def.key === 'objectId') {
      const fromLayer = readPropCaseInsensitive(props, def.aliases)
      const v =
        fromLayer != null && fromLayer !== ''
          ? formatAgriCell(fromLayer)
          : input.fallbackObjectId?.trim() || NOT_AVAILABLE
      out.push({
        key: def.key,
        label: def.label,
        value: v,
        source: fromLayer != null && fromLayer !== '' ? 'layer' : v === NOT_AVAILABLE ? 'missing' : 'layer',
      })
      continue
    }
    if (def.key === 'objectName') {
      const fromLayer = readPropCaseInsensitive(props, def.aliases)
      const v =
        fromLayer != null && fromLayer !== ''
          ? formatAgriCell(fromLayer)
          : input.fallbackName?.trim() || NOT_AVAILABLE
      out.push({
        key: def.key,
        label: def.label,
        value: v,
        source: fromLayer != null && fromLayer !== '' ? 'layer' : v === NOT_AVAILABLE ? 'missing' : 'layer',
      })
      continue
    }

    // Metadata / computed-later fields stay blank here if not on the layer.
    if (
      def.aliases.length === 0 ||
      [
        'capabilityStatus',
        'timeSeriesDataAvailable',
        'satelliteDataUsed',
        'aiAnalyticalMethodUsed',
        'requiredGroundTruthData',
        'additionalDatasetRequired',
        'expectedAccuracy',
        'technicalLimitations',
        'additionalEoAiOutputs',
        'additionalObservationsRecommendations',
        'changeFromPreviousPeriod',
        'newlyCultivatedAbandoned',
        'anomalyDetected',
        'priorityForFieldInspection',
        'recommendedActionInsight',
      ].includes(def.key)
    ) {
      const fromLayer = def.aliases.length ? readPropCaseInsensitive(props, def.aliases) : undefined
      if (fromLayer != null && fromLayer !== '') {
        out.push({ key: def.key, label: def.label, value: formatAgriCell(fromLayer), source: 'layer' })
      } else {
        out.push({ key: def.key, label: def.label, value: NOT_AVAILABLE, source: 'missing' })
      }
      continue
    }

    const fromLayer = readPropCaseInsensitive(props, def.aliases)
    if (fromLayer != null && fromLayer !== '') {
      out.push({ key: def.key, label: def.label, value: formatAgriCell(fromLayer), source: 'layer' })
    } else {
      out.push({ key: def.key, label: def.label, value: NOT_AVAILABLE, source: 'missing' })
    }
  }
  return out
}

export function mappedFieldsToRecord(fields: AgriMappedField[]): Record<AgriObjectFieldKey, string | number> {
  const rec = {} as Record<AgriObjectFieldKey, string | number>
  for (const f of fields) rec[f.key] = f.value
  return rec
}

/** Classify NDVI change between early and late window means. */
export function classifyNdviChange(
  earlyMean: number | null | undefined,
  lateMean: number | null | undefined,
  observationCount: number,
): import('./agriculturalObjectIntelligenceSchema').AgriObjectChangeLabel {
  if (observationCount < 2 || earlyMean == null || lateMean == null) {
    return 'Insufficient historical data'
  }
  if (!Number.isFinite(earlyMean) || !Number.isFinite(lateMean)) {
    return 'Insufficient historical data'
  }
  const delta = lateMean - earlyMean
  if (earlyMean < 0.15 && lateMean >= 0.35 && delta >= 0.15) return 'Newly cultivated'
  if (earlyMean >= 0.35 && lateMean < 0.15 && delta <= -0.2) return 'Potentially abandoned'
  if (delta >= 0.05) return 'Improving'
  if (delta <= -0.05) return 'Declining'
  return 'Stable'
}

export function classifyInspectionPriority(input: {
  change: import('./agriculturalObjectIntelligenceSchema').AgriObjectChangeLabel
  lateNdvi: number | null
  lateNdmi: number | null
  ndviDelta: number | null
}): {
  priority: import('./agriculturalObjectIntelligenceSchema').AgriObjectInspectionPriority
  anomaly: string
  reason: string
} {
  const reasons: string[] = []
  let score = 0
  if (input.change === 'Potentially abandoned') {
    score += 3
    reasons.push('strong vegetation decline suggesting possible abandonment')
  } else if (input.change === 'Declining') {
    score += 2
    reasons.push('declining NDVI trend')
  }
  if (input.lateNdvi != null && input.lateNdvi < 0.2) {
    score += 2
    reasons.push('low late-window NDVI')
  }
  if (input.lateNdmi != null && input.lateNdmi < 0) {
    score += 2
    reasons.push('NDMI water-stress proxy below 0')
  }
  if (input.ndviDelta != null && input.ndviDelta <= -0.15) {
    score += 1
    reasons.push(`NDVI Δ ${input.ndviDelta.toFixed(3)}`)
  }

  if (score >= 4) {
    return {
      priority: 'HIGH',
      anomaly: reasons.join('; ') || 'Severe vegetation / moisture stress signals',
      reason: `HIGH — ${reasons.join('; ')}`,
    }
  }
  if (score >= 2) {
    return {
      priority: 'MEDIUM',
      anomaly: reasons.join('; ') || 'Moderate vegetation stress signals',
      reason: `MEDIUM — ${reasons.join('; ')}`,
    }
  }
  if (input.change === 'Insufficient historical data') {
    return {
      priority: 'None',
      anomaly: 'Insufficient historical data for anomaly scoring',
      reason: 'None — insufficient multi-temporal evidence',
    }
  }
  return {
    priority: 'LOW',
    anomaly: 'No significant anomaly from available indices',
    reason: 'LOW — normal / stable vegetation condition from available Sentinel-2 indices',
  }
}

/** NDVI-threshold vegetation coverage estimate (proxy, not a land-cover map). */
export function estimateVegetationCoveragePct(ndviMean: number | null | undefined): number | null {
  if (ndviMean == null || !Number.isFinite(ndviMean)) return null
  // Linear stretch: NDVI 0.2 → ~0%, 0.7 → ~100% vegetated fraction proxy
  const pct = ((ndviMean - 0.2) / 0.5) * 100
  return Math.max(0, Math.min(100, Number(pct.toFixed(1))))
}

export function waterStressFromNdmi(ndmi: number | null | undefined): string {
  if (ndmi == null || !Number.isFinite(ndmi)) return NOT_AVAILABLE
  if (ndmi < -0.1) return 'High'
  if (ndmi < 0.1) return 'Moderate'
  return 'Low'
}

export function soilMoistureProxyFromNdmi(ndmi: number | null | undefined): string {
  if (ndmi == null || !Number.isFinite(ndmi)) return NOT_AVAILABLE
  if (ndmi < 0) return 'Low'
  if (ndmi < 0.2) return 'Moderate'
  return 'Moist'
}

export function cropHealthFromNdvi(ndvi: number | null | undefined): string {
  if (ndvi == null || !Number.isFinite(ndvi)) return NOT_AVAILABLE
  if (ndvi < 0.35) return 'High Stress'
  if (ndvi < 0.5) return 'Moderate'
  return 'Healthy'
}

/**
 * Phenology-stage proxy from late NDVI (+ optional early→late trajectory).
 * Not a crop calendar — labeled as spectral proxy when used.
 */
export function cropGrowthStageFromNdvi(input: {
  lateNdvi: number | null | undefined
  earlyNdvi?: number | null | undefined
  observationCount?: number
}): string {
  const late = input.lateNdvi
  if (late == null || !Number.isFinite(late)) return NOT_AVAILABLE
  const early = input.earlyNdvi
  const n = input.observationCount ?? 0
  const delta =
    early != null && Number.isFinite(early) && n >= 2 ? late - (early as number) : null

  if (late < 0.18) return 'Dormant / Bare'
  if (late < 0.32) {
    if (delta != null && delta >= 0.08) return 'Early Growth'
    return 'Sparse / Establishment'
  }
  if (late < 0.48) {
    if (delta != null && delta >= 0.05) return 'Vegetative Growth'
    if (delta != null && delta <= -0.05) return 'Senescence'
    return 'Mid Growth'
  }
  if (late < 0.62) {
    if (delta != null && delta <= -0.06) return 'Late Season / Senescence'
    return 'Flowering'
  }
  if (delta != null && delta <= -0.05) return 'Post-Peak / Senescence'
  return 'Peak Canopy'
}

/**
 * Coarse land-cover class from zonal NDVI/NDWI only — EXAMPLE-style short labels.
 */
export function landCoverFromSpectralIndices(input: {
  ndvi: number | null | undefined
  ndwi?: number | null | undefined
}): string {
  const ndvi = input.ndvi
  const ndwi = input.ndwi
  if (ndvi == null || !Number.isFinite(ndvi)) return NOT_AVAILABLE
  if (ndwi != null && Number.isFinite(ndwi) && ndwi >= 0.2 && ndvi < 0.35) {
    return 'Water / Wetland'
  }
  if (ndvi < 0.12) return 'Bare Soil'
  if (ndvi < 0.25) return 'Fallow / Sparse'
  if (ndvi < 0.45) return 'Cropland'
  if (ndvi < 0.65) return 'Vegetated Cropland'
  return 'Tree Crops / Dense Vegetation'
}

/**
 * Agricultural vs non-agricultural — short EXAMPLE-style labels.
 */
export function agriculturalStatusFromEvidence(input: {
  ndvi: number | null | undefined
  ndwi?: number | null | undefined
  objectType?: string | number | null
}): string {
  const typeHint = String(input.objectType ?? '')
    .trim()
    .toLowerCase()
  const looksAgriObject =
    /\b(farm|field|plot|crop|orchard|greenhouse|plantation|agro|agricultur|paddock|parcel)\b/.test(
      typeHint,
    )

  const cover = landCoverFromSpectralIndices({ ndvi: input.ndvi, ndwi: input.ndwi })
  if (cover !== NOT_AVAILABLE) {
    if (/water/i.test(cover)) {
      return looksAgriObject ? 'Agricultural' : 'Non-Agricultural'
    }
    if (/bare soil/i.test(cover)) {
      return looksAgriObject ? 'Agricultural' : 'Non-Agricultural'
    }
    if (/fallow|cropland|vegetat|tree/i.test(cover)) {
      return 'Agricultural'
    }
  }

  if (looksAgriObject) return 'Agricultural'
  if (input.ndvi == null || !Number.isFinite(input.ndvi)) return NOT_AVAILABLE
  return input.ndvi >= 0.2 ? 'Agricultural' : 'Non-Agricultural'
}

/**
 * Active vs inactive — short EXAMPLE-style labels.
 */
export function activeStatusFromTemporal(input: {
  change: import('./agriculturalObjectIntelligenceSchema').AgriObjectChangeLabel
  lateNdvi: number | null | undefined
}): string {
  const ndvi = input.lateNdvi
  if (input.change === 'Newly cultivated') return 'Active'
  if (input.change === 'Potentially abandoned') return 'Inactive'
  if (input.change === 'Improving') return 'Active'
  if (input.change === 'Declining') {
    if (ndvi != null && Number.isFinite(ndvi) && ndvi >= 0.25) return 'Active'
    return 'Inactive'
  }
  if (input.change === 'Stable') {
    if (ndvi != null && Number.isFinite(ndvi) && ndvi >= 0.2) return 'Active'
    if (ndvi != null && Number.isFinite(ndvi) && ndvi < 0.15) return 'Inactive'
    return 'Active'
  }
  if (ndvi == null || !Number.isFinite(ndvi)) return NOT_AVAILABLE
  if (ndvi >= 0.2) return 'Active'
  return 'Inactive'
}

const EST_S2 = 'Estimated from Sentinel-2'
const EST_S2_WX = 'Estimated from Sentinel-2 + Open-Meteo'

/** FAO-style crop coefficient proxy from canopy NDVI (indicative). */
export function kcFromNdvi(ndvi: number | null | undefined): number | null {
  if (ndvi == null || !Number.isFinite(ndvi)) return null
  return Number(Math.max(0.15, Math.min(1.2, 0.12 + Math.max(0, ndvi) * 1.35)).toFixed(2))
}

/** Coarse crop / cover class when the layer has no Crop_Type (short result label). */
export function cropTypeSpectralProxy(input: {
  ndvi: number | null | undefined
  ndwi?: number | null | undefined
}): string {
  const cover = landCoverFromSpectralIndices(input)
  if (cover === NOT_AVAILABLE) return NOT_AVAILABLE
  if (/water/i.test(cover)) return 'Water / wetland'
  if (/bare/i.test(cover)) return 'Uncultivated / bare soil'
  if (/fallow/i.test(cover)) return 'Fallow / sparse vegetation'
  if (/tree/i.test(cover)) return 'Tree crops / dense canopy'
  if (/vegetated/i.test(cover)) return 'Dense herbaceous cropland'
  return 'Herbaceous cropland'
}

export function cropConfidenceFromEvidence(input: {
  ndvi: number | null | undefined
  observationCount: number
  fromLayerCrop: boolean
}): number | string {
  if (input.fromLayerCrop) {
    return Math.min(95, 70 + Math.min(20, input.observationCount * 2))
  }
  if (input.ndvi == null || !Number.isFinite(input.ndvi)) return NOT_AVAILABLE
  const clarity = Math.abs(input.ndvi - 0.35) // distance from ambiguous mid
  const base = 40 + Math.min(25, clarity * 50) + Math.min(20, input.observationCount * 3)
  return Number(Math.max(35, Math.min(78, base)).toFixed(0))
}

export function irrigationPerformanceFromNdmi(ndmi: number | null | undefined): string {
  if (ndmi == null || !Number.isFinite(ndmi)) return NOT_AVAILABLE
  if (ndmi < -0.05) return 'Under-irrigated'
  if (ndmi < 0.12) return 'Adequately irrigated'
  return 'Well supplied'
}

export function soilSalinityProxyFromIndices(input: {
  ndsi?: number | null
  ssi?: number | null
  ndvi?: number | null
  ndmi?: number | null
}): string {
  if (input.ssi != null && Number.isFinite(input.ssi)) {
    if (input.ssi > 0.25) return 'Elevated'
    if (input.ssi > 0.1) return 'Moderate'
    return 'Low'
  }
  if (input.ndsi != null && Number.isFinite(input.ndsi)) {
    if (input.ndsi > 0.2) return 'Elevated'
    if (input.ndsi > 0.05) return 'Moderate'
    return 'Low'
  }
  const ndvi = input.ndvi
  const ndmi = input.ndmi
  if (ndvi == null || !Number.isFinite(ndvi)) return NOT_AVAILABLE
  if (ndvi < 0.25 && (ndmi == null || ndmi < 0.05)) return 'Possible constraint'
  if (ndvi >= 0.4) return 'Low'
  return 'Uncertain / moderate'
}

export function landCropSuitabilityFromEvidence(input: {
  ndvi: number | null | undefined
  waterStress: string
  agriculturalStatus: string
}): string {
  const ndvi = input.ndvi
  if (ndvi == null || !Number.isFinite(ndvi)) return NOT_AVAILABLE
  if (/non-agricultural/i.test(input.agriculturalStatus)) return 'Limited'
  const stressed = /high/i.test(input.waterStress)
  if (ndvi >= 0.5 && !stressed) return 'Highly suitable'
  if (ndvi >= 0.35) return 'Moderately suitable'
  if (ndvi >= 0.2) return 'Marginally suitable'
  return 'Poorly suited'
}

/** Generic biomass/yield proxy (t/ha cereal-equivalent). Not crop-calibrated. */
export function estimateYieldTHa(ndvi: number | null | undefined): number | null {
  if (ndvi == null || !Number.isFinite(ndvi)) return null
  if (ndvi < 0.15) return 0.2
  const y = 8.5 / (1 + Math.exp(-10 * (ndvi - 0.42))) - 0.4
  return Number(Math.max(0.1, Math.min(9.5, y)).toFixed(2))
}

export function estimateActualEtMm(input: {
  et0TotalMm: number | null | undefined
  ndvi: number | null | undefined
  periodDays: number
}): { etaMm: number; kc: number; et0Mm: number | null; formula: string } | null {
  const kc = kcFromNdvi(input.ndvi)
  if (kc == null) return null
  if (input.et0TotalMm != null && Number.isFinite(input.et0TotalMm) && input.et0TotalMm > 0) {
    const eta = Number((input.et0TotalMm * kc).toFixed(1))
    return {
      etaMm: eta,
      kc,
      et0Mm: input.et0TotalMm,
      formula: `ETa = ET₀ × Kc(NDVI) = ${input.et0TotalMm.toFixed(1)} × ${kc} = ${eta} mm (${EST_S2_WX})`,
    }
  }
  const days = Math.max(1, input.periodDays || 1)
  const eta = Number((Math.max(0.5, (input.ndvi ?? 0) * 5.5) * days * (kc / 0.8)).toFixed(1))
  return {
    etaMm: eta,
    kc,
    et0Mm: null,
    formula: `ETa ≈ max(0.5, NDVI×5.5) × days × (Kc/0.8) = ${eta} mm over ${days} d (${EST_S2})`,
  }
}

/** Approx planting / harvest window from NDVI trajectory (ISO dates only). */
export function estimatePhenologyDates(
  daily: Array<{ date: string; ndvi?: number | null }>,
): { planting: string; harvest: string } | null {
  const rows = daily
    .filter(d => d.date && d.ndvi != null && Number.isFinite(d.ndvi))
    .map(d => ({ date: d.date, ndvi: d.ndvi as number }))
    .sort((a, b) => a.date.localeCompare(b.date))
  if (rows.length < 2) return null

  let plantIdx = -1
  for (let i = 1; i < rows.length; i++) {
    if (rows[i - 1]!.ndvi < 0.28 && rows[i]!.ndvi >= 0.32) {
      plantIdx = i
      break
    }
  }
  if (plantIdx < 0) {
    plantIdx = rows.findIndex(r => r.ndvi >= 0.3)
  }

  let peakIdx = 0
  for (let i = 1; i < rows.length; i++) {
    if (rows[i]!.ndvi > rows[peakIdx]!.ndvi) peakIdx = i
  }
  let harvestIdx = peakIdx
  for (let i = peakIdx + 1; i < rows.length; i++) {
    if (rows[i]!.ndvi <= rows[peakIdx]!.ndvi - 0.08) {
      harvestIdx = i
      break
    }
    harvestIdx = i
  }

  const planting = plantIdx >= 0 ? rows[plantIdx]!.date : rows[0]!.date
  const harvest = rows[harvestIdx]!.date
  return { planting, harvest }
}

/** Yield curve equation documentation helper. */
export function yieldTHaFormula(ndvi: number): string {
  return `Y = clamp(8.5/(1+e^(-10*(NDVI-0.42)))-0.4, 0.1, 9.5); NDVI=${ndvi.toFixed(3)} → cereal-eq. t/ha`
}

export function kcFormula(ndvi: number): string {
  return `Kc = clamp(0.12 + NDVI×1.35, 0.15, 1.20); NDVI=${ndvi.toFixed(3)}`
}
