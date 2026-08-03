import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Chart as ChartJS } from 'chart.js'
import type { ImageryChartType, ImageryTimeAggregation } from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import type { ImageryTimeSeriesLayerSeries } from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import type { CropAlertFieldInput } from '../../../../lib/siCropAlertEngine'
import type { SentinelHubDailyIndexMeans } from '../../../../lib/sentinelHubStatisticsApi'
import {
  runTimeSeriesExport,
  type BatchAnalyticsExportProgress,
  type BatchFieldSummaryProgress,
  type TimeSeriesExportKind,
} from '../../lib/timeSeriesReport'
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
}

type ExportProgressState = {
  done: number
  total: number
  currentName?: string
  failed?: number
  startedAt?: number
  mode?: 'plots' | 'batch'
}

const EXPORT_OPTIONS: Array<{ kind: TimeSeriesExportKind; label: string; icon: string; primary?: boolean }> = [
  { kind: 'pdf', label: 'Executive PDF', icon: 'fa-file-pdf', primary: true },
  { kind: 'docx', label: 'Intelligence Report (Word)', icon: 'fa-file-word' },
  { kind: 'lulc-docx', label: 'LULC Report (Word)', icon: 'fa-layer-group' },
  { kind: 'excel', label: 'Analytics Report (Excel)', icon: 'fa-file-excel' },
  {
    kind: 'batch-excel',
    label: 'Batch Export - Analytics Reports (Excel)',
    icon: 'fa-files',
  },
  {
    kind: 'batch-field-summary',
    label: 'Batch Export → Field Summary (Excel)',
    icon: 'fa-table',
  },
  {
    kind: 'weather-excel',
    label: 'Weather / Indices Analysis (Excel)',
    icon: 'fa-cloud-sun-rain',
  },
  { kind: 'png', label: 'Figure (PNG)', icon: 'fa-image' },
  { kind: 'geojson', label: 'AOI (GeoJSON)', icon: 'fa-map' },
]

