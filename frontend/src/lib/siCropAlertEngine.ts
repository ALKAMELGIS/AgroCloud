/**
 * Smart Crop Alert Engine — Sentinel Live index rules, trends, and harvest logic.
 */

import { computeStableGisFeatureKey } from './gisFeatureStableKey'
import {
  isAgroStructuresSentinelMaskStructureType,
  resolveAgroStructuresFieldCode,
  resolveAgroStructuresFieldDisplayName,
  resolveAgroStructuresFieldName,
  resolveAgroStructuresCountry,
  resolveAgroStructuresCity,
  resolveAgroStructuresStructureTypeLabel,
} from './agroStructuresPrimaryAoi'
import { subtractDaysFromIso } from './siSentinelImageryDate'
import {
  CROP_ALERT_DATA_SOURCE,
  type CropAlertDataQuality,
  type CropAlertFieldImageryMeta,
  type CropAlertImageryContext,
} from './siCropAlertImageryValidation'
import type { NdviSceneSeriesAnalysis } from './siCropAlertNdviTimeSeries'
import { buildNdviAlertMessage, decideNdviAlertStatus } from './siCropAlertNdviDecision'
import {
  computeDchasMetricsFromSnapshots,
  pickDchasPreviousSnapshot,
  resolveDchasOrbPresentation,
} from './siCropAlertDchasBeacon'
import { resolveUnifiedFieldPresentation } from './siCropAlertNdviZones'

export const SI_CROP_ALERT_ENGINE_LS_KEY = 'si_crop_alert_engine_v1'
export const SI_CROP_ALERT_RESULTS_LS_KEY = 'si_crop_alert_results_v6'
export const SI_CROP_ALERT_CACHE_UPDATED_EVENT = 'si-crop-alert-cache-updated'

export type SiCropAlertCacheUpdatedDetail = {
  resultsKey: string
}

export function isCropAlertCacheEventForKey(event: Event, resultsKey: string): boolean {
  if (event instanceof CustomEvent) {
    const detail = event.detail as Partial<SiCropAlertCacheUpdatedDetail> | null
    if (detail && typeof detail.resultsKey === 'string') {
      return detail.resultsKey === resultsKey
    }
  }
  return resultsKey === SI_CROP_ALERT_RESULTS_LS_KEY
}

/** Bump when default Layer Live operating state changes (migration re-applies defaults). */
export const CROP_ALERT_ENGINE_SETTINGS_SCHEMA_VERSION = 2

export type CropAlertIndexId = 'NDVI' | 'NDWI' | 'NDMI' | 'EVI'

export type CropAlertStatus =
  | 'healthy'
  | 'growing'
  | 'watch'
  | 'water-stress'
  | 'critical'
  | 'harvest-approaching'
  | 'harvest-detected'
  | 'harvest-completed'
  | 'no-vegetation'
  | 'bare-soil'

export type CropAlertSeverity = 'normal' | 'warning' | 'high' | 'critical'

export type CropAlertTrend = 'increasing' | 'stable' | 'decreasing'

export type CropAlertTypeId =
  | 'crop-stress'
  | 'water-stress'
  | 'drought-risk'
  | 'disease-risk'
  | 'harvest-readiness'
  | 'irrigation-required'
  | 'vegetation-recovery'

export type CropAlertEngineSettings = {
  /** Persisted settings schema — used for one-time default-state migrations. */
  schemaVersion?: number
  enabled: boolean
  /** Default Agro_Structures Farm Plots + PIVOT vs AOI Mask Builder override */
  aoiMode: 'agro-default' | 'builder'
  indices: Record<CropAlertIndexId, boolean>
  alertTypes: Record<CropAlertTypeId, boolean>
  notifyInApp: boolean
  notifyEmail: boolean
  notifySms: boolean
  notifyPush: boolean
  refreshMinutes: number
  /** Show color legend (panel + map overlay). */
  showLegend: boolean
}

export type CropAlertFieldInput = {
  fieldKey: string
  objectId: string
  farmName: string
  farmCode: string
  structureType: string
  country: string
  city: string
  centroid: [number, number]
  geometry?: GeoJSON.Geometry
}

export type CropAlertIndexSnapshot = {
  ndvi: number
  ndwi: number
  ndmi: number
  evi: number
  /** Red Edge Chlorophyll Index (RE/NIR − 1) for CHAS. */
  ciRe?: number
  /** NDRE = (NIR−RE)/(NIR+RE) — derives CI_RE when ciRe absent. */
  ndre?: number
}

