import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { appAlert } from '../../../../lib/appDialog'
import { IMAGERY_TIME_AGGREGATION_OPTIONS } from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import type { ImageryTimeAggregation } from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import type { TimeSeriesReportConfig } from '../../lib/timeSeriesReport/timeSeriesReportTypes'

export type TimeSeriesReportConfigModalProps = {
  open: boolean
  onClose: () => void
  onGenerate: (config: TimeSeriesReportConfig) => Promise<void>
  fieldName: string
  layerIds: string[]
  fromDate: string
  toDate: string
  aggregation: ImageryTimeAggregation
  generating?: boolean
}

export function TimeSeriesReportConfigModal({
  open,
  onClose,
  onGenerate,
  fieldName,
  layerIds,
  fromDate,
  toDate,
  aggregation,
  generating = false,
}: TimeSeriesReportConfigModalProps) {
  const [title, setTitle] = useState('Agro Intelligence Report')
  const [start, setStart] = useState(fromDate)
  const [end, setEnd] = useState(toDate)
  const [agg, setAgg] = useState<ImageryTimeAggregation>(aggregation)
  const [includeMap, setIncludeMap] = useState(true)
  const [includeInterpretation, setIncludeInterpretation] = useState(true)
  const [includeLine, setIncludeLine] = useState(true)
  const [includeBar, setIncludeBar] = useState(true)
  const [includeScatter, setIncludeScatter] = useState(true)

  useEffect(() => {
    if (!open) return
    setTitle(`Agro Intelligence Report — ${fieldName}`)
    setStart(fromDate)
    setEnd(toDate)
    setAgg(aggregation)
  }, [open, fieldName, fromDate, toDate, aggregation])

  const layerSummary = useMemo(() => layerIds.join(', ') || '—', [layerIds])

  const handleGenerate = useCallback(async () => {
    if (!start || !end || start >= end) {
      await appAlert('Start date must be before end date.')
      return
    }
    await onGenerate({
      title: title.trim() || 'Agro Intelligence Report',
      fromDate: start,
      toDate: end,
      layerIds: [...layerIds],
      aggregation: agg,
      includeMapSnapshot: includeMap,
      includeInterpretation,
      includeCharts: {
        line: includeLine,
        bar: includeBar,
        scatter: includeScatter,
      },
    })
  }, [
    title,
    start,
    end,
    layerIds,
    agg,
    includeMap,
    includeInterpretation,
    includeLine,
    includeBar,
    includeScatter,
    onGenerate,
  ])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="acp-ts-report-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="acp-ts-report-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="acp-ts-report-title"
        onClick={e => e.stopPropagation()}
      >
        <header className="acp-ts-report-modal__head">
          <div>
            <h2 id="acp-ts-report-title" className="acp-ts-report-modal__title">
              Generate full report
            </h2>
            <p className="acp-ts-report-modal__subtitle">
              Configure a professional A4 PDF with field map, statistics, charts, comparison, and
              agricultural interpretation. Chart pages use the chart type currently shown in the panel.
            </p>
          </div>
          <button type="button" className="acp-ts-report-modal__close" onClick={onClose} aria-label="Close">
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        </header>

        <div className="acp-ts-report-modal__body">
          <label className="acp-ts-report-modal__field">
            <span>Report title</span>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} />
          </label>

          <div className="acp-ts-report-modal__row">
            <label className="acp-ts-report-modal__field">
              <span>Start date</span>
              <input type="date" value={start} max={end || undefined} onChange={e => setStart(e.target.value)} />
            </label>
            <label className="acp-ts-report-modal__field">
              <span>End date</span>
              <input type="date" value={end} min={start || undefined} onChange={e => setEnd(e.target.value)} />
            </label>
          </div>

          <div className="acp-ts-report-modal__row">
            <label className="acp-ts-report-modal__field">
              <span>Field</span>
              <input type="text" value={fieldName} readOnly />
            </label>
            <label className="acp-ts-report-modal__field">
              <span>Aggregation</span>
              <select value={agg} onChange={e => setAgg(e.target.value as ImageryTimeAggregation)}>
                {IMAGERY_TIME_AGGREGATION_OPTIONS.map(o => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="acp-ts-report-modal__field">
            <span>Selected layers</span>
            <input type="text" value={layerSummary} readOnly />
          </label>

          <fieldset className="acp-ts-report-modal__checks">
            <legend>Include in report</legend>
            <label>
              <input type="checkbox" checked={includeMap} onChange={e => setIncludeMap(e.target.checked)} />
              Map snapshot
            </label>
            <label>
              <input
                type="checkbox"
                checked={includeInterpretation}
                onChange={e => setIncludeInterpretation(e.target.checked)}
              />
              AI interpretation
            </label>
            <label>
              <input type="checkbox" checked={includeLine} onChange={e => setIncludeLine(e.target.checked)} />
              Line / trend chart
            </label>
            <label>
              <input type="checkbox" checked={includeBar} onChange={e => setIncludeBar(e.target.checked)} />
              Bar comparison chart
            </label>
            <label>
              <input type="checkbox" checked={includeScatter} onChange={e => setIncludeScatter(e.target.checked)} />
              Scatter correlation
            </label>
          </fieldset>
        </div>

        <footer className="acp-ts-report-modal__foot">
          <button type="button" className="acp-ts-report-modal__btn acp-ts-report-modal__btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="acp-ts-report-modal__btn acp-ts-report-modal__btn--primary"
            disabled={generating}
            onClick={() => void handleGenerate()}
          >
            {generating ? 'Generating…' : 'Generate PDF report'}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
