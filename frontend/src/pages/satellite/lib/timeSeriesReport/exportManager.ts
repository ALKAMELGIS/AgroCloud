import { buildTimeSeriesReportPayload, type BuildTimeSeriesReportPayloadInput } from './buildTimeSeriesReportPayload'
import { generateTimeSeriesReportPdf } from './generateTimeSeriesReportPdf'
import {
  exportTimeSeriesCsvReport,
  generateTimeSeriesReportExcel,
} from './generateTimeSeriesReportExcel'
import { generateTimeSeriesWeatherReportExcel } from './generateTimeSeriesWeatherReportExcel'
import { generateTimeSeriesReportDocx, generateTimeSeriesLulcReportDocx } from './generateTimeSeriesReportDocx'
import { exportChartPng } from './timeSeriesReportExports'
import { buildPlotTimeSeriesAnalyticsFromPlots } from './fetchPlotTimeSeriesAnalytics'
import { generatePlotTimeSeriesAnalyticsExcel } from './generatePlotTimeSeriesAnalyticsExcel'
import { generateAoiPlotRawTimeSeriesExcel } from './generateAoiPlotRawTimeSeriesExcel'
import { generateAoiRawDataByLayerExcel } from './generateAoiRawDataByLayerExcel'
import {
  batchExportAnalyticsReportsExcel,
  type BatchAnalyticsExportProgress,
  type BatchAnalyticsExportResult,
} from './batchExportAnalyticsReportsExcel'
import {
  batchExportFieldSummaries,
  type BatchFieldSummaryProgress,
  type BatchFieldSummaryResult,
  type FieldSummaryExportMode,
} from './batchExportFieldSummaries'
import type {
  ImageryChartType,
  ImageryTimeAggregation,
} from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
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
  /** Field-level progress for batch Analytics Report Excel exports. */
  onBatchAnalyticsProgress?: (progress: BatchAnalyticsExportProgress) => void
  /** Field-level progress for batch Field Summary PDF exports. */
  onBatchFieldSummaryProgress?: (progress: BatchFieldSummaryProgress) => void
  /** individual = one PDF per field; combined = executive cover + pages. */
  fieldSummaryMode?: FieldSummaryExportMode
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
    includeLulcMapSnapshots?: boolean
    includeCumulativeMapSnapshots?: boolean
    includeChangeDetectionMapSnapshots?: boolean
    enrichVegetationCoverage?: boolean
    mapSnapshotAggregation?: ImageryTimeAggregation
    mapSnapshotMaxPerLayer?: number
    signal?: AbortSignal
    onMapSnapshotProgress?: (completed: number, total: number) => void
  },
) {
  const config = { ...DEFAULT_CONFIG, ...ctx.config }
  // Prefer any AOI geometry available (field or first plot) so Map Snapshots never skip the build.
  const plotWithGeom = ctx.plots?.find(p => p.geometry) ?? null
  const field =
    ctx.field?.geometry
      ? ctx.field
      : ctx.field && plotWithGeom?.geometry
        ? { ...ctx.field, geometry: plotWithGeom.geometry }
        : plotWithGeom?.geometry
          ? plotWithGeom
          : ctx.field

  return buildTimeSeriesReportPayload({
    ...ctx,
    field,
    projectName: config.projectName,
    generatedBy: config.generatedBy,
    includeMap: config.includeMap,
    includeMapSnapshots: options?.includeMapSnapshots ?? true,
    includeLulcMapSnapshots: options?.includeLulcMapSnapshots,
    includeCumulativeMapSnapshots: options?.includeCumulativeMapSnapshots,
    includeChangeDetectionMapSnapshots: options?.includeChangeDetectionMapSnapshots,
    includeVegetationCoverageTimeline: options?.enrichVegetationCoverage ?? true,
    periodAnchorDates: ctx.periodAnchorDates,
    mapSnapshotAggregation: options?.mapSnapshotAggregation,
    mapSnapshotMaxPerLayer: options?.mapSnapshotMaxPerLayer,
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
): Promise<BatchAnalyticsExportResult | BatchFieldSummaryResult | void> {
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
    case 'docx': {
      // Intelligence Report: index atlas + change + cumulative (LULC is a separate Word export).
      const payload = await buildExportPayload(ctx, {
        includeMapSnapshots: true,
        includeLulcMapSnapshots: false,
        enrichVegetationCoverage: true,
        mapSnapshotAggregation: 'day',
        // Cap per layer so WMS/composite stays reliable (same ceiling as Excel atlas).
        mapSnapshotMaxPerLayer: 36,
        ...snapshotOpts,
      })
      await generateTimeSeriesReportDocx(payload)
      break
    }
    case 'excel': {
      // Analytics Excel: index Map Snapshots atlas only (skip LULC/change/cumulative WMS load).
      // Cap per layer so multi-layer exports (NDVI+ISS+…) stay reliable and complete.
      const layerCount = Math.max(1, ctx.layerIds?.filter(Boolean).length ?? 1)
      const mapSnapshotMaxPerLayer = Math.min(36, Math.max(12, Math.floor(48 / layerCount)))
      const payload = await buildExportPayload(ctx, {
        includeMapSnapshots: true,
        includeLulcMapSnapshots: false,
        includeCumulativeMapSnapshots: false,
        includeChangeDetectionMapSnapshots: false,
        enrichVegetationCoverage: true,
        mapSnapshotAggregation: 'day',
        mapSnapshotMaxPerLayer,
        ...snapshotOpts,
      })
      await generateTimeSeriesReportExcel(payload)
      break
    }
    case 'batch-excel': {
      const config = { ...DEFAULT_CONFIG, ...ctx.config }
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
        throw new Error('Select at least one field with geometry before batch-exporting Analytics Reports.')
      }
      return batchExportAnalyticsReportsExcel({
        plots,
        layerIds: ctx.layerIds,
        fromDate: ctx.fromDate,
        toDate: ctx.toDate,
        timeAggregation: ctx.timeAggregation ?? 'day',
        mapboxToken: ctx.mapboxToken,
        projectName: config.projectName,
        generatedBy: config.generatedBy,
        signal: options?.signal,
        onProgress: ctx.onBatchAnalyticsProgress,
      })
    }
    case 'batch-field-summary': {
      const config = { ...DEFAULT_CONFIG, ...ctx.config }
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
        throw new Error('Select at least one field with geometry before batch-exporting Field Summaries.')
      }
      return batchExportFieldSummaries({
        plots,
        layerIds: ctx.layerIds,
        fromDate: ctx.fromDate,
        toDate: ctx.toDate,
        timeAggregation: ctx.timeAggregation ?? 'day',
        projectName: config.projectName,
        signal: options?.signal,
        onProgress: progress => {
          ctx.onBatchFieldSummaryProgress?.(progress)
          ctx.onBatchAnalyticsProgress?.(progress)
        },
      })
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
    case 'lulc-docx': {
      const payload = await buildExportPayload(ctx, {
        includeMapSnapshots: false,
        includeLulcMapSnapshots: true,
        enrichVegetationCoverage: false,
        ...snapshotOpts,
      })
      await generateTimeSeriesLulcReportDocx(payload)
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
