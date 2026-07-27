/**
 * ISS Irrigation Alert — per-field irrigation-stress alerts, harvest rank, Excel/map export.
 *
 * Alert levels follow operational irrigation / ISS rules only
 * (irrigationDroughtAlert.ts). WDSI / WAPI raster layers are separate and not used here.
 */

import { computeStableGisFeatureKey } from './gisFeatureStableKey'
import { estimateSaviFromNdvi } from './chasIndex'
import {
  computeEtStressFromCore,
  isWapiLayerId,
} from './wapiIndex'
import {
  classifyIrrigationAlertLevel,
  decideIrrigationAlert,
  IRRIGATION_ALERT_ACTIONS,
  IRRIGATION_ALERT_BASE_RANK,
  IRRIGATION_ALERT_LEVEL_COLORS,
  IRRIGATION_ALERT_LEVEL_LABELS,
  IRRIGATION_ALERT_STATUS,
  type IrrigationAlertLevel,
} from './irrigationDroughtAlert'
import type { CropAlertFieldInput, CropAlertIndexSnapshot } from './siCropAlertEngine'

export { isWapiLayerId }

export const SI_WAPI_ALERT_ENGINE_LS_KEY = 'si_wapi_alert_engine_v1'
export const SI_WAPI_ALERT_RESULTS_LS_KEY = 'si_wapi_alert_results_v1'
export const SI_WAPI_ALERT_CACHE_UPDATED_EVENT = 'si-wapi-alert-cache-updated'

export const WAPI_ALERT_ENGINE_SETTINGS_SCHEMA_VERSION = 1

/** Default weekly scene window (days). */
export const WAPI_ALERT_DEFAULT_LOOKBACK_DAYS = 7
/** Default refresh cadence (hours) — weekly. */
export const WAPI_ALERT_DEFAULT_REFRESH_HOURS = 168
/** Minimum Sentinel fetch window so ΔISS can use a previous clear scene. */
export const WAPI_ALERT_MIN_FETCH_LOOKBACK_DAYS = 30

/** Irrigation / ISS alert tiers (operational legend). */
export type WapiAlertLevel = IrrigationAlertLevel

export type WapiHarvestStage = 'pre-peak' | 'approaching' | 'detected' | 'completed' | 'unknown'

export type WapiAlertEngineSettings = {
  schemaVersion?: number
  enabled: boolean
  /** Rolling lookback for scoring context (weekly default). */
  lookbackDays: number
  /** Auto-refresh interval in hours (weekly default). */
  refreshHours: number
  showLegend: boolean
  /** Show per-field alert icons on the map. */
  showMapIcons: boolean
}

export type WapiAlertFieldInput = {
  fieldKey: string
  fieldId: string
  fieldName: string
  centroid: [number, number]
  geometry?: GeoJSON.Geometry
}

export type WapiAlertFieldResult = {
  fieldKey: string
  fieldId: string
  fieldName: string
  /** ISS irrigation stress score — sole driver of alert level. */
  iss: number
  deltaIss: number
  ndmi: number
  ndwi: number
  ndvi: number
  etStress: number
  alertLevel: WapiAlertLevel
  waterStressStatus: string
  harvestStage: WapiHarvestStage
  priorityRank: number
  recommendedAction: string
  sceneDate: string | null
  color: string
  centroid: [number, number]
  geometry?: GeoJSON.Geometry
  evaluatedAt: string
  escalated?: boolean
  alertMessage?: string
}

/** Lower priorityRank first; ties break toward drier (lower) ISS. */
export function compareIssAlertPriority(
  a: Pick<WapiAlertFieldResult, 'priorityRank' | 'iss'>,
  b: Pick<WapiAlertFieldResult, 'priorityRank' | 'iss'>,
): number {
  return a.priorityRank - b.priorityRank || a.iss - b.iss
}

/** @deprecated Use compareIssAlertPriority */
export const compareWdsiAlertPriority = compareIssAlertPriority

