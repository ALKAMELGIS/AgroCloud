import type { CropAlertFieldResult, CropAlertIndexSnapshot } from './siCropAlertEngine'
import { deriveCoherentIndicesFromNdvi } from './siCropAlertEngine'
import { resolveFarmerFieldAction } from './farmerAlertAction'
import { subtractDaysFromIso } from './siSentinelImageryDate'
import { resolveAgroStructuresFieldDisplayName } from './agroStructuresPrimaryAoi'
import {
  classifyCdsiInsightTier,
  classifyDchasRiskTier,
  CDSI_INSIGHT_COLORS,
  CDSI_INSIGHT_EMOJI,
  CDSI_INSIGHT_LABELS,
  CDSI_INSIGHT_TIERS,
  CDSI_FORMULA_POPUP,
  DCHAS_RISK_LABELS,
  chasInputsFromSnapshot,
  computeChas,
  estimateSaviFromNdvi,
  resolveDchasOrbPresentation,
  resolveSmartCropInsightNeed,
  type CdsiInsightTier,
} from './siCropAlertDchasBeacon'
import { classifyNdviLandZone } from './siCropAlertNdviZones'
import { computeSiAoiFieldMetrics } from './siAoiFields'
import type { SentinelHubDailyIndexMeans } from './sentinelHubStatisticsApi'

export type IndexTrendDirection = 'up' | 'down' | 'flat'

export type IndexMinMaxMean = {
  min: number
  max: number
  mean: number
  trend: IndexTrendDirection
}

const INDEX_TREND_EPSILON = 0.004

/** Compare newest vs previous scene (series is newest-first). */
export function resolveIndexTrendFromSeries(values: number[]): IndexTrendDirection {
  const nums = values.filter(v => Number.isFinite(v))
  if (nums.length < 2) return 'flat'
  const delta = nums[0]! - nums[1]!
  if (Math.abs(delta) < INDEX_TREND_EPSILON) return 'flat'
  return delta > 0 ? 'up' : 'down'
}

export type IndexTrendPresentation = {
  icon: string
  label: string
  title: string
  compareLine: string | null
}

/** Trend badge copy — compares latest vs previous Sentinel scene when dates are known. */
export function resolveIndexTrendPresentation(
  trend: IndexTrendDirection,
  sceneDate?: string | null,
  previousSceneDate?: string | null,
): IndexTrendPresentation {
  const base =
    trend === 'up'
      ? { icon: 'fa-arrow-trend-up', label: 'Rising', title: 'Rising vs previous scene' }
      : trend === 'down'
        ? { icon: 'fa-arrow-trend-down', label: 'Falling', title: 'Falling vs previous scene' }
        : { icon: 'fa-minus', label: 'Stable', title: 'Stable vs previous scene' }

  const latest = sceneDate?.trim().slice(0, 10) || null
  const previous = previousSceneDate?.trim().slice(0, 10) || null
  const compareLine = latest && previous ? `${previous} → ${latest}` : latest

  const title =
    latest && previous
      ? `${base.title} (${previous} → ${latest})`
      : latest
        ? `${base.title} · ${latest}`
        : base.title

  return { ...base, title, compareLine }
}

export type CropAlertPopupLandSplit = {
  label: string
  pct: number
  color: string
  areaHa: number | null
}

export type NdviFieldCoverage = {
  vegetationPct: number
  bareAreaPct: number
  fieldAreaHa: number | null
  /** Planted / vegetated area from NDVI share of field polygon. */
  vegetationHa: number | null
  /** Unplanted / bare share from NDVI analysis. */
  bareAreaHa: number | null
}

export type PopupEmbeddedIndex = {
  id: 'NDVI' | 'NDWI' | 'NDMI' | 'SAVI'
  label: string
  value: number
}

export type PopupEmbeddedChasTrend = {
  labels: string[]
  values: number[]
  direction: 'rising' | 'declining' | 'stable'
}

export type PopupEmbeddedInsight = {
  summary: string
  action: string
  alertLevel: string
  chasLabels: string[]
  chasValues: number[]
  indices: PopupEmbeddedIndex[]
  chasTrend: PopupEmbeddedChasTrend
  deltaChas: number | null
}

