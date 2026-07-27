import type { SentinelHubDailyIndexMeans } from '../../../lib/sentinelHubStatisticsApi'
import { computeChas, chasInputsFromDaily } from '../../../lib/chasIndex'
import {
  ADI_HISTORICAL_LOOKBACK_DAYS,
  computeAdiCurrentIndex,
  computeAdiZScore,
  isAdiLayerId,
} from '../../../lib/adiIndex'
import { isNcadiLayerId } from '../../../lib/ncadiIndex'
import {
  buildRemoteSensingLayerSelectGroups,
  flattenRemoteSensingLayerSelectGroups,
  isAgroDeltaCompositeLayerId,
  isAgroStaticCompositeLayerId,
  isChirpsPrecipLayerId,
  resolveAgroCompositeExpr,
  resolveAgroStaticLayerIdForDelta,
  type RemoteSensingLayerSelectGroup,
} from '../../../lib/agroCompositeIndices'
import { estimateEtMmDayFromMoisture } from '../../../lib/etIndex'
import { estimateLstCelsius } from '../../../lib/lstIndex'
import { estimateSaviFromNdvi } from '../../../lib/siCropAlertDchasBeacon'

export type ImageryChartType = 'line' | 'area' | 'bar' | 'pie' | 'scatter'

/**
 * Format Chart.js linear y-tick labels without float artifacts
 * (e.g. 0.15000000000000002 → "0.15").
 */
export function formatImageryTimeSeriesYTick(value: string | number): string {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return String(value ?? '')
  if (Object.is(n, -0)) return '0'
  const abs = Math.abs(n)
  if (abs === 0) return '0'
  if (abs >= 1000) return Math.round(n).toLocaleString('en-US')
  if (abs >= 100) return String(Math.round(n))
  if (abs >= 10) {
    const t = Math.round(n * 10) / 10
    return Number.isInteger(t) ? String(t) : t.toFixed(1)
  }
  // Index-scale values (−1…1, small deltas): trim float noise, keep up to 3 decimals.
  const rounded = Math.round(n * 1000) / 1000
  return String(Number(rounded.toFixed(3)))
}

/** Layer Live index catalog — same groups as Satellite Intelligence Remote Sensing. */
export function buildImageryTimeSeriesLayerGroups(): RemoteSensingLayerSelectGroup[] {
  return buildRemoteSensingLayerSelectGroups([])
}

export function flattenImageryTimeSeriesLayerOptions() {
  return flattenRemoteSensingLayerSelectGroups(buildImageryTimeSeriesLayerGroups())
}

const YEAR_COLORS = [
  '#14b8a6',
  '#38bdf8',
  '#a3e635',
  '#f472b6',
  '#fb923c',
  '#c084fc',
  '#facc15',
  '#60a5fa',
  '#4ade80',
]

type CoreVars = {
  ndvi: number
  ndmi: number
  ndwi: number
  savi: number
  ci_re: number
  ndsi: number
  si: number
  ssi: number
  ndre: number
  evi: number
}

function finiteOrNull(v: number | null | undefined): number | null {
  return v != null && Number.isFinite(v) ? v : null
}

function daysBetweenIso(a: string, b: string): number {
  const ta = Date.parse(`${a.slice(0, 10)}T12:00:00Z`)
  const tb = Date.parse(`${b.slice(0, 10)}T12:00:00Z`)
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return Number.POSITIVE_INFINITY
  return Math.abs(tb - ta) / 86_400_000
}

/** Build chart eval vars from daily means — NaN marks unavailable inputs. */
function coreVarsFromDaily(row: SentinelHubDailyIndexMeans): CoreVars | null {
  const ndvi = finiteOrNull(row.ndvi)
  const ndmi = finiteOrNull(row.ndmi)
  const ndwi = finiteOrNull(row.ndwi)
  const ndsi = finiteOrNull(row.ndsi)
  const si = finiteOrNull(row.si)
  const ndre = finiteOrNull(row.ndre)
  const evi = finiteOrNull(row.evi)
  const ssi = finiteOrNull(row.ssi) ?? (ndsi != null && si != null ? ndsi + si : null)
  const savi = finiteOrNull(row.savi) ?? (ndvi != null ? estimateSaviFromNdvi(ndvi) : null)
  const ci_re = finiteOrNull(row.ciRe)

  if (
    ndvi == null &&
    ndmi == null &&
    ndwi == null &&
    ndsi == null &&
    si == null &&
    ndre == null &&
    evi == null &&
    savi == null
  ) {
    return null
  }

  return {
    ndvi: ndvi ?? NaN,
    ndmi: ndmi ?? NaN,
    ndwi: ndwi ?? NaN,
    savi: savi ?? NaN,
    ci_re: ci_re ?? NaN,
    ndsi: ndsi ?? NaN,
    si: si ?? NaN,
    ssi: ssi ?? NaN,
    ndre: ndre ?? NaN,
    evi: evi ?? NaN,
  }
}

function evaluateCompositeExpr(expr: string, vars: CoreVars): number | null {
  try {
    const fn = new Function(
      'ndvi',
      'ndmi',
      'ndwi',
      'savi',
      'ci_re',
      'ndsi',
      'si',
      'ssi',
      'ndre',
      'evi',
      'Math',
      `"use strict"; return (${expr});`,
    )
    const value = fn(
      vars.ndvi,
      vars.ndmi,
      vars.ndwi,
      vars.savi,
      vars.ci_re,
      vars.ndsi,
      vars.si,
      vars.ssi,
      vars.ndre,
      vars.evi,
      Math,
    )
    return typeof value === 'number' && Number.isFinite(value) ? value : null
  } catch {
    return null
  }
}