export type WapiAlertLiveSnapshot = {
  current: CropAlertIndexSnapshot
  previous?: CropAlertIndexSnapshot | null
  seasonalPeakNdvi?: number
  sceneDate?: string | null
  ndviChangePct2?: number | null
}

export type WapiAlertResultsCache = {
  referenceDate: string
  aoiMaskKey: string
  results: WapiAlertFieldResult[]
  lastRunAt: number
  liveFieldCount: number
}

export const DEFAULT_WAPI_ALERT_ENGINE_SETTINGS: WapiAlertEngineSettings = {
  schemaVersion: WAPI_ALERT_ENGINE_SETTINGS_SCHEMA_VERSION,
  enabled: false,
  lookbackDays: WAPI_ALERT_DEFAULT_LOOKBACK_DAYS,
  refreshHours: WAPI_ALERT_DEFAULT_REFRESH_HOURS,
  showLegend: true,
  showMapIcons: true,
}

export const WAPI_ALERT_LEVEL_COLORS = IRRIGATION_ALERT_LEVEL_COLORS
export const WAPI_ALERT_LEVEL_LABELS = IRRIGATION_ALERT_LEVEL_LABELS

/** Font Awesome solid icon class per alert level (map + panel key). */
export const WAPI_ALERT_LEVEL_ICONS: Record<WapiAlertLevel, string> = {
  critical: 'fa-triangle-exclamation',
  severe: 'fa-circle-exclamation',
  warning: 'fa-exclamation',
  watch: 'fa-eye',
  safe: 'fa-circle-check',
  overwatering: 'fa-droplet',
}

export const WAPI_HARVEST_STAGE_LABELS: Record<WapiHarvestStage, string> = {
  'pre-peak': 'Pre-peak',
  approaching: 'Approaching',
  detected: 'Detected',
  completed: 'Completed',
  unknown: 'Unknown',
}

/** Classify using ISS irrigation rules (operational stress legend). */
export function classifyWapiAlertLevel(iss: number): WapiAlertLevel {
  return classifyIrrigationAlertLevel(iss)
}

export function wapiAlertLevelColor(level: WapiAlertLevel): string {
  return WAPI_ALERT_LEVEL_COLORS[level]
}

export function classifyWapiHarvestStage(input: {
  ndvi: number
  previousNdvi?: number | null
  seasonalPeakNdvi?: number | null
  ndviChangePct2?: number | null
}): WapiHarvestStage {
  const ndvi = Number.isFinite(input.ndvi) ? input.ndvi : 0
  const peak = Math.max(
    Number.isFinite(input.seasonalPeakNdvi ?? NaN) ? (input.seasonalPeakNdvi as number) : 0,
    ndvi,
  )
  const dropFromPeak = peak - ndvi
  const change =
    input.ndviChangePct2 != null && Number.isFinite(input.ndviChangePct2)
      ? input.ndviChangePct2
      : input.previousNdvi != null && Number.isFinite(input.previousNdvi) && input.previousNdvi > 0.05
        ? Number((((ndvi - input.previousNdvi) / input.previousNdvi) * 100).toFixed(1))
        : 0

  if (ndvi < 0.15 && dropFromPeak >= 0.2) return 'completed'
  if (peak >= 0.6 && dropFromPeak >= 0.12 && change <= -15) return 'detected'
  if (ndvi >= 0.72 && change <= 0 && change >= -8) return 'approaching'
  if (ndvi >= 0.4) return 'pre-peak'
  if (ndvi <= 0 && peak <= 0) return 'unknown'
  return ndvi < 0.25 ? 'unknown' : 'pre-peak'
}

export function resolveWapiPriorityRank(
  alertLevel: WapiAlertLevel,
  harvestStage: WapiHarvestStage,
): number {
  const base = IRRIGATION_ALERT_BASE_RANK[alertLevel] ?? 5
  if (harvestStage === 'completed') return Math.min(6, base + 1)
  return base
}

