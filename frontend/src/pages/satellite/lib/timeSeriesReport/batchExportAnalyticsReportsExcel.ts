import type { CropAlertFieldInput } from '../../../../lib/siCropAlertEngine'
import type { SentinelHubDailyIndexMeans } from '../../../../lib/sentinelHubStatisticsApi'
import type { ImageryTimeAggregation } from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import { cleanAoiPlotDisplayId, looksLikeLayerFileId } from './aoiExcelExportShared'
import {
  BATCH_EXPORT_CANCELLED,
  pickBatchExportDirectory,
  writeBlobToDirectory,
} from './batchExportDirectory'
import {
  buildDayChartFromDailyRows,
  buildTimeSeriesReportPayload,
  type BuildTimeSeriesReportPayloadInput,
} from './buildTimeSeriesReportPayload'
import { fetchPlotFieldDailyWithRetry } from './fetchPlotTimeSeriesAnalytics'
import {
  buildTimeSeriesReportExcelBlob,
  sanitizeTimeSeriesReportExcelFilename,
} from './generateTimeSeriesReportExcel'
import type { TimeSeriesReportPayload } from './timeSeriesReportTypes'

export type BatchAnalyticsExportProgress = {
  done: number
  total: number
  currentName: string
  failed: number
  startedAt: number
}

export type BatchAnalyticsExportError = {
  fieldKey: string
  name: string
  message: string
}

export type BatchAnalyticsExportResult = {
  succeeded: number
  failed: number
  errors: BatchAnalyticsExportError[]
  aborted: boolean
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
  signal?: AbortSignal
  onProgress?: (progress: BatchAnalyticsExportProgress) => void
  onMapSnapshotProgress?: (completed: number, total: number) => void
}

/** Injectable deps for unit tests. */
export type BatchExportAnalyticsReportsExcelDeps = {
  fetchDaily?: typeof fetchPlotFieldDailyWithRetry
  buildPayload?: (input: BuildTimeSeriesReportPayloadInput) => Promise<TimeSeriesReportPayload>
  pickDirectory?: (signal?: AbortSignal) => Promise<FileSystemDirectoryHandle>
  writeBlob?: (
    dir: FileSystemDirectoryHandle,
    filename: string,
    blob: Blob,
  ) => Promise<void>
  buildBlob?: (payload: TimeSeriesReportPayload) => Promise<Blob>
}

function isAbort(err: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true
  if (err instanceof DOMException && err.name === 'AbortError') return true
  if (err instanceof Error && err.message === BATCH_EXPORT_CANCELLED) return true
  return err instanceof Error && /abort/i.test(err.message)
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
}

/** Resolve Plot Label display name (farmName after Field Selector labeling). */
export function resolveBatchPlotDisplayName(plot: CropAlertFieldInput): string {
  const name = cleanAoiPlotDisplayId(String(plot.farmName || '').trim())
  if (name && !looksLikeLayerFileId(name)) return name
  const oid = cleanAoiPlotDisplayId(String(plot.objectId || '').trim())
  if (oid && !looksLikeLayerFileId(oid)) return oid
  return 'Plot'
}

function uniqueExcelFilename(displayName: string, used: Set<string>): string {
  const sanitized = sanitizeTimeSeriesReportExcelFilename(displayName)
  const stem = sanitized.replace(/\.xlsx$/i, '')
  let candidate = `${stem}.xlsx`
  let n = 2
  while (used.has(candidate.toLowerCase())) {
    candidate = `${stem}_${n}.xlsx`
    n += 1
  }
  used.add(candidate.toLowerCase())
  return candidate
}

function mapSnapshotMaxPerLayer(layerIds: string[]): number {
  const layerCount = Math.max(1, layerIds.filter(Boolean).length)
  return Math.min(36, Math.max(12, Math.floor(48 / layerCount)))
}

/**
 * Sequentially fetch each field's daily series and write a full Analytics Report Excel
 * workbook into one user-picked folder (same worksheets/charts as single `excel` export),
 * named from Plot Label.
 */
