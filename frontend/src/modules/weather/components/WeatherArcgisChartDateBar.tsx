import { useState } from 'react'
import {
  WEATHER_CHART_DATE_MAX,
  WEATHER_CHART_DATE_MIN,
  clampWeatherChartDateRange,
  type WeatherChartDateRange,
} from '../config/weatherChartDateRange'

type Props = {
  range: WeatherChartDateRange
  onChange: (range: WeatherChartDateRange) => void
  loading?: boolean
}

export function WeatherArcgisChartDateBar({ range, onChange, loading }: Props) {
  const [open, setOpen] = useState(false)

  const apply = (patch: Partial<WeatherChartDateRange>) => {
    onChange(clampWeatherChartDateRange({ ...range, ...patch }))
  }

  return (
    <div className={`weather-arcgis-date-bar${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="weather-arcgis-date-bar__toggle"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        title="Chart date range"
      >
        <i className="fa-regular fa-calendar" aria-hidden />
        <span className="weather-arcgis-date-bar__toggle-label">Dates</span>
        {loading ? <span className="weather-arcgis-date-bar__spinner" aria-hidden /> : null}
      </button>

      {open ? (
        <div className="weather-arcgis-date-bar__panel" role="dialog" aria-label="Start and end date">
          <label className="weather-arcgis-date-bar__field">
            <span>Start Date</span>
            <input
              type="date"
              min={WEATHER_CHART_DATE_MIN}
              max={WEATHER_CHART_DATE_MAX}
              value={range.startDate}
              onChange={e => apply({ startDate: e.target.value })}
            />
          </label>
          <label className="weather-arcgis-date-bar__field">
            <span>End Date</span>
            <input
              type="date"
              min={WEATHER_CHART_DATE_MIN}
              max={WEATHER_CHART_DATE_MAX}
              value={range.endDate}
              onChange={e => apply({ endDate: e.target.value })}
            />
          </label>
          <p className="weather-arcgis-date-bar__hint">
            Default end rolls to today · {WEATHER_CHART_DATE_MIN.slice(0, 4)}–{WEATHER_CHART_DATE_MAX.slice(0, 4)}
          </p>
        </div>
      ) : null}
    </div>
  )
}