export function buildWapiRecommendedAction(
  alertLevel: WapiAlertLevel,
  harvestStage: WapiHarvestStage,
): string {
  if (harvestStage === 'completed' && alertLevel !== 'overwatering') {
    return 'Post-harvest — deprioritize irrigation'
  }
  const harvestUrgent = harvestStage === 'approaching' || harvestStage === 'detected'
  const base = IRRIGATION_ALERT_ACTIONS[alertLevel]
  if (harvestUrgent && (alertLevel === 'critical' || alertLevel === 'severe' || alertLevel === 'warning')) {
    return `${base} — before harvest window`
  }
  return base
}

export function waterStressStatusForLevel(level: WapiAlertLevel): string {
  return IRRIGATION_ALERT_STATUS[level]
}

export function resolveWapiFetchLookbackDays(lookbackDays: number): number {
  const n = Math.max(1, Math.floor(Number(lookbackDays) || WAPI_ALERT_DEFAULT_LOOKBACK_DAYS))
  return Math.max(n, WAPI_ALERT_MIN_FETCH_LOOKBACK_DAYS)
}

function isPolygonGeometry(g: GeoJSON.Geometry | null | undefined): g is GeoJSON.Polygon | GeoJSON.MultiPolygon {
  return !!g && (g.type === 'Polygon' || g.type === 'MultiPolygon')
}

function featureDisplayName(props: Record<string, unknown>, fallback: string): string {
  for (const key of [
    'name',
    'Name',
    'NAME',
    'Plot_ID',
    'PLOT_ID',
    'plot_id',
    'PlotID',
    'Object_Name',
    'OBJECT_NAME',
    'label',
    'Label',
    'farmName',
    'Farm_Name',
    'FIELD_NAME',
    'Field_Name',
  ]) {
    const v = props[key]
    if (v != null && String(v).trim()) return String(v).trim()
  }
  return fallback
}

