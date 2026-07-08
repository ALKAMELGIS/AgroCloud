import * as XLSX from 'xlsx'
import type { ImageryTimeSeriesLayerSeries } from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'

export function exportTimeSeriesCsv(chartLabels: string[], layerSeries: ImageryTimeSeriesLayerSeries[]): void {
  if (!chartLabels.length || !layerSeries.length) return
  const header = ['period', ...layerSeries.map(s => s.layerId)].join(',')
  const rows = chartLabels.map((period, rowIndex) =>
    [period, ...layerSeries.map(s => s.values[rowIndex] ?? '')].join(','),
  )
  downloadBlob(new Blob([[header, ...rows].join('\n')], { type: 'text/csv' }), fileSlug(layerSeries, 'csv'))
}

export function exportTimeSeriesExcel(chartLabels: string[], layerSeries: ImageryTimeSeriesLayerSeries[]): void {
  if (!chartLabels.length || !layerSeries.length) return
  const header = ['period', ...layerSeries.map(s => s.layerId)]
  const rows = chartLabels.map((period, rowIndex) => [
    period,
    ...layerSeries.map(s => s.values[rowIndex] ?? ''),
  ])
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'TimeSeries')
  XLSX.writeFile(wb, fileSlug(layerSeries, 'xlsx'))
}

export function exportChartPng(
  chart: { toBase64Image: (type?: string, quality?: number) => string } | null,
  layerSeries: ImageryTimeSeriesLayerSeries[],
): void {
  if (!chart) return
  const url = chart.toBase64Image('image/png', 1)
  const a = document.createElement('a')
  a.href = url
  a.download = fileSlug(layerSeries, 'png')
  a.click()
}

function fileSlug(layerSeries: ImageryTimeSeriesLayerSeries[], ext: string): string {
  return `imagery-timeseries-${layerSeries.map(s => s.layerId.toLowerCase()).join('-')}.${ext}`
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
