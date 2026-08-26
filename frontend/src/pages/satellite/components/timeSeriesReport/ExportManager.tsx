import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CSSProperties, RefObject } from 'react'
import type { Chart as ChartJS } from 'chart.js'
import type { ImageryChartType, ImageryTimeAggregation } from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import type { ImageryTimeSeriesLayerSeries } from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import type { CropAlertFieldInput } from '../../../../lib/siCropAlertEngine'
import type { SentinelHubDailyIndexMeans } from '../../../../lib/sentinelHubStatisticsApi'
import {
  beginBatchExportDirectoryPick,
  beginBatchExportDirectoryPickFromGesture,
  beginBatchFieldSummarySavePick,
  batchExportDirectoryLabel,
  defaultFieldReportFilename,
  isBatchDirectoryPickerSupported,
  isBatchExportCancelled,
  isFieldSummarySavePickerSupported,
  rememberBatchExportDirectory,
  resolveWritableBatchExportDirectory,
  verifyBatchExportDirectoryWritable,
  BATCH_EXPORT_PERMISSION_DENIED,
  BATCH_EXPORT_PICKER_BLOCKED,
  BATCH_EXPORT_PICKER_BUSY,
  runTimeSeriesExport,
  type BatchAnalyticsExportProgress,
  type BatchFieldSummaryProgress,
  type FieldSummarySaveTarget,
  type TimeSeriesExportKind,
} from '../../lib/timeSeriesReport'
import type { AgriObjectIntelProgress, AgriObjectSourceFeature } from '../../lib/timeSeriesReport/buildAgriculturalObjectIntelligenceModel'
import { AGRI_OBJECT_INTEL_STAGE_LABELS } from '../../lib/timeSeriesReport/buildAgriculturalObjectIntelligenceModel'
import { SI_IMAGERY_PLOT_LABEL_AUTO } from '../../utils/siImageryTimeSeriesFields'
import './ExportManager.css'

export type TimeSeriesExportLabelAttribute = { name: string; label: string }

export type TimeSeriesExportManagerProps = {
  disabled?: boolean
  field: CropAlertFieldInput | null
  fieldName: string
  fieldKey: string
  fromDate: string
  toDate: string
  acquisitionDate: string
  layerIds: string[]
  chartLabels: string[]
  displayLabels: string[]
  layerSeries: ImageryTimeSeriesLayerSeries[]
  dailyRows: SentinelHubDailyIndexMeans[]
  chartRef: React.RefObject<ChartJS | null>
  chartType?: ImageryChartType
  mapboxToken?: string
  periodAnchorDates?: Record<string, string>
  timeAggregation?: ImageryTimeAggregation
  projectName?: string
  generatedBy?: string
  /** All plots in the active AOI layer. */
  plots?: CropAlertFieldInput[]
  farmName?: string
  aoiName?: string
  /** @deprecated Unused — multi-AOI uses the same export menu. */
  priorityReportOnly?: boolean
  /** Layer attribute fields available for plot/sheet naming (Name, OBJECTID, Plot_ID, …). */
  labelAttributes?: TimeSeriesExportLabelAttribute[]
  /** Current Label field from the Time Series toolbar. */
  labelAttribute?: string
  /** Keep toolbar Label field in sync when the export dialog picks a field. */
  onLabelAttributeChange?: (attribute: string) => void
  /** Re-resolve plots with the chosen label attribute for sheet / row names. */
  resolvePlotsForLabel?: (labelAttribute: string) => CropAlertFieldInput[]
  /** Re-resolve the active single field (Weather / PDF) with the chosen label. */
  resolveFieldForLabel?: (labelAttribute: string) => CropAlertFieldInput | null
  /** Full GeoJSON features (with properties) for Agricultural Object Intelligence. */
  objectLayerFeatures?: AgriObjectSourceFeature[]
  objectLayerName?: string
  objectDailyByFieldKey?: Map<string, import('../../../../lib/sentinelHubStatisticsApi').SentinelHubDailyIndexMeans[]>
}

type ExportProgressState = {
  done: number
  total: number
  currentName?: string
  failed?: number
  startedAt?: number
  savedToFolder?: number
  mode?: 'plots' | 'batch' | 'agri-intel'
}