function evaluateStaticLayerDailyValue(layerId: string, row: SentinelHubDailyIndexMeans): number | null {
  const id = layerId.trim().toUpperCase()

  // Temporal / change layers are aggregated across dates — not a single-row absolute.
  if (isAdiLayerId(id) || isNcadiLayerId(id) || isAgroDeltaCompositeLayerId(id)) return null

  // CHIRPS precipitation is not a Sentinel Hub statistic — loaded via /api/chirps in RS toolbox.
  if (id === 'PRECIP' || id === 'CHIRPS' || id === 'RAINFALL' || id === 'PRECIPITATION') return null

  // Direct band means (do not require NDVI — e.g. salinity scenes).
  if (id === 'NDSI') return finiteOrNull(row.ndsi)
  if (id === 'SI') return finiteOrNull(row.si)
  if (id === 'SSI') {
    const direct = finiteOrNull(row.ssi)
    if (direct != null) return direct
    const ndsi = finiteOrNull(row.ndsi)
    const si = finiteOrNull(row.si)
    return ndsi != null && si != null ? ndsi + si : null
  }
  if (id === 'NDRE') return finiteOrNull(row.ndre)

  const core = coreVarsFromDaily(row)

  switch (id) {
    case 'NDVI':
      return finiteOrNull(row.ndvi)
    case 'NDMI':
      return finiteOrNull(row.ndmi)
    case 'NDWI':
      return finiteOrNull(row.ndwi)
    case 'SAVI':
      return core?.savi != null && Number.isFinite(core.savi) ? core.savi : null
    case 'EVI':
      return finiteOrNull(row.evi)
    case 'ET': {
      const ndmi = finiteOrNull(row.ndmi)
      let ndwi = finiteOrNull(row.ndwi)
      if (ndmi == null) return null
      if (ndwi == null) {
        ndwi = Math.max(-0.2, Math.min(0.45, ndmi * 0.85))
      }
      if (!Number.isFinite(ndwi)) return null
      const ndvi = finiteOrNull(row.ndvi)
      return estimateEtMmDayFromMoisture(ndmi, ndwi, {
        sceneDate: row.date,
        ndvi,
      })
    }
    case 'LST': {
      // Sentinel-2 has no thermal band — same NDVI·NDMI seasonal °C proxy as Layer Live WMS.
      const ndvi = finiteOrNull(row.ndvi)
      const ndmi = finiteOrNull(row.ndmi)
      if (ndvi == null || ndmi == null) return null
      return estimateLstCelsius(ndvi, ndmi, { sceneDate: row.date })
    }
    case 'CHAS':
    case 'CHAS_ALERT': {
      const chas = computeChas(chasInputsFromDaily(row))
      return Number.isFinite(chas) ? chas : null
    }
    default:
      break
  }

  if (!core || !isAgroStaticCompositeLayerId(id)) return null
  const expr = resolveAgroCompositeExpr(id)
  if (!expr) return null
  return evaluateCompositeExpr(expr, core)
}

/** Layer Live daily value for charts (core, composite, or delta-ready static). */
export function evaluateImageryLayerDailyValue(layerId: string, row: SentinelHubDailyIndexMeans): number | null {
  const id = layerId.trim().toUpperCase()
  if (isAgroDeltaCompositeLayerId(id) || isAdiLayerId(id) || isNcadiLayerId(id)) return null
  return evaluateStaticLayerDailyValue(id, row)
}

/** True when at least one daily row can produce a finite value for the given layer. */
function layerHasDailyRowSupport(layerId: string, daily: SentinelHubDailyIndexMeans[]): boolean {
  const id = layerId.trim().toUpperCase()
  if (isAdiLayerId(id)) {
    return daily.some(row => {
      const ndvi = finiteOrNull(row.ndvi)
      const ndmi = finiteOrNull(row.ndmi)
      return ndvi != null && ndmi != null
    })
  }
  if (isNcadiLayerId(id)) {
    return daily.some(row => finiteOrNull(row.ndvi) != null && finiteOrNull(row.ndmi) != null)
  }
  const resolvedId = isAgroDeltaCompositeLayerId(id)
    ? resolveAgroStaticLayerIdForDelta(id) ?? id
    : id
  return daily.some(row => {
    const value = evaluateStaticLayerDailyValue(resolvedId, row)
    return value != null && Number.isFinite(value)
  })
}

/**
 * Whether cached daily rows already carry enough data to render EVERY requested layer.
 * Used to decide if a cached chart can be shown instantly (vs. waiting for a fresh fetch).
 */
export function imageryDailyRowsSupportLayers(
  daily: SentinelHubDailyIndexMeans[],
  layerIds: string[],
): boolean {
  if (!daily.length) return false
  const ids = layerIds.length ? layerIds : ['NDVI']
  return ids.every(id => layerHasDailyRowSupport(id, daily))
}

/**
 * Whether the requested layers require a dedicated re-fetch that the cached rows cannot satisfy.
 * Salinity (NDSI/SI/SSI) and red-edge (ADI/NDRE) need their band means present on daily rows.
 */
export function imageryDailyRowsNeedRefetchForLayers(
  daily: SentinelHubDailyIndexMeans[],
  layerIds: string[],
): boolean {
  if (!daily.length) return false
  const ids = layerIds.map(id => id.trim().toUpperCase()).filter(Boolean)
  const needsNdsi = ids.some(id => id === 'NDSI' || id === 'SSI')
  const needsSi = ids.some(id => id === 'SI' || id === 'SSI')
  const needsNdre = ids.some(
    id =>
      id === 'NDRE' ||
      id === 'CGI' ||
      id === 'CVI' ||
      id === 'CHS' ||
      id === 'CMI' ||
      id === 'HRI' ||
      id === 'CCI' ||
      id === 'EHD' ||
      id === 'DCGI' ||
      id === 'DCVI' ||
      id === 'DCHS' ||
      id === 'DCMI' ||
      id === 'DHRI',
  )
  const needsEvi = ids.some(
    id =>
      id === 'EVI' ||
      id === 'PRI' ||
      id === 'CGI' ||
      id === 'CVI' ||
      id === 'CHS' ||
      id === 'CMI' ||
      id === 'CCI' ||
      id === 'EPD' ||
      id === 'DPRI' ||
      id === 'DCGI' ||
      id === 'DCVI' ||
      id === 'DCHS' ||
      id === 'DCMI',
  )
  if (needsNdsi && !daily.some(row => row.ndsi != null && Number.isFinite(row.ndsi))) return true
  if (needsSi && !daily.some(row => row.si != null && Number.isFinite(row.si))) return true
  if (needsNdre && !daily.some(row => row.ndre != null && Number.isFinite(row.ndre))) return true
  if (needsEvi && !daily.some(row => row.evi != null && Number.isFinite(row.evi))) return true
  // ADI prefers NDRE when available; refetch once if missing so the full formula can be used.
  if (ids.some(isAdiLayerId) && !daily.some(row => row.ndre != null && Number.isFinite(row.ndre))) {
    return true
  }
  return false
}

