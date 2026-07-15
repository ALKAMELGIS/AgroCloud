import { buildTimeSeriesReportPayload, type BuildTimeSeriesReportPayloadInput } from './buildTimeSeriesReportPayload'
import { generateTimeSeriesReportPdf } from './generateTimeSeriesReportPdf'
import {
  exportTimeSeriesCsvReport,
  generateTimeSeriesReportExcel,
} from './generateTimeSeriesReportExcel'
import { generateTimeSeriesWeatherReportExcel } from './generateTimeSeriesWeatherReportExcel'
import { generateTimeSeriesReportDocx } from './generateTimeSeriesReportDocx'
import { exportChartPng } from './timeSeriesReportExports'
import type { ImageryChartType } from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import type { TimeSeriesExportKind, TimeSeriesReportConfig } from './timeSeriesReportTypes'
import type { ImageryTimeSeriesLayerSeries } from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'

export type TimeSeriesExportContext = BuildTimeSeriesReportPayloadInput & {
  chartRef?: { current: { toBase64Image: (type?: string, quality?: number) => string; update?: (mode?: 'none') => void } | null } | null
  chartType?: ImageryChartType
  config?: Partial<TimeSeriesReportConfig>
}

export type TimeSeriesExportOptions = {
  signal?: AbortSignal
  onMapSnapshotProgress?: (completed: number, total: number) => void
}

const DEFAULT_CONFIG: TimeSeriesReportConfig = {
  projectName: 'AgroCloud Satellite Intelligence',
  generatedBy: 'AgroCloud',
  includeMap: true,
  includeInterpretation: true,
}

async function buildExportPayload(
  ctx: TimeSeriesExportContext,
  options?: {
    includeMapSnapshots?: boolean
    enrichVegetationCoverage?: boolean
    signal?: AbortSignal
    onMapSnapshotProgress?: (completed: number, total: number) => void
  },
) {
  const config = { ...DEFAULT_CONFIG, ...ctx.config }
  return buildTimeSeriesReportPayload({
    ...ctx,
    projectName: config.projectName,
    generatedBy: config.generatedBy,
    includeMap: config.includeMap,
    includeMapSnapshots: options?.includeMapSnapshots ?? true,
    includeVegetationCoverageTimeline: options?.enrichVegetationCoverage ?? true,
    periodAnchorDates: ctx.periodAnchorDates,
    signal: options?.signal ?? ctx.signal,
    onMapSnapshotProgress: options?.onMapSnapshotProgress ?? ctx.onMapSnapshotProgress,
  })
}

export async function generateFullTimeSeriesReport(ctx: TimeSeriesExportContext): Promise<void> {
  const payload = await buildExportPayload(ctx, {
    includeMapSnapshots: false,
    enrichVegetationCoverage: false,
  })
  await generateTimeSeriesReportPdf(payload, {
    chart: ctx.chartRef?.current ?? null,
    chartType: ctx.chartType ?? 'line',
  })
}

export async function runTimeSeriesExport(
  kind: TimeSeriesExportKind,
  ctx: TimeSeriesExportContext,
  layerSeries: ImageryTimeSeriesLayerSeries[],
  chartLabels: string[],
  options?: TimeSeriesExportOptions,
): Promise<void> {
  const snapshotOpts = {
    signal: options?.signal,
    onMapSnapshotProgress: options?.onMapSnapshotProgress,
  }
  switch (kind) {
    case 'pdf':
      await generateFullTimeSeriesReport(ctx)
      break
    case 'csv': {
      const payload = await buildExportPayload(ctx, {
        includeMapSnapshots: false,
        enrichVegetationCoverage: false,
      })
      exportTimeSeriesCsvReport(payload)
      break
    }
    case 'excel': {
      const payload = await buildExportPayload(ctx, {
        includeMapSnapshots: true,
        enrichVegetationCoverage: true,
        ...snapshotOpts,
      })
      await generateTimeSeriesReportExcel(payload)
      break
    }
    case 'weather-excel': {
      const payload = await buildExportPayload(ctx, {
        includeMapSnapshots: false,
        enrichVegetationCoverage: false,
      })
      await generateTimeSeriesWeatherReportExcel(payload)
      break
    }
    case 'docx': {
      const payload = await buildExportPayload(ctx, {
        includeMapSnapshots: true,
        enrichVegetationCoverage: true,
        ...snapshotOpts,
      })
      await generateTimeSeriesReportDocx(payload)
      break
    }
    case 'png':
      exportChartPng(ctx.chartRef?.current ?? null, layerSeries)
      break
    case 'geojson':
      exportFieldGeoJson(ctx)
      break
    default:
      break
  }
}

function exportFieldGeoJson(ctx: TimeSeriesExportContext): void {
  const geom = ctx.field?.geometry
  if (!geom) return
  const fc: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          fieldName: ctx.fieldName,
          fieldKey: ctx.fieldKey,
          from: ctx.fromDate,
          to: ctx.toDate,
          acquisitionDate: ctx.acquisitionDate,
        },
        geometry: geom,
      },
    ],
  }
  const blob = new Blob([JSON.stringify(fc, null, 2)], { type: 'application/geo+json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `aoi-${ctx.fieldKey.replace(/[^\w.-]+/g, '_')}.geojson`
  a.click()
  URL.revokeObjectURL(url)
}