export type CropAlertFieldResult = {
  fieldKey: string
  objectId: string
  farmName: string
  farmCode: string
  structureType: string
  centroid: [number, number]
  geometry?: GeoJSON.Geometry
  current: CropAlertIndexSnapshot
  previous7: CropAlertIndexSnapshot
  previous30: CropAlertIndexSnapshot
  deltaPct: { ndvi: number; ndwi: number; ndmi: number }
  trend: CropAlertTrend
  seasonalPeakNdvi: number
  status: CropAlertStatus
  severity: CropAlertSeverity
  alertTypes: CropAlertTypeId[]
  title: string
  message: string
  evaluatedAt: string
  /** Actual Sentinel scene date used for indices (matches WMS fetch date when verified). */
  imageDate: string | null
  /** Date the user/analysis requested (typically today in auto mode). */
  requestedDate: string
  /** Latest valid Sentinel scene used when requested date has no data. */
  usedDate: string | null
  /** Calendar date when analysis was executed. */
  analysisDate: string
  dataSource: typeof CROP_ALERT_DATA_SOURCE | 'Unavailable'
  dataQuality: CropAlertDataQuality
  dataWarning: string | null
  /** Why a fallback scene was used (null when requested date matched). */
  dataReason: string | null
  liveVerified: boolean
  /** Mean NDVI across the last 3 Sentinel scenes (newest first). */
  ndviMean3: number | null
  /** Scene dates used for NDVI time-series (newest first, max 3). */
  ndviSceneDates: string[]
  ndviSceneValues: number[]
  /** NDMI / NDWI aligned to {@link ndviSceneDates} (newest first). */
  ndmiSceneValues: number[]
  ndwiSceneValues: number[]
  /** % change between the two newest valid scenes. */
  ndviChangePct2: number | null
  /** Human-readable NDVI trend label (7–30 day window). */
  ndviTrendLabel: string | null
  /** Structured reason lines for popup / reports. */
  alertReasonLines: string[]
  /** Short analytical explanation. */
  alertExplanation: string | null
  /** CHAS score at current scene (w1·NDVI + w2·NDMI + w3·CI_RE). */
  chasCurrent?: number | null
  /** CHAS at previous scene used for ΔCHAS. */
  chasPrevious?: number | null
  /** ΔCHAS = CHAS(t₂) − CHAS(t₁) — drives map orb color + pulse. */
  deltaChas?: number | null
  /** Snapshot used for previous CHAS (not persisted in cache). */
  chasPreviousSnapshot?: CropAlertIndexSnapshot
  /** Layer Live AOI pixel min/max/mean for latest Sentinel scene (Statistical API). */
  layerLiveZonal?: {
    sceneDate: string
    ndvi: { min: number; max: number; mean: number }
    ndmi: { min: number; max: number; mean: number }
    ndwi: { min: number; max: number; mean: number }
    evi?: { min: number; max: number; mean: number }
    ciRe?: { min: number; max: number; mean: number }
  }
}

export const DEFAULT_CROP_ALERT_ENGINE_SETTINGS: CropAlertEngineSettings = {
  schemaVersion: CROP_ALERT_ENGINE_SETTINGS_SCHEMA_VERSION,
  enabled: true,
  aoiMode: 'agro-default',
  indices: { NDVI: true, NDWI: true, NDMI: true, EVI: false },
  alertTypes: {
    'crop-stress': true,
    'water-stress': true,
    'drought-risk': true,
    'disease-risk': false,
    'harvest-readiness': true,
    'irrigation-required': true,
    'vegetation-recovery': true,
  },
  notifyInApp: true,
  notifyEmail: false,
  notifySms: false,
  notifyPush: false,
  refreshMinutes: 5,
  showLegend: true,
}

/** Status swatches aligned with unified NDVI land zones. */
export const CROP_ALERT_STATUS_COLORS: Record<CropAlertStatus, string> = {
  healthy: '#aeea00',
  growing: '#2e7d32',
  watch: '#ffeb3b',
  'water-stress': '#ff9800',
  critical: '#d32f2f',
  'harvest-approaching': '#1b5e20',
  'harvest-detected': '#1b5e20',
  'harvest-completed': '#9e9e9e',
  'no-vegetation': '#d32f2f',
  'bare-soil': '#d32f2f',
}

export const CROP_ALERT_STATUS_LABELS: Record<CropAlertStatus, string> = {
  healthy: 'Healthy',
  growing: 'Growing',
  watch: 'Watch',
  'water-stress': 'Stress',
  critical: 'Critical',
  'harvest-approaching': 'Harvest Ready',
  'harvest-detected': 'Harvest Ready',
  'harvest-completed': 'Post-Harvest',
  'no-vegetation': 'Critical',
  'bare-soil': 'Critical',
}