const EXPORT_OPTIONS: Array<{ kind: TimeSeriesExportKind; label: string; icon: string; primary?: boolean; hint?: string }> = [
  { kind: 'pdf', label: 'Executive PDF', icon: 'fa-file-pdf', primary: true },
  { kind: 'docx', label: 'Intelligence (Word)', icon: 'fa-file-word', hint: 'Intelligence Report (Word)' },
  { kind: 'lulc-docx', label: 'LULC (Word)', icon: 'fa-layer-group', hint: 'LULC Report (Word)' },
  { kind: 'excel', label: 'Analytics (Excel)', icon: 'fa-file-excel', hint: 'Analytics Report (Excel)' },
  {
    kind: 'agri-object-intel-excel',
    label: 'Agri Intel (Excel)',
    icon: 'fa-seedling',
    hint: 'Agricultural Object Intelligence (Excel)',
  },
  {
    kind: 'batch-excel',
    label: 'Batch Analytics (Excel)',
    icon: 'fa-folder-tree',
    hint: 'Batch Export - Analytics Reports (Excel)',
  },
  {
    kind: 'batch-field-summary',
    label: 'Batch Summary (Excel)',
    icon: 'fa-table',
    hint: 'Batch Export → Field Summary (Excel)',
  },
  {
    kind: 'weather-excel',
    label: 'Weather / Indices (Excel)',
    icon: 'fa-cloud-sun-rain',
    hint: 'Weather / Indices Analysis (Excel)',
  },
  { kind: 'png', label: 'Figure (PNG)', icon: 'fa-image' },
  { kind: 'geojson', label: 'AOI (GeoJSON)', icon: 'fa-map' },
]

const LABEL_DATE_CONFIRM_KINDS = new Set<TimeSeriesExportKind>(['weather-excel'])
const BATCH_EXPORT_KINDS = new Set<TimeSeriesExportKind>(['batch-excel', 'batch-field-summary'])
const AGRI_OBJECT_INTEL_KIND: TimeSeriesExportKind = 'agri-object-intel-excel'

function formatEta(ms: number): string {
  const sec = Math.max(0, Math.round(ms / 1000))
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  const rem = sec % 60
  if (min < 60) return rem > 0 ? `${min}m ${rem}s` : `${min}m`
  const hr = Math.floor(min / 60)
  const remMin = min % 60
  return remMin > 0 ? `${hr}h ${remMin}m` : `${hr}h`
}

function formatBusyLabel(progress: ExportProgressState | null, _tick: number): string {
  if (!progress || progress.total <= 0) {
    return progress?.currentName || 'Exporting...'
  }
  if (progress.mode === 'agri-intel') {
    return progress.currentName || 'Generating Agricultural Intelligence Report...'
  }
  if (progress.mode === 'batch' && progress.currentName) {
    const current = Math.min(progress.total, progress.done < progress.total ? progress.done + 1 : progress.done)
    const saved =
      progress.savedToFolder != null && progress.savedToFolder > 0
        ? ` · ${progress.savedToFolder} saved`
        : ''
    let label = `Field ${current}/${progress.total} - ${progress.currentName}${saved}`
    if (progress.done > 0 && progress.done < progress.total && progress.startedAt) {
      const elapsed = Date.now() - progress.startedAt
      const avg = elapsed / progress.done
      const etaMs = avg * (progress.total - progress.done)
      label += ` (~${formatEta(etaMs)})`
    }
    return label
  }
  return `Plots ${progress.done}/${progress.total}...`
}

type ExportPopoverAnchor = {
  top: number
  left: number
  width: number
  placement: 'above' | 'below'
}

function useExportPopoverAnchor(
  rootRef: RefObject<HTMLDivElement | null>,
  active: boolean,
): ExportPopoverAnchor | null {
  const [anchor, setAnchor] = useState<ExportPopoverAnchor | null>(null)

  useLayoutEffect(() => {
    if (!active) {
      setAnchor(null)
      return
    }
    const sync = () => {
      const trigger = rootRef.current?.querySelector('.acp-ts-export__trigger') as HTMLElement | null
      if (!trigger) return
      const rect = trigger.getBoundingClientRect()
      const width = Math.min(212, Math.max(196, rect.width))
      const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8)
      const spaceBelow = window.innerHeight - rect.bottom - 8
      const spaceAbove = rect.top - 8
      const placement = spaceBelow >= 200 || spaceBelow >= spaceAbove ? 'below' : 'above'
      const top = placement === 'below' ? rect.bottom + 6 : rect.top - 6
      setAnchor({ top, left, width, placement })
    }
    sync()
    window.addEventListener('resize', sync)
    window.addEventListener('scroll', sync, true)
    return () => {
      window.removeEventListener('resize', sync)
      window.removeEventListener('scroll', sync, true)
    }
  }, [active, rootRef])

  return anchor
}

