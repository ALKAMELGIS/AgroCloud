import { evaluateImageryLayerDailyValue } from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import type { SentinelHubDailyIndexMeans } from '../../../../lib/sentinelHubStatisticsApi'
import { dailyRowsSatisfyLayerIds } from './fetchPlotTimeSeriesAnalytics'

/** Clip zonal daily rows to the toolbar Start/End window (inclusive ISO dates). */
export function dailyRowsInRange(
  rows: SentinelHubDailyIndexMeans[],
  fromDate: string,
  toDate: string,
): SentinelHubDailyIndexMeans[] {
  const from = fromDate.trim().slice(0, 10)
  const to = toDate.trim().slice(0, 10)
  if (!from || !to || from > to) return []

  const byDate = new Map<string, SentinelHubDailyIndexMeans>()
  for (const row of rows) {
    const d = String(row.date || '').trim().slice(0, 10)
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d) || d < from || d > to) continue
    const prev = byDate.get(d)
    if (!prev) {
      byDate.set(d, { ...row, date: d })
      continue
    }
    byDate.set(d, {
      date: d,
      ndvi: prev.ndvi ?? row.ndvi,
      ndwi: prev.ndwi ?? row.ndwi,
      ndmi: prev.ndmi ?? row.ndmi,
      evi: prev.evi ?? row.evi,
      savi: prev.savi ?? row.savi,
      ciRe: prev.ciRe ?? row.ciRe,
      ndsi: prev.ndsi ?? row.ndsi,
      si: prev.si ?? row.si,
      ssi: prev.ssi ?? row.ssi,
      ndre: prev.ndre ?? row.ndre,
      ndii: prev.ndii ?? row.ndii,
      zonal: prev.zonal ?? row.zonal,
    })
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export function dailyRowHasFiniteLayer(
  row: SentinelHubDailyIndexMeans,
  layerIds: string[],
): boolean {
  return layerIds.some(id => {
    const v = evaluateImageryLayerDailyValue(id, row)
    return v != null && Number.isFinite(v)
  })
}

/** True when clipped rows cover the export window with at least one observation per required layer. */
export function dailyRowsSatisfyExportWindow(
  rows: SentinelHubDailyIndexMeans[],
  fromDate: string,
  toDate: string,
  layerIds: string[],
): boolean {
  const clipped = dailyRowsInRange(rows, fromDate, toDate)
  if (!clipped.length) return false
  if (!dailyRowsSatisfyLayerIds(clipped, layerIds)) return false
  return clipped.some(row => dailyRowHasFiniteLayer(row, layerIds))
}

export function describeEmptyExportWindow(
  fromDate: string,
  toDate: string,
  layerIds: string[],
): string {
  const layers = layerIds.length ? layerIds.join(', ') : 'NDVI'
  return `No clear satellite observations for ${layers} between ${fromDate.slice(0, 10)} and ${toDate.slice(0, 10)}. Widen the date range or wait for the Time Series chart to finish loading.`
}