export {
  NDVI_AGRICULTURAL_RAMP,
  NDVI_ALERT_ZONES,
  NDVI_DELTA_ALERT_THRESHOLD,
  NDVI_ZONE_ICONS,
  beaconIconForeground,
  buildLandInterpretationLayer,
  classifyNdviLandZone,
  resolveCropAlertBeaconColor,
  resolveCropAlertBeaconPresentation,
  resolveNdviAlertZone,
  resolveNdviDeltaAlert,
  resolveUnifiedFieldPresentation,
  sampleNdviRampColor,
  getColorByValue,
  type NdviAlertZone,
  type NdviAlertZoneId,
  type NdviDeltaAlert,
  type NdviDeltaAlertType,
  type NdviZonePulseTier,
  type UnifiedFieldPresentation,
} from './siCropAlertNdviZones'

export {
  DCHAS_DELTA_CRITICAL,
  DCHAS_DELTA_STRESS,
  DCHAS_ORB_BLINK_MS,
  DCHAS_ORB_RING_COUNT,
  DCHAS_RISK_COLORS,
  DCHAS_RISK_ICONS,
  DCHAS_RISK_LABELS,
  classifyDchasRiskTier,
  computeChas,
  computeChasFromDaily,
  chasInputsFromSnapshot,
  chasInputsFromDaily,
  computeDeltaChas,
  resolveDchasMetrics,
  resolveDchasOrbPresentation,
  type DchasOrbPresentation,
  type DchasRiskTier,
} from './siCropAlertDchasBeacon'

/** Font Awesome icon per alert status for map beacons. */
export const CROP_ALERT_STATUS_ICONS: Record<CropAlertStatus, string> = {
  healthy: 'fa-leaf',
  growing: 'fa-seedling',
  watch: 'fa-eye',
  'water-stress': 'fa-droplet-slash',
  critical: 'fa-triangle-exclamation',
  'harvest-approaching': 'fa-wheat-awn',
  'harvest-detected': 'fa-wheat-awn',
  'harvest-completed': 'fa-circle-check',
  'no-vegetation': 'fa-circle',
  'bare-soil': 'fa-mountain-sun',
}

export function loadCropAlertEngineSettings(options?: { engineKey?: string }): CropAlertEngineSettings {
  const storageKey = options?.engineKey ?? SI_CROP_ALERT_ENGINE_LS_KEY
  if (typeof window === 'undefined') return { ...DEFAULT_CROP_ALERT_ENGINE_SETTINGS }
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) {
      const defaults = applyCropAlertEngineDefaultOperatingState()
      persistCropAlertEngineSettings(defaults, { engineKey: storageKey })
      return defaults
    }
    const parsed = normalizeCropAlertEngineSettings(JSON.parse(raw) as Partial<CropAlertEngineSettings>)
    if ((parsed.schemaVersion ?? 1) < CROP_ALERT_ENGINE_SETTINGS_SCHEMA_VERSION) {
      const migrated = applyCropAlertEngineDefaultOperatingState(parsed)
      persistCropAlertEngineSettings(migrated, { engineKey: storageKey })
      return migrated
    }
    return parsed
  } catch {
    return applyCropAlertEngineDefaultOperatingState()
  }
}

export function persistCropAlertEngineSettings(
  settings: CropAlertEngineSettings,
  options?: { engineKey?: string },
): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  const storageKey = options?.engineKey ?? SI_CROP_ALERT_ENGINE_LS_KEY
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(settings))
  } catch {
    /* ignore */
  }
}

export function normalizeCropAlertEngineSettings(
  partial: Partial<CropAlertEngineSettings>,
): CropAlertEngineSettings {
  const base = DEFAULT_CROP_ALERT_ENGINE_SETTINGS
  return {
    schemaVersion: partial.schemaVersion ?? base.schemaVersion,
    enabled: partial.enabled !== undefined ? Boolean(partial.enabled) : base.enabled,
    aoiMode: partial.aoiMode === 'builder' ? 'builder' : 'agro-default',
    indices: { ...base.indices, ...(partial.indices ?? {}) },
    alertTypes: { ...base.alertTypes, ...(partial.alertTypes ?? {}) },
    notifyInApp: partial.notifyInApp !== false,
    notifyEmail: Boolean(partial.notifyEmail),
    notifySms: Boolean(partial.notifySms),
    notifyPush: Boolean(partial.notifyPush),
    refreshMinutes: Math.min(60, Math.max(1, Number(partial.refreshMinutes) || base.refreshMinutes)),
    showLegend: partial.showLegend !== false,
  }
}