export function TimeSeriesExportManager({
  disabled,
  field,
  fieldName,
  fieldKey,
  fromDate,
  toDate,
  acquisitionDate,
  layerIds,
  chartLabels,
  displayLabels,
  layerSeries,
  dailyRows,
  chartRef,
  chartType = 'line',
  mapboxToken,
  periodAnchorDates,
  timeAggregation = 'day',
  projectName,
  generatedBy,
  plots,
  farmName,
  aoiName,
  labelAttributes = [],
  labelAttribute = SI_IMAGERY_PLOT_LABEL_AUTO,
  onLabelAttributeChange,
  resolvePlotsForLabel,
  resolveFieldForLabel,
  objectLayerFeatures,
  objectLayerName,
  objectDailyByFieldKey,
}: TimeSeriesExportManagerProps) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [mapProgress, setMapProgress] = useState<ExportProgressState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [statusTone, setStatusTone] = useState<'success' | 'cancelled' | 'info'>('success')
  const [pendingKind, setPendingKind] = useState<TimeSeriesExportKind | null>(null)
  const [pendingLabel, setPendingLabel] = useState(labelAttribute)
  const [etaTick, setEtaTick] = useState(0)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const portalRef = useRef<HTMLDivElement | null>(null)
  const batchPickInProgressRef = useRef(false)
  const statusClearRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const plotsWithGeometry = useMemo(
    () => (plots ?? []).filter(p => p.geometry).length,
    [plots],
  )
  const batchExcelEnabled = plotsWithGeometry >= 1 && !!fromDate && !!toDate && fromDate <= toDate
  const batchFieldSummaryEnabled = batchExcelEnabled

  useEffect(() => {
    if (!open && !pendingKind) return
    const onDoc = (e: MouseEvent) => {
      if (batchPickInProgressRef.current) return
      const target = e.target as Node
      if (rootRef.current?.contains(target) || portalRef.current?.contains(target)) return
      setOpen(false)
      setPendingKind(null)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open, pendingKind])

  useEffect(() => {
    if (!pendingKind) return
    setPendingLabel(labelAttribute)
  }, [pendingKind, labelAttribute])

  useEffect(() => {
    if (!busy || mapProgress?.mode !== 'batch' || !mapProgress.startedAt) return
    const id = setInterval(() => setEtaTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [busy, mapProgress?.mode, mapProgress?.startedAt])

  useEffect(() => {
    return () => {
      if (statusClearRef.current) clearTimeout(statusClearRef.current)
    }
  }, [])

  const showStatus = useCallback((message: string, tone: 'success' | 'cancelled' | 'info' = 'success', persistMs = 8000) => {
    if (statusClearRef.current) clearTimeout(statusClearRef.current)
    setStatusTone(tone)
    setStatus(message)
    statusClearRef.current = setTimeout(() => {
      setStatus(null)
      statusClearRef.current = null
    }, persistMs)
  }, [])

  const runExport = useCallback(
    async (
      kind: TimeSeriesExportKind,
      labelOverride?: string,
      batchExportDirectory?: FileSystemDirectoryHandle,
      batchFolderPickAttempted = false,
      fieldSummarySaveTarget?: FieldSummarySaveTarget,
    ) => {
      setOpen(false)
      setPendingKind(null)
      setError(null)
      setStatus(null)
      setBusy(true)
      setMapProgress(null)

      const chosenLabel = labelOverride ?? labelAttribute
      if (labelOverride != null && labelOverride !== labelAttribute) {
        onLabelAttributeChange?.(labelOverride)
      }
      const labeledPlots = resolvePlotsForLabel?.(chosenLabel) ?? plots
      const labeledField = resolveFieldForLabel?.(chosenLabel) ?? field
      const labeledFieldName = labeledField?.farmName?.trim() || fieldName
      // Ensure AOI geometry is present for Map Snapshots (field, labeled field, or any plot).
      const geometryFallback =
        labeledField?.geometry ??
        field?.geometry ??
        labeledPlots?.find(p => p.geometry)?.geometry ??
        plots?.find(p => p.geometry)?.geometry ??
        null
      const fieldStub: CropAlertFieldInput = {
        fieldKey: fieldKey || 'aoi',
        objectId: '',
        farmName: labeledFieldName || 'AOI',
        farmCode: '',
        structureType: '',
        country: '',
        city: '',
        centroid: [0, 0],
      }
      const fieldForExport: CropAlertFieldInput | null = geometryFallback
        ? {
            ...(labeledField ?? field ?? fieldStub),
            geometry: geometryFallback,
          }
        : labeledField ?? field
      try {
        const result = await runTimeSeriesExport(
          kind,
          {
            field: fieldForExport,
            fieldName: labeledFieldName,
            fieldKey: fieldForExport?.fieldKey || fieldKey,
            fromDate,
            toDate,
            acquisitionDate,
            layerIds,
            chartLabels,
            displayLabels,
            layerSeries,
            dailyRows,
            mapboxToken,
            periodAnchorDates,
            timeAggregation,
            chartRef,
            chartType,
            config: { projectName, generatedBy },
            plots: labeledPlots,
            farmName: fieldForExport?.farmName || farmName || labeledFieldName,
            aoiName,
            plotNameField: chosenLabel || undefined,
            objectLayerFeatures,
            objectLayerName,
            objectDailyByFieldKey,
            onAgriObjectIntelProgress: (progress: AgriObjectIntelProgress) =>
              setMapProgress({
                done: progress.done,
                total: Math.max(1, progress.total),
                currentName:
                  progress.stage === 'completed'
                    ? 'Download Agricultural Intelligence Report.xlsx'
                    : progress.stage === 'reading_layer'
                      ? 'Generating Agricultural Intelligence Report...'
                      : AGRI_OBJECT_INTEL_STAGE_LABELS[progress.stage] || progress.label,
                mode: 'agri-intel',
              }),
            onPlotAnalyticsProgress: (done, total) =>
              setMapProgress({ done, total, mode: 'plots' }),
            onBatchAnalyticsProgress: (progress: BatchAnalyticsExportProgress) =>
              setMapProgress({
                done: progress.done,
                total: progress.total,
                currentName: progress.currentName,
                failed: progress.failed,
                startedAt: progress.startedAt,
                savedToFolder: progress.savedToFolder,
                mode: 'batch',
              }),
            onBatchFieldSummaryProgress: (progress: BatchFieldSummaryProgress) =>
              setMapProgress({
                done: progress.done,
                total: progress.total,
                currentName: progress.currentName,
                failed: progress.failed,
                startedAt: progress.startedAt,
                mode: 'batch',
              }),
          },
          layerSeries,
          chartLabels,
          {
            onMapSnapshotProgress:
              kind === 'batch-excel'
                ? (done, total) =>
                    setMapProgress(prev => ({
                      done: prev?.done ?? 0,
                      total: prev?.total ?? 1,
                      currentName: `Map snapshots ${done}/${total}`,
                      failed: prev?.failed,
                      startedAt: prev?.startedAt,
                      savedToFolder: prev?.savedToFolder,
                      mode: 'batch',
                    }))
                : BATCH_EXPORT_KINDS.has(kind)
                  ? undefined
                  : kind === AGRI_OBJECT_INTEL_KIND
                    ? undefined
                    : (done, total) => setMapProgress({ done, total, mode: 'plots' }),
            batchExportDirectory: kind === 'batch-excel' ? batchExportDirectory : undefined,
            batchFolderPickAttempted: kind === 'batch-excel' ? batchFolderPickAttempted : undefined,
            fieldSummarySaveTarget:
              kind === 'batch-field-summary' ? fieldSummarySaveTarget : undefined,
          },
        )
        if (kind === AGRI_OBJECT_INTEL_KIND) {
          showStatus('Download Agricultural Intelligence Report.xlsx')
        } else if (BATCH_EXPORT_KINDS.has(kind) && result && 'succeeded' in result) {
          const abortedNote = result.aborted ? ' (stopped early)' : ''
          if (kind === 'batch-field-summary') {
            const delivery =
              'delivery' in result && result.delivery ? result.delivery : undefined
            let locationNote = ''
            if (delivery?.usedDownloadFallback) {
              locationNote = delivery.filename
                ? ` — saved to Downloads as ${delivery.filename} (folder write failed — close Excel if open)`
                : ' — saved to Downloads (folder write failed)'
              showStatus(
                `Field summary Excel complete: ${result.succeeded} fields, ${result.failed} failed${abortedNote}${locationNote}`,
                'info',
              )
            } else {
              locationNote = delivery?.locationLabel
                ? ` — saved as ${delivery.locationLabel}`
                : delivery?.deliveryMode === 'download' && delivery.filename
                  ? ` — check Downloads for ${delivery.filename}`
                  : ''
              showStatus(
                `Field summary Excel complete: ${result.succeeded} fields, ${result.failed} failed${abortedNote}${locationNote}`,
              )
            }
          } else if ('deliveryMode' in result) {
            const total = result.succeeded + result.failed
            const folderLabel = result.folderName
            const savedToFolder = result.savedToFolderCount ?? 0
            const downloaded = result.downloadedCount ?? 0
            const abortedNote = result.aborted ? ' (stopped early)' : ''
            const firstError = result.errors?.[0]?.message
              ? ` — ${result.errors[0].message}`
              : ''

            if (result.succeeded === 0) {
              showStatus(
                `Batch Analytics failed — 0/${total} saved${abortedNote}${firstError}`,
                'info',
                30000,
              )
            } else if (savedToFolder > 0 && downloaded === 0) {
              showStatus(
                `Batch Analytics Export Completed — ${savedToFolder}/${total} saved to ${folderLabel || 'folder'}${abortedNote}`,
                result.failed > 0 ? 'info' : 'success',
                30000,
              )
            } else if (downloaded > 0 && savedToFolder === 0) {
              showStatus(
                `Batch Analytics Export Completed — ${downloaded}/${total} downloaded (folder write unavailable)${abortedNote}`,
                'info',
                30000,
              )
            } else if (downloaded > 0) {
              showStatus(
                `Batch Analytics Export Completed — ${savedToFolder} in folder + ${downloaded} downloaded${abortedNote}`,
                'info',
                30000,
              )
            } else {
              showStatus(
                `Batch Analytics built ${result.succeeded} reports but none were saved — close Excel files and re-pick the folder${abortedNote}${firstError}`,
                'info',
                30000,
              )
            }
          } else {
            showStatus(
              `Batch export complete: ${result.succeeded} succeeded, ${result.failed} failed${abortedNote}`,
            )
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Export failed')
      } finally {
        setBusy(false)
        setMapProgress(null)
      }
    },
    [
      field,
      fieldName,
      fieldKey,
      fromDate,
      toDate,
      acquisitionDate,
      layerIds,
      chartLabels,
      displayLabels,
      layerSeries,
      dailyRows,
      mapboxToken,
      periodAnchorDates,
      timeAggregation,
      chartRef,
      chartType,
      projectName,
      generatedBy,
      plots,
      farmName,
      aoiName,
      labelAttribute,
      onLabelAttributeChange,
      resolvePlotsForLabel,
      resolveFieldForLabel,
      objectLayerFeatures,
      objectLayerName,
      objectDailyByFieldKey,
      showStatus,
    ],
  )

  const startBatchExcelExportFromClick = useCallback(
    (directoryPromise?: Promise<FileSystemDirectoryHandle | null>) => {
      if (batchPickInProgressRef.current) return
      batchPickInProgressRef.current = true
      void (async () => {
        try {
          let exportDirectory: FileSystemDirectoryHandle | undefined

          if (directoryPromise) {
            try {
              const picked = await directoryPromise
              if (picked) exportDirectory = picked
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err)
              if (message === BATCH_EXPORT_PICKER_BUSY) {
                showStatus('Folder picker already open — choose a folder or press Cancel', 'info')
                return
              }
              if (isBatchExportCancelled(err)) {
                /* fall through — try persisted folder */
              } else if (message === BATCH_EXPORT_PICKER_BLOCKED) {
                showStatus('Folder picker blocked — click Batch Analytics again and choose a folder immediately', 'info')
              } else if (message === BATCH_EXPORT_PERMISSION_DENIED) {
                showStatus('Write permission denied — pick the folder again and allow access', 'info')
              } else {
                showStatus(`Could not access folder — ${message}`, 'info')
              }
            }
          }

          if (!exportDirectory) {
            exportDirectory = (await resolveWritableBatchExportDirectory()) ?? undefined
          }

          if (!exportDirectory) {
            showStatus(
              'Select a folder in the dialog, then click Select Folder — files save only to that folder',
              'info',
              15000,
            )
            return
          }

          rememberBatchExportDirectory(exportDirectory)
          try {
            await verifyBatchExportDirectoryWritable(exportDirectory)
          } catch {
            showStatus(
              `Folder write test skipped — saving ${plotsWithGeometry} Excel files directly…`,
              'info',
            )
          }

          setOpen(false)
          setPendingKind(null)

          const folderLabel = batchExportDirectoryLabel(exportDirectory)
          showStatus(
            `Batch Analytics — writing ${plotsWithGeometry} Excel files one-by-one to "${folderLabel}"…`,
            'info',
          )
          await runExport('batch-excel', labelAttribute, exportDirectory, true)
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Batch export failed')
        } finally {
          batchPickInProgressRef.current = false
        }
      })()
    },
    [labelAttribute, plotsWithGeometry, runExport, showStatus],
  )

  const beginBatchExcelFolderPick = useCallback(() => {
    if (batchPickInProgressRef.current) return

    setOpen(false)
    setPendingKind(null)

    let directoryPromise: Promise<FileSystemDirectoryHandle | null> | undefined
    if (isBatchDirectoryPickerSupported()) {
      try {
        directoryPromise = beginBatchExportDirectoryPickFromGesture().catch(err => {
          if (
            isBatchExportCancelled(err) ||
            (err instanceof Error &&
              (err.message === BATCH_EXPORT_PICKER_BLOCKED ||
                err.message === BATCH_EXPORT_PERMISSION_DENIED))
          ) {
            return null
          }
          return Promise.reject(err)
        })
      } catch (err) {
        directoryPromise = Promise.reject(err)
      }
    }

    startBatchExcelExportFromClick(directoryPromise)
  }, [startBatchExcelExportFromClick])

  const startBatchFieldSummaryExportFromClick = useCallback(
    (saveTargetPromise?: Promise<FieldSummarySaveTarget | null>) => {
      if (batchPickInProgressRef.current) return
      batchPickInProgressRef.current = true
      void (async () => {
        try {
          let saveTarget: FieldSummarySaveTarget | undefined
          if (saveTargetPromise) {
            try {
              const picked = await saveTargetPromise
              if (picked) saveTarget = picked
            } catch (err) {
              saveTarget = undefined
              const message = err instanceof Error ? err.message : ''
              if (message === BATCH_EXPORT_PICKER_BUSY) {
                showStatus('Folder picker already open — choose a folder or press Cancel', 'info')
                return
              }
              if (
                !isBatchExportCancelled(err) &&
                message !== BATCH_EXPORT_PICKER_BLOCKED &&
                message !== BATCH_EXPORT_PERMISSION_DENIED
              ) {
                throw err
              }
            }
          }

          if (!saveTarget) {
            const directory = await resolveWritableBatchExportDirectory()
            if (directory) {
              saveTarget = {
                kind: 'folder',
                directory,
                filename: defaultFieldReportFilename(aoiName, toDate),
              }
            }
          }

          if (saveTarget?.kind === 'folder') {
            try {
              await verifyBatchExportDirectoryWritable(saveTarget.directory)
              rememberBatchExportDirectory(saveTarget.directory)
            } catch {
              saveTarget = undefined
            }
          }

          setOpen(false)
          setPendingKind(null)

          if (saveTarget?.kind === 'folder') {
            showStatus(
              `Building summary for ${plotsWithGeometry} fields → "${batchExportDirectoryLabel(saveTarget.directory)}"…`,
              'info',
            )
          } else {
            showStatus(
              'Export will save to your browser Downloads folder when processing finishes',
              'info',
            )
          }
          await runExport('batch-field-summary', labelAttribute, undefined, false, saveTarget)
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Field summary export failed')
        } finally {
          batchPickInProgressRef.current = false
        }
      })()
    },
    [aoiName, labelAttribute, plotsWithGeometry, runExport, showStatus, toDate],
  )

  const beginBatchFieldSummaryFolderPick = useCallback(() => {
    if (batchPickInProgressRef.current) return

    const suggested = defaultFieldReportFilename(aoiName, toDate)
    let saveTargetPromise: Promise<FieldSummarySaveTarget | null> | undefined

    if (isBatchDirectoryPickerSupported()) {
      saveTargetPromise = beginBatchExportDirectoryPick()
        .then(directory => ({ kind: 'folder' as const, directory, filename: suggested }))
        .catch(err => {
          if (
            isBatchExportCancelled(err) ||
            (err instanceof Error &&
              (err.message === BATCH_EXPORT_PICKER_BLOCKED ||
                err.message === BATCH_EXPORT_PERMISSION_DENIED))
          ) {
            return null
          }
          return Promise.reject(err)
        })
    } else if (isFieldSummarySavePickerSupported()) {
      saveTargetPromise = beginBatchFieldSummarySavePick(suggested).catch(err => {
        if (isBatchExportCancelled(err)) return null
        return Promise.reject(err)
      })
    }

    setOpen(false)
    startBatchFieldSummaryExportFromClick(saveTargetPromise)
  }, [aoiName, startBatchFieldSummaryExportFromClick, toDate])

  const requestExport = useCallback(
    (kind: TimeSeriesExportKind) => {
      if (kind === 'batch-excel') {
        if (!batchExcelEnabled) return
        beginBatchExcelFolderPick()
        return
      }
      if (kind === 'batch-field-summary') {
        if (!batchFieldSummaryEnabled) return
        beginBatchFieldSummaryFolderPick()
        return
      }
      if (LABEL_DATE_CONFIRM_KINDS.has(kind)) {
        setOpen(false)
        setPendingKind(kind)
        setPendingLabel(labelAttribute)
        return
      }
      void runExport(kind)
    },
    [
      batchExcelEnabled,
      batchFieldSummaryEnabled,
      beginBatchExcelFolderPick,
      beginBatchFieldSummaryFolderPick,
      labelAttribute,
      runExport,
    ],
  )

  const pendingOption = pendingKind ? EXPORT_OPTIONS.find(o => o.kind === pendingKind) : null
  const busyLabel = formatBusyLabel(mapProgress, etaTick)
  const popoverActive = open || !!pendingKind
  const popoverAnchor = useExportPopoverAnchor(rootRef, popoverActive)
  const popoverStyle: CSSProperties | undefined = popoverAnchor
    ? {
        position: 'fixed',
        top: popoverAnchor.top,
        left: popoverAnchor.left,
        width: popoverAnchor.width,
        transform: popoverAnchor.placement === 'above' ? 'translateY(-100%)' : undefined,
        zIndex: 9300,
      }
    : undefined

  const exportMenu =
    open ? (
        <div className="acp-ts-export__menu acp-ts-export__menu--portal" role="menu">
          <div className="acp-ts-export__menu-head">Export</div>
          {EXPORT_OPTIONS.map(opt => {
            const itemDisabled =
              (opt.kind === 'batch-excel' && !batchExcelEnabled) ||
              (opt.kind === 'batch-field-summary' && !batchFieldSummaryEnabled)
            return (
              <button
                key={opt.kind}
                type="button"
                role="menuitem"
                disabled={itemDisabled}
                className={
                  'acp-ts-export__item' +
                  (opt.primary ? ' acp-ts-export__item--primary' : '') +
                  (opt.kind === 'batch-excel' ? ' acp-ts-export__item--batch-excel' : '') +
                  (itemDisabled ? ' acp-ts-export__item--disabled' : '')
                }
                title={
                  opt.kind === 'batch-excel'
                    ? batchExcelEnabled
                      ? `One Analytics workbook per field (Plot Label name) — pick a folder; ${plotsWithGeometry} .xlsx files save there`
                      : 'Select at least one field with geometry in Field Selector'
                    : opt.kind === 'batch-field-summary'
                      ? batchFieldSummaryEnabled
                        ? isBatchDirectoryPickerSupported()
                          ? `Pick a folder once; one executive workbook for ${plotsWithGeometry} fields saves there when ready`
                          : `Executive field report for ${plotsWithGeometry} fields — downloads when ready`
                        : 'Select at least one field with geometry in Field Selector'
                    : opt.kind === 'weather-excel'
                      ? `Uses Label field + Start/End dates (${fromDate.slice(0, 10)} -> ${toDate.slice(0, 10)})`
                      : opt.kind === 'lulc-docx'
                        ? 'Five-year LULC atlas (2021-2025) with class area tables, pie/bar charts, and change detection'
                        : opt.kind === 'docx'
                          ? 'Index map atlas, change detection, weather & recommendations (LULC is a separate export)'
                          : opt.hint ?? opt.label
                }
                onClick={e => {
                  e.stopPropagation()
                  if (itemDisabled) return
                  if (opt.kind === 'batch-excel') {
                    if (!batchExcelEnabled) return
                    beginBatchExcelFolderPick()
                    return
                  }
                  if (opt.kind === 'batch-field-summary') {
                    if (!batchFieldSummaryEnabled) return
                    beginBatchFieldSummaryFolderPick()
                    return
                  }
                  requestExport(opt.kind)
                }}
              >
                <i className={'fa-solid ' + opt.icon} aria-hidden="true" />
                <span className="acp-ts-export__item-label">{opt.label}</span>
              </button>
            )
          })}
        </div>
      ) : null

  const exportConfirm =
    pendingKind && pendingOption && LABEL_DATE_CONFIRM_KINDS.has(pendingKind) ? (
        <div className="acp-ts-export__confirm acp-ts-export__confirm--portal" role="dialog" aria-label="Confirm export options">
          <div className="acp-ts-export__confirm-title">{pendingOption.label}</div>
          <p className="acp-ts-export__confirm-hint">
            Choose the layer attribute for the AOI name, using the same Start / End dates as the toolbar.
          </p>
          {labelAttributes.length > 0 ? (
            <label className="acp-ts-export__confirm-field">
              <span>Name from field</span>
              <select
                value={pendingLabel}
                onChange={e => setPendingLabel(e.target.value)}
                aria-label="Layer attribute for AOI name"
              >
                <option value={SI_IMAGERY_PLOT_LABEL_AUTO}>Auto (Name / ID)</option>
                {labelAttributes.map(attr => (
                  <option key={attr.name} value={attr.name}>
                    {attr.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="acp-ts-export__confirm-dates" aria-label="Export date range">
            <span>
              Start <strong>{fromDate.slice(0, 10) || '-'}</strong>
            </span>
            <span aria-hidden="true">-&gt;</span>
            <span>
              End <strong>{toDate.slice(0, 10) || '-'}</strong>
            </span>
          </div>
          <div className="acp-ts-export__confirm-meta">1 AOI - weather + indices</div>
          <div className="acp-ts-export__confirm-actions">
            <button type="button" className="acp-ts-export__confirm-cancel" onClick={() => setPendingKind(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="acp-ts-export__confirm-go"
              disabled={!fromDate || !toDate || fromDate > toDate || !(field || resolveFieldForLabel?.(pendingLabel))}
              onClick={() => void runExport(pendingKind, pendingLabel)}
            >
              Export
            </button>
          </div>
        </div>
      ) : null

  const exportPopover =
    popoverActive && popoverAnchor && typeof document !== 'undefined'
      ? createPortal(
          <div ref={portalRef} className="acp-ts-export__portal" style={popoverStyle}>
            {exportMenu}
            {exportConfirm}
          </div>,
          document.body,
        )
      : null

  return (
    <div className={'acp-ts-export' + (popoverActive ? ' acp-ts-export--open' : '')} ref={rootRef}>
      {error || status ? (
        <div className="acp-ts-export__feedback" aria-live="polite">
          {error ? (
            <span className="acp-ts-export__error" role="alert" title={error}>
              {error}
            </span>
          ) : null}
          {status && !error ? (
            <span
              className={'acp-ts-export__status acp-ts-export__status--' + statusTone}
              role="status"
              title={status}
            >
              {status}
            </span>
          ) : null}
        </div>
      ) : null}
      <button
        type="button"
        className="acp-ts-export__trigger"
        disabled={disabled || busy}
        aria-expanded={open || !!pendingKind}
        aria-haspopup="menu"
        onClick={() => {
          if (pendingKind) {
            setPendingKind(null)
            return
          }
          setOpen(v => !v)
        }}
        title={busy && mapProgress?.mode === 'batch' ? busyLabel : 'Export analysis'}
      >
        <i
          className={'fa-solid acp-ts-export__trigger-icon ' + (busy ? 'fa-spinner fa-spin' : 'fa-file-export')}
          aria-hidden="true"
        />
        <span className="acp-ts-export__trigger-label">{busy ? busyLabel : 'Export'}</span>
      </button>
      {exportPopover}
    </div>
  )
}