export type CropAlertPopupViewModel = {
  fieldName: string
  fieldId: string
  lat: number
  lng: number
  latLonLine: string
  fieldInfoLine: string
  cropStatus: {
    ndvi: IndexMinMaxMean
    ndmi: IndexMinMaxMean
    ndwi: IndexMinMaxMean
    savi: IndexMinMaxMean
    evi: IndexMinMaxMean
    lst: IndexMinMaxMean
  }
  chas: {
    current: number
    previous: number | null
    deltaLabel: string
  }
  smartCropInsight: {
    cdsi: number
    tier: CdsiInsightTier
    label: string
    emoji: string
    color: string
    need: string
    sceneDate: string
    formula: string
    tiers: Array<{ id: CdsiInsightTier; label: string; emoji: string; active: boolean }>
  }
  alert: {
    level: string
    trend: string
    action: string
  }
  coverage: NdviFieldCoverage
  /** Sentinel scene dates available for land-coverage date filter (newest first). */
  sceneDates: string[]
  chasTrend: {
    labels: string[]
    values: number[]
  }
  embeddedInsight: PopupEmbeddedInsight
  landSplit: CropAlertPopupLandSplit[]
  interpretationLines: [string, string]
  requestedDate: string
  usedDate: string
  analysisDate: string
  dataSource: string
  dataWarning: string | null
  accentColor: string
  layerLive: {
    satellite: string
    sensor: string
    gsdM: number
    sceneDate: string
  }
  landCover: {
    label: string
    color: string
    interpretation: string
  }
  aoi: {
    fieldName: string
    fieldId: string
    areaHa: number | null
    structureType: string | null
    farmCode: string | null
  }
}

function clampPct(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)))
}

export function formatPopupCoordLine(lat: number, lng: number): string {
  const latAbs = Math.abs(lat).toFixed(3)
  const lngAbs = Math.abs(lng).toFixed(3)
  const latH = lat >= 0 ? 'N' : 'S'
  const lngH = lng >= 0 ? 'E' : 'W'
  return `${latAbs}°${latH} · ${lngAbs}°${lngH}`
}

function seriesMinMaxMean(values: number[], fallback: number): IndexMinMaxMean {
  const nums = values.filter(v => Number.isFinite(v))
  if (nums.length === 0) {
    const v = Number(fallback.toFixed(3))
    return { min: v, max: v, mean: v, trend: 'flat' }
  }
  const min = Math.min(...nums)
  const max = Math.max(...nums)
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length
  const fix = (n: number) => Number(n.toFixed(3))
  return { min: fix(min), max: fix(max), mean: fix(mean), trend: resolveIndexTrendFromSeries(nums) }
}

function zonalToIndexMinMaxMean(
  zonal: { min: number; max: number; mean: number },
  trend: IndexTrendDirection,
): IndexMinMaxMean {
  return {
    min: Number(zonal.min.toFixed(3)),
    max: Number(zonal.max.toFixed(3)),
    mean: Number(zonal.mean.toFixed(3)),
    trend,
  }
}

/** Layer Live AOI pixel min/max/mean for latest scene; trend from scene time series means. */
export function resolveLayerLiveIndexMinMaxMean(
  result: CropAlertFieldResult,
): CropAlertPopupViewModel['cropStatus'] {
  const z = result.layerLiveZonal
  if (z) {
    const ndviTrend = resolveIndexTrendFromSeries(result.ndviSceneValues)
    const ndmiTrend = resolveIndexTrendFromSeries(resolveCropAlertIndexSceneValues(result, 'ndmi'))
    const ndwiTrend = resolveIndexTrendFromSeries(resolveCropAlertIndexSceneValues(result, 'ndwi'))
    const saviMin = estimateSaviFromNdvi(z.ndvi.min)
    const saviMax = estimateSaviFromNdvi(z.ndvi.max)
    const saviMean = estimateSaviFromNdvi(z.ndvi.mean)
    const eviStats = z.evi
      ? zonalToIndexMinMaxMean(z.evi, ndviTrend)
      : {
          min: Number((z.ndvi.min * 1.05).toFixed(3)),
          max: Number((z.ndvi.max * 1.05).toFixed(3)),
          mean: Number((z.ndvi.mean * 1.05).toFixed(3)),
          trend: ndviTrend,
        }
    return {
      ndvi: zonalToIndexMinMaxMean(z.ndvi, ndviTrend),
      ndmi: zonalToIndexMinMaxMean(z.ndmi, ndmiTrend),
      ndwi: zonalToIndexMinMaxMean(z.ndwi, ndwiTrend),
      savi: {
        min: Number(saviMin.toFixed(3)),
        max: Number(saviMax.toFixed(3)),
        mean: Number(saviMean.toFixed(3)),
        trend: ndviTrend,
      },
      evi: eviStats,
      lst: {
        min: Number((38 - z.ndvi.max * 12).toFixed(1)),
        max: Number((38 - z.ndvi.min * 12).toFixed(1)),
        mean: Number((38 - z.ndvi.mean * 12).toFixed(1)),
        trend: ndviTrend,
      },
    }
  }

  const saviCurrent = estimateSaviFromNdvi(result.current.ndvi)
  const saviSeries = result.ndviSceneValues.map(estimateSaviFromNdvi)
  const eviSeries = result.ndviSceneValues.map(v => v * 1.05)
  return {
    ndvi: seriesMinMaxMean(result.ndviSceneValues, result.current.ndvi),
    ndmi: seriesMinMaxMean(resolveCropAlertIndexSceneValues(result, 'ndmi'), result.current.ndmi),
    ndwi: seriesMinMaxMean(resolveCropAlertIndexSceneValues(result, 'ndwi'), result.current.ndwi),
    savi: seriesMinMaxMean(saviSeries, saviCurrent),
    evi: seriesMinMaxMean(eviSeries, result.current.evi ?? result.current.ndvi * 1.05),
    lst: estimateLstMinMaxMean(result.current.ndvi, result.ndviSceneValues),
  }
}