function featureIdToken(props: Record<string, unknown>, index: number): string {
  for (const key of [
    'OBJECTID',
    'ObjectID',
    'objectid',
    'Plot_ID',
    'PLOT_ID',
    'plot_id',
    'PlotID',
    'id',
    'ID',
    'FID',
  ]) {
    const v = props[key]
    if (v != null && String(v).trim()) return String(v).trim()
  }
  return `Plot_${index + 1}`
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
  return null
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

/** Extract every polygon from the active AOI clip / layer mask (not Agro_Structures-only). */
export function extractWapiAlertFieldsFromMask(
  mask: { features?: unknown[] } | null | undefined,
): WapiAlertFieldInput[] {
  if (!mask?.features?.length) return []
  const out: WapiAlertFieldInput[] = []
  let polyIdx = 0
  for (let i = 0; i < mask.features.length; i++) {
    const raw = mask.features[i] as {
      type?: string
      geometry?: GeoJSON.Geometry
      properties?: Record<string, unknown>
    }
    if (raw?.type !== 'Feature' || !raw.geometry || !isPolygonGeometry(raw.geometry)) continue
    const centroid = computeFeatureCentroid(raw.geometry)
    if (!centroid) continue
    polyIdx += 1
    const props = raw.properties ?? {}
    const fieldKey = computeStableGisFeatureKey(raw, i)
    out.push({
      fieldKey,
      fieldId: featureIdToken(props, i),
      fieldName: featureDisplayName(props, `Plot ${polyIdx}`),
      centroid,
      geometry: raw.geometry,
    })
  }
  return out
}

export function wapiFieldToCropAlertInput(field: WapiAlertFieldInput): CropAlertFieldInput {
  return {
    fieldKey: field.fieldKey,
    objectId: field.fieldId,
    farmName: field.fieldName,
    farmCode: field.fieldId,
    structureType: 'AOI Plot',
    country: '',
    city: '',
    centroid: field.centroid,
    geometry: field.geometry,
  }
}

export function evaluateWapiAlertField(
  field: WapiAlertFieldInput,
  referenceDate: string,
  live?: WapiAlertLiveSnapshot | null,
): WapiAlertFieldResult {
  const current = live?.current
  const previous = live?.previous ?? null
  const ndvi = current?.ndvi ?? 0
  const ndmi = current?.ndmi ?? 0
  const ndwi = current?.ndwi ?? 0
  const savi = estimateSaviFromNdvi(ndvi)

  const etStress = computeEtStressFromCore({ ndmi, ndwi })
  const irrigation = decideIrrigationAlert({
    zoneName: field.fieldName,
    current: { ndvi, ndmi, ndwi, savi },
    previous: previous
      ? {
          ndvi: previous.ndvi,
          ndmi: previous.ndmi,
          ndwi: previous.ndwi,
          savi: estimateSaviFromNdvi(previous.ndvi),
        }
      : null,
  })
  const alertLevel = irrigation.alertLevel
  const harvestStage = classifyWapiHarvestStage({
    ndvi,
    previousNdvi: previous?.ndvi ?? null,
    seasonalPeakNdvi: live?.seasonalPeakNdvi ?? null,
    ndviChangePct2: live?.ndviChangePct2 ?? null,
  })
  const priorityRank = resolveWapiPriorityRank(alertLevel, harvestStage)
  const color = irrigation.color
  const sceneDate = live?.sceneDate ?? referenceDate

  return {
    fieldKey: field.fieldKey,
    fieldId: field.fieldId,
    fieldName: field.fieldName,
    iss: irrigation.iss,
    deltaIss: irrigation.deltaIss ?? 0,
    ndmi: Number(ndmi.toFixed(4)),
    ndwi: Number(ndwi.toFixed(4)),
    ndvi: Number(ndvi.toFixed(4)),
    etStress: Number(etStress.toFixed(4)),
    alertLevel,
    waterStressStatus: irrigation.status,
    harvestStage,
    priorityRank,
    recommendedAction: buildWapiRecommendedAction(alertLevel, harvestStage),
    sceneDate,
    color,
    centroid: field.centroid,
    geometry: field.geometry,
    evaluatedAt: new Date().toISOString(),
    escalated: irrigation.escalated,
    alertMessage: irrigation.message,
  }
}

export function runWapiAlertEngine(
  fields: WapiAlertFieldInput[],
  referenceDate: string,
  liveSnapshots?: Map<string, WapiAlertLiveSnapshot>,
): WapiAlertFieldResult[] {
  return fields
    .map(f => evaluateWapiAlertField(f, referenceDate, liveSnapshots?.get(f.fieldKey)))
    .sort(compareWdsiAlertPriority)
}

export function wapiAlertResultsToGeoJson(results: WapiAlertFieldResult[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: results
      .filter(r => r.geometry && isPolygonGeometry(r.geometry))
      .map(r => ({
        type: 'Feature' as const,
        geometry: r.geometry!,
        properties: {
          fieldKey: r.fieldKey,
          fieldId: r.fieldId,
          fieldName: r.fieldName,
          iss: r.iss,
          deltaIss: r.deltaIss,
          alertLevel: r.alertLevel,
          waterStressStatus: r.waterStressStatus,
          harvestStage: r.harvestStage,
          priorityRank: r.priorityRank,
          recommendedAction: r.recommendedAction,
          color: r.color,
          sceneDate: r.sceneDate,
        },
      })),
  }
}

export function summarizeWapiAlertCounts(
  results: WapiAlertFieldResult[],
): Record<WapiAlertLevel, number> {
  const counts: Record<WapiAlertLevel, number> = {
    critical: 0,
    severe: 0,
    warning: 0,
    watch: 0,
    safe: 0,
    overwatering: 0,
  }
  for (const r of results) counts[r.alertLevel] += 1
  return counts
}

export function normalizeWapiAlertEngineSettings(
  partial?: Partial<WapiAlertEngineSettings> | null,
): WapiAlertEngineSettings {
  const base = { ...DEFAULT_WAPI_ALERT_ENGINE_SETTINGS }
  if (!partial || typeof partial !== 'object') return base
  return {
    schemaVersion: WAPI_ALERT_ENGINE_SETTINGS_SCHEMA_VERSION,
    enabled: Boolean(partial.enabled),
    lookbackDays: Math.max(
      1,
      Math.min(90, Math.floor(Number(partial.lookbackDays) || WAPI_ALERT_DEFAULT_LOOKBACK_DAYS)),
    ),
    refreshHours: Math.max(
      1,
      Math.min(720, Math.floor(Number(partial.refreshHours) || WAPI_ALERT_DEFAULT_REFRESH_HOURS)),
    ),
    showLegend: partial.showLegend !== false,
    showMapIcons: partial.showMapIcons !== false,
  }
}

export function loadWapiAlertEngineSettings(options?: {
  engineKey?: string
}): WapiAlertEngineSettings {
  const storageKey = options?.engineKey ?? SI_WAPI_ALERT_ENGINE_LS_KEY
  if (typeof window === 'undefined') return { ...DEFAULT_WAPI_ALERT_ENGINE_SETTINGS }
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return { ...DEFAULT_WAPI_ALERT_ENGINE_SETTINGS }
    return normalizeWapiAlertEngineSettings(JSON.parse(raw) as Partial<WapiAlertEngineSettings>)
  } catch {
    return { ...DEFAULT_WAPI_ALERT_ENGINE_SETTINGS }
  }
}

