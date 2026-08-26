import type { CropAlertFieldInput } from '../../../../lib/siCropAlertEngine'
import type { SentinelHubDailyIndexMeans } from '../../../../lib/sentinelHubStatisticsApi'
import type { ImageryTimeAggregation } from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import type { SiImageryObjectSourceFeature } from '../../utils/siImageryTimeSeriesFields'
import {
  aggregateFieldSummaryPortfolio,
  buildFieldSummaryModel,
  type FieldSummaryModel,
  type FieldSummaryPortfolioStats,
} from './buildFieldSummaryModel'
import { resolveBatchPlotExcelFilename } from './aoiExcelExportShared'
import { fetchPlotFieldDailyWithRetry, mapPool, resolveBatchDailyByFieldKey, BATCH_DAILY_FETCH_CONCURRENCY } from './fetchPlotTimeSeriesAnalytics'
import { defaultFieldReportFilename } from './fieldSummaryExecutiveExcel'
import {
  generateFieldSummaryExcel,
  type FieldSummaryExcelDelivery,
} from './generateFieldSummaryExcel'
import type { FieldSummarySaveTarget } from './batchExportDirectory'
import { buildPlotLayerAttributesMap } from './plotLayerAttributes'
import { fetchBatchEt0ByField } from './waterRequirementEt0'
import { fetchBatchAetByField } from './waterRequirementWapor'

const SUMMARY_LAYER_IDS = ['NDVI', 'NDMI', 'NDWI', 'NDRE', 'SAVI'] as const

/** Build field summary models in parallel after daily stats are prefetched. */
const BATCH_SUMMARY_MODEL_CONCURRENCY = 8

/** @deprecated Field Summary is always one Excel table; kept for UI compatibility. */
export type FieldSummaryExportMode = 'individual' | 'combined'

export type BatchFieldSummaryProgress = {
  done: number
  total: number
  currentName: string
  failed: number
  startedAt: number
}

export type BatchFieldSummaryError = {
  fieldKey: string
  name: string
  message: string
}

export type BatchFieldSummaryResult = {
  succeeded: number
  failed: number
  errors: BatchFieldSummaryError[]
  aborted: boolean
  mode: FieldSummaryExportMode
  portfolio?: FieldSummaryPortfolioStats
  delivery?: FieldSummaryExcelDelivery
}

export type BatchExportFieldSummariesInput = {
  plots: CropAlertFieldInput[]
  layerIds?: string[]
  fromDate: string
  toDate: string
  /** Ignored — export is always a single executive workbook. */
  mode?: FieldSummaryExportMode
  timeAggregation?: ImageryTimeAggregation
  projectName?: string
  aoiName?: string
  /** Full GeoJSON features with layer attributes (Field_Name, Crop_Type, Irrigation, …). */
  objectLayerFeatures?: SiImageryObjectSourceFeature[]
  /** Reuse zonal daily rows already loaded in the Time Series panel (same date range). */
  dailyByFieldKey?: Map<string, SentinelHubDailyIndexMeans[]>
  signal?: AbortSignal
  onProgress?: (progress: BatchFieldSummaryProgress) => void
  /** Pre-picked save target from the Export Excel click (File System Access API). */
  saveTarget?: FieldSummarySaveTarget
  /** Plot Label dropdown value for row labels in the executive workbook. */
  plotNameField?: string
}

export type BatchExportFieldSummariesDeps = {
  fetchDaily?: typeof fetchPlotFieldDailyWithRetry
  resolveDaily?: typeof resolveBatchDailyByFieldKey
  buildModel?: typeof buildFieldSummaryModel
  buildPortfolio?: typeof aggregateFieldSummaryPortfolio
  saveExcel?: (input: {
    summaries: FieldSummaryModel[]
    portfolio?: FieldSummaryPortfolioStats | null
    fromDate: string
    toDate: string
    projectName?: string
    filename?: string
    aoiName?: string
    et0ByFieldKey?: Map<string, number>
    aetByFieldKey?: Map<string, number>
    fieldKeys?: string[]
    saveTarget?: FieldSummarySaveTarget
  }) => Promise<FieldSummaryExcelDelivery | void> | FieldSummaryExcelDelivery | void
}