/** NDMI / NDWI scene arrays — fallback to current + 7d + 30d snapshots for cached results. */
export function resolveCropAlertIndexSceneValues(
  result: CropAlertFieldResult,
  index: 'ndmi' | 'ndwi',
): number[] {
  const fromSeries = index === 'ndmi' ? result.ndmiSceneValues : result.ndwiSceneValues
  if (Array.isArray(fromSeries) && fromSeries.length) {
    return fromSeries.filter(v => Number.isFinite(v))
  }
  return [result.current[index], result.previous7[index], result.previous30[index]].filter(v =>
    Number.isFinite(v),
  )
}

/** Rough LST proxy (°C) from NDVI — field-level until Sentinel LST stats are wired. */
export function estimateLstMinMaxMean(ndvi: number, sceneNdvi: number[] = []): IndexMinMaxMean {
  const estimate = (v: number) => 38 - v * 12
  const values = sceneNdvi.length ? sceneNdvi.map(estimate) : [estimate(ndvi)]
  const nums = values.map(v => Number(v.toFixed(1)))
  return {
    min: Math.min(...nums),
    max: Math.max(...nums),
    mean: Number((nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1)),
    trend: resolveIndexTrendFromSeries(nums),
  }
}

export function estimateFieldCoverage(ndvi: number): Pick<NdviFieldCoverage, 'vegetationPct' | 'bareAreaPct'> {
  const v = Number.isFinite(ndvi) ? Math.max(0, Math.min(1, ndvi)) : 0
  const vegetationPct = clampPct(v * 100)
  const bareAreaPct = clampPct(100 - vegetationPct)
  return { vegetationPct, bareAreaPct }
}

/** Field polygon area (ha) from Agro_Structures geometry when available. */
export function resolveFieldAreaHaFromGeometry(geometry: GeoJSON.Geometry | null | undefined): number | null {
  if (!geometry || typeof geometry !== 'object') return null
  if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') return null
  const { areaHa } = computeSiAoiFieldMetrics(geometry)
  if (!Number.isFinite(areaHa) || areaHa <= 0) return null
  return Number(areaHa.toFixed(2))
}

/** NDVI-based planted / bare split — hectares proportional to the same percentages as Land Coverage. */
export function estimateNdviFieldCoverage(ndvi: number, fieldAreaHa: number | null): NdviFieldCoverage {
  const { vegetationPct, bareAreaPct } = estimateFieldCoverage(ndvi)
  if (fieldAreaHa == null || !Number.isFinite(fieldAreaHa) || fieldAreaHa <= 0) {
    return {
      vegetationPct,
      bareAreaPct,
      fieldAreaHa: null,
      vegetationHa: null,
      bareAreaHa: null,
    }
  }
  const vegetationHa = Number(((fieldAreaHa * vegetationPct) / 100).toFixed(2))
  const bareAreaHa = Number((fieldAreaHa - vegetationHa).toFixed(2))
  return {
    vegetationPct,
    bareAreaPct,
    fieldAreaHa,
    vegetationHa,
    bareAreaHa,
  }
}

/** Scene dates for popup land-coverage filter (newest → oldest). */
export function listPopupSceneDates(result: CropAlertFieldResult): string[] {
  const fromSeries = (result.ndviSceneDates ?? [])
    .map(d => String(d || '').trim().slice(0, 10))
    .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
  if (fromSeries.length) return [...new Set(fromSeries)]
  const fallback = String(result.usedDate ?? result.imageDate ?? result.analysisDate ?? '')
    .trim()
    .slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(fallback) ? [fallback] : []
}