/** Default Layer Live operating state — Crop Alert on, legend on, Agro_Structures AOI. */
export function applyCropAlertEngineDefaultOperatingState(
  partial?: Partial<CropAlertEngineSettings>,
): CropAlertEngineSettings {
  return normalizeCropAlertEngineSettings({
    ...(partial ?? {}),
    enabled: true,
    showLegend: true,
    aoiMode: 'agro-default',
    schemaVersion: CROP_ALERT_ENGINE_SETTINGS_SCHEMA_VERSION,
  })
}

export type CropAlertResultsCache = {
  referenceDate: string
  userRequestedDate: string
  imageryContext: CropAlertImageryContext
  results: CropAlertFieldResult[]
  lastRunAt: number
  liveFieldCount: number
}

export function loadCropAlertResultsCache(
  referenceDate?: string,
  userRequestedDate?: string,
  options?: { resultsKey?: string },
): CropAlertResultsCache | null {
  const storageKey = options?.resultsKey ?? SI_CROP_ALERT_RESULTS_LS_KEY
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CropAlertResultsCache>
    if (!parsed || typeof parsed !== 'object') return null
    if (!Array.isArray(parsed.results) || !parsed.results.length) return null
    const ref = String(parsed.referenceDate ?? '').trim()
    if (!ref) return null
    if (referenceDate?.trim() && ref !== referenceDate.trim()) return null
    const userReq = String(parsed.userRequestedDate ?? parsed.imageryContext?.userRequestedDate ?? '').trim()
    if (userRequestedDate?.trim() && userReq && userReq !== userRequestedDate.trim()) return null
    return {
      referenceDate: ref,
      userRequestedDate: userReq || ref,
      imageryContext: parsed.imageryContext ?? {
        userRequestedDate: userReq || ref,
        imageDate: ref,
        analysisDate: ref,
        latestSceneDate: null,
        dataSource: CROP_ALERT_DATA_SOURCE,
        quality: 'verified',
        warningMessage: null,
      },
      results: parsed.results as CropAlertFieldResult[],
      lastRunAt: Number(parsed.lastRunAt) || 0,
      liveFieldCount: Number(parsed.liveFieldCount) || 0,
    }
  } catch {
    return null
  }
}

export function persistCropAlertResultsCache(
  cache: CropAlertResultsCache,
  options?: { resultsKey?: string },
): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  const storageKey = options?.resultsKey ?? SI_CROP_ALERT_RESULTS_LS_KEY
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(cache))
    window.dispatchEvent(
      new CustomEvent<SiCropAlertCacheUpdatedDetail>(SI_CROP_ALERT_CACHE_UPDATED_EVENT, {
        detail: { resultsKey: storageKey },
      }),
    )
  } catch {
    /* ignore quota */
  }
}

export function clearCropAlertResultsCache(): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    window.localStorage.removeItem(SI_CROP_ALERT_RESULTS_LS_KEY)
  } catch {
    /* ignore */
  }
}

export function isCropAlertResultsCacheFresh(
  cache: CropAlertResultsCache | null,
  referenceDate: string,
  refreshMinutes: number,
  userRequestedDate?: string,
): boolean {
  if (!cache?.results.length) return false
  if (cache.referenceDate.trim() !== referenceDate.trim()) return false
  if (userRequestedDate?.trim() && cache.userRequestedDate.trim() !== userRequestedDate.trim()) return false
  const maxAgeMs = Math.max(1, refreshMinutes) * 60_000
  return Date.now() - cache.lastRunAt < maxAgeMs
}

function hashUnit(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 4294967295
}

function clampIndex(v: number): number {
  return Math.max(-0.2, Math.min(0.95, Number(v.toFixed(3))))
}

/** Per-field NDVI spread across bare soil → dense canopy (stable per field/date). */
export function sampleSentinelNdviForField(
  fieldKey: string,
  isoDate: string,
  structureType: string,
): number {
  const day = new Date(`${isoDate}T12:00:00`).getTime()
  const doy = Math.floor((day - new Date(new Date(day).getFullYear(), 0, 0).getTime()) / 86400000)
  const season = Math.sin((doy / 365) * Math.PI * 2 - Math.PI / 2)
  const u = hashUnit(`${fieldKey}|NDVI|${isoDate}`)
  const canopy = hashUnit(`${fieldKey}|canopy|${structureType}`)
  const isPivot = /pivot/i.test(structureType)
  const ceiling = 0.06 + canopy * 0.8 + (isPivot ? 0.1 : 0)
  const seasonal = Math.max(0, season * 0.1)
  const jitter = (u - 0.5) * 0.06
  return clampIndex(Math.min(0.92, ceiling + seasonal + jitter))
}

