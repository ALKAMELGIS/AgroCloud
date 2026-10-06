import { useEffect, useMemo, useState } from 'react'
import type { ClimateExportAggregation } from '@/modules/remote-sensing/weather/weatherClimateReport/weatherClimateReportTypes'
import {
  clampWeatherChartDateRange,
  getDefaultWeatherChartDateRange,
  WEATHER_CHART_DATE_MAX,
  WEATHER_CHART_DATE_MIN,
  type WeatherChartDateRange,
} from '../config/weatherChartDateRange'
import { exportWeatherIntelligenceExcel } from '../export/exportWeatherIntelligenceExcel'
import {
  DEFAULT_WEATHER_EXCEL_METRICS,
  WEATHER_EXCEL_EXPORT_METRICS,
  type WeatherExcelExportMetricId,
} from '../export/weatherExcelExportMetrics'
import type { WeatherFarmSite } from '../services/weatherFarmService'

type Props = {
  open: boolean
  onClose: () => void
  locationLabel: string
  lat: number
  lng: number
  sites: WeatherFarmSite[]
  initialRange?: WeatherChartDateRange
  defaultCompareSiteIds?: string[]
}

const AGGREGATION_OPTIONS: Array<{ id: ClimateExportAggregation; label: string }> = [
  { id: 'hour', label: 'Hourly' },
  { id: 'day', label: 'Daily' },
]

export function WeatherExcelExportModal({
  open,
  onClose,
  locationLabel,
  lat,
  lng,
  sites,
  initialRange,
  defaultCompareSiteIds = [],
}: Props) {
  const [range, setRange] = useState<WeatherChartDateRange>(() =>
    clampWeatherChartDateRange(initialRange ?? getDefaultWeatherChartDateRange()),
  )
  const [aggregation, setAggregation] = useState<ClimateExportAggregation>('day')
  const [metrics, setMetrics] = useState<WeatherExcelExportMetricId[]>(DEFAULT_WEATHER_EXCEL_METRICS)
  const [compareIds, setCompareIds] = useState<Set<string>>(() => new Set())
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const compareCandidates = useMemo(
    () => sites.filter(s => s.id !== 'all' && Number.isFinite(s.lat) && Number.isFinite(s.lng)),
    [sites],
  )

  useEffect(() => {
    if (!open) return
    setRange(clampWeatherChartDateRange(initialRange ?? getDefaultWeatherChartDateRange()))
    setError(null)
    setProgress(null)
    setCompareIds(new Set(defaultCompareSiteIds.filter(id => id !== 'all')))
  }, [open, initialRange, defaultCompareSiteIds])

  if (!open) return null

  const toggleMetric = (id: WeatherExcelExportMetricId) => {
    setMetrics(prev => (prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]))
  }

  const toggleCompare = (id: string) => {
    setCompareIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const onExport = async () => {
    if (!metrics.length) {
      setError('Select at least one weather element.')
      return
    }
    const clamped = clampWeatherChartDateRange(range)
    setBusy(true)
    setError(null)
    setProgress('Starting export…')
    try {
      const compareSites = compareCandidates.filter(s => compareIds.has(s.id))
      await exportWeatherIntelligenceExcel({
        locationLabel,
        lat,
        lng,
        startDate: clamped.startDate,
        endDate: clamped.endDate,
        timeAggregation: aggregation,
        metrics,
        compareSites: compareSites.length ? compareSites : undefined,
        onProgress: setProgress,
      })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed.')
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  return (
    <div
      className="weather-excel-export-dialog"
      role="dialog"
      aria-label="Export weather Excel report"
      onClick={e => {
        if (e.target === e.currentTarget && !busy) onClose()
      }}
    >
      <div className="weather-excel-export-dialog__panel">
        <h2>Export Excel report</h2>
        <p className="weather-excel-export-dialog__lead">
          {locationLabel} · data sheets, summary tables, and native Excel charts (line, bar, pie) for the
          selected period.
        </p>

        <div className="weather-excel-export-dialog__grid">
          <label className="weather-excel-export-dialog__field">
            <span>Start date</span>
            <input
              type="date"
              min={WEATHER_CHART_DATE_MIN}
              max={WEATHER_CHART_DATE_MAX}
              value={range.startDate}
              disabled={busy}
              onChange={e => setRange(r => clampWeatherChartDateRange({ ...r, startDate: e.target.value }))}
            />
          </label>
          <label className="weather-excel-export-dialog__field">
            <span>End date</span>
            <input
              type="date"
              min={WEATHER_CHART_DATE_MIN}
              max={WEATHER_CHART_DATE_MAX}
              value={range.endDate}
              disabled={busy}
              onChange={e => setRange(r => clampWeatherChartDateRange({ ...r, endDate: e.target.value }))}
            />
          </label>
        </div>

        <fieldset className="weather-excel-export-dialog__fieldset" disabled={busy}>
          <legend>Time aggregation</legend>
          {AGGREGATION_OPTIONS.map(opt => (
            <label key={opt.id} className="weather-excel-export-dialog__radio">
              <input
                type="radio"
                name="excel-aggregation"
                checked={aggregation === opt.id}
                onChange={() => setAggregation(opt.id)}
              />
              {opt.label}
            </label>
          ))}
        </fieldset>

        <fieldset className="weather-excel-export-dialog__fieldset" disabled={busy}>
          <legend>Weather elements</legend>
          <div className="weather-excel-export-dialog__checks">
            {WEATHER_EXCEL_EXPORT_METRICS.map(m => (
              <label key={m.id} className="weather-excel-export-dialog__check">
                <input
                  type="checkbox"
                  checked={metrics.includes(m.id)}
                  onChange={() => toggleMetric(m.id)}
                />
                {m.label}
              </label>
            ))}
          </div>
        </fieldset>

        {compareCandidates.length > 0 ? (
          <fieldset className="weather-excel-export-dialog__fieldset" disabled={busy}>
            <legend>Compare locations (optional)</legend>
            <div className="weather-excel-export-dialog__checks">
              {compareCandidates.map(s => (
                <label key={s.id} className="weather-excel-export-dialog__check">
                  <input
                    type="checkbox"
                    checked={compareIds.has(s.id)}
                    onChange={() => toggleCompare(s.id)}
                  />
                  {s.label}
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        {progress ? <p className="weather-excel-export-dialog__progress" aria-live="polite">{progress}</p> : null}
        {error ? <p className="weather-excel-export-dialog__error" role="alert">{error}</p> : null}

        <div className="weather-excel-export-dialog__actions">
          <button type="button" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="weather-excel-export-dialog__primary" onClick={() => void onExport()} disabled={busy}>
            {busy ? 'Exporting…' : 'Download .xlsx'}
          </button>
        </div>
      </div>
    </div>
  )
}