/** Merge engine scene window with extended Sentinel daily history (newest → oldest). */
export function mergePopupSceneDatesWithHistory(
  result: CropAlertFieldResult,
  dailyRows: SentinelHubDailyIndexMeans[] | undefined,
): string[] {
  const base = listPopupSceneDates(result)
  const fromHistory = (dailyRows ?? [])
    .filter(d => d.ndvi != null && Number.isFinite(d.ndvi))
    .map(d => String(d.date || '').trim().slice(0, 10))
    .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
  const merged = [...new Set([...base, ...fromHistory])]
  merged.sort((a, b) => b.localeCompare(a))
  return merged
}

/** NDVI mean for a scene date — engine series first, then extended daily history. */
export function resolveNdviForPopupSceneDate(
  result: CropAlertFieldResult,
  sceneDate: string,
  dailyRows?: SentinelHubDailyIndexMeans[],
): number {
  const want = sceneDate.trim().slice(0, 10)
  const idx = (result.ndviSceneDates ?? []).findIndex(d => String(d).trim().slice(0, 10) === want)
  if (idx >= 0 && result.ndviSceneValues[idx] != null && Number.isFinite(result.ndviSceneValues[idx])) {
    return result.ndviSceneValues[idx]!
  }
  const hist = (dailyRows ?? []).find(d => String(d.date || '').trim().slice(0, 10) === want)
  if (hist?.ndvi != null && Number.isFinite(hist.ndvi)) return hist.ndvi
  return result.current.ndvi
}

/** NDVI land split for a specific Sentinel scene date inside the field AOI. */
export function estimateNdviFieldCoverageForScene(
  result: CropAlertFieldResult,
  sceneDate: string,
  dailyRows?: SentinelHubDailyIndexMeans[],
): NdviFieldCoverage {
  const fieldAreaHa = resolveFieldAreaHaFromGeometry(result.geometry)
  const ndvi = resolveNdviForPopupSceneDate(result, sceneDate, dailyRows)
  return estimateNdviFieldCoverage(ndvi, fieldAreaHa)
}

export function formatPopupAreaHa(ha: number | null | undefined): string {
  if (ha == null || !Number.isFinite(ha)) return '—'
  if (ha >= 100) return `${(ha / 100).toFixed(2)} km²`
  return `${ha.toFixed(2)} ha`
}

export const CHAS_TREND_POINT_COUNT = 3

/** Pad CHAS trend to a fixed slot count (oldest → newest); missing slots use em-dash + NaN. */
export function ensureChasTrendPointCount(
  series: { labels: string[]; values: number[] },
  count = CHAS_TREND_POINT_COUNT,
): { labels: string[]; values: number[] } {
  const labels = series.labels.slice(-count)
  const values = series.values.slice(-count)
  while (labels.length < count) {
    labels.unshift('—')
    values.unshift(Number.NaN)
  }
  return { labels, values }
}

function formatChasTrendDateLabel(iso: string): string {
  return iso.slice(5) || '—'
}

function resolveSceneIndexSnapshot(
  result: CropAlertFieldResult,
  sceneIndex: number,
): CropAlertIndexSnapshot | null {
  const ndvi = result.ndviSceneValues[sceneIndex]
  const date = result.ndviSceneDates[sceneIndex]
  if (!Number.isFinite(ndvi) || !date) return null

  const ndmiRaw = result.ndmiSceneValues[sceneIndex]
  const ndwiRaw = result.ndwiSceneValues[sceneIndex]
  if (Number.isFinite(ndmiRaw) && Number.isFinite(ndwiRaw)) {
    const derived = deriveCoherentIndicesFromNdvi(ndvi, result.fieldKey, date)
    return {
      ndvi,
      ndmi: ndmiRaw,
      ndwi: ndwiRaw,
      evi: derived.evi,
      ciRe: derived.ciRe,
    }
  }

  const derived = deriveCoherentIndicesFromNdvi(ndvi, result.fieldKey, date)
  return {
    ndvi,
    ndmi: Number.isFinite(ndmiRaw) ? ndmiRaw! : derived.ndmi,
    ndwi: Number.isFinite(ndwiRaw) ? ndwiRaw! : derived.ndwi,
    evi: derived.evi,
    ciRe: derived.ciRe,
  }
}

function resolveChasTrendSnapshotForScene(
  result: CropAlertFieldResult,
  sceneIndex: number,
): CropAlertIndexSnapshot | null {
  const sceneDate = result.ndviSceneDates[sceneIndex]?.trim().slice(0, 10)
  if (!sceneDate) return resolveSceneIndexSnapshot(result, sceneIndex)

  const zonal = result.layerLiveZonal
  if (zonal && zonal.sceneDate === sceneDate) {
    return {
      ndvi: zonal.ndvi.mean,
      ndmi: zonal.ndmi.mean,
      ndwi: zonal.ndwi.mean,
      evi: zonal.evi?.mean ?? zonal.ndvi.mean * 1.05,
      ciRe: zonal.ciRe?.mean,
    }
  }

  return resolveSceneIndexSnapshot(result, sceneIndex)
}