export type NdsiZonalChartBands = {
  mean: Array<number | null>
  min: Array<number | null>
  max: Array<number | null>
}

/** Align NDSI zonal min/mean/max to chart label dates (one value per acquisition day). */
export function buildNdsiZonalChartBands(
  labels: string[],
  dailyRows: SentinelHubDailyIndexMeans[],
): NdsiZonalChartBands {
  const byDate = new Map(dailyRows.map(row => [row.date.slice(0, 10), row]))
  const mean: Array<number | null> = []
  const min: Array<number | null> = []
  const max: Array<number | null> = []
  for (const key of labels) {
    const day = key.slice(0, 10)
    const row = byDate.get(day)
    const zonal = row?.zonal?.ndsi
    const m = row ? evaluateImageryLayerDailyValue('NDSI', row) : null
    mean.push(m != null && Number.isFinite(m) ? m : null)
    min.push(zonal?.min != null && Number.isFinite(zonal.min) ? zonal.min : m)
    max.push(zonal?.max != null && Number.isFinite(zonal.max) ? zonal.max : m)
  }
  return { mean, min, max }
}

function meanFieldValueForDate(
  dailyMaps: Map<string, SentinelHubDailyIndexMeans[]>,
  fieldKeys: string[],
  date: string,
  layerId: string,
): number | null {
  const bucket: number[] = []
  for (const key of fieldKeys) {
    const row = dailyMaps.get(key)?.find(d => d.date === date)
    if (!row) continue
    const v = evaluateStaticLayerDailyValue(layerId, row)
    if (v != null && Number.isFinite(v)) bucket.push(v)
  }
  if (!bucket.length) return null
  return bucket.reduce((a, b) => a + b, 0) / bucket.length
}

function meanAdiCurrentForDate(
  dailyMaps: Map<string, SentinelHubDailyIndexMeans[]>,
  fieldKeys: string[],
  date: string,
): number | null {
  const bucket: number[] = []
  for (const key of fieldKeys) {
    const row = dailyMaps.get(key)?.find(d => d.date === date)
    if (!row) continue
    const ndvi = finiteOrNull(row.ndvi)
    const ndmi = finiteOrNull(row.ndmi)
    if (ndvi == null || ndmi == null) continue
    // Prefer measured NDRE; fall back to NDVI so ADI still charts when WMS lacks B05.
    const ndre = finiteOrNull(row.ndre) ?? ndvi
    bucket.push(computeAdiCurrentIndex(ndvi, ndmi, ndre))
  }
  if (!bucket.length) return null
  return bucket.reduce((a, b) => a + b, 0) / bucket.length
}

function meanNcadiFusionForDate(
  dailyMaps: Map<string, SentinelHubDailyIndexMeans[]>,
  fieldKeys: string[],
  date: string,
): number | null {
  const bucket: number[] = []
  for (const key of fieldKeys) {
    const row = dailyMaps.get(key)?.find(d => d.date === date)
    if (!row) continue
    const ndvi = finiteOrNull(row.ndvi)
    const ndmi = finiteOrNull(row.ndmi)
    if (ndvi == null || ndmi == null) continue
    bucket.push(0.7 * ndvi + 0.3 * ndmi)
  }
  if (!bucket.length) return null
  return bucket.reduce((a, b) => a + b, 0) / bucket.length
}

function seriesStability(vals: number[]): number {
  if (vals.length < 2) return vals.length === 1 ? 1 : 0
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length
  if (Math.abs(mean) < 1e-6) return 0
  const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length
  const std = Math.sqrt(Math.max(0, variance))
  return Math.max(0, Math.min(1, 1 - std / Math.abs(mean)))
}

/** VRI = (NDVI − MinNDVI) / (MaxNDVI − MinNDVI) over the full series. */
function aggregateVegetationRecoveryIndex(
  dailyMaps: Map<string, SentinelHubDailyIndexMeans[]>,
  fieldKeys: string[],
  labels: string[],
): { labels: string[]; values: number[] } {
  const ndvi = labels.map(date => meanFieldValueForDate(dailyMaps, fieldKeys, date, 'NDVI'))
  const finite = ndvi.filter((v): v is number => v != null && Number.isFinite(v))
  if (finite.length < 2) {
    return { labels, values: labels.map(() => NaN) }
  }
  const min = Math.min(...finite)
  const max = Math.max(...finite)
  const span = max - min
  if (span < 1e-6) {
    return { labels, values: labels.map((_, i) => (ndvi[i] != null ? 0.5 : NaN)) }
  }
  return {
    labels,
    values: ndvi.map(v => (v == null || !Number.isFinite(v) ? NaN : Number(((v - min) / span).toFixed(4)))),
  }
}

/** CCI from rolling stability of NDVI/NDRE/EVI + observation density. */
function aggregateCropCalendarConfidence(
  dailyMaps: Map<string, SentinelHubDailyIndexMeans[]>,
  fieldKeys: string[],
  labels: string[],
): { labels: string[]; values: number[] } {
  const LOOKBACK = 8
  const ndvi = labels.map(date => meanFieldValueForDate(dailyMaps, fieldKeys, date, 'NDVI'))
  const ndre = labels.map(date => meanFieldValueForDate(dailyMaps, fieldKeys, date, 'NDRE'))
  const evi = labels.map(date => meanFieldValueForDate(dailyMaps, fieldKeys, date, 'EVI'))
  const values: number[] = []
  for (let i = 0; i < labels.length; i++) {
    const from = Math.max(0, i - LOOKBACK + 1)
    const windowNdvi = ndvi.slice(from, i + 1).filter((v): v is number => v != null && Number.isFinite(v))
    const windowNdre = ndre.slice(from, i + 1).filter((v): v is number => v != null && Number.isFinite(v))
    const windowEvi = evi.slice(from, i + 1).filter((v): v is number => v != null && Number.isFinite(v))
    if (!windowNdvi.length && !windowNdre.length && !windowEvi.length) {
      values.push(NaN)
      continue
    }
    const ndviStab = seriesStability(windowNdvi)
    const ndreStab = seriesStability(windowNdre.length ? windowNdre : windowNdvi)
    const eviStab = seriesStability(windowEvi.length ? windowEvi : windowNdvi)
    const obsDensity = Math.max(0, Math.min(1, windowNdvi.length / LOOKBACK))
    const cci = 0.4 * ndviStab + 0.3 * ndreStab + 0.2 * eviStab + 0.1 * obsDensity
    values.push(Number(cci.toFixed(4)))
  }
  return { labels, values }
}

