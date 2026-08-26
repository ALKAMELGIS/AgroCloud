import type { CropAlertFieldInput } from '../../../../lib/siCropAlertEngine'
import type { SentinelHubDailyIndexMeans } from '../../../../lib/sentinelHubStatisticsApi'
import type { ImageryTimeAggregation } from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import { resolveBatchPlotExcelFilename, uniqueBatchPlotExcelFilename } from './aoiExcelExportShared'
import type { SiImageryObjectSourceFeature } from '../../utils/siImageryTimeSeriesFields'
import {
  deliverBlobToDirectory,
  ensureBatchDirectoryWritePermission,
  ensureBatchExportOutputDirectory,
  formatBatchOutputFolderLabel,
  cleanupBatchExportWriteTestMarkers,
  verifyBatchExportDirectoryWritable,
} from './batchExportDirectory'
import {
  buildAnalyticsChartFromDailyRows,
  buildTimeSeriesReportPayload,
  type BuildTimeSeriesReportPayloadInput,
} from './buildTimeSeriesReportPayload'
import {
  fetchPlotFieldDailyWithRetry,
  mapPool,
} from './fetchPlotTimeSeriesAnalytics'
import {
  dailyRowsInRange,
  dailyRowsSatisfyExportWindow,
  describeEmptyExportWindow,
} from './plotTimeSeriesDailyRows'
import {
  buildTimeSeriesReportExcelBlob,
  sanitizeTimeSeriesReportExcelFilename,
} from './generateTimeSeriesReportExcel'
import type { TimeSeriesReportPayload } from './timeSeriesReportTypes'

/**
 * Parallel field pipelines: fetch → build → save immediately (files appear one-by-one).
 * Lower concurrency when Map Snapshots are enabled (WMS fetches are heavy).
 */
const BATCH_ANALYTICS_FIELD_CONCURRENCY = 6
const BATCH_ANALYTICS_FIELD_CONCURRENCY_WITH_MAPS = 2

/** Batch Excel uses daily chart axis so every clear scene in the toolbar range is exported. */
const BATCH_ANALYTICS_CHART_AGGREGATION: ImageryTimeAggregation = 'day'

/** Layers required for a usable analytics workbook (ET is optional / derived). */
const BATCH_CORE_LAYER_IDS = ['NDVI', 'NDMI', 'NDWI'] as const

export type BatchAnalyticsExportProgress = {
  done: number
  total: number
  currentName: string
  failed: number
  startedAt: number
  /** Files successfully written to the picked folder so far. */
  savedToFolder?: number
}

/** Standard Serbia analytics workbook indices (matches single-field Excel export). */
const ANALYTICS_REPORT_LAYER_IDS = ['NDVI', 'NDMI', 'NDWI', 'SAVI', 'ET'] as const

export function mergeAnalyticsReportLayerIds(layerIds: string[] | undefined): string[] {
  return [
    ...new Set(
      [...(layerIds ?? []), ...ANALYTICS_REPORT_LAYER_IDS]
        .map(id => id.trim().toUpperCase())
        .filter(Boolean),
    ),
  ]
}

export type BatchAnalyticsExportError = {
  fieldKey: string
  name: string
  message: string
}

export type BatchAnalyticsDeliveryMode = 'folder' | 'download'

export type BatchAnalyticsExportResult = {
  succeeded: number
  failed: number
  errors: BatchAnalyticsExportError[]
  aborted: boolean
  deliveryMode: BatchAnalyticsDeliveryMode
  folderName?: string
  savedToFolderCount?: number
  downloadedCount?: number
}

export type BatchExportAnalyticsReportsExcelInput = {
  plots: CropAlertFieldInput[]
  layerIds: string[]
  fromDate: string
  toDate: string
  timeAggregation?: ImageryTimeAggregation
  mapboxToken?: string
  projectName?: string
  generatedBy?: string
  /** When set (picked from a user gesture), skip the folder dialog. */
  exportDirectory?: FileSystemDirectoryHandle
  /** When true, folder picker was already shown in the click handler — do not call it again. */
  folderPickAttempted?: boolean
  signal?: AbortSignal
  onProgress?: (progress: BatchAnalyticsExportProgress) => void
  onMapSnapshotProgress?: (completed: number, total: number) => void
  /** Reuse zonal daily rows already loaded in the Time Series panel. */
  dailyByFieldKey?: Map<string, SentinelHubDailyIndexMeans[]>
  /** Plot Label dropdown value (Field_Name, Field_ID, …) for Excel filenames. */
  plotNameField?: string
  objectLayerFeatures?: SiImageryObjectSourceFeature[]
}