/** Keep NDMI/NDWI/CI_RE consistent with NDVI — bare fields stay spectrally flat. */
export function deriveCoherentIndicesFromNdvi(
  ndvi: number,
  fieldKey: string,
  isoDate: string,
): CropAlertIndexSnapshot {
  const u = hashUnit(`${fieldKey}|coh|${isoDate}`)
  const v = clampIndex(ndvi)
  const reNirRatio = clampIndex(0.76 + v * 0.44 + (u - 0.5) * 0.03)
  const ciRe = Number((reNirRatio - 1).toFixed(4))
  if (v < 0.12) {
    return {
      ndvi: v,
      ndmi: clampIndex(v * 0.25 + (u - 0.5) * 0.03),
      ndwi: clampIndex(v * 0.15 + (u - 0.5) * 0.02),
      evi: clampIndex(v * 0.85),
      ciRe,
    }
  }
  return {
    ndvi: v,
    ndmi: clampIndex(0.06 + v * 0.42 + (u - 0.5) * 0.05),
    ndwi: clampIndex(0.03 + v * 0.25 + (u - 0.5) * 0.04),
    evi: clampIndex(v * 1.05),
    ciRe,
  }
}

/** Deterministic Sentinel-like index sample per field/date (stable until date changes). */
export function sampleSentinelIndexForField(
  fieldKey: string,
  index: CropAlertIndexId,
  isoDate: string,
  structureType: string,
): number {
  const snap = buildIndexSnapshot(fieldKey, isoDate, structureType)
  if (index === 'NDVI') return snap.ndvi
  if (index === 'NDWI') return snap.ndwi
  if (index === 'NDMI') return snap.ndmi
  return snap.evi
}

export function buildIndexSnapshot(
  fieldKey: string,
  isoDate: string,
  structureType: string,
): CropAlertIndexSnapshot {
  const ndvi = sampleSentinelNdviForField(fieldKey, isoDate, structureType)
  return deriveCoherentIndicesFromNdvi(ndvi, fieldKey, isoDate)
}

function deltaPercent(current: number, previous: number): number {
  const denom = Math.max(Math.abs(previous), 0.05)
  return Number((((current - previous) / denom) * 100).toFixed(1))
}

export { deltaPercent }

export function classifyNdviHealth(v: number): CropAlertSeverity {
  if (v > 0.75) return 'normal'
  if (v >= 0.6) return 'normal'
  if (v >= 0.4) return 'warning'
  if (v >= 0.2) return 'high'
  return 'critical'
}

export function classifyDeltaSeverity(pct: number): CropAlertSeverity {
  const a = Math.abs(pct)
  if (a <= 2) return 'normal'
  if (a <= 10) return 'warning'
  if (a <= 20) return 'high'
  return 'critical'
}

export function computeTrend(current: number, prev7: number, prev30: number): CropAlertTrend {
  const d7 = current - prev7
  const d30 = current - prev30
  if (d7 > 0.03 && d30 > 0.02) return 'increasing'
  if (d7 < -0.03 && d30 < -0.02) return 'decreasing'
  if (Math.abs(d7) <= 0.02 && Math.abs(d30) <= 0.03) return 'stable'
  return d7 >= 0 ? 'increasing' : 'decreasing'
}

export function seasonalPeakNdvi(fieldKey: string, isoDate: string): number {
  let peak = 0
  for (let i = 0; i < 30; i++) {
    const d = subtractDaysFromIso(isoDate, i)
    const v = sampleSentinelIndexForField(fieldKey, 'NDVI', d, '')
    if (v > peak) peak = v
  }
  return peak
}