/** Step series: 0 before first planting signal, 1 from signal date onward. */
function aggregateEstimatedPlantingDate(
  dailyMaps: Map<string, SentinelHubDailyIndexMeans[]>,
  fieldKeys: string[],
  labels: string[],
): { labels: string[]; values: number[] } {
  const pri = labels.map(date => meanFieldValueForDate(dailyMaps, fieldKeys, date, 'PRI'))
  const ndvi = labels.map(date => meanFieldValueForDate(dailyMaps, fieldKeys, date, 'NDVI'))
  let triggered = false
  const values: number[] = []
  for (let i = 0; i < labels.length; i++) {
    const p = pri[i]
    const n = ndvi[i]
    const prev = i > 0 ? ndvi[i - 1] : null
    const trendUp = n != null && prev != null && n > prev
    if (!triggered && p != null && p >= 0.45 && trendUp) triggered = true
    if (p == null && n == null) {
      values.push(NaN)
      continue
    }
    values.push(triggered ? 1 : 0)
  }
  return { labels, values }
}

/** Step series: 0 before first harvest signal, 1 from signal date onward. */
function aggregateEstimatedHarvestDate(
  dailyMaps: Map<string, SentinelHubDailyIndexMeans[]>,
  fieldKeys: string[],
  labels: string[],
): { labels: string[]; values: number[] } {
  const hri = labels.map(date => meanFieldValueForDate(dailyMaps, fieldKeys, date, 'HRI'))
  const ndvi = labels.map(date => meanFieldValueForDate(dailyMaps, fieldKeys, date, 'NDVI'))
  let triggered = false
  const values: number[] = []
  for (let i = 0; i < labels.length; i++) {
    const h = hri[i]
    const n = ndvi[i]
    const prev = i > 0 ? ndvi[i - 1] : null
    const trendDown = n != null && prev != null && n < prev
    if (!triggered && h != null && h >= 0.7 && trendDown) triggered = true
    if (h == null && n == null) {
      values.push(NaN)
      continue
    }
    values.push(triggered ? 1 : 0)
  }
  return { labels, values }
}

export function aggregateImageryTimeSeries(
  dailyMaps: Map<string, SentinelHubDailyIndexMeans[]>,
  fieldKeys: string[],
  layerId: string,
): { labels: string[]; values: number[] } {
  const id = layerId.trim().toUpperCase()
  const dateSet = new Set<string>()
  for (const key of fieldKeys) {
    for (const row of dailyMaps.get(key) ?? []) dateSet.add(row.date)
  }
  const labels = [...dateSet].sort()
  const values: number[] = []

  if (isAdiLayerId(id)) {
    const currents = labels.map(date => meanAdiCurrentForDate(dailyMaps, fieldKeys, date))
    for (let i = 0; i < labels.length; i++) {
      const current = currents[i]
      if (current == null || !Number.isFinite(current)) {
        values.push(NaN)
        continue
      }
      const hist: number[] = []
      for (let j = 0; j < i; j++) {
        const v = currents[j]
        if (v == null || !Number.isFinite(v)) continue
        if (daysBetweenIso(labels[j]!, labels[i]!) > ADI_HISTORICAL_LOOKBACK_DAYS) continue
        hist.push(v)
      }
      if (hist.length < 1) {
        values.push(NaN)
        continue
      }
      const mean = hist.reduce((a, b) => a + b, 0) / hist.length
      const variance =
        hist.length >= 2 ? hist.reduce((a, b) => a + (b - mean) ** 2, 0) / hist.length : 0
      const std = Math.sqrt(Math.max(0, variance))
      const z = computeAdiZScore(current, mean, std)
      values.push(Number.isFinite(z) ? Number(z.toFixed(4)) : NaN)
    }
    return { labels, values }
  }

  if (isNcadiLayerId(id)) {
    let prev: number | null = null
    for (const date of labels) {
      const current = meanNcadiFusionForDate(dailyMaps, fieldKeys, date)
      if (current == null || !Number.isFinite(current)) {
        values.push(NaN)
        continue
      }
      values.push(prev == null ? NaN : Number((current - prev).toFixed(4)))
      prev = current
    }
    return { labels, values }
  }

  if (isAgroDeltaCompositeLayerId(id)) {
    const staticId = resolveAgroStaticLayerIdForDelta(id)
    if (!staticId) return { labels, values: labels.map(() => NaN) }
    let prev: number | null = null
    for (const date of labels) {
      const current = meanFieldValueForDate(dailyMaps, fieldKeys, date, staticId)
      if (current == null || !Number.isFinite(current)) {
        values.push(NaN)
        continue
      }
      values.push(prev == null ? NaN : Number((current - prev).toFixed(4)))
      prev = current
    }
    return { labels, values }
  }

  if (id === 'VRI') {
    return aggregateVegetationRecoveryIndex(dailyMaps, fieldKeys, labels)
  }
  if (id === 'CCI') {
    return aggregateCropCalendarConfidence(dailyMaps, fieldKeys, labels)
  }
  if (id === 'EPD') {
    return aggregateEstimatedPlantingDate(dailyMaps, fieldKeys, labels)
  }
  if (id === 'EHD') {
    return aggregateEstimatedHarvestDate(dailyMaps, fieldKeys, labels)
  }

  for (const date of labels) {
    const mean = meanFieldValueForDate(dailyMaps, fieldKeys, date, id)
    values.push(mean == null ? NaN : mean)
  }
  return { labels, values }
}

