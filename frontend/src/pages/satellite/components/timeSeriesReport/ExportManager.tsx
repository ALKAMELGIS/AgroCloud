import { useCallback, useEffect, useRef, useState } from 'react'
import type { Chart as ChartJS } from 'chart.js'
import type { ImageryChartType, ImageryTimeAggregation } from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import type { ImageryTimeSeriesLayerSeries } from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import type { CropAlertFieldInput } from '../../../../lib/siCropAlertEngine'
import type { SentinelHubDailyIndexMeans } from '../../../../lib/sentinelHubStatisticsApi'
import { runTimeSeriesExport, type TimeSeriesExportKind } from '../../lib/timeSeriesReport'
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

const EXPORT_OPTIONS: Array<{ kind: TimeSeriesExportKind; label: string; icon: string; primary?: boolean }> = [
  { kind: 'pdf', label: 'Executive PDF', icon: 'fa-file-pdf', primary: true },
  { kind: 'docx', label: 'Intelligence Report (Word)', icon: 'fa-file-word' },
  { kind: 'excel', label: 'Analytics Report (Excel)', icon: 'fa-file-excel' },
  {
    kind: 'weather-excel',
    label: 'Weather ↔ Indices Analysis (Excel)',
    icon: 'fa-cloud-sun-rain',
  },
  { kind: 'png', label: 'Figure (PNG)', icon: 'fa-image' },
  { kind: 'geojson', label: 'AOI (GeoJSON)', icon: 'fa-map' },
]

const LABEL_DATE_CONFIRM_KINDS = new Set<TimeSeriesExportKind>(['weather-excel'])

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
  const [mapProgress, setMapProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendingKind, setPendingKind] = useState<TimeSeriesExportKind | null>(null)
  const [pendingLabel, setPendingLabel] = useState(labelAttribute)
  const rootRef = useRef<HTMLDivElement | null>(null)

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

  const runExport = useCallback(
    async (kind: TimeSeriesExportKind, labelOverride?: string) => {
      setOpen(false)
      setPendingKind(null)
      setError(null)
      setBusy(true)
      setMapProgress(null)
      const chosenLabel = labelOverride ?? labelAttribute
      if (labelOverride != null && labelOverride !== labelAttribute) {
        onLabelAttributeChange?.(labelOverride)
      }
      const labeledPlots = resolvePlotsForLabel?.(chosenLabel) ?? plots
      const labeledField = resolveFieldForLabel?.(chosenLabel) ?? field
      const labeledFieldName = labeledField?.farmName?.trim() || fieldName
      try {
        await runTimeSeriesExport(
          kind,
          {
            field: labeledField,
            fieldName: labeledFieldName,
            fieldKey: labeledField?.fieldKey || fieldKey,
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
            farmName: labeledField?.farmName || farmName || labeledFieldName,
            aoiName,
            plotNameField: chosenLabel || undefined,
            onPlotAnalyticsProgress: (done, total) => setMapProgress({ done, total }),
          },
          layerSeries,
          chartLabels,
          {
            onMapSnapshotProgress: (done, total) => setMapProgress({ done, total }),
          },
        )
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
    ],
  )

  const requestExport = useCallback(
    (kind: TimeSeriesExportKind) => {
      if (LABEL_DATE_CONFIRM_KINDS.has(kind)) {
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
        title="Export analysis"
      >
        <i className={'fa-solid ' + (busy ? 'fa-spinner fa-spin' : 'fa-file-export')} aria-hidden="true" />
        {busy
          ? mapProgress
            ? `Plots ${mapProgress.done}/${mapProgress.total}…`
            : 'Exporting…'
          : 'Export'}
      </button>
      {open ? (
        <div className="acp-ts-export__menu" role="menu">
          {EXPORT_OPTIONS.map(opt => (
            <button
              key={opt.kind}
              type="button"
              role="menuitem"
              className={'acp-ts-export__item' + (opt.primary ? ' acp-ts-export__item--primary' : '')}
              title={
                opt.kind === 'weather-excel'
                  ? `Uses Label field + Start/End dates (${fromDate.slice(0, 10)} → ${toDate.slice(0, 10)})`
                  : undefined
              }
              onClick={() => requestExport(opt.kind)}
            >
              <i className={'fa-solid ' + opt.icon} aria-hidden="true" />
              {opt.label}
            </button>
          ))}
        </div>
      ) : null}
      {pendingKind && pendingOption ? (
        <div className="acp-ts-export__confirm" role="dialog" aria-label="Confirm export options">
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
              Start <strong>{fromDate.slice(0, 10) || '—'}</strong>
            </span>
            <span aria-hidden="true">→</span>
            <span>
              End <strong>{toDate.slice(0, 10) || '—'}</strong>
            </span>
          </div>
          <div className="acp-ts-export__confirm-meta">1 AOI · weather + indices</div>
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
      ) : null}
      {error ? (
        <span className="acp-ts-export__error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  )
}