export async function batchExportAnalyticsReportsExcel(
  input: BatchExportAnalyticsReportsExcelInput,
  deps: BatchExportAnalyticsReportsExcelDeps = {},
): Promise<BatchAnalyticsExportResult> {
  const fetchDaily = deps.fetchDaily ?? fetchPlotFieldDailyWithRetry
  const buildPayload = deps.buildPayload ?? buildTimeSeriesReportPayload
  const pickDirectory = deps.pickDirectory ?? pickBatchExportDirectory
  const writeBlob = deps.writeBlob ?? writeBlobToDirectory
  const buildBlob = deps.buildBlob ?? buildTimeSeriesReportExcelBlob

  const plots = input.plots.filter(p => p.geometry)
  if (!plots.length) {
    throw new Error('Select at least one field with geometry before batch-exporting Analytics Reports.')
  }

  const layerIds = input.layerIds.map(id => id.trim().toUpperCase()).filter(Boolean)
  const ids = layerIds.length ? layerIds : ['NDVI']
  const fromDate = input.fromDate.trim().slice(0, 10)
  const toDate = input.toDate.trim().slice(0, 10)
  const timeAggregation = input.timeAggregation ?? 'day'
  const startedAt = Date.now()
  const total = plots.length
  const usedNames = new Set<string>()
  const errors: BatchAnalyticsExportError[] = []
  let succeeded = 0
  let failed = 0
  let aborted = false

  const emit = (done: number, currentName: string) => {
    input.onProgress?.({ done, total, currentName, failed, startedAt })
  }

  let directory: FileSystemDirectoryHandle
  try {
    directory = await pickDirectory(input.signal)
  } catch (err) {
    if (isAbort(err, input.signal)) {
      throw err instanceof Error ? err : new DOMException(BATCH_EXPORT_CANCELLED, 'AbortError')
    }
    throw err
  }

  for (let i = 0; i < plots.length; i++) {
    throwIfAborted(input.signal)
    const plot = plots[i]!
    const displayName = resolveBatchPlotDisplayName(plot)
    emit(i, displayName)

    try {
      const dailyRows: SentinelHubDailyIndexMeans[] = await fetchDaily(
        plot,
        ids,
        fromDate,
        toDate,
        input.signal,
      )
      throwIfAborted(input.signal)

      const chart = buildDayChartFromDailyRows(ids, dailyRows, fromDate, toDate)
      const acquisitionDate =
        chart.labels[chart.labels.length - 1]?.slice(0, 10) || toDate || fromDate

      const payload = await buildPayload({
        projectName: input.projectName ?? 'AgroCloud Satellite Intelligence',
        generatedBy: input.generatedBy ?? 'AgroCloud',
        field: plot,
        fieldName: displayName,
        fieldKey: plot.fieldKey,
        fromDate,
        toDate,
        acquisitionDate,
        layerIds: ids,
        chartLabels: chart.labels,
        displayLabels: chart.displayLabels,
        layerSeries: chart.series,
        dailyRows,
        mapboxToken: input.mapboxToken,
        includeMap: true,
        includeMapSnapshots: true,
        includeLulcMapSnapshots: false,
        includeCumulativeMapSnapshots: false,
        includeChangeDetectionMapSnapshots: false,
        includeVegetationCoverageTimeline: true,
        periodAnchorDates: chart.periodAnchorDates,
        timeAggregation,
        mapSnapshotAggregation: 'day',
        mapSnapshotMaxPerLayer: mapSnapshotMaxPerLayer(ids),
        signal: input.signal,
        onMapSnapshotProgress: input.onMapSnapshotProgress,
      })
      throwIfAborted(input.signal)

      const filename = uniqueExcelFilename(displayName, usedNames)
      const blob = await buildBlob(payload)
      await writeBlob(directory, filename, blob)
      succeeded += 1
    } catch (err) {
      if (isAbort(err, input.signal)) {
        aborted = true
        break
      }
      failed += 1
      errors.push({
        fieldKey: plot.fieldKey,
        name: displayName,
        message: err instanceof Error ? err.message : String(err),
      })
    }

    emit(i + 1, displayName)

    // Yield so progress UI can paint between fields (no download gap needed).
    if (i < plots.length - 1 && !input.signal?.aborted) {
      await Promise.resolve()
    }
  }

  return { succeeded, failed, errors, aborted }
}