export type YearSplitSeries = { year: number; labels: string[]; values: number[] }

export function splitSeriesByYear(labels: string[], values: number[]): YearSplitSeries[] {
  const byYear = new Map<number, { labels: string[]; values: number[] }>()
  for (let i = 0; i < labels.length; i++) {
    const date = labels[i]!
    const value = values[i]
    if (value == null || !Number.isFinite(value)) continue
    const year = Number(date.slice(0, 4))
    if (!Number.isFinite(year)) continue
    const monthDay = date.slice(5)
    if (!byYear.has(year)) byYear.set(year, { labels: [], values: [] })
    const entry = byYear.get(year)!
    entry.labels.push(monthDay)
    entry.values.push(value)
  }
  return [...byYear.entries()]
    .sort(([a], [b]) => a - b)
    .map(([year, data]) => ({ year, ...data }))
}

export function yearSplitChartColors(): string[] {
  return YEAR_COLORS
}

export function imageryLayerChartColor(index: number): string {
  return YEAR_COLORS[index % YEAR_COLORS.length]!
}

export type ImageryTimeSeriesLayerSeries = {
  layerId: string
  values: Array<number | null>
  /** Optional display label (e.g. LULC class name). */
  label?: string
  /** Optional series color (e.g. LULC legend swatch). */
  color?: string
  /** When `ha`, chart values are class areas in hectares (convert to m² in UI). */
  valueUnit?: 'index' | 'ha'
}

export type ImageryTimeAggregation = 'day' | 'week' | 'month' | 'year'

export type AggregatedImageryChart = {
  /** Stable period keys (ISO date for day, YYYY-MM, YYYY-Www, YYYY). */
  labels: string[]
  /** Human-readable x-axis labels. */
  displayLabels: string[]
  series: ImageryTimeSeriesLayerSeries[]
  /** Last observation date in each period — used for map sync & interpretation. */
  periodAnchorDate: Map<string, string>
}

function isoWeekPeriodKey(isoDate: string): string {
  const date = new Date(`${isoDate.slice(0, 10)}T12:00:00Z`)
  if (Number.isNaN(date.getTime())) return isoDate.slice(0, 10)
  const day = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - day)
  const year = date.getUTCFullYear()
  const jan1 = new Date(Date.UTC(year, 0, 1))
  const week = Math.ceil(((date.getTime() - jan1.getTime()) / 86_400_000 + 1) / 7)
  return `${year}-W${String(week).padStart(2, '0')}`
}

export function imageryTimePeriodKey(isoDate: string, aggregation: ImageryTimeAggregation): string {
  const d = isoDate.trim().slice(0, 10)
  if (!d) return ''
  if (aggregation === 'day') return d
  if (aggregation === 'month') return d.slice(0, 7)
  if (aggregation === 'year') return d.slice(0, 4)
  return isoWeekPeriodKey(d)
}

export function formatImageryTimePeriodLabel(key: string, aggregation: ImageryTimeAggregation): string {
  if (aggregation === 'day') return key
  if (aggregation === 'month') return key
  if (aggregation === 'year') return key
  return key.replace('-W', ' W')
}

/**
 * Complete calendar of period keys from from→to (inclusive) for a shared multi-series x-axis.
 * Week/month/year use every bucket in range; day returns each calendar day.
 */
export function enumerateImageryTimePeriods(
  fromIso: string,
  toIso: string,
  aggregation: ImageryTimeAggregation,
): string[] {
  const from = fromIso.trim().slice(0, 10)
  const to = toIso.trim().slice(0, 10)
  if (!from || !to || from > to) return []

  if (aggregation === 'year') {
    const out: string[] = []
    for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y += 1) {
      out.push(String(y))
    }
    return out
  }

  if (aggregation === 'month') {
    const out: string[] = []
    let y = Number(from.slice(0, 4))
    let m = Number(from.slice(5, 7))
    const endY = Number(to.slice(0, 4))
    const endM = Number(to.slice(5, 7))
    while (y < endY || (y === endY && m <= endM)) {
      out.push(`${y}-${String(m).padStart(2, '0')}`)
      m += 1
      if (m > 12) {
        m = 1
        y += 1
      }
    }
    return out
  }

  if (aggregation === 'week') {
    const seen = new Set<string>()
    const out: string[] = []
    let cur = from
    while (cur <= to) {
      const key = imageryTimePeriodKey(cur, 'week')
      if (key && !seen.has(key)) {
        seen.add(key)
        out.push(key)
      }
      const next = new Date(`${cur}T12:00:00Z`)
      next.setUTCDate(next.getUTCDate() + 1)
      cur = next.toISOString().slice(0, 10)
    }
    return out
  }

  // day
  const out: string[] = []
  let cur = from
  while (cur <= to) {
    out.push(cur)
    const next = new Date(`${cur}T12:00:00Z`)
    next.setUTCDate(next.getUTCDate() + 1)
    cur = next.toISOString().slice(0, 10)
  }
  return out
}

/**
 * Shared x-axis labels for multi-plot charts.
 * Week/month/year → full calendar spine. Day → observed dates only (still shared across plots).
 */
export function buildAlignedImageryPeriodLabels(options: {
  fromDate: string
  toDate: string
  aggregation: ImageryTimeAggregation
  observedPeriodKeys?: Iterable<string>
}): string[] {
  const full = enumerateImageryTimePeriods(options.fromDate, options.toDate, options.aggregation)
  if (options.aggregation !== 'day') return full
  const observed = new Set(
    [...(options.observedPeriodKeys ?? [])].map(k => k.trim().slice(0, 10)).filter(Boolean),
  )
  if (!observed.size) return full
  return full.filter(d => observed.has(d))
}