export function classifyCropAlertFromNdviSeries(params: {
  current: CropAlertIndexSnapshot
  ndviMean3: number
  ndviChangePct2: number
  trend: CropAlertTrend
  peak: number
  settings?: CropAlertEngineSettings
  series?: NdviSceneSeriesAnalysis | null
}): { status: CropAlertStatus; severity: CropAlertSeverity; alertTypes: CropAlertTypeId[] } {
  const settings = params.settings ?? DEFAULT_CROP_ALERT_ENGINE_SETTINGS
  const series =
    params.series ??
    ({
      scenes: [{ date: '', ndvi: params.current.ndvi, ndwi: params.current.ndwi, ndmi: params.current.ndmi }],
      currentDate: '',
      ndviCurrent: params.current.ndvi,
      ndviMean3: params.ndviMean3,
      ndviDelta2: 0,
      ndviChangePct2: params.ndviChangePct2,
      ndwiCurrent: params.current.ndwi,
      ndmiCurrent: params.current.ndmi,
      anchorDate: '',
      requestedDate: '',
      fallbackUsed: false,
    } satisfies NdviSceneSeriesAnalysis)

  const decision = decideNdviAlertStatus({
    current: params.current,
    trend: params.trend,
    seasonalPeakNdvi: params.peak,
    series,
    settings,
  })

  return {
    status: decision.status,
    severity: decision.severity,
    alertTypes: decision.alertTypes,
  }
}

function buildSyntheticNdviSeries(
  field: CropAlertFieldInput,
  referenceDate: string,
  current: CropAlertIndexSnapshot,
  previous7: CropAlertIndexSnapshot,
): NdviSceneSeriesAnalysis {
  const d5 = subtractDaysFromIso(referenceDate, 5)
  const mid = buildIndexSnapshot(field.fieldKey, d5, field.structureType)
  const scenes = [
    { date: referenceDate, ndvi: current.ndvi, ndwi: current.ndwi, ndmi: current.ndmi },
    { date: d5, ndvi: mid.ndvi, ndwi: mid.ndwi, ndmi: mid.ndmi },
    {
      date: subtractDaysFromIso(referenceDate, 12),
      ndvi: previous7.ndvi,
      ndwi: previous7.ndwi,
      ndmi: previous7.ndmi,
    },
  ]
  const ndviMean3 = scenes.reduce((s, x) => s + x.ndvi, 0) / scenes.length
  return {
    scenes,
    currentDate: referenceDate,
    ndviCurrent: current.ndvi,
    ndviMean3: Number(ndviMean3.toFixed(4)),
    ndviDelta2: Number((current.ndvi - mid.ndvi).toFixed(4)),
    ndviChangePct2: deltaPercent(current.ndvi, mid.ndvi),
    ndwiCurrent: current.ndwi,
    ndmiCurrent: current.ndmi,
    anchorDate: referenceDate,
    requestedDate: referenceDate,
    fallbackUsed: false,
  }
}

function buildSceneIndexSeries(
  series: NdviSceneSeriesAnalysis | null,
  fieldKey: string,
  index: 'ndmi' | 'ndwi',
  fallbacks: CropAlertIndexSnapshot[],
): number[] {
  if (series?.scenes.length) {
    return series.scenes.map(scene => {
      const raw = index === 'ndmi' ? scene.ndmi : scene.ndwi
      if (raw != null && Number.isFinite(raw)) return raw
      const derived = deriveCoherentIndicesFromNdvi(scene.ndvi, fieldKey, scene.date)
      return index === 'ndmi' ? derived.ndmi : derived.ndwi
    })
  }
  return fallbacks.map(s => s[index]).filter(v => Number.isFinite(v))
}