/** Injectable deps for unit tests. */
export type BatchExportAnalyticsReportsExcelDeps = {
  fetchDaily?: typeof fetchPlotFieldDailyWithRetry
  buildPayload?: (input: BuildTimeSeriesReportPayloadInput) => Promise<TimeSeriesReportPayload>
  writeBlob?: (
    dir: FileSystemDirectoryHandle,
    filename: string,
    blob: Blob,
  ) => Promise<{ savedToFolder: boolean; usedDownloadFallback: boolean }>
  buildBlob?: (payload: TimeSeriesReportPayload) => Promise<Blob>
}

const BATCH_WRITE_MAX_ATTEMPTS = 3

function isAbort(err: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true
  if (err instanceof DOMException && err.name === 'AbortError') return true
  return err instanceof Error && /abort/i.test(err.message)
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
}

export { resolveBatchPlotDisplayName, resolveBatchPlotExcelFilename, uniqueBatchPlotExcelFilename } from './aoiExcelExportShared'

/** Per-layer Day atlas cap — high enough to keep every chart period (matches single Analytics Excel). */
function batchMapSnapshotMaxPerLayer(layerIds: string[], observationCount: number): number {
  const layerCount = Math.max(1, layerIds.filter(Boolean).length)
  const fromLayerBudget = Math.max(12, Math.floor(48 / layerCount))
  return Math.max(observationCount, fromLayerBudget, 36)
}

function uniqueExcelFilename(
  plot: CropAlertFieldInput,
  used: Set<string>,
  namingOptions: {
    plotNameField?: string
    objectLayerFeatures?: SiImageryObjectSourceFeature[]
  },
): string {
  return uniqueBatchPlotExcelFilename(plot, used, {
    ...namingOptions,
    sanitize: stem => sanitizeTimeSeriesReportExcelFilename(stem).replace(/\.xlsx$/i, ''),
  })
}

type FieldPipelineResult =
  | { status: 'ok'; displayName: string; blob: Blob; filename: string }
  | { status: 'fail'; displayName: string; error: BatchAnalyticsExportError }
  | { status: 'aborted'; displayName: string }

type SaveOutcome = 'folder' | 'fail'

/**
 * Per-field pipeline: fetch (or reuse cache) → build workbook → save immediately.
 * Does not wait for all fields before writing the first `.xlsx`.
 */
