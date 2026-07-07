import { useCallback, useEffect, useRef, useState } from 'react'
import type { TimeSeriesExportKind } from '../../lib/timeSeriesReport/timeSeriesReportTypes'

const EXPORT_OPTIONS: Array<{ id: TimeSeriesExportKind; label: string; hint: string }> = [
  { id: 'pdf', label: 'PDF full report', hint: 'Professional A4 analysis report' },
  { id: 'excel', label: 'Excel analysis report', hint: 'Summary, statistics, time series, comparison' },
  { id: 'csv', label: 'CSV time series data', hint: 'Aggregated period values' },
  { id: 'png', label: 'PNG chart image', hint: 'Current chart snapshot' },
  { id: 'geojson', label: 'GeoJSON statistics', hint: 'Field geometry with layer stats' },
]

export type TimeSeriesExportMenuProps = {
  disabled?: boolean
  busy?: boolean
  onExport: (kind: TimeSeriesExportKind) => void | Promise<void>
}

export function TimeSeriesExportMenu({ disabled, busy, onExport }: TimeSeriesExportMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const handlePick = useCallback(
    (kind: TimeSeriesExportKind) => {
      setOpen(false)
      void onExport(kind)
    },
    [onExport],
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
      >
        {busy ? 'Exporting…' : 'Export'}
        <i className={`fa-solid fa-chevron-${open ? 'up' : 'down'}`} aria-hidden="true" />
      </button>
      {open ? (
        <div className="acp-ts-export__menu" role="menu">
          {EXPORT_OPTIONS.map(opt => (
            <button
              key={opt.id}
              type="button"
              className="acp-ts-export__item"
              role="menuitem"
              onClick={() => handlePick(opt.id)}
            >
              <span className="acp-ts-export__item-label">{opt.label}</span>
              <span className="acp-ts-export__item-hint">{opt.hint}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