/** Three-point CHAS trend from Layer Live scene means (oldest → newest, aligned to scene dates). */
export function buildChasTrendSeries(result: CropAlertFieldResult): { labels: string[]; values: number[] } {
  const currentDate = (result.usedDate ?? result.analysisDate).trim()
  const sceneCount = Math.min(
    result.ndviSceneValues.filter(v => Number.isFinite(v)).length,
    result.ndviSceneDates.length,
  )

  const trendPoints: Array<{ date: string; snapshot: CropAlertIndexSnapshot }> = []

  if (sceneCount >= CHAS_TREND_POINT_COUNT) {
    for (let i = CHAS_TREND_POINT_COUNT - 1; i >= 0; i -= 1) {
      const snapshot = resolveChasTrendSnapshotForScene(result, i)
      if (!snapshot) continue
      trendPoints.push({ date: result.ndviSceneDates[i]!, snapshot })
    }
  } else if (sceneCount === 2) {
    trendPoints.unshift({
      date: subtractDaysFromIso(result.ndviSceneDates[1] ?? currentDate, 30),
      snapshot: result.previous30,
    })
    for (const i of [1, 0]) {
      const snapshot = resolveChasTrendSnapshotForScene(result, i)
      if (!snapshot) continue
      trendPoints.push({ date: result.ndviSceneDates[i]!, snapshot })
    }
  } else {
    trendPoints.push(
      { date: subtractDaysFromIso(currentDate, 30), snapshot: result.previous30 },
      { date: subtractDaysFromIso(currentDate, 7), snapshot: result.previous7 },
      { date: currentDate, snapshot: result.current },
    )
  }

  const points = trendPoints.slice(-CHAS_TREND_POINT_COUNT)
  return ensureChasTrendPointCount({
    labels: points.map(p => formatChasTrendDateLabel(p.date)),
    values: points.map(p => computeChas(chasInputsFromSnapshot(p.snapshot))),
  })
}

/** Index snapshot for a Sentinel scene date — engine series first, then extended daily history. */
export function resolvePopupSnapshotForSceneDate(
  result: CropAlertFieldResult,
  sceneDate: string,
  dailyRows?: SentinelHubDailyIndexMeans[],
): CropAlertIndexSnapshot | null {
  const want = sceneDate.trim().slice(0, 10)
  const idx = (result.ndviSceneDates ?? []).findIndex(d => String(d).trim().slice(0, 10) === want)
  if (idx >= 0) return resolveChasTrendSnapshotForScene(result, idx)

  const hist = (dailyRows ?? []).find(d => String(d.date || '').trim().slice(0, 10) === want)
  if (hist?.ndvi != null && Number.isFinite(hist.ndvi)) {
    const derived = deriveCoherentIndicesFromNdvi(hist.ndvi, result.fieldKey, want)
    return {
      ndvi: hist.ndvi,
      ndmi: hist.ndmi ?? derived.ndmi,
      ndwi: hist.ndwi ?? derived.ndwi,
      evi: hist.evi ?? derived.evi,
      ciRe: hist.ciRe ?? derived.ciRe,
    }
  }
  return null
}

export function resolvePopupIndicesForSceneDate(
  result: CropAlertFieldResult,
  sceneDate: string,
  dailyRows?: SentinelHubDailyIndexMeans[],
): PopupEmbeddedIndex[] {
  const snapshot = resolvePopupSnapshotForSceneDate(result, sceneDate, dailyRows)
  if (snapshot) {
    return [
      { id: 'NDVI', label: 'NDVI', value: snapshot.ndvi },
      { id: 'NDWI', label: 'NDWI', value: snapshot.ndwi },
      { id: 'NDMI', label: 'NDMI', value: snapshot.ndmi },
      { id: 'SAVI', label: 'SAVI', value: estimateSaviFromNdvi(snapshot.ndvi) },
    ]
  }
  return resolveEmbeddedInsightIndices(result)
}

