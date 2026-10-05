import { farmWeatherStatsHasValues, type FarmWeatherStats } from '../analysis/farmWeatherStats'

type Props = {
  stats: FarmWeatherStats
  locationLabel?: string
  forecastHours?: number
  onRunExtent: () => void
  loading?: boolean
  onRefresh?: () => void
}

export function WeatherSpatialAnalysisPanel({
  stats,
  locationLabel = 'Selected location',
  forecastHours = 0,
  onRunExtent,
  loading,
  onRefresh,
}: Props) {
  const hasValues = farmWeatherStatsHasValues(stats)
  const windowLabel =
    forecastHours > 0 ? `${forecastHours}h forecast at pin` : 'Forecast series at selected location'

  return (
    <section className="weather-side__card weather-side__card--spatial">
      <h2>Spatial analysis</h2>
      <p className="weather-side__meta-line" title={`${locationLabel} · ${windowLabel}`}>
        <span className="weather-side__meta-line__loc">{locationLabel}</span>
        <span className="weather-side__meta-line__sep" aria-hidden>·</span>
        <span>{windowLabel}</span>
      </p>

      {!hasValues && !loading ? (
        <p className="weather-side__disclaimer weather-side__disclaimer--warn">
          Forecast statistics unavailable.{' '}
          {onRefresh ? (
            <button type="button" className="weather-side__inline-link" onClick={onRefresh}>
              Refresh weather
            </button>
          ) : (
            'Try again shortly.'
          )}
        </p>
      ) : null}
      {loading && !hasValues ? (
        <p className="weather-side__disclaimer">Loading forecast statistics…</p>
      ) : null}

      <button type="button" className="weather-side__action" onClick={onRunExtent}>
        Sample map extent (grid)
      </button>

      <dl className="weather-side__dl weather-side__dl--stats">
        <div>
          <dt>Mean temp</dt>
          <dd>{stats.temperature.mean?.toFixed(1) ?? '—'} °C</dd>
        </div>
        <div>
          <dt>Temp range</dt>
          <dd>{stats.temperature.range?.toFixed(1) ?? '—'} °C</dd>
        </div>
        <div>
          <dt>Mean RH</dt>
          <dd>{stats.humidity.mean?.toFixed(0) ?? '—'} %</dd>
        </div>
        <div>
          <dt>Max wind</dt>
          <dd>{stats.wind.maxKmh?.toFixed(0) ?? '—'} km/h</dd>
        </div>
        <div>
          <dt>Weekly precip</dt>
          <dd>{stats.precip.weeklyTotalMm?.toFixed(1) ?? '—'} mm</dd>
        </div>
        <div>
          <dt>Pressure range</dt>
          <dd>
            {stats.pressure.min != null && stats.pressure.max != null
              ? `${stats.pressure.min.toFixed(0)}–${stats.pressure.max.toFixed(0)} hPa`
              : '—'}
          </dd>
        </div>
      </dl>
    </section>
  )
}
