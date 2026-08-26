import {
  buildAnalyticsChartFromDailyRows,
  buildTimeSeriesReportPayload,
  type BuildTimeSeriesReportPayloadInput,
} from './buildTimeSeriesReportPayload'
import { dailyRowsInRange } from './plotTimeSeriesDailyRows'
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
import type { FieldSummarySaveTarget } from './batchExportDirectory'
import {
  buildAgriculturalObjectIntelligenceModel,
  type AgriObjectIntelProgress,
  type AgriObjectSourceFeature,
} from './buildAgriculturalObjectIntelligenceModel'
import { generateAgriculturalObjectIntelligenceExcel } from './generateAgriculturalObjectIntelligenceExcel'
import type {
  ImageryChartType,
  ImageryTimeAggregation,
} from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import type { TimeSeriesExportKind, TimeSeriesReportConfig } from './timeSeriesReportTypes'
import type { ImageryTimeSeriesLayerSeries } from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import type { CropAlertFieldInput } from '../../../../lib/siCropAlertEngine'
import type { PlotTimeSeriesAnalyticsOptions } from './plotTimeSeriesAnalyticsTypes'
import type { SentinelHubDailyIndexMeans } from '../../../../lib/sentinelHubStatisticsApi'

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
  /** Full GeoJSON features with properties for Agricultural Object Intelligence. */
  objectLayerFeatures?: AgriObjectSourceFeature[]
  objectLayerName?: string
  /** Optional pre-fetched zonal daily series keyed by fieldKey. */
  objectDailyByFieldKey?: Map<string, SentinelHubDailyIndexMeans[]>
  onAgriObjectIntelProgress?: (progress: AgriObjectIntelProgress) => void
}

export type TimeSeriesExportOptions = {
  signal?: AbortSignal
  onMapSnapshotProgress?: (completed: number, total: number) => void
  /** Pre-picked writable folder for batch Analytics Report Excel export. */
  batchExportDirectory?: FileSystemDirectoryHandle
  /** Folder picker already ran in the UI click handler (do not invoke again). */
  batchFolderPickAttempted?: boolean
  /** Pre-picked save location for batch Field Summary Excel export. */
  fieldSummarySaveTarget?: FieldSummarySaveTarget
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

  const fromDate = String(ctx.fromDate || '').trim().slice(0, 10)
  const toDate = String(ctx.toDate || '').trim().slice(0, 10)
  const clippedDailyRows = dailyRowsInRange(ctx.dailyRows ?? [], fromDate, toDate)

  let chartLabels = ctx.chartLabels ?? []
  let displayLabels = ctx.displayLabels ?? chartLabels
  let layerSeries = ctx.layerSeries ?? []
  let periodAnchorDates = ctx.periodAnchorDates ?? {}

  const chartHasObservations = chartLabels.some((_, i) =>
    layerSeries.some(s => {
      const v = s.values[i]
      return v != null && Number.isFinite(v)
    }),
  )

  if (
    (!chartLabels.length || !chartHasObservations) &&
    clippedDailyRows.length &&
    ctx.layerIds?.length &&
    fromDate &&
    toDate &&
    fromDate <= toDate
  ) {
    const rebuilt = buildAnalyticsChartFromDailyRows(
      ctx.fieldKey || field?.fieldKey || 'aoi',
      ctx.layerIds,
      clippedDailyRows,
      fromDate,
      toDate,
      ctx.timeAggregation ?? 'day',
    )
    if (rebuilt.labels.length) {
      chartLabels = rebuilt.labels
      displayLabels = rebuilt.displayLabels
      layerSeries = rebuilt.series
      periodAnchorDates = rebuilt.periodAnchorDates
    }
  }

  return buildTimeSeriesReportPayload({
    ...ctx,
    field,
    chartLabels,
    displayLabels,
    layerSeries,
    dailyRows: clippedDailyRows.length ? clippedDailyRows : ctx.dailyRows ?? [],
    periodAnchorDates,
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
        exportDirectory: options?.batchExportDirectory,
        folderPickAttempted: options?.batchFolderPickAttempted,
        dailyByFieldKey: ctx.objectDailyByFieldKey,
        plotNameField: ctx.plotNameField,
        objectLayerFeatures: ctx.objectLayerFeatures,
        signal: options?.signal,
        onProgress: ctx.onBatchAnalyticsProgress,
        onMapSnapshotProgress: options?.onMapSnapshotProgress,
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
        aoiName: ctx.aoiName,
        objectLayerFeatures: ctx.objectLayerFeatures,
        dailyByFieldKey: ctx.objectDailyByFieldKey,
        plotNameField: ctx.plotNameField,
        signal: options?.signal,
        saveTarget: options?.fieldSummarySaveTarget,
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
    case 'agri-object-intel-excel': {
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
        throw new Error(
          'Select at least one agricultural/object plot with geometry before exporting the Agricultural Object Intelligence Report.',
        )
      }
      if (!ctx.fromDate || !ctx.toDate || ctx.fromDate > ctx.toDate) {
        throw new Error('Set a valid Start/End date range before exporting the Agricultural Object Intelligence Report.')
      }
      ctx.onAgriObjectIntelProgress?.({
        stage: 'reading_layer',
        label: 'Generating Agricultural Intelligence Report...',
        done: 0,
        total: plots.length,
      })
      const model = await buildAgriculturalObjectIntelligenceModel({
        plots,
        features: ctx.objectLayerFeatures,
        layerName: ctx.objectLayerName || ctx.aoiName || ctx.farmName || 'Selected layer',
        fromDate: ctx.fromDate,
        toDate: ctx.toDate,
        acquisitionDate: ctx.acquisitionDate,
        layerIds: ctx.layerIds,
        dailyByFieldKey: ctx.objectDailyByFieldKey,
        signal: options?.signal,
        onProgress: ctx.onAgriObjectIntelProgress,
      })
      ctx.onAgriObjectIntelProgress?.({
        stage: 'building_excel',
        label: 'Building Excel report',
        done: 1,
        total: 1,
      })
      await generateAgriculturalObjectIntelligenceExcel(model)
      ctx.onAgriObjectIntelProgress?.({
        stage: 'completed',
        label: 'Download Agricultural Intelligence Report.xlsx',
        done: 1,
        total: 1,
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