/** Three-point CHAS trend ending at the selected scene (oldest → newest labels). */
export function buildChasTrendSeriesForSceneDate(
  result: CropAlertFieldResult,
  anchorDate: string,
  dailyRows?: SentinelHubDailyIndexMeans[],
): { labels: string[]; values: number[] } {
  const dates = mergePopupSceneDatesWithHistory(result, dailyRows)
  const anchor = anchorDate.trim().slice(0, 10)
  const anchorIdx = dates.indexOf(anchor)
  if (anchorIdx < 0) return buildChasTrendSeries(result)

  const windowDates = dates.slice(anchorIdx, anchorIdx + CHAS_TREND_POINT_COUNT)
  const chronological = [...windowDates].reverse()
  const trendPoints: Array<{ date: string; value: number }> = []

  for (const date of chronological) {
    const snapshot = resolvePopupSnapshotForSceneDate(result, date, dailyRows)
    if (!snapshot) continue
    trendPoints.push({ date, value: computeChas(chasInputsFromSnapshot(snapshot)) })
  }

  if (trendPoints.length < 2) return buildChasTrendSeries(result)

  if (trendPoints.length < CHAS_TREND_POINT_COUNT && anchorIdx === 0) {
    const fallback = buildChasTrendSeries(result)
    if (fallback.values.length >= trendPoints.length) {
      return {
        labels: fallback.labels.slice(-CHAS_TREND_POINT_COUNT),
        values: fallback.values.slice(-CHAS_TREND_POINT_COUNT),
      }
    }
  }

  const points = trendPoints.slice(-CHAS_TREND_POINT_COUNT)
  return ensureChasTrendPointCount({
    labels: points.map(p => formatChasTrendDateLabel(p.date)),
    values: points.map(p => p.value),
  })
}

export function resolveDeltaChasForSceneDate(
  result: CropAlertFieldResult,
  sceneDate: string,
  dailyRows?: SentinelHubDailyIndexMeans[],
): number | null {
  const dates = mergePopupSceneDatesWithHistory(result, dailyRows)
  const anchor = sceneDate.trim().slice(0, 10)
  const idx = dates.indexOf(anchor)
  if (idx < 0) return null

  const currentSnap = resolvePopupSnapshotForSceneDate(result, dates[idx]!, dailyRows)
  const prevDate = dates[idx + 1]
  const prevSnap = prevDate ? resolvePopupSnapshotForSceneDate(result, prevDate, dailyRows) : null
  if (!currentSnap || !prevSnap) return null

  const current = computeChas(chasInputsFromSnapshot(currentSnap))
  const previous = computeChas(chasInputsFromSnapshot(prevSnap))
  return Number((current - previous).toFixed(4))
}

export function resolveAlertPresentationForSceneDate(
  result: CropAlertFieldResult,
  sceneDate: string,
  dailyRows?: SentinelHubDailyIndexMeans[],
): { label: string; deltaChas: number | null; chasCurrent: number | null } {
  const deltaChas = resolveDeltaChasForSceneDate(result, sceneDate, dailyRows)
  const tier = classifyDchasRiskTier(deltaChas)
  const snapshot = resolvePopupSnapshotForSceneDate(result, sceneDate, dailyRows)
  const chasCurrent = snapshot ? computeChas(chasInputsFromSnapshot(snapshot)) : null
  return { label: DCHAS_RISK_LABELS[tier], deltaChas, chasCurrent }
}

/** Embedded insight card values aligned to a user-selected Sentinel scene date. */
export function buildEmbeddedInsightForSceneDate(
  result: CropAlertFieldResult,
  sceneDate: string,
  dailyRows?: SentinelHubDailyIndexMeans[],
): PopupEmbeddedInsight {
  const chasSeries = buildChasTrendSeriesForSceneDate(result, sceneDate, dailyRows)
  const indices = resolvePopupIndicesForSceneDate(result, sceneDate, dailyRows)
  const deltaChas = resolveDeltaChasForSceneDate(result, sceneDate, dailyRows)
  const alertPresentation = resolveAlertPresentationForSceneDate(result, sceneDate, dailyRows)
  const snapshot = resolvePopupSnapshotForSceneDate(result, sceneDate, dailyRows)
  const tier = classifyDchasRiskTier(deltaChas)
  const action = resolveFarmerFieldAction(result, tier)
  const patchedResult: CropAlertFieldResult = snapshot
    ? {
        ...result,
        deltaChas: deltaChas ?? result.deltaChas ?? null,
        alertReasonLines: [
          `NDVI current = ${snapshot.ndvi.toFixed(2)}`,
          `NDWI current = ${snapshot.ndwi.toFixed(2)}`,
          `NDMI current = ${snapshot.ndmi.toFixed(2)}`,
        ],
      }
    : { ...result, deltaChas: deltaChas ?? result.deltaChas ?? null }

  const base = buildEmbeddedInsightInterpretation(
    patchedResult,
    chasSeries.labels,
    chasSeries.values,
    action,
  )

  return {
    ...base,
    action,
    alertLevel: alertPresentation.label,
    chasLabels: chasSeries.labels,
    chasValues: chasSeries.values,
    indices,
    deltaChas,
    chasTrend: {
      labels: chasSeries.labels,
      values: chasSeries.values,
      direction: resolveChasTrendDirection(chasSeries.values),
    },
  }
}

