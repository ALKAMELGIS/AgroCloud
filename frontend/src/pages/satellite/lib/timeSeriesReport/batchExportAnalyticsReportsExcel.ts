import type { CropAlertFieldInput } from '../../../../lib/siCropAlertEngine'
import type { SentinelHubDailyIndexMeans } from '../../../../lib/sentinelHubStatisticsApi'
import type { ImageryTimeAggregation } from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import { cleanAoiPlotDisplayId, looksLikeLayerFileId } from './aoiExcelExportShared'
import {
  buildDayChartFromDailyRows,
  buildTimeSeriesReportPayload,
  type BuildTimeSeriesReportPayloadInput,
} from './buildTimeSeriesReportPayload'
import { fetchPlotFieldDailyWithRetry } from './fetchPlotTimeSeriesAnalytics'
import {
  generateTimeSeriesReportExcel,
  sanitizeTimeSeriesReportExcelFilename,
} from './generateTimeSeriesReportExcel'
import type { TimeSeriesReportPayload } from './timeSeriesReportTypes'

const DEFAULT_DOWNLOAD_GAP_MS = 450

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
  /** Pause between browser downloads so multi-file saves are not blocked. */
  downloadGapMs?: number
  onProgress?: (progress: BatchAnalyticsExportProgress) => void
  onMapSnapshotProgress?: (completed: number, total: number) => void
}

/** Injectable deps for unit tests. */
export type BatchExportAnalyticsReportsExcelDeps = {
  fetchDaily?: typeof fetchPlotFieldDailyWithRetry
  buildPayload?: (input: BuildTimeSeriesReportPayloadInput) => Promise<TimeSeriesReportPayload>
  generateExcel?: (
    payload: TimeSeriesReportPayload,
    options?: { filename?: string },
  ) => Promise<void>
  sleep?: (ms: number) => Promise<void>
}

function isAbort(err: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true
  if (err instanceof DOMException && err.name === 'AbortError') return true
  return err instanceof Error && /abort/i.test(err.message)
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
}

function defaultSleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  return new Promise(resolve => setTimeout(resolve, ms))
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
 * Sequentially fetch each field's daily series and download a full Analytics Report Excel
 * workbook (same worksheets/charts as single `excel` export), named from Plot Label.
 */
export async function batchExportAnalyticsReportsExcel(
  input: BatchExportAnalyticsReportsExcelInput,
  deps: BatchExportAnalyticsReportsExcelDeps = {},
): Promise<BatchAnalyticsExportResult> {
  const fetchDaily = deps.fetchDaily ?? fetchPlotFieldDailyWithRetry
  const buildPayload = deps.buildPayload ?? buildTimeSeriesReportPayload
  const generateExcel = deps.generateExcel ?? generateTimeSeriesReportExcel
  const sleep = deps.sleep ?? defaultSleep

  const plots = input.plots.filter(p => p.geometry)
  if (!plots.length) {
    throw new Error('Select at least one field with geometry before batch-exporting Analytics Reports.')
  }

  const layerIds = input.layerIds.map(id => id.trim().toUpperCase()).filter(Boolean)
  const ids = layerIds.length ? layerIds : ['NDVI']
  const fromDate = input.fromDate.trim().slice(0, 10)
  const toDate = input.toDate.trim().slice(0, 10)
  const timeAggregation = input.timeAggregation ?? 'day'
  const downloadGapMs = input.downloadGapMs ?? DEFAULT_DOWNLOAD_GAP_MS
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
      await generateExcel(payload, { filename })
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

    if (i < plots.length - 1 && !input.signal?.aborted) {
      await sleep(downloadGapMs)
    }
  }

  return { succeeded, failed, errors, aborted }
}