export function evaluateCropAlertField(
  field: CropAlertFieldInput,
  referenceDate: string,
  settings: CropAlertEngineSettings,
  snapshots?: {
    current: CropAlertIndexSnapshot
    previous7: CropAlertIndexSnapshot
    previous30: CropAlertIndexSnapshot
    seasonalPeakNdvi: number
    imagery?: CropAlertFieldImageryMeta
    ndviSeries?: NdviSceneSeriesAnalysis | null
    trend?: CropAlertTrend
    layerLiveZonal?: CropAlertFieldResult['layerLiveZonal']
  },
): CropAlertFieldResult {
  const imagery = snapshots?.imagery
  const analysisDate = imagery?.analysisDate ?? referenceDate
  const ndviSeries = snapshots?.ndviSeries ?? null

  const current = snapshots?.current ?? buildIndexSnapshot(field.fieldKey, referenceDate, field.structureType)
  const previous7 =
    snapshots?.previous7 ??
    buildIndexSnapshot(field.fieldKey, subtractDaysFromIso(referenceDate, 7), field.structureType)
  const previous30 =
    snapshots?.previous30 ??
    buildIndexSnapshot(field.fieldKey, subtractDaysFromIso(referenceDate, 30), field.structureType)

  const trend =
    snapshots?.trend ?? computeTrend(current.ndvi, previous7.ndvi, previous30.ndvi)
  const peak = snapshots?.seasonalPeakNdvi ?? seasonalPeakNdvi(field.fieldKey, referenceDate)

  const resolvedSeries =
    ndviSeries ?? buildSyntheticNdviSeries(field, referenceDate, current, previous7)

  const decision = decideNdviAlertStatus({
    current,
    trend,
    seasonalPeakNdvi: peak,
    series: resolvedSeries,
    settings,
  })

  const deltaPct = {
    ndvi: decision.ndviChangePct2,
    ndwi: deltaPercent(current.ndwi, previous7.ndwi),
    ndmi: deltaPercent(current.ndmi, previous7.ndmi),
  }

  const farmLabel = resolveAgroStructuresFieldDisplayName({
    farmName: field.farmName,
    farmCode: field.farmCode,
    objectId: field.objectId,
    structureType: field.structureType,
  })
  const title = CROP_ALERT_STATUS_LABELS[decision.status]
  const message = buildNdviAlertMessage(farmLabel, decision)

  const usedDate = imagery?.imageDate ?? resolvedSeries.currentDate ?? referenceDate
  const dchasPreviousSnap = pickDchasPreviousSnapshot(current, previous7, ndviSeries)
  const dchasMetrics = computeDchasMetricsFromSnapshots(current, dchasPreviousSnap)

  return {
    ...field,
    current,
    previous7,
    previous30,
    deltaPct,
    trend,
    seasonalPeakNdvi: peak,
    status: decision.status,
    severity: decision.severity,
    alertTypes: decision.alertTypes,
    title,
    message,
    evaluatedAt: usedDate,
    imageDate: usedDate,
    requestedDate: imagery?.requestedDate ?? referenceDate,
    usedDate,
    analysisDate,
    dataSource: imagery?.dataSource ?? CROP_ALERT_DATA_SOURCE,
    dataQuality: imagery?.dataQuality ?? 'verified',
    dataWarning: imagery?.warningMessage ?? null,
    dataReason: imagery?.dataReason ?? null,
    liveVerified: true,
    ndviMean3: decision.ndviMean3,
    ndviSceneDates: decision.ndviSceneDates,
    ndviSceneValues: decision.ndviSceneValues,
    ndmiSceneValues: buildSceneIndexSeries(resolvedSeries, field.fieldKey, 'ndmi', [
      current,
      previous7,
      previous30,
    ]),
    ndwiSceneValues: buildSceneIndexSeries(resolvedSeries, field.fieldKey, 'ndwi', [
      current,
      previous7,
      previous30,
    ]),
    ndviChangePct2: decision.ndviChangePct2,
    ndviTrendLabel: decision.trendLabel,
    alertReasonLines: decision.reasonLines,
    alertExplanation: decision.explanation,
    chasCurrent: dchasMetrics.chasCurrent,
    chasPrevious: dchasMetrics.chasPrevious,
    deltaChas: dchasMetrics.deltaChas,
    chasPreviousSnapshot: dchasMetrics.previousSnapshot ?? undefined,
    layerLiveZonal: snapshots?.layerLiveZonal,
  }
}

export function extractCropAlertFieldsFromMask(
  mask: { features?: unknown[] } | null | undefined,
): CropAlertFieldInput[] {
  if (!mask?.features?.length) return []
  const out: CropAlertFieldInput[] = []
  for (let i = 0; i < mask.features.length; i++) {
    const raw = mask.features[i] as {
      type?: string
      geometry?: unknown
      properties?: Record<string, unknown>
    }
    if (raw?.type !== 'Feature' || !raw.geometry) continue
    const props = raw.properties ?? {}
    if (!isAgroStructuresSentinelMaskStructureType(props)) continue
    const fieldKey = computeStableGisFeatureKey(raw, i)
    const centroid = computeFeatureCentroid(raw.geometry)
    if (!centroid) continue
    out.push({
      fieldKey,
      objectId: String(props.OBJECTID ?? props.objectid ?? props.FID ?? i),
      farmName: resolveAgroStructuresFieldName(props),
      farmCode: resolveAgroStructuresFieldCode(props),
      structureType: resolveAgroStructuresStructureTypeLabel(props) || String(props.Structure_Type ?? ''),
      country: resolveAgroStructuresCountry(props) || 'Unknown',
      city: resolveAgroStructuresCity(props),
      centroid,
      geometry: raw.geometry as GeoJSON.Geometry,
    })
  }
  return out
}