/** Client-side re-bucketing of daily chart series into week / month / year means. */
export function aggregateImageryChartByTimePeriod(
  labels: string[],
  series: ImageryTimeSeriesLayerSeries[],
  aggregation: ImageryTimeAggregation,
): AggregatedImageryChart {
  if (!labels.length || !series.length) {
    return { labels: [], displayLabels: [], series: [], periodAnchorDate: new Map() }
  }
  if (aggregation === 'day') {
    return {
      labels: [...labels],
      displayLabels: [...labels],
      series: series.map(s => ({
        layerId: s.layerId,
        values: [...s.values],
        label: s.label,
        color: s.color,
        valueUnit: s.valueUnit,
      })),
      periodAnchorDate: new Map(labels.map(d => [d, d])),
    }
  }

  type Bucket = { dates: string[]; layerValues: Map<string, number[]> }
  const buckets = new Map<string, Bucket>()
  const order: string[] = []

  for (let i = 0; i < labels.length; i += 1) {
    const date = labels[i]!
    const key = imageryTimePeriodKey(date, aggregation)
    if (!key) continue
    if (!buckets.has(key)) {
      buckets.set(key, { dates: [], layerValues: new Map() })
      order.push(key)
    }
    const bucket = buckets.get(key)!
    bucket.dates.push(date)
    for (const entry of series) {
      const value = entry.values[i]
      if (value == null || !Number.isFinite(value)) continue
      const arr = bucket.layerValues.get(entry.layerId) ?? []
      arr.push(value)
      bucket.layerValues.set(entry.layerId, arr)
    }
  }

  order.sort((a, b) => {
    const da = buckets.get(a)!.dates.sort()[0] ?? a
    const db = buckets.get(b)!.dates.sort()[0] ?? b
    return da.localeCompare(db)
  })

  const periodAnchorDate = new Map<string, string>()
  for (const key of order) {
    const dates = [...buckets.get(key)!.dates].sort()
    periodAnchorDate.set(key, dates[dates.length - 1] ?? key)
  }

  const aggSeries = series.map(entry => ({
    layerId: entry.layerId,
    label: entry.label,
    color: entry.color,
    valueUnit: entry.valueUnit,
    values: order.map(key => {
      const vals = buckets.get(key)!.layerValues.get(entry.layerId) ?? []
      // Rainfall is additive (mm) — sum within week/month/year; indices stay as means.
      if (isChirpsPrecipLayerId(entry.layerId)) {
        if (!vals.length) return NaN
        return vals.reduce((a, b) => a + b, 0)
      }
      return meanOf(vals) ?? NaN
    }),
  }))

  return {
    labels: order,
    displayLabels: order.map(k => formatImageryTimePeriodLabel(k, aggregation)),
    series: aggSeries,
    periodAnchorDate,
  }
}

/** Multi-layer timeline — shared sorted date axis; each layer uses its own aggregator (static / Δ / ADI / NCADI). */
export function aggregateImageryTimeSeriesMulti(
  dailyMaps: Map<string, SentinelHubDailyIndexMeans[]>,
  fieldKeys: string[],
  layerIds: string[],
): { labels: string[]; series: ImageryTimeSeriesLayerSeries[] } {
  const ids = [...new Set(layerIds.map(id => id.trim().toUpperCase()).filter(Boolean))]
  if (!ids.length) return { labels: [], series: [] }

  const perLayer = ids.map(layerId => ({
    layerId,
    ...aggregateImageryTimeSeries(dailyMaps, fieldKeys, layerId),
  }))

  const dateSet = new Set<string>()
  for (const entry of perLayer) {
    for (const date of entry.labels) dateSet.add(date)
  }
  const labels = [...dateSet].sort()

  const series = perLayer.map(entry => {
    const byDate = new Map(entry.labels.map((date, index) => [date, entry.values[index]!]))
    return {
      layerId: entry.layerId,
      values: labels.map(date => {
        const value = byDate.get(date)
        return value != null && Number.isFinite(value) ? value : NaN
      }),
    }
  })

  return { labels, series }
}

/** Keep only dates where at least one layer has a finite zonal mean. */
export function pruneImageryTimeSeriesToObservations(
  labels: string[],
  series: ImageryTimeSeriesLayerSeries[],
): { labels: string[]; series: ImageryTimeSeriesLayerSeries[] } {
  if (!labels.length || !series.length) return { labels: [], series: [] }
  const keepIndexes: number[] = []
  for (let i = 0; i < labels.length; i++) {
    const hasValue = series.some(s => {
      const v = s.values[i]
      return v != null && Number.isFinite(v)
    })
    if (hasValue) keepIndexes.push(i)
  }
  if (!keepIndexes.length) {
    return {
      labels: [],
      series: series.map(s => ({
        layerId: s.layerId,
        values: [],
        label: s.label,
        color: s.color,
        valueUnit: s.valueUnit,
      })),
    }
  }
  return {
    labels: keepIndexes.map(i => labels[i]!),
    series: series.map(s => ({
      layerId: s.layerId,
      values: keepIndexes.map(i => s.values[i]!),
      label: s.label,
      color: s.color,
      valueUnit: s.valueUnit,
    })),
  }
}

export function pruneSingleLayerImagerySeries(
  labels: string[],
  values: number[],
): { labels: string[]; values: number[] } {
  const pruned = pruneImageryTimeSeriesToObservations(labels, [{ layerId: 'L', values }])
  return { labels: pruned.labels, values: pruned.series[0]?.values ?? [] }
}

/** Clip chart series to the toolbar Start/End date window (inclusive, ISO yyyy-mm-dd). */
export function filterImageryTimeSeriesByDateRange(
  labels: string[],
  series: ImageryTimeSeriesLayerSeries[],
  fromIso: string,
  toIso: string,
): { labels: string[]; series: ImageryTimeSeriesLayerSeries[] } {
  if (!labels.length || !series.length) return { labels: [], series: [] }
  const from = fromIso.trim().slice(0, 10)
  const to = toIso.trim().slice(0, 10)
  if (!from || !to || from > to) {
    return {
      labels: [],
      series: series.map(s => ({
        layerId: s.layerId,
        values: [],
        label: s.label,
        color: s.color,
        valueUnit: s.valueUnit,
      })),
    }
  }

  const keepIndexes: number[] = []
  for (let i = 0; i < labels.length; i++) {
    const day = String(labels[i] ?? '').slice(0, 10)
    if (day >= from && day <= to) keepIndexes.push(i)
  }
  if (!keepIndexes.length) {
    return {
      labels: [],
      series: series.map(s => ({
        layerId: s.layerId,
        values: [],
        label: s.label,
        color: s.color,
        valueUnit: s.valueUnit,
      })),
    }
  }
  return {
    labels: keepIndexes.map(i => labels[i]!),
    series: series.map(s => ({
      layerId: s.layerId,
      values: keepIndexes.map(i => s.values[i] ?? null),
      label: s.label,
      color: s.color,
      valueUnit: s.valueUnit,
    })),
  }
}