export function resolveAlertAction(result: CropAlertFieldResult, _level: string): string {
  const tier = resolveDchasOrbPresentation(result).tier
  return resolveFarmerFieldAction(result, tier)
}

const CHAS_TREND_EPSILON = 0.008

function resolveEmbeddedInsightIndices(result: CropAlertFieldResult): PopupEmbeddedIndex[] {
  const parsed = new Map<'NDVI' | 'NDWI' | 'NDMI' | 'SAVI', number>()
  for (const line of result.alertReasonLines ?? []) {
    const match = line.match(/^(NDVI|NDWI|NDMI|SAVI)\s+current\s*=\s*(-?\d+(?:\.\d+)?)/i)
    if (!match) continue
    parsed.set(match[1]!.toUpperCase() as 'NDVI' | 'NDWI' | 'NDMI' | 'SAVI', Number(match[2]))
  }
  const ndvi = parsed.get('NDVI') ?? result.current.ndvi
  return [
    { id: 'NDVI', label: 'NDVI', value: ndvi },
    { id: 'NDWI', label: 'NDWI', value: parsed.get('NDWI') ?? result.current.ndwi },
    { id: 'NDMI', label: 'NDMI', value: parsed.get('NDMI') ?? result.current.ndmi },
    { id: 'SAVI', label: 'SAVI', value: parsed.get('SAVI') ?? estimateSaviFromNdvi(ndvi) },
  ]
}

function resolveChasTrendDirection(values: number[]): PopupEmbeddedChasTrend['direction'] {
  const vals = values.filter(v => Number.isFinite(v))
  if (vals.length < 2) return 'stable'
  const delta = vals[vals.length - 1]! - vals[0]!
  if (delta > CHAS_TREND_EPSILON) return 'rising'
  if (delta < -CHAS_TREND_EPSILON) return 'declining'
  return 'stable'
}

/** Interpretive copy for embedded insight — same CHAS series as the popup charts tab. */
export function buildEmbeddedInsightInterpretation(
  result: CropAlertFieldResult,
  chasLabels: string[],
  chasValues: number[],
  action: string,
): PopupEmbeddedInsight {
  const indexLines = (result.alertReasonLines ?? []).filter(line =>
    /NDVI|NDWI|NDMI|SAVI/i.test(line),
  )
  const indicesLine = indexLines.length
    ? indexLines.join(' · ')
    : (result.alertReasonLines?.[0]?.trim() ?? '')

  const vals = chasValues.filter(v => Number.isFinite(v))
  let chasLine = ''
  if (vals.length >= 2) {
    const oldest = vals[0]!
    const latest = vals[vals.length - 1]!
    const delta = latest - oldest
    const trend =
      delta > CHAS_TREND_EPSILON ? 'rising' : delta < -CHAS_TREND_EPSILON ? 'declining' : 'stable'
    const series = vals.map(v => v.toFixed(3)).join(' → ')
    const dates = chasLabels.length === vals.length ? chasLabels.join(' → ') : null
    chasLine = dates
      ? `CHAS trend (${dates}): ${series} — ${trend}.`
      : `CHAS trend: ${series} — ${trend}.`
  } else if (vals.length === 1) {
    chasLine = `CHAS ${vals[0]!.toFixed(3)} at latest scene.`
  }

  const deltaChas = result.deltaChas
  const deltaLine =
    deltaChas != null && Number.isFinite(deltaChas)
      ? `ΔCHAS ${deltaChas >= 0 ? '+' : ''}${deltaChas.toFixed(3)} vs previous scene.`
      : ''

  const summary = [indicesLine, chasLine, deltaLine].filter(Boolean).join(' ')
  const trimmedAction = action.trim()
  const chasTrend = {
    labels: chasLabels,
    values: chasValues,
    direction: resolveChasTrendDirection(chasValues),
  }

  return {
    summary: summary || trimmedAction,
    action: trimmedAction,
    alertLevel: resolveDchasOrbPresentation(result).label,
    chasLabels,
    chasValues,
    indices: resolveEmbeddedInsightIndices(result),
    chasTrend,
    deltaChas: deltaChas != null && Number.isFinite(deltaChas) ? deltaChas : null,
  }
}

