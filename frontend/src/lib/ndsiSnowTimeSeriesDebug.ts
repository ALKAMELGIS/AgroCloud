import type { SentinelHubDailyIndexMeans } from './sentinelHubStatisticsApi'
import { evaluateImageryLayerDailyValue } from '../pages/dashboards/agroCloudPlatform/acpImageryTimeSeries'

export type NdsiSnowTimeSeriesDebugReport = {
  layerIds: string[]
  fromIso: string
  toIso: string
  statsMode: 'snow-ndsi' | 'multi'
  totalDailyRows: number
  computedNdsiCount: number
  skippedScenes: Array<{ date: string; reason: string }>
  chartPoints: Array<{ date: string; ndsi: number | null; min?: number; max?: number }>
}

export function buildNdsiSnowTimeSeriesDebugReport(
  daily: SentinelHubDailyIndexMeans[],
  layerIds: string[],
  fromIso: string,
  toIso: string,
  statsMode: 'snow-ndsi' | 'multi',
): NdsiSnowTimeSeriesDebugReport {
  const skippedScenes: Array<{ date: string; reason: string }> = []
  const chartPoints: Array<{ date: string; ndsi: number | null; min?: number; max?: number }> = []

  for (const row of daily) {
    const day = row.date.slice(0, 10)
    if (day < fromIso || day > toIso) continue
    const ndsi = evaluateImageryLayerDailyValue('NDSI', row)
    const zonal = row.zonal?.ndsi
    if (ndsi == null || !Number.isFinite(ndsi)) {
      skippedScenes.push({
        date: day,
        reason:
          row.ndsi == null
            ? 'no NDSI band in daily row'
            : !Number.isFinite(row.ndsi)
              ? 'NDSI not finite'
              : 'NDSI filtered during chart evaluation',
      })
      continue
    }
    chartPoints.push({
      date: day,
      ndsi,
      min: zonal?.min,
      max: zonal?.max,
    })
  }

  return {
    layerIds,
    fromIso,
    toIso,
    statsMode,
    totalDailyRows: daily.length,
    computedNdsiCount: chartPoints.length,
    skippedScenes,
    chartPoints,
  }
}

export function logNdsiSnowTimeSeriesDebug(
  label: string,
  report: NdsiSnowTimeSeriesDebugReport,
  extra?: Record<string, unknown>,
): void {
  if (typeof console === 'undefined' || typeof console.groupCollapsed !== 'function') return
  console.groupCollapsed(`[NDSI snow time series] ${label}`)
  console.log('layerIds', report.layerIds)
  console.log('date range', `${report.fromIso} → ${report.toIso}`)
  console.log('stats mode', report.statsMode)
  console.log('total daily rows', report.totalDailyRows)
  console.log('computed NDSI count', report.computedNdsiCount)
  console.log('skipped scenes', report.skippedScenes.length, report.skippedScenes.slice(0, 12))
  console.log('chart points', report.chartPoints.length, report.chartPoints.slice(0, 12))
  if (extra) console.log('extra', extra)
  console.groupEnd()
}