export function persistWapiAlertEngineSettings(
  settings: WapiAlertEngineSettings,
  options?: { engineKey?: string },
): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  const storageKey = options?.engineKey ?? SI_WAPI_ALERT_ENGINE_LS_KEY
  try {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify(normalizeWapiAlertEngineSettings(settings)),
    )
  } catch {
    /* ignore */
  }
}

export function loadWapiAlertResultsCache(options?: {
  resultsKey?: string
}): WapiAlertResultsCache | null {
  const storageKey = options?.resultsKey ?? SI_WAPI_ALERT_RESULTS_LS_KEY
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<WapiAlertResultsCache>
    if (!parsed || !Array.isArray(parsed.results) || !parsed.results.length) return null
    if (!String(parsed.referenceDate ?? '').trim()) return null
    return {
      referenceDate: String(parsed.referenceDate),
      aoiMaskKey: String(parsed.aoiMaskKey ?? ''),
      results: parsed.results as WapiAlertFieldResult[],
      lastRunAt: Number(parsed.lastRunAt) || 0,
      liveFieldCount: Number(parsed.liveFieldCount) || 0,
    }
  } catch {
    return null
  }
}

export function persistWapiAlertResultsCache(
  cache: WapiAlertResultsCache,
  options?: { resultsKey?: string },
): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  const storageKey = options?.resultsKey ?? SI_WAPI_ALERT_RESULTS_LS_KEY
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(cache))
    window.dispatchEvent(
      new CustomEvent(SI_WAPI_ALERT_CACHE_UPDATED_EVENT, { detail: { resultsKey: storageKey } }),
    )
  } catch {
    /* ignore quota */
  }
}

export function clearWapiAlertResultsCache(options?: { resultsKey?: string }): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  const storageKey = options?.resultsKey ?? SI_WAPI_ALERT_RESULTS_LS_KEY
  try {
    window.localStorage.removeItem(storageKey)
    window.dispatchEvent(
      new CustomEvent(SI_WAPI_ALERT_CACHE_UPDATED_EVENT, { detail: { resultsKey: storageKey, cleared: true } }),
    )
  } catch {
    /* ignore */
  }
}

export function isWapiAlertResultsCacheFresh(
  cache: WapiAlertResultsCache | null,
  referenceDate: string,
  refreshHours: number,
  aoiMaskKey?: string,
): boolean {
  if (!cache?.results.length) return false
  if (cache.referenceDate.trim() !== referenceDate.trim()) return false
  if (aoiMaskKey != null && cache.aoiMaskKey !== aoiMaskKey) return false
  const maxAgeMs = Math.max(1, refreshHours) * 3_600_000
  return Date.now() - cache.lastRunAt < maxAgeMs
}
