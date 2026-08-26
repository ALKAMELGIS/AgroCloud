import type { CropAlertFieldInput } from '../../../../lib/siCropAlertEngine'
import {
  etCropCoefficientFromNdvi,
  estimateAetMmDayFromEtcAndIndices,
  estimateEtcPotentialMmDay,
} from '../../../../lib/etIndex'
import type { SentinelHubDailyIndexMeans } from '../../../../lib/sentinelHubStatisticsApi'
import {
  evaluateImageryLayerDailyValue,
  type ImageryTimeSeriesLayerSeries,
} from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import { calculateETc } from './waterRequirementService'
import { fetchEt0MmDayByDateForSceneDates, resolvePlotCentroidLonLat } from './waterRequirementEt0'
import { estimateNdwiFromNdmi } from './timeSeriesReportExecutive'

export type WaterLossEtByDateMaps = {
  etMmDayByDate: Record<string, number>
  etcMmDayByDate: Record<string, number>
}

function resolveLayerMean(
  layerId: 'NDMI' | 'NDWI' | 'NDVI',
  date: string,
  dailyRows: SentinelHubDailyIndexMeans[],
  series: ImageryTimeSeriesLayerSeries | null | undefined,
  seriesIndex: number | null,
): number | null {
  const row = dailyRows.find(r => r.date?.slice(0, 10) === date.slice(0, 10))
  if (row) {
    const v = evaluateImageryLayerDailyValue(layerId, row)
    if (v != null && Number.isFinite(v)) return v
  }
  if (series && seriesIndex != null) {
    const v = series.values[seriesIndex]
    if (v != null && Number.isFinite(v)) return v
  }
  return null
}

function resolveEtcMmDay(input: {
  date: string
  ndvi: number | null
  et0MmDayByDate?: Record<string, number | null | undefined>
}): number | null {
  const kc = etCropCoefficientFromNdvi(input.ndvi)
  const et0 = input.et0MmDayByDate?.[input.date.slice(0, 10)]
  if (et0 != null && Number.isFinite(et0) && et0 > 0) {
    return calculateETc(kc, et0)
  }
  const potential = estimateEtcPotentialMmDay({ sceneDate: input.date, ndvi: input.ndvi })
  return potential > 0 ? potential : null
}

function resolveEtaMmDay(input: {
  date: string
  ndmi: number | null
  ndwi: number | null
  ndvi: number | null
  etcMmDay: number | null
  dailyRows: SentinelHubDailyIndexMeans[]
  explicitAet?: number | null
}): number | null {
  if (input.explicitAet != null && Number.isFinite(input.explicitAet) && input.explicitAet >= 0) {
    return input.explicitAet
  }
  const etc = input.etcMmDay
  if (etc == null || etc <= 0) return null

  let ndmi = input.ndmi
  let ndwi = input.ndwi
  if ((ndwi == null || !Number.isFinite(ndwi)) && ndmi != null && Number.isFinite(ndmi)) {
    ndwi = estimateNdwiFromNdmi(ndmi)
  }
  if (ndmi != null && Number.isFinite(ndmi) && ndwi != null && Number.isFinite(ndwi)) {
    return estimateAetMmDayFromEtcAndIndices(etc, ndmi, ndwi)
  }

  const row = input.dailyRows.find(r => r.date?.slice(0, 10) === input.date.slice(0, 10))
  const etLayer = row ? evaluateImageryLayerDailyValue('ET', row) : null
  if (etLayer != null && Number.isFinite(etLayer) && etLayer >= 0) {
    return Math.min(etc, etLayer)
  }
  return null
}

/**
 * Build per-scene ETa / ETc maps for Water Loss Index:
 *   Index (%) = (1 − ETa/ETc) × 100
 */
export function buildWaterLossEtByDateMaps(input: {
  sceneDates: string[]
  dailyRows: SentinelHubDailyIndexMeans[]
  layerSeries: ImageryTimeSeriesLayerSeries[]
  periodMetaByDate: Map<string, { seriesIndex: number }>
  et0MmDayByDate?: Record<string, number | null | undefined>
  aetMmDayByDate?: Record<string, number | null | undefined>
}): WaterLossEtByDateMaps {
  const ndmiSeries = input.layerSeries.find(s => s.layerId.toUpperCase() === 'NDMI') ?? null
  const ndwiSeries = input.layerSeries.find(s => s.layerId.toUpperCase() === 'NDWI') ?? null
  const ndviSeries = input.layerSeries.find(s => s.layerId.toUpperCase() === 'NDVI') ?? null

  const etMmDayByDate: Record<string, number> = {}
  const etcMmDayByDate: Record<string, number> = {}

  for (const sceneDate of input.sceneDates) {
    const meta = input.periodMetaByDate.get(sceneDate)
    const ndmi = resolveLayerMean('NDMI', sceneDate, input.dailyRows, ndmiSeries, meta?.seriesIndex ?? null)
    const ndwiRaw = resolveLayerMean('NDWI', sceneDate, input.dailyRows, ndwiSeries, meta?.seriesIndex ?? null)
    const ndvi = resolveLayerMean('NDVI', sceneDate, input.dailyRows, ndviSeries, meta?.seriesIndex ?? null)
    const etcMmDay = resolveEtcMmDay({
      date: sceneDate,
      ndvi,
      et0MmDayByDate: input.et0MmDayByDate,
    })
    if (etcMmDay == null) continue

    const etaMmDay = resolveEtaMmDay({
      date: sceneDate,
      ndmi,
      ndwi: ndwiRaw,
      ndvi,
      etcMmDay,
      dailyRows: input.dailyRows,
      explicitAet: input.aetMmDayByDate?.[sceneDate] ?? null,
    })
    if (etaMmDay == null) continue

    etcMmDayByDate[sceneDate] = etcMmDay
    etMmDayByDate[sceneDate] = etaMmDay
  }

  return { etMmDayByDate, etcMmDayByDate }
}

export async function fetchWaterLossEt0ByDateForField(input: {
  field: CropAlertFieldInput | null | undefined
  fromDate: string
  toDate: string
  sceneDates: string[]
  signal?: AbortSignal
}): Promise<Record<string, number>> {
  if (input.signal?.aborted) return {}
  const point = input.field ? resolvePlotCentroidLonLat(input.field) : null
  if (!point) return {}
  return fetchEt0MmDayByDateForSceneDates({
    lat: point.lat,
    lon: point.lon,
    fromDate: input.fromDate,
    toDate: input.toDate,
    sceneDates: input.sceneDates,
    signal: input.signal,
  })
}
