import { buildTimeSeriesReportPayload, type BuildTimeSeriesReportPayloadInput } from './buildTimeSeriesReportPayload'
import { generateTimeSeriesReportPdf } from './generateTimeSeriesReportPdf'
import {
  exportTimeSeriesCsvReport,
  generateTimeSeriesReportExcel,
} from './generateTimeSeriesReportExcel'
import { generateTimeSeriesWeatherReportExcel } from './generateTimeSeriesWeatherReportExcel'
import { generateTimeSeriesReportDocx } from './generateTimeSeriesReportDocx'
import { exportChartPng } from './timeSeriesReportExports'
import { buildPlotTimeSeriesAnalyticsFromPlots } from './fetchPlotTimeSeriesAnalytics'
import { generatePlotTimeSeriesAnalyticsExcel } from './generatePlotTimeSeriesAnalyticsExcel'
import { generateAoiPlotRawTimeSeriesExcel } from './generateAoiPlotRawTimeSeriesExcel'
import { generateAoiRawDataByLayerExcel } from './generateAoiRawDataByLayerExcel'
import type { ImageryChartType } from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import type { TimeSeriesExportKind, TimeSeriesReportConfig } from './timeSeriesReportTypes'
import type { ImageryTimeSeriesLayerSeries } from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import type { CropAlertFieldInput } from '../../../../lib/siCropAlertEngine'
import type { PlotTimeSeriesAnalyticsOptions } from './plotTimeSeriesAnalyticsTypes'

export type TimeSeriesExportContext = BuildTimeSeriesReportPayloadInput & {
  chartRef?: { current: { toBase64Image: (type?: string, quality?: number) => string; update?: (mode?: 'none') => void } | null } | null
  chartType?: ImageryChartType
  config?: Partial<TimeSeriesReportConfig>
  /** All plots in the active AOI layer — used by Plot Time Series Analytics export. */
  plots?: CropAlertFieldInput[]
  farmName?: string
  aoiName?: string
  /** Layer attribute used for plot / sheet names in multi-plot Excel exports. */
  plotNameField?: string
  plotAnalyticsOptions?: Partial<PlotTimeSeriesAnalyticsOptions>
  onPlotAnalyticsProgress?: (done: number, total: number) => void
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
      await exportTimeSeriesCsvReport(payload)
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
    case 'plot-priority-excel': {
      const plots =
        ctx.plots?.filter(p => p.geometry) ??
        (ctx.field?.geometry
          ? [
              {
                ...ctx.field,
                fieldKey: ctx.fieldKey || ctx.field.fieldKey,
                farmName: ctx.fieldName || ctx.field.farmName,
              },
            ]
          : [])
      if (!plots.length) {
        throw new Error('Select at least one plot AOI with geometry before exporting the Priority Report.')
      }
      const layerId = ctx.layerIds[0]?.trim() || 'NDVI'
      const model = await buildPlotTimeSeriesAnalyticsFromPlots(
        {
          plots,
          layerId,
          fromDate: ctx.fromDate,
          toDate: ctx.toDate,
          timeAggregation: ctx.timeAggregation ?? 'day',
          farmName: ctx.farmName || ctx.fieldName,
          aoiName: ctx.aoiName || `${plots.length} plots`,
          signal: options?.signal,
          onProgress: ctx.onPlotAnalyticsProgress,
        },
        ctx.plotAnalyticsOptions,
      )
      await generatePlotTimeSeriesAnalyticsExcel(model, ctx.plotAnalyticsOptions)
      break
    }
    case 'aoi-raw-excel': {
      const plots =
        ctx.plots?.filter(p => p.geometry) ??
        (ctx.field?.geometry
          ? [
              {
                ...ctx.field,
                fieldKey: ctx.fieldKey || ctx.field.fieldKey,
                farmName: ctx.fieldName || ctx.field.farmName,
              },
            ]
          : [])
      if (!plots.length) {
        throw new Error('Select at least one AOI plot with geometry before exporting raw time series.')
      }
      await generateAoiPlotRawTimeSeriesExcel({
        plots,
        layerIds: ctx.layerIds,
        fromDate: ctx.fromDate,
        toDate: ctx.toDate,
        farmName: ctx.farmName || ctx.fieldName,
        aoiName: ctx.aoiName || `${plots.length} plots`,
        plotNameField: ctx.plotNameField,
        signal: options?.signal,
        onProgress: ctx.onPlotAnalyticsProgress,
      })
      break
    }
    case 'aoi-raw-by-layer-excel': {
      const plots =
        ctx.plots?.filter(p => p.geometry) ??
        (ctx.field?.geometry
          ? [
              {
                ...ctx.field,
                fieldKey: ctx.fieldKey || ctx.field.fieldKey,
                farmName: ctx.fieldName || ctx.field.farmName,
              },
            ]
          : [])
      if (!plots.length) {
        throw new Error('Select at least one AOI plot with geometry before exporting AOI raw data by layer.')
      }
      await generateAoiRawDataByLayerExcel({
        plots,
        layerIds: ctx.layerIds,
        fromDate: ctx.fromDate,
        toDate: ctx.toDate,
        farmName: ctx.farmName || ctx.fieldName,
        aoiName: ctx.aoiName || `${plots.length} plots`,
        plotNameField: ctx.plotNameField,
        dataSource: 'Sentinel-2 (Sentinel Hub zonal statistics)',
        signal: options?.signal,
        onProgress: ctx.onPlotAnalyticsProgress,
      })
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