export async function batchExportAnalyticsReportsExcel(
  input: BatchExportAnalyticsReportsExcelInput,
  deps: BatchExportAnalyticsReportsExcelDeps = {},
): Promise<BatchAnalyticsExportResult> {
  const fetchDaily = deps.fetchDaily ?? fetchPlotFieldDailyWithRetry
  const buildPayload = deps.buildPayload ?? buildTimeSeriesReportPayload
  const buildBlob = deps.buildBlob ?? buildTimeSeriesReportExcelBlob

  const plots = input.plots.filter(p => p.geometry)
  if (!plots.length) {
    throw new Error('Select at least one field with geometry before batch-exporting Analytics Reports.')
  }
  if (!input.exportDirectory) {
    throw new Error('Select a folder before batch-exporting Analytics Reports.')
  }

  const parentDirectory = input.exportDirectory
  let outputDirectory: FileSystemDirectoryHandle = parentDirectory
  let folderLabel = parentDirectory.name

  try {
    await ensureBatchDirectoryWritePermission(parentDirectory)
    await cleanupBatchExportWriteTestMarkers(parentDirectory)
    try {
      await verifyBatchExportDirectoryWritable(parentDirectory)
    } catch {
      /* probe optional — still attempt per-file writes */
    }
    try {
      outputDirectory = await ensureBatchExportOutputDirectory(parentDirectory, input.toDate)
      folderLabel = formatBatchOutputFolderLabel(parentDirectory, outputDirectory)
      try {
        await verifyBatchExportDirectoryWritable(outputDirectory)
      } catch {
        /* OneDrive/synced folders often allow the probe on parent but fail nested writes — use parent. */
        outputDirectory = parentDirectory
        folderLabel = parentDirectory.name
      }
    } catch {
      outputDirectory = parentDirectory
      folderLabel = parentDirectory.name
    }
  } catch {
    outputDirectory = parentDirectory
    folderLabel = parentDirectory.name
  }

  const writeBlob =
    deps.writeBlob ??
    (async (dir: FileSystemDirectoryHandle, filename: string, blob: Blob) =>
      deliverBlobToDirectory(dir, filename, blob, {
        folderOnly: true,
        allowDownloadFallback: false,
      }))

  const namingOptions = {
    plotNameField: input.plotNameField,
    objectLayerFeatures: input.objectLayerFeatures,
  }
  const plotLabel = (plot: CropAlertFieldInput) =>
    resolveBatchPlotExcelFilename(plot, namingOptions)

  const layerIds = mergeAnalyticsReportLayerIds(input.layerIds)
  const ids = layerIds.length ? layerIds : ['NDVI']
  /** Fetch / cache check uses core indices so ET gaps do not block the whole batch. */
  const fetchIds = [...new Set([...BATCH_CORE_LAYER_IDS, ...ids.filter(id => id !== 'ET' && id !== 'SAVI'), 'SAVI'])]
  const fromDate = input.fromDate.trim().slice(0, 10)
  const toDate = input.toDate.trim().slice(0, 10)
  const timeAggregation = BATCH_ANALYTICS_CHART_AGGREGATION
  const startedAt = Date.now()
  const total = plots.length
  const usedNames = new Set<string>()
  const errors: BatchAnalyticsExportError[] = []
  let succeeded = 0
  let failed = 0
  let aborted = false
  let progressDone = 0
  let savedToFolderCount = 0
  let writeLock = Promise.resolve()

  const emit = (currentName: string) => {
    input.onProgress?.({
      done: progressDone,
      total,
      currentName,
      failed,
      startedAt,
      savedToFolder: savedToFolderCount,
    })
  }

  const saveWorkbook = (
    filename: string,
    blob: Blob,
    plot: CropAlertFieldInput,
  ): Promise<SaveOutcome> => {
    const run = writeLock.then(async (): Promise<SaveOutcome> => {
      if (input.signal?.aborted) return 'fail'

      emit(`Saving ${savedToFolderCount + 1}/${total} — ${filename}`)
      try {
        for (let attempt = 0; attempt < BATCH_WRITE_MAX_ATTEMPTS; attempt += 1) {
          if (attempt > 0) {
            try {
              await ensureBatchDirectoryWritePermission(outputDirectory)
            } catch {
              /* continue — try write anyway */
            }
            await new Promise(resolve => window.setTimeout(resolve, 100 * attempt))
          }
          const deliveryResult = await writeBlob(outputDirectory, filename, blob)
          if (deliveryResult.savedToFolder) {
            savedToFolderCount += 1
            emit(`Saved ${savedToFolderCount}/${total} — ${filename}`)
            return 'folder'
          }
        }

        errors.push({
          fieldKey: plot.fieldKey,
          name: plotLabel(plot),
          message: `Could not save "${filename}" to the selected folder. Close the file in Excel if open, then try again.`,
        })
        return 'fail'
      } catch (err) {
        errors.push({
          fieldKey: plot.fieldKey,
          name: plotLabel(plot),
          message: err instanceof Error ? err.message : String(err),
        })
        return 'fail'
      }
    })
    writeLock = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  throwIfAborted(input.signal)
  emit(`Starting batch — writing ${total} Excel files one-by-one…`)

  async function resolveDailyRows(plot: CropAlertFieldInput): Promise<SentinelHubDailyIndexMeans[]> {
    const cached = input.dailyByFieldKey?.get(plot.fieldKey)
    // Soften reuse: only require core indices in the date window (not ET).
    if (
      cached &&
      dailyRowsSatisfyExportWindow(cached, fromDate, toDate, [...BATCH_CORE_LAYER_IDS])
    ) {
      return dailyRowsInRange(cached, fromDate, toDate)
    }
    // Also accept cache that has any NDVI observation in range (chart can still build).
    if (cached) {
      const clipped = dailyRowsInRange(cached, fromDate, toDate)
      if (clipped.some(r => r.ndvi != null && Number.isFinite(r.ndvi))) {
        return clipped
      }
    }

    let rows = await fetchDaily(plot, fetchIds, fromDate, toDate, input.signal)
    let clipped = dailyRowsInRange(rows, fromDate, toDate)
    if (!clipped.length) {
      // Narrower retry without SAVI/ET-heavy set
      rows = await fetchDaily(plot, [...BATCH_CORE_LAYER_IDS], fromDate, toDate, input.signal)
      clipped = dailyRowsInRange(rows, fromDate, toDate)
    }
    return clipped
  }

  async function runFieldPipeline(plot: CropAlertFieldInput): Promise<FieldPipelineResult> {
    throwIfAborted(input.signal)
    const displayName = plotLabel(plot)

    try {
      emit(`Loading ${displayName}…`)
      const dailyRows = await resolveDailyRows(plot)
      throwIfAborted(input.signal)

      if (!dailyRows.length) {
        return {
          status: 'fail',
          displayName,
          error: {
            fieldKey: plot.fieldKey,
            name: displayName,
            message: describeEmptyExportWindow(fromDate, toDate, [...BATCH_CORE_LAYER_IDS]),
          },
        }
      }

      const chart = buildAnalyticsChartFromDailyRows(
        plot.fieldKey,
        ids,
        dailyRows,
        fromDate,
        toDate,
        timeAggregation,
      )
      // If full layer set yields empty axis, rebuild with core layers only.
      const chartOk = chart.labels.length
        ? chart
        : buildAnalyticsChartFromDailyRows(
            plot.fieldKey,
            [...BATCH_CORE_LAYER_IDS],
            dailyRows,
            fromDate,
            toDate,
            timeAggregation,
          )
      if (!chartOk.labels.length) {
        return {
          status: 'fail',
          displayName,
          error: {
            fieldKey: plot.fieldKey,
            name: displayName,
            message: describeEmptyExportWindow(fromDate, toDate, [...BATCH_CORE_LAYER_IDS]),
          },
        }
      }

      const payloadLayerIds = chartOk.labels.length === chart.labels.length ? ids : [...BATCH_CORE_LAYER_IDS]
      const acquisitionDate =
        chartOk.labels[chartOk.labels.length - 1]?.slice(0, 10) || toDate || fromDate

      emit(`Building ${displayName}…`)
      const mapSnapshotMaxPerLayer = batchMapSnapshotMaxPerLayer(payloadLayerIds, chartOk.labels.length)
      const payload = await buildPayload({
        projectName: input.projectName ?? 'AgroCloud Satellite Intelligence',
        generatedBy: input.generatedBy ?? 'AgroCloud',
        field: plot,
        fieldName: displayName,
        fieldKey: plot.fieldKey,
        fromDate,
        toDate,
        acquisitionDate,
        layerIds: payloadLayerIds,
        chartLabels: chartOk.labels,
        displayLabels: chartOk.displayLabels,
        layerSeries: chartOk.series,
        dailyRows,
        mapboxToken: input.mapboxToken,
        batchExportFastPath: true,
        includeMap: false,
        includeMapSnapshots: true,
        includeLulcMapSnapshots: false,
        includeCumulativeMapSnapshots: false,
        includeChangeDetectionMapSnapshots: false,
        includeVegetationCoverageTimeline: false,
        enrichVegetationHistograms: false,
        includeWeatherTimeline: false,
        mapSnapshotAggregation: 'day',
        mapSnapshotMaxPerLayer,
        mapSnapshotConcurrency: 2,
        periodAnchorDates: chartOk.periodAnchorDates,
        timeAggregation,
        signal: input.signal,
        onMapSnapshotProgress: input.onMapSnapshotProgress,
      })
      throwIfAborted(input.signal)

      const blob = await buildBlob(payload)
      const filename = uniqueExcelFilename(plot, usedNames, namingOptions)
      return { status: 'ok', displayName, blob, filename }
    } catch (err) {
      if (isAbort(err, input.signal)) {
        return { status: 'aborted', displayName }
      }
      return {
        status: 'fail',
        displayName,
        error: {
          fieldKey: plot.fieldKey,
          name: displayName,
          message: err instanceof Error ? err.message : String(err),
        },
      }
    }
  }

  await mapPool(
    plots,
    Math.min(BATCH_ANALYTICS_FIELD_CONCURRENCY_WITH_MAPS, plots.length),
    async plot => {
      if (input.signal?.aborted || aborted) return

      const result = await runFieldPipeline(plot)
      if (result.status === 'aborted') {
        aborted = true
        return
      }

      if (result.status === 'fail') {
        failed += 1
        errors.push(result.error)
        progressDone += 1
        emit(`Field ${progressDone}/${total} — ${result.displayName} (failed)`)
        return
      }

      const outcome = await saveWorkbook(result.filename, result.blob, plot)
      if (outcome === 'fail') {
        failed += 1
      } else {
        succeeded += 1
      }
      progressDone += 1
      emit(
        outcome === 'folder'
          ? `Saved ${savedToFolderCount}/${total} — ${result.filename}`
          : `Field ${progressDone}/${total} — ${result.displayName} (save failed)`,
      )
    },
    input.signal,
  ).catch(err => {
    if (isAbort(err, input.signal)) {
      aborted = true
      return
    }
    throw err
  })

  await writeLock

  return {
    succeeded,
    failed,
    errors,
    aborted,
    deliveryMode: 'folder',
    folderName: folderLabel,
    savedToFolderCount,
    downloadedCount: 0,
  }
}
