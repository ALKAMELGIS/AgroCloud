import { useCallback, useEffect, useRef, useState } from 'react'
import type { Chart as ChartJS } from 'chart.js'
import type { ImageryChartType } from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import type { ImageryTimeSeriesLayerSeries } from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import type { CropAlertFieldInput } from '../../../../lib/siCropAlertEngine'
import type { SentinelHubDailyIndexMeans } from '../../../../lib/sentinelHubStatisticsApi'
import { runTimeSeriesExport, type TimeSeriesExportKind } from '../../lib/timeSeriesReport'
import './ExportManager.css'

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
  projectName?: string
  generatedBy?: string
}

const EXPORT_OPTIONS: Array<{ kind: TimeSeriesExportKind; label: string; icon: string; primary?: boolean }> = [
  { kind: 'pdf', label: 'Executive PDF', icon: 'fa-file-pdf', primary: true },
  { kind: 'excel', label: 'Analytics Report (Excel)', icon: 'fa-file-excel' },
  { kind: 'csv', label: 'Summary Table (CSV)', icon: 'fa-table' },
  { kind: 'png', label: 'Figure (PNG)', icon: 'fa-image' },
  { kind: 'geojson', label: 'AOI (GeoJSON)', icon: 'fa-map' },
]

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
  projectName,
  generatedBy,
}: TimeSeriesExportManagerProps) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const runExport = useCallback(
    async (kind: TimeSeriesExportKind) => {
      setOpen(false)
      setError(null)
      setBusy(true)
      try {
        await runTimeSeriesExport(
          kind,
          {
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
            chartRef,
            chartType,
            config: { projectName, generatedBy },
          },
          layerSeries,
          chartLabels,
        )
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Export failed')
      } finally {
        setBusy(false)
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
      chartRef,
      chartType,
      projectName,
      generatedBy,
    ],
  )

  return (
    <div className="acp-ts-export" ref={rootRef}>
      <button
        type="button"
        className="acp-ts-export__trigger"
        disabled={disabled || busy}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen(v => !v)}
        title="Export analysis"
      >
        <i className={'fa-solid ' + (busy ? 'fa-spinner fa-spin' : 'fa-file-export')} aria-hidden="true" />
        {busy ? 'Exporting…' : 'Export'}
      </button>
      {open ? (
        <div className="acp-ts-export__menu" role="menu">
          {EXPORT_OPTIONS.map(opt => (
            <button
              key={opt.kind}
              type="button"
              role="menuitem"
              className={'acp-ts-export__item' + (opt.primary ? ' acp-ts-export__item--primary' : '')}
              onClick={() => void runExport(opt.kind)}
            >
              <i className={'fa-solid ' + opt.icon} aria-hidden="true" />
              {opt.label}
            </button>
          ))}
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