function isAbort(err: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true
  if (err instanceof DOMException && err.name === 'AbortError') return true
  return err instanceof Error && /abort/i.test(err.message)
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
}

/** Always fetch NDVI/NDMI/NDWI/NDRE/SAVI; merge any selected chart layers. */
export function mergeFieldSummaryLayerIds(layerIds: string[] | undefined): string[] {
  return [
    ...new Set(
      [...(layerIds ?? []), ...SUMMARY_LAYER_IDS]
        .map(id => id.trim().toUpperCase())
        .filter(Boolean),
    ),
  ]
}

/**
 * Parallel-fetch zonal stats for every plot, then build one executive Excel workbook.
 */
export async function batchExportFieldSummaries(
  input: BatchExportFieldSummariesInput,
  deps: BatchExportFieldSummariesDeps = {},
): Promise<BatchFieldSummaryResult> {
  const fetchDaily = deps.fetchDaily ?? fetchPlotFieldDailyWithRetry
  const resolveDaily =
    deps.resolveDaily ??
    ((plots, layerIds, fromDate, toDate, opts) =>
      resolveBatchDailyByFieldKey(plots, layerIds, fromDate, toDate, {
        ...opts,
        fetchDaily,
      }))
  const buildModel = deps.buildModel ?? buildFieldSummaryModel
  const buildPortfolio = deps.buildPortfolio ?? aggregateFieldSummaryPortfolio
  const saveExcel = deps.saveExcel ?? generateFieldSummaryExcel

  const plots = input.plots.filter(p => p.geometry)
  if (!plots.length) {
    throw new Error('Select at least one field with geometry before batch-exporting Field Summaries.')
  }

  const ids = mergeFieldSummaryLayerIds(input.layerIds)
  const fromDate = input.fromDate.trim().slice(0, 10)
  const toDate = input.toDate.trim().slice(0, 10)
  const layerAttributesByKey = buildPlotLayerAttributesMap(input.objectLayerFeatures)
  const plotLabel = (plot: CropAlertFieldInput) =>
    resolveBatchPlotExcelFilename(plot, {
      plotNameField: input.plotNameField,
      objectLayerFeatures: input.objectLayerFeatures,
    })
  const startedAt = Date.now()
  const total = plots.length
  const errors: BatchFieldSummaryError[] = []
  const succeededSummaries: FieldSummaryModel[] = []
  const summaryFieldKeys: string[] = []
  const plotByFieldKey = new Map(plots.map(p => [p.fieldKey, p]))
  let succeeded = 0
  let failed = 0
  let aborted = false

  const emit = (done: number, currentName: string) => {
    input.onProgress?.({ done, total, currentName, failed, startedAt })
  }

  throwIfAborted(input.signal)
  emit(0, 'Loading satellite data…')

  let dailyByFieldKey: Map<string, SentinelHubDailyIndexMeans[]>
  let prefetchErrors: Map<string, string>
  try {
    const prefetch = await resolveDaily(plots, ids, fromDate, toDate, {
      reuseDaily: input.dailyByFieldKey,
      signal: input.signal,
      concurrency: BATCH_DAILY_FETCH_CONCURRENCY,
      onProgress: (done, fetchTotal) => {
        emit(
          Math.min(done, fetchTotal),
          done >= fetchTotal ? `Building summaries (0/${fetchTotal})…` : `Loading satellite data (${done}/${fetchTotal})…`,
        )
      },
    })
    dailyByFieldKey = prefetch.dailyByFieldKey
    prefetchErrors = prefetch.fetchErrors
  } catch (err) {
    if (isAbort(err, input.signal)) {
      return { succeeded: 0, failed: 0, errors, aborted: true, mode: 'combined' }
    }
    throw err
  }

  type ModelBuildResult =
    | { ok: true; summary: FieldSummaryModel; fieldKey: string; displayName: string }
    | { ok: false; error: BatchFieldSummaryError; displayName: string }

  let modelResults: ModelBuildResult[]
  let et0ByFieldKey: Map<string, number> | undefined
  let aetByFieldKey: Map<string, number> | undefined
  const etPrefetchEntries = plots.map(plot => ({
    fieldKey: plot.fieldKey,
    plot,
    observationDate: toDate,
  }))

  emit(0, 'Building summaries & ET metrics…')
  try {
    const [builtModels, et0Result, aetResult] = await Promise.all([
      mapPool(
        plots,
        BATCH_SUMMARY_MODEL_CONCURRENCY,
        async plot => {
          throwIfAborted(input.signal)
          const displayName = plotLabel(plot)
          const fetchError = prefetchErrors.get(plot.fieldKey)
          if (fetchError) {
            return {
              ok: false as const,
              displayName,
              error: {
                fieldKey: plot.fieldKey,
                name: displayName,
                message: fetchError,
              },
            }
          }

          try {
            const dailyRows = dailyByFieldKey.get(plot.fieldKey) ?? []
            throwIfAborted(input.signal)
            const summary = buildModel({
              plot,
              dailyRows,
              fromDate,
              toDate,
              layerAttributes: layerAttributesByKey.get(plot.fieldKey) ?? null,
              objectLayerFeatures: input.objectLayerFeatures,
            })
            return { ok: true as const, summary, fieldKey: plot.fieldKey, displayName }
          } catch (err) {
            if (isAbort(err, input.signal)) throw err
            return {
              ok: false as const,
              displayName,
              error: {
                fieldKey: plot.fieldKey,
                name: displayName,
                message: err instanceof Error ? err.message : String(err),
              },
            }
          }
        },
        input.signal,
      ),
      fetchBatchEt0ByField(etPrefetchEntries, fromDate, toDate, input.signal).catch(() => undefined),
      fetchBatchAetByField(etPrefetchEntries, input.signal).catch(() => undefined),
    ])
    modelResults = builtModels
    et0ByFieldKey = et0Result
    aetByFieldKey = aetResult
  } catch (err) {
    if (isAbort(err, input.signal)) {
      return { succeeded, failed, errors, aborted: true, mode: 'combined' }
    }
    throw err
  }

  for (let i = 0; i < modelResults.length; i++) {
    const result = modelResults[i]!
    if (result.ok) {
      succeededSummaries.push(result.summary)
      summaryFieldKeys.push(result.fieldKey)
      succeeded += 1
    } else {
      failed += 1
      errors.push(result.error)
    }
    emit(i + 1, result.displayName)
  }

  let portfolio: FieldSummaryPortfolioStats | undefined
  let delivery: FieldSummaryExcelDelivery | undefined
  if (!aborted && succeededSummaries.length > 0) {
    emit(plots.length, 'Writing executive workbook…')
    portfolio = buildPortfolio(succeededSummaries)

    delivery =
      (await saveExcel({
        summaries: succeededSummaries.map((s, idx) => ({
          ...s,
          et0MmDay: et0ByFieldKey?.get(summaryFieldKeys[idx]!) ?? s.et0MmDay ?? null,
        })),
        portfolio,
        fromDate,
        toDate,
        projectName: input.projectName,
        aoiName: input.aoiName,
        filename: defaultFieldReportFilename(input.aoiName, toDate),
        et0ByFieldKey,
        aetByFieldKey,
        fieldKeys: summaryFieldKeys,
        saveTarget: input.saveTarget,
      })) ?? undefined
  }

  return {
    succeeded,
    failed,
    errors,
    aborted,
    mode: 'combined',
    portfolio,
    delivery,
  }
}
