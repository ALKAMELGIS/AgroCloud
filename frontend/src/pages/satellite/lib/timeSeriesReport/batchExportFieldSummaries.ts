import type { CropAlertFieldInput } from '../../../../lib/siCropAlertEngine'
import type { ImageryTimeAggregation } from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import {
  aggregateFieldSummaryPortfolio,
  buildFieldSummaryModel,
  type FieldSummaryModel,
  type FieldSummaryPortfolioStats,
} from './buildFieldSummaryModel'
import { resolveBatchPlotDisplayName } from './batchExportAnalyticsReportsExcel'
import { fetchPlotFieldDailyWithRetry } from './fetchPlotTimeSeriesAnalytics'
import { generateFieldSummaryExcel } from './generateFieldSummaryExcel'

const SUMMARY_LAYER_IDS = ['NDVI', 'NDMI', 'NDWI', 'NDRE', 'SAVI'] as const

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
}

export type BatchExportFieldSummariesInput = {
  plots: CropAlertFieldInput[]
  layerIds?: string[]
  fromDate: string
  toDate: string
  /** Ignored — export is always a single Excel sheet table. */
  mode?: FieldSummaryExportMode
  timeAggregation?: ImageryTimeAggregation
  projectName?: string
  signal?: AbortSignal
  onProgress?: (progress: BatchFieldSummaryProgress) => void
}

export type BatchExportFieldSummariesDeps = {
  fetchDaily?: typeof fetchPlotFieldDailyWithRetry
  buildModel?: typeof buildFieldSummaryModel
  buildPortfolio?: typeof aggregateFieldSummaryPortfolio
  saveExcel?: (input: {
    summaries: FieldSummaryModel[]
    portfolio?: FieldSummaryPortfolioStats | null
    fromDate: string
    toDate: string
    projectName?: string
    filename?: string
  }) => void | Promise<void>
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
 * Sequentially analyze every plot with geometry, then download one Excel workbook
 * with a single "Field Summaries" sheet (one row per field).
 */
export async function batchExportFieldSummaries(
  input: BatchExportFieldSummariesInput,
  deps: BatchExportFieldSummariesDeps = {},
): Promise<BatchFieldSummaryResult> {
  const fetchDaily = deps.fetchDaily ?? fetchPlotFieldDailyWithRetry
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
  const startedAt = Date.now()
  const total = plots.length
  const errors: BatchFieldSummaryError[] = []
  const succeededSummaries: FieldSummaryModel[] = []
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
      const dailyRows = await fetchDaily(plot, ids, fromDate, toDate, input.signal)
      throwIfAborted(input.signal)

      const summary = buildModel({
        plot,
        dailyRows,
        fromDate,
        toDate,
      })
      succeededSummaries.push(summary)
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
  }

  let portfolio: FieldSummaryPortfolioStats | undefined
  if (!aborted && succeededSummaries.length > 0) {
    portfolio = buildPortfolio(succeededSummaries)
    await saveExcel({
      summaries: succeededSummaries,
      portfolio,
      fromDate,
      toDate,
      projectName: input.projectName,
      filename: 'Field_Summaries_Table.xlsx',
    })
  }

  return {
    succeeded,
    failed,
    errors,
    aborted,
    mode: 'combined',
    portfolio,
  }
}