export function buildCropAlertPopupViewModel(result: CropAlertFieldResult): CropAlertPopupViewModel {
  const orb = resolveDchasOrbPresentation(result)
  const [lng, lat] = result.centroid
  const fieldName = resolveAgroStructuresFieldDisplayName({
    farmName: result.farmName,
    farmCode: result.farmCode,
    objectId: result.objectId,
    structureType: result.structureType,
  })
  const fieldId = `#${result.objectId}`
  const latLonLine = formatPopupCoordLine(lat, lng)
  const fieldInfoLine = `${latLonLine} · ${fieldName} · ${fieldId}`

  const trendLabel =
    result.ndviTrendLabel ??
    (result.trend === 'increasing'
      ? 'Increasing'
      : result.trend === 'decreasing'
        ? 'Decreasing'
        : 'Stable')

  const deltaLabel =
    orb.deltaChas != null ? `${orb.deltaChas >= 0 ? '+' : ''}${orb.deltaChas.toFixed(3)}` : '—'

  const fieldAreaHa = resolveFieldAreaHaFromGeometry(result.geometry)
  const sceneDates = listPopupSceneDates(result)
  const coverageSceneDate =
    sceneDates[0] ??
    String(result.usedDate ?? result.imageDate ?? result.analysisDate ?? '')
      .trim()
      .slice(0, 10)
  const coverage = estimateNdviFieldCoverageForScene(result, coverageSceneDate)
  const zone = classifyNdviLandZone(result.current.ndvi)

  const interpretationPrimary =
    result.alertReasonLines[0] ??
    `${orb.label} · ΔCHAS ${deltaLabel} (scene change detection)`
  const interpretationSecondary =
    result.alertReasonLines[1] ??
    result.alertExplanation ??
    zone.interpretation

  const requestedDate = result.requestedDate || result.analysisDate
  const usedDate = result.usedDate ?? result.imageDate ?? '—'
  const cdsiTier = classifyCdsiInsightTier(orb.chasCurrent)
  const smartCropInsight = {
    cdsi: orb.chasCurrent,
    tier: cdsiTier,
    label: CDSI_INSIGHT_LABELS[cdsiTier],
    emoji: CDSI_INSIGHT_EMOJI[cdsiTier],
    color: CDSI_INSIGHT_COLORS[cdsiTier],
    need: resolveSmartCropInsightNeed(cdsiTier, orb.deltaChas),
    sceneDate: usedDate,
    formula: CDSI_FORMULA_POPUP,
    tiers: CDSI_INSIGHT_TIERS.map(id => ({
      id,
      label: CDSI_INSIGHT_LABELS[id],
      emoji: CDSI_INSIGHT_EMOJI[id],
      active: id === cdsiTier,
    })),
  }

  const layerLiveSceneDate =
    result.layerLiveZonal?.sceneDate?.trim().slice(0, 10) ||
    (usedDate !== '—' ? usedDate : result.analysisDate)

  const chasTrend = buildChasTrendSeries(result)
  const alertAction = resolveAlertAction(result, orb.label)
  const embeddedInsight = buildEmbeddedInsightInterpretation(
    result,
    chasTrend.labels,
    chasTrend.values,
    alertAction,
  )

  return {
    fieldName,
    fieldId,
    lat,
    lng,
    latLonLine,
    fieldInfoLine,
    cropStatus: resolveLayerLiveIndexMinMaxMean(result),
    chas: {
      current: orb.chasCurrent,
      previous: orb.chasPrevious,
      deltaLabel,
    },
    smartCropInsight,
    alert: {
      level: orb.label,
      trend: trendLabel,
      action: alertAction,
    },
    coverage,
    sceneDates,
    chasTrend,
    embeddedInsight,
    landSplit: [
      {
        label: 'Vegetation',
        pct: coverage.vegetationPct,
        color: '#2e7d32',
        areaHa: coverage.vegetationHa,
      },
      {
        label: 'Bare Area',
        pct: coverage.bareAreaPct,
        color: '#94a3b8',
        areaHa: coverage.bareAreaHa,
      },
    ],
    interpretationLines: [interpretationPrimary, interpretationSecondary],
    requestedDate,
    usedDate,
    analysisDate: result.analysisDate,
    dataSource: result.dataSource,
    dataWarning: result.dataWarning,
    accentColor: orb.color,
    layerLive: {
      satellite: 'Sentinel-2',
      sensor: 'MSI (L2A)',
      gsdM: 10,
      sceneDate: layerLiveSceneDate,
    },
    landCover: {
      label: zone.label,
      color: zone.color,
      interpretation: zone.interpretation,
    },
    aoi: {
      fieldName,
      fieldId,
      areaHa: fieldAreaHa,
      structureType: result.structureType ?? null,
      farmCode: result.farmCode ?? null,
    },
  }
}

export function formatIndexMinMaxMean(v: IndexMinMaxMean, digits = 2): string {
  if (v.min === v.max && v.max === v.mean) {
    return v.mean.toFixed(digits)
  }
  return `${v.min.toFixed(digits)} / ${v.max.toFixed(digits)} / ${v.mean.toFixed(digits)}`
}