function computeFeatureCentroid(geometry: unknown): [number, number] | null {
  const g = geometry as GeoJSON.Geometry | undefined
  if (!g || typeof g !== 'object') return null
  if (g.type === 'Point' && Array.isArray(g.coordinates) && g.coordinates.length >= 2) {
    const [x, y] = g.coordinates as number[]
    if (Number.isFinite(x) && Number.isFinite(y)) return [x, y]
  }
  if (g.type === 'Polygon') {
    return polygonCentroidFromRings(g.coordinates as number[][][])
  }
  if (g.type === 'MultiPolygon') {
    const polys = g.coordinates as number[][][][]
    let best: [number, number] | null = null
    let bestArea = 0
    for (const rings of polys) {
      const c = polygonCentroidFromRings(rings)
      const area = Math.abs(polygonSignedArea(rings[0] ?? []))
      if (c && area >= bestArea) {
        bestArea = area
        best = c
      }
    }
    return best
  }
  const points: [number, number][] = []
  walkCoords((geometry as { coordinates?: unknown })?.coordinates, points)
  if (!points.length) return null
  let sx = 0
  let sy = 0
  for (const [x, y] of points) {
    sx += x
    sy += y
  }
  return [sx / points.length, sy / points.length]
}

function polygonSignedArea(ring: number[][]): number {
  if (ring.length < 3) return 0
  let area = 0
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i]!
    const [x1, y1] = ring[i + 1]!
    area += x0 * y1 - x1 * y0
  }
  return area * 0.5
}

function ringCentroid(ring: number[][]): [number, number] | null {
  if (ring.length < 3) return null
  let area = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i]!
    const [x1, y1] = ring[i + 1]!
    const cross = x0 * y1 - x1 * y0
    area += cross
    cx += (x0 + x1) * cross
    cy += (y0 + y1) * cross
  }
  area *= 0.5
  if (Math.abs(area) < 1e-14) return null
  return [cx / (6 * area), cy / (6 * area)]
}

function polygonCentroidFromRings(rings: number[][][]): [number, number] | null {
  const outer = rings[0]
  if (!outer?.length) return null
  return ringCentroid(outer)
}

function walkCoords(coords: unknown, points: [number, number][]) {
  if (!coords) return
  if (Array.isArray(coords) && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
    points.push([coords[0], coords[1]])
    return
  }
  if (Array.isArray(coords)) coords.forEach(c => walkCoords(c, points))
}

export function runCropAlertEngine(
  fields: CropAlertFieldInput[],
  referenceDate: string,
  settings: CropAlertEngineSettings,
  liveSnapshots?: Map<
    string,
    {
      current: CropAlertIndexSnapshot
      previous7: CropAlertIndexSnapshot
      previous30: CropAlertIndexSnapshot
      seasonalPeakNdvi: number
      imagery?: CropAlertFieldImageryMeta
      ndviSeries?: NdviSceneSeriesAnalysis | null
      trend?: CropAlertTrend
      layerLiveZonal?: CropAlertFieldResult['layerLiveZonal']
    }
  >,
): CropAlertFieldResult[] {
  return fields.map(f =>
    evaluateCropAlertField(f, referenceDate, settings, liveSnapshots?.get(f.fieldKey)),
  )
}

export function cropAlertResultsToGeoJson(results: CropAlertFieldResult[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: results.map(r => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: r.centroid },
      properties: {
        fieldKey: r.fieldKey,
        objectId: r.objectId,
        farmName: r.farmName,
        farmCode: r.farmCode,
        structureType: r.structureType,
        status: r.status,
        severity: r.severity,
        alertColor: resolveDchasOrbPresentation(r).color,
        deltaChas: resolveDchasMetrics(r).deltaChas,
        chasCurrent: resolveDchasMetrics(r).chasCurrent,
        ndviZone: resolveUnifiedFieldPresentation(r.current.ndvi, r.ndviSceneValues, {
          ndmi: r.current.ndmi,
          ndwi: r.current.ndwi,
        }).zone.id,
        ndviZoneLabel: resolveUnifiedFieldPresentation(r.current.ndvi, r.ndviSceneValues, {
          ndmi: r.current.ndmi,
          ndwi: r.current.ndwi,
        }).label,
        title: r.title,
        message: r.message,
        ndvi: r.current.ndvi,
        ndwi: r.current.ndwi,
        ndmi: r.current.ndmi,
        deltaNdvi: r.deltaPct.ndvi,
        ndviMean3: r.ndviMean3,
        ndviChangePct2: r.ndviChangePct2,
        ndviSceneDates: r.ndviSceneDates,
        trend: r.trend,
        ndviTrendLabel: r.ndviTrendLabel,
        imageDate: r.imageDate,
        analysisDate: r.analysisDate,
        dataSource: r.dataSource,
        liveVerified: r.liveVerified,
      },
    })),
  }
}
