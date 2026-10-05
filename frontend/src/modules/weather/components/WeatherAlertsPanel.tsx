import type { WeatherAlert } from '../analysis/buildWeatherAlerts'

type Props = {
  alerts: WeatherAlert[]
  loading?: boolean
  hasWeatherData?: boolean
  locationLabel?: string
  onRefresh?: () => void
}

export function WeatherAlertsPanel({
  alerts,
  loading,
  hasWeatherData,
  locationLabel,
  onRefresh,
}: Props) {
  const showLoading = Boolean(loading && !hasWeatherData)
  const showNeedData = !hasWeatherData && !loading
  const showAllClear = hasWeatherData && alerts.length === 0

  return (
    <section className="weather-side__card weather-side__card--alerts">
      <h2>Weather alerts</h2>
      {locationLabel ? (
        <p className="weather-side__meta-line" title={locationLabel}>{locationLabel}</p>
      ) : null}

      {showLoading ? <p className="weather-side__muted">Checking thresholds…</p> : null}

      {showNeedData ? (
        <p className="weather-side__muted">
          Alerts need live weather data.{' '}
          {onRefresh ? (
            <button type="button" className="weather-side__inline-link" onClick={onRefresh}>
              Refresh weather
            </button>
          ) : null}
        </p>
      ) : null}

      {showAllClear ? (
        <p className="weather-side__muted weather-side__muted--ok">All clear — no threshold breaches.</p>
      ) : null}

      {alerts.length > 0 ? (
        <ul className="weather-alerts">
          {alerts.map(a => (
            <li key={a.id} className={`weather-alerts__item is-${a.severity}`}>
              <strong>{a.type}</strong>
              <span>{a.location}</span>
              <span>{a.variable}: {a.currentValue} (threshold {a.threshold})</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
