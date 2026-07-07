import * as XLSX from 'xlsx'
import { IMAGERY_TIME_AGGREGATION_OPTIONS } from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import type { TimeSeriesReportPayload } from './timeSeriesReportTypes'

function fmtNum(n: number | null | undefined): number | string {
  if (n == null || !Number.isFinite(n)) return ''
  return n
}

export function exportTimeSeriesWorkbook(payload: TimeSeriesReportPayload): boolean {
  const wb = XLSX.utils.book_new()

  const aggLabel =
    IMAGERY_TIME_AGGREGATION_OPTIONS.find(o => o.id === payload.period.aggregation)?.label ??
    payload.period.aggregation

  const summaryRows = [
    { Field: 'Report title', Value: payload.title },
    { Field: 'Project', Value: payload.projectName },
    { Field: 'Field', Value: payload.fieldName },
    { Field: 'Farm', Value: payload.location.farmName || '—' },
    { Field: 'Layers', Value: payload.layerIds.join(', ') },
    { Field: 'Period start', Value: payload.period.start },
    { Field: 'Period end', Value: payload.period.end },
    { Field: 'Aggregation', Value: aggLabel },
    { Field: 'Generated', Value: payload.generatedAt },
    {
      Field: 'Latitude',
      Value: payload.location.latitude ?? '',
    },
    {
      Field: 'Longitude',
      Value: payload.location.longitude ?? '',
    },
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Summary')

  const statsRows = payload.layerStats.map(s => ({
    Index: s.layerId,
    Mean: fmtNum(s.mean),
    Min: fmtNum(s.min),
    Max: fmtNum(s.max),
    'Std Dev': fmtNum(s.stdDev),
    Trend: s.trend,
    Observations: s.observationCount,
  }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(statsRows), 'Statistics')

  const tsHeader = ['period', ...payload.layerSeries.map(s => s.layerId)]
  const tsRows = payload.labels.map((label, i) => {
    const row: Record<string, string | number> = { period: label }
    for (const series of payload.layerSeries) {
      row[series.layerId] = fmtNum(series.values[i] ?? null)
    }
    return row
  })
  const wsTs = XLSX.utils.json_to_sheet(tsRows, { header: tsHeader })
  XLSX.utils.book_append_sheet(wb, wsTs, 'Time Series')

  const compareRows = payload.layerStats.map(s => ({
    Index: s.layerId,
    Mean: fmtNum(s.mean),
    Min: fmtNum(s.min),
    Max: fmtNum(s.max),
    Trend: s.trend,
  }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(compareRows), 'Layer Comparison')

  if (payload.scatterAnalysis) {
    const sa = payload.scatterAnalysis
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet([
        { Metric: 'X layer', Value: sa.xLayerId },
        { Metric: 'Y layer', Value: sa.yLayerId },
        { Metric: 'R²', Value: sa.regression.r2 },
        { Metric: 'R', Value: sa.regression.r },
        { Metric: 'Slope', Value: sa.regression.slope },
        { Metric: 'Intercept', Value: sa.regression.intercept },
        { Metric: 'Relationship', Value: sa.relationship.label },
        { Metric: 'GIS insight', Value: sa.gisInsight },
        { Metric: 'Agro insight', Value: sa.agroInsight },
      ]),
      'Correlation',
    )
  }

  if (payload.interpretations.length) {
    const interpRows = payload.interpretations.flatMap(item => [
      { Layer: item.layerId, Type: 'Summary', Text: item.summaryLine },
      { Layer: item.layerId, Type: 'Coverage', Text: item.coverageLine },
      { Layer: item.layerId, Type: 'Actions', Text: item.actionsLine },
    ])
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(interpRows), 'Interpretation')
  }

  const slug = payload.fieldName.replace(/[^\w.-]+/g, '_').slice(0, 40)
  XLSX.writeFile(wb, `imagery-analysis-report-${slug}.xlsx`)
  return true
}

export function exportTimeSeriesCsv(payload: TimeSeriesReportPayload): boolean {
  const header = ['period', ...payload.layerSeries.map(s => s.layerId)].join(',')
  const rows = payload.labels.map((date, rowIndex) =>
    [date, ...payload.layerSeries.map(s => s.values[rowIndex] ?? '')].join(','),
  )
  const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const slug = payload.layerIds.map(id => id.toLowerCase()).join('-')
  a.download = `imagery-timeseries-${slug}.csv`
  a.click()
  URL.revokeObjectURL(url)
  return true
}

export function exportTimeSeriesChartPng(chartPng: string, layerIds: string[]): boolean {
  if (!chartPng) return false
  const a = document.createElement('a')
  a.href = chartPng
  a.download = `imagery-timeseries-${layerIds.map(id => id.toLowerCase()).join('-')}.png`
  a.click()
  return true
}

export function exportTimeSeriesGeoJson(payload: TimeSeriesReportPayload): boolean {
  const geometry = payload.location.geometry
  if (!geometry) return false

  const properties: Record<string, unknown> = {
    fieldName: payload.fieldName,
    fieldKey: payload.fieldKey,
    farmName: payload.location.farmName,
    farmCode: payload.location.farmCode,
    periodStart: payload.period.start,
    periodEnd: payload.period.end,
    aggregation: payload.period.aggregation,
    layers: payload.layerIds.join(', '),
    generatedAt: payload.generatedAt,
  }

  for (const stat of payload.layerStats) {
    properties[`${stat.layerId}_mean`] = stat.mean
    properties[`${stat.layerId}_min`] = stat.min
    properties[`${stat.layerId}_max`] = stat.max
    properties[`${stat.layerId}_stdDev`] = stat.stdDev
    properties[`${stat.layerId}_trend`] = stat.trend
  }

  const feature: GeoJSON.Feature = {
    type: 'Feature',
    geometry,
    properties,
  }

  const fc: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [feature],
  }

  const blob = new Blob([JSON.stringify(fc, null, 2)], { type: 'application/geo+json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const slug = payload.fieldName.replace(/[^\w.-]+/g, '_').slice(0, 40)
  a.download = `imagery-field-stats-${slug}.geojson`
  a.click()
  URL.revokeObjectURL(url)
  return true
}
