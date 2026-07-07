import type { Chart as ChartJS } from 'chart.js'
import {
  buildTimeSeriesReportPayload,
  type BuildTimeSeriesReportPayloadInput,
} from './buildTimeSeriesReportPayload'
import { generateTimeSeriesReportPdf } from './generateTimeSeriesReportPdf'
import { fetchFieldMapSnapshot } from './timeSeriesMapSnapshot'
import {
  exportTimeSeriesChartPng,
  exportTimeSeriesCsv,
  exportTimeSeriesGeoJson,
  exportTimeSeriesWorkbook,
} from './timeSeriesReportExports'
import type { TimeSeriesExportKind, TimeSeriesReportConfig, TimeSeriesReportPayload } from './timeSeriesReportTypes'

export type RunTimeSeriesExportInput = Omit<
  BuildTimeSeriesReportPayloadInput,
  'chartPng' | 'mapPng' | 'includeInterpretation'
> & {
  chartRef: ChartJS | null
  config?: Partial<TimeSeriesReportConfig>
}

async function assemblePayload(
  input: RunTimeSeriesExportInput,
  options: { includeMap: boolean; includeInterpretation: boolean },
): Promise<TimeSeriesReportPayload> {
  const { chartRef, config, ...rest } = input
  const chartPng = chartRef?.toBase64Image('image/png', 1) ?? null
  const mapPng = options.includeMap
    ? await fetchFieldMapSnapshot(rest.field?.geometry ?? null)
    : null

  return buildTimeSeriesReportPayload({
    ...rest,
    chartPng,
    mapPng,
    includeInterpretation: options.includeInterpretation,
    title: config?.title ?? rest.title,
    fromDate: config?.fromDate ?? rest.fromDate,
    toDate: config?.toDate ?? rest.toDate,
    layerIds: config?.layerIds ?? rest.layerIds,
    aggregation: config?.aggregation ?? rest.aggregation,
  })
}

export async function runTimeSeriesExport(
  kind: TimeSeriesExportKind,
  input: RunTimeSeriesExportInput,
): Promise<boolean> {
  const includeMap = kind === 'pdf'
  const includeInterpretation = kind === 'pdf' || kind === 'excel'
  const payload = await assemblePayload(input, { includeMap, includeInterpretation })

  if (!payload.labels.length) return false

  switch (kind) {
    case 'pdf':
      return generateTimeSeriesReportPdf(payload)
    case 'excel':
      return exportTimeSeriesWorkbook(payload)
    case 'csv':
      return exportTimeSeriesCsv(payload)
    case 'png': {
      const png =
        payload.charts.linePng ??
        payload.charts.barPng ??
        payload.charts.scatterPng ??
        input.chartRef?.toBase64Image('image/png', 1) ??
        null
      return exportTimeSeriesChartPng(png ?? '', payload.layerIds)
    }
    case 'geojson':
      return exportTimeSeriesGeoJson(payload)
    default:
      return false
  }
}

export async function generateFullTimeSeriesReport(
  input: RunTimeSeriesExportInput,
  config: TimeSeriesReportConfig,
): Promise<boolean> {
  const chartPng = input.chartRef?.toBase64Image('image/png', 1) ?? null
  const mapPng = config.includeMapSnapshot
    ? await fetchFieldMapSnapshot(input.field?.geometry ?? null)
    : null

  const payload = buildTimeSeriesReportPayload({
    ...input,
    title: config.title,
    fromDate: config.fromDate,
    toDate: config.toDate,
    layerIds: config.layerIds,
    aggregation: config.aggregation,
    chartPng,
    mapPng,
    includeInterpretation: config.includeInterpretation,
  })

  if (!payload.labels.length) return false
  return generateTimeSeriesReportPdf(payload, {
    includeMap: config.includeMapSnapshot,
    includeInterpretation: config.includeInterpretation,
    includeCharts: config.includeCharts,
  })
}

export { buildTimeSeriesReportPayload, type TimeSeriesReportPayload }