export function defaultImageryDateRange(referenceIso: string, lookbackDays = 90): { from: string; to: string } {
  const to = referenceIso.slice(0, 10)
  const end = new Date(`${to}T12:00:00Z`)
  end.setUTCDate(end.getUTCDate() - lookbackDays)
  const from = end.toISOString().slice(0, 10)
  return { from, to }
}

function finiteValues(values: Array<number | null | undefined>): number[] {
  return values.filter((v): v is number => v != null && Number.isFinite(v))
}

function meanOf(values: Array<number | null | undefined>): number | null {
  const finite = finiteValues(values)
  if (!finite.length) return null
  return finite.reduce((sum, v) => sum + v, 0) / finite.length
}

/** Monthly mean buckets for a single layer — keeps pie slices readable. */
export function bucketImagerySeriesByMonth(
  labels: string[],
  values: number[],
): { labels: string[]; values: number[] } {
  const buckets = new Map<string, number[]>()
  for (let i = 0; i < labels.length; i++) {
    const value = values[i]
    if (value == null || !Number.isFinite(value)) continue
    const month = String(labels[i] ?? '').slice(0, 7)
    if (!month) continue
    const bucket = buckets.get(month) ?? []
    bucket.push(value)
    buckets.set(month, bucket)
  }
  const sorted = [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  return {
    labels: sorted.map(([month]) => month),
    values: sorted.map(([, bucket]) => meanOf(bucket) ?? 0),
  }
}

/** Pie — multi-layer: mean share per layer; single layer: monthly means. */
export function buildImageryPieChartSlices(
  labels: string[],
  series: ImageryTimeSeriesLayerSeries[],
): { labels: string[]; values: number[] } {
  if (!series.length) return { labels: [], values: [] }
  if (series.length === 1) {
    return bucketImagerySeriesByMonth(labels, series[0]!.values)
  }
  return {
    labels: series.map(entry => entry.label || entry.layerId),
    values: series.map(entry => meanOf(entry.values) ?? 0),
  }
}

export type ImageryScatterPoint = { x: number; y: number }

/** Scatter — x = epoch ms from scene date, y = index value per layer. */
export function buildImageryScatterPoints(
  labels: string[],
  values: number[],
): ImageryScatterPoint[] {
  const points: ImageryScatterPoint[] = []
  for (let i = 0; i < labels.length; i++) {
    const y = values[i]
    if (y == null || !Number.isFinite(y)) continue
    const parsed = Date.parse(`${labels[i]}T12:00:00Z`)
    if (!Number.isFinite(parsed)) continue
    points.push({ x: parsed, y })
  }
  return points
}

export type ImageryCorrelationPoint = { x: number; y: number; date: string }

export type LinearRegressionResult = {
  slope: number
  intercept: number
  r: number
  r2: number
  n: number
}

export type ScatterRelationshipStrength = 'strong' | 'moderate' | 'weak' | 'none'
export type ScatterRelationshipDirection = 'positive' | 'negative' | 'none'

export type ScatterRelationshipPresentation = {
  strength: ScatterRelationshipStrength
  direction: ScatterRelationshipDirection
  label: string
}

export type ImageryCorrelationScatterAnalysis = {
  xLayerId: string
  yLayerId: string
  points: ImageryCorrelationPoint[]
  regression: LinearRegressionResult
  relationship: ScatterRelationshipPresentation
  gisInsight: string
  agroInsight: string
  regressionLine: ImageryScatterPoint[]
}

const SCATTER_RELATION_EPSILON = 0.015

/** Pair observations by scene date for X vs Y correlation scatter. */
export function buildImageryCorrelationPairs(
  labels: string[],
  xValues: number[],
  yValues: number[],
): ImageryCorrelationPoint[] {
  const points: ImageryCorrelationPoint[] = []
  for (let i = 0; i < labels.length; i++) {
    const x = xValues[i]
    const y = yValues[i]
    if (x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y)) continue
    points.push({ x, y, date: labels[i]! })
  }
  return points
}

/** Ordinary least-squares regression with Pearson r and R². */
export function computeLinearRegression(
  points: Array<{ x: number; y: number }>,
): LinearRegressionResult | null {
  const finite = points.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y))
  if (finite.length < 2) return null

  const n = finite.length
  const sumX = finite.reduce((sum, p) => sum + p.x, 0)
  const sumY = finite.reduce((sum, p) => sum + p.y, 0)
  const sumXY = finite.reduce((sum, p) => sum + p.x * p.y, 0)
  const sumX2 = finite.reduce((sum, p) => sum + p.x * p.x, 0)
  const sumY2 = finite.reduce((sum, p) => sum + p.y * p.y, 0)

  const denom = n * sumX2 - sumX * sumX
  if (Math.abs(denom) < 1e-12) return null

  const slope = (n * sumXY - sumX * sumY) / denom
  const intercept = (sumY - slope * sumX) / n

  const ssTot = sumY2 - (sumY * sumY) / n
  const ssRes = finite.reduce((sum, p) => {
    const predicted = slope * p.x + intercept
    return sum + (p.y - predicted) ** 2
  }, 0)
  const r2 = ssTot > 1e-12 ? Math.max(0, Math.min(1, 1 - ssRes / ssTot)) : 0
  const r = slope >= 0 ? Math.sqrt(r2) : -Math.sqrt(r2)

  return { slope, intercept, r, r2, n }
}