const LABEL_DATE_CONFIRM_KINDS = new Set<TimeSeriesExportKind>(['weather-excel'])
const FIELD_SUMMARY_CONFIRM_KINDS = new Set<TimeSeriesExportKind>(['batch-field-summary'])
const BATCH_EXPORT_KINDS = new Set<TimeSeriesExportKind>(['batch-excel', 'batch-field-summary'])

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
  if (!progress || progress.total <= 0) return 'Exporting...'
  if (progress.mode === 'batch' && progress.currentName) {
    const current = Math.min(progress.total, progress.done < progress.total ? progress.done + 1 : progress.done)
    let label = `Field ${current}/${progress.total} - ${progress.currentName}`
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
}: TimeSeriesExportManagerProps) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [mapProgress, setMapProgress] = useState<ExportProgressState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [pendingKind, setPendingKind] = useState<TimeSeriesExportKind | null>(null)
  const [pendingLabel, setPendingLabel] = useState(labelAttribute)
  const [etaTick, setEtaTick] = useState(0)
  const rootRef = useRef<HTMLDivElement | null>(null)
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
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false)
        setPendingKind(null)
      }
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

  const showStatus = useCallback((message: string) => {
    if (statusClearRef.current) clearTimeout(statusClearRef.current)
    setStatus(message)
    statusClearRef.current = setTimeout(() => {
      setStatus(null)
      statusClearRef.current = null
    }, 8000)
  }, [])

  const runExport = useCallback(
    async (kind: TimeSeriesExportKind, labelOverride?: string) => {
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
            onPlotAnalyticsProgress: (done, total) =>
              setMapProgress({ done, total, mode: 'plots' }),
            onBatchAnalyticsProgress: (progress: BatchAnalyticsExportProgress) =>
              setMapProgress({
                done: progress.done,
                total: progress.total,
                currentName: progress.currentName,
                failed: progress.failed,
                startedAt: progress.startedAt,
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
            onMapSnapshotProgress: BATCH_EXPORT_KINDS.has(kind)
              ? undefined
              : (done, total) => setMapProgress({ done, total, mode: 'plots' }),
          },
        )
        if (BATCH_EXPORT_KINDS.has(kind) && result && 'succeeded' in result) {
          const abortedNote = result.aborted ? ' (aborted)' : ''
          if (kind === 'batch-field-summary') {
            showStatus(
              `Field summary Excel complete: ${result.succeeded} fields, ${result.failed} failed${abortedNote}`,
            )
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
      showStatus,
    ],
  )

  const requestExport = useCallback(
    (kind: TimeSeriesExportKind) => {
      if (LABEL_DATE_CONFIRM_KINDS.has(kind) || FIELD_SUMMARY_CONFIRM_KINDS.has(kind)) {
        setOpen(false)
        setPendingKind(kind)
        setPendingLabel(labelAttribute)
        return
      }
      void runExport(kind)
    },
    [labelAttribute, runExport],
  )

  const pendingOption = pendingKind ? EXPORT_OPTIONS.find(o => o.kind === pendingKind) : null
  const busyLabel = formatBusyLabel(mapProgress, etaTick)

  return (
    <div className="acp-ts-export" ref={rootRef}>
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
        <i className={'fa-solid ' + (busy ? 'fa-spinner fa-spin' : 'fa-file-export')} aria-hidden="true" />
        {busy ? busyLabel : 'Export'}
      </button>
      {open ? (
        <div className="acp-ts-export__menu" role="menu">
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
                  (itemDisabled ? ' acp-ts-export__item--disabled' : '')
                }
                title={
                  opt.kind === 'batch-excel'
                    ? batchExcelEnabled
                      ? `One Analytics Report Excel per field (${plotsWithGeometry} fields with geometry)`
                      : 'Select at least one field with geometry in Field Selector'
                    : opt.kind === 'batch-field-summary'
                      ? batchFieldSummaryEnabled
                        ? `One Excel table sheet for all fields (${plotsWithGeometry} fields with geometry)`
                        : 'Select at least one field with geometry in Field Selector'
                    : opt.kind === 'weather-excel'
                      ? `Uses Label field + Start/End dates (${fromDate.slice(0, 10)} -> ${toDate.slice(0, 10)})`
                      : opt.kind === 'lulc-docx'
                        ? 'Five-year LULC atlas (2021-2025) with class area tables, pie/bar charts, and change detection'
                        : opt.kind === 'docx'
                          ? 'Index map atlas, change detection, weather & recommendations (LULC is a separate export)'
                          : undefined
                }
                onClick={() => {
                  if (itemDisabled) return
                  requestExport(opt.kind)
                }}
              >
                <i className={'fa-solid ' + opt.icon} aria-hidden="true" />
                {opt.label}
              </button>
            )
          })}
        </div>
      ) : null}
      {pendingKind && pendingOption ? (
        <div className="acp-ts-export__confirm" role="dialog" aria-label="Confirm export options">
          <div className="acp-ts-export__confirm-title">{pendingOption.label}</div>
          {pendingKind === 'batch-field-summary' ? (
            <>
              <p className="acp-ts-export__confirm-hint">
                Builds one Excel workbook with a single sheet table (one row per field): health,
                moisture, yield, harvest window, irrigation, and recommendation. Uses NDVI, NDMI,
                NDWI, NDRE plus any selected chart layers.
              </p>
              <div className="acp-ts-export__confirm-dates" aria-label="Export date range">
                <span>
                  Start <strong>{fromDate.slice(0, 10) || '-'}</strong>
                </span>
                <span aria-hidden="true">-&gt;</span>
                <span>
                  End <strong>{toDate.slice(0, 10) || '-'}</strong>
                </span>
              </div>
              <div className="acp-ts-export__confirm-meta">
                {plotsWithGeometry} field{plotsWithGeometry === 1 ? '' : 's'} with geometry · one sheet
              </div>
              <div className="acp-ts-export__confirm-actions">
                <button type="button" className="acp-ts-export__confirm-cancel" onClick={() => setPendingKind(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="acp-ts-export__confirm-go"
                  disabled={!batchFieldSummaryEnabled}
                  onClick={() => void runExport(pendingKind)}
                >
                  Export Excel
                </button>
              </div>
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
      ) : null}
      {error ? (
        <span className="acp-ts-export__error" role="alert">
          {error}
        </span>
      ) : null}
      {status && !error ? (
        <span className="acp-ts-export__status" role="status">
          {status}
        </span>
      ) : null}
    </div>
  )
}