export function buildRegressionLinePoints(
  regression: LinearRegressionResult,
  points: Array<{ x: number; y: number }>,
): ImageryScatterPoint[] {
  if (!points.length) return []
  const xs = points.map(p => p.x)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const span = maxX - minX
  const pad = span > 0 ? span * 0.06 : Math.max(Math.abs(minX) * 0.05, 0.02)
  const x1 = minX - pad
  const x2 = maxX + pad
  return [
    { x: x1, y: regression.slope * x1 + regression.intercept },
    { x: x2, y: regression.slope * x2 + regression.intercept },
  ]
}

export function classifyScatterRelationship(regression: LinearRegressionResult): ScatterRelationshipPresentation {
  const absR = Math.abs(regression.r)
  if (absR < 0.15) {
    return { strength: 'none', direction: 'none', label: 'No clear relationship' }
  }

  const strength: ScatterRelationshipStrength =
    absR >= 0.7 ? 'strong' : absR >= 0.4 ? 'moderate' : 'weak'
  const direction: ScatterRelationshipDirection =
    regression.r >= SCATTER_RELATION_EPSILON
      ? 'positive'
      : regression.r <= -SCATTER_RELATION_EPSILON
        ? 'negative'
        : 'none'

  const strengthLabel =
    strength === 'strong' ? 'Strong' : strength === 'moderate' ? 'Moderate' : 'Weak'
  const directionLabel =
    direction === 'positive'
      ? 'Positive'
      : direction === 'negative'
        ? 'Negative'
        : 'Neutral'

  return {
    strength,
    direction,
    label: `${strengthLabel} ${directionLabel} Relationship`,
  }
}

function layerPairKey(a: string, b: string): string {
  return `${a.trim().toUpperCase()}|${b.trim().toUpperCase()}`
}

function buildLayerPairAgroInsight(
  xLayerId: string,
  yLayerId: string,
  relationship: ScatterRelationshipPresentation,
  regression: LinearRegressionResult,
): string {
  const key = layerPairKey(xLayerId, yLayerId)
  const reverseKey = layerPairKey(yLayerId, xLayerId)
  const pct = Math.round(regression.r2 * 100)
  const { strength, direction } = relationship

  const templates: Record<string, Partial<Record<ScatterRelationshipDirection, string>>> = {
    'NDVI|NDMI': {
      positive:
        strength === 'strong'
          ? 'Canopy vigor and canopy moisture index move together — uniform crop health with limited decoupled water stress across the field.'
          : 'Vegetation greenness and moisture index generally rise together — biomass gains align with canopy water status.',
      negative:
        'Biomass increases while canopy moisture falls — early water-stress decoupling; review irrigation scheduling before yield loss.',
    },
    'NDVI|NDWI': {
      positive:
        'Surface water / canopy water signal tracks vegetation density — healthy transpiration balance supports productivity.',
      negative:
        'Higher NDVI with lower NDWI suggests moisture deficit under active canopy — prioritize targeted irrigation or scouting.',
    },
    'NDVI|LST': {
      negative:
        'Canopy cooling: greener vegetation coincides with lower land-surface temperature — expected when cover shades and transpires.',
      positive:
        'Vegetation and surface heat rise together — may indicate sparse cover, senescent canopy, or soil-dominated pixels.',
    },
    'NDVI|CHAS': {
      positive:
        'Integrated crop health score rises with NDVI — Sentinel layers agree on improving agronomic condition.',
      negative:
        'Vegetation index improves while composite health score weakens — check nutrient, pest, or moisture constraints not captured by NDVI alone.',
    },
    'NDMI|NDWI': {
      positive:
        'Canopy moisture and water index co-vary — consistent hydrological status across the parcel.',
      negative:
        'Moisture indices diverge — possible canopy stress, drainage heterogeneity, or mixed crop stages within the AOI.',
    },
  }

  const picked =
    templates[key]?.[direction === 'none' ? 'positive' : direction] ??
    templates[reverseKey]?.[direction === 'none' ? 'positive' : direction]

  if (picked) return picked

  if (strength === 'none') {
    return `${yLayerId} does not explain a stable share of ${xLayerId} variation in this window — treat layers independently for management decisions.`
  }

  const coupling =
    direction === 'negative'
      ? 'inverse coupling'
      : direction === 'positive'
        ? 'co-movement'
        : 'mixed coupling'
  return `${yLayerId} explains ~${pct}% of ${xLayerId} variance (R²=${regression.r2.toFixed(3)}) — ${coupling} may drive productivity swings in this period.`
}

export function buildScatterGisInsight(
  xLayerId: string,
  yLayerId: string,
  regression: LinearRegressionResult,
  relationship: ScatterRelationshipPresentation,
): string {
  const pct = Math.round(regression.r2 * 100)
  return `GIS · r=${regression.r.toFixed(3)} · R²=${regression.r2.toFixed(3)} (${pct}%) · n=${regression.n} scenes · slope ${regression.slope.toFixed(4)} Δ${yLayerId}/Δ${xLayerId} · ${relationship.label}`
}

export function buildScatterAgroInsight(
  xLayerId: string,
  yLayerId: string,
  regression: LinearRegressionResult,
  relationship: ScatterRelationshipPresentation,
): string {
  return `Agro · ${buildLayerPairAgroInsight(xLayerId, yLayerId, relationship, regression)}`
}

/** Correlation scatter analysis — X = first layer, Y = second layer, aligned by scene date. */
export function buildImageryCorrelationScatterAnalysis(
  labels: string[],
  xLayerId: string,
  xValues: number[],
  yLayerId: string,
  yValues: number[],
): ImageryCorrelationScatterAnalysis | null {
  const points = buildImageryCorrelationPairs(labels, xValues, yValues)
  const regression = computeLinearRegression(points)
  if (!regression) return null

  const relationship = classifyScatterRelationship(regression)
  return {
    xLayerId,
    yLayerId,
    points,
    regression,
    relationship,
    gisInsight: buildScatterGisInsight(xLayerId, yLayerId, regression, relationship),
    agroInsight: buildScatterAgroInsight(xLayerId, yLayerId, regression, relationship),
    regressionLine: buildRegressionLinePoints(regression, points),
  }
}
