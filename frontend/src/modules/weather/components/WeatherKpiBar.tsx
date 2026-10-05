import { useMemo } from 'react'
import type { OpenMeteoDashboardBundle } from '../services/openMeteoWeatherDashboard'
import type { WeatherKpiTrend } from '../services/openMeteoWeatherDashboard'

function sparkPath(values: number[], w = 48, h = 14): string {
  const finite = values.filter(v => Number.isFinite(v))
  if (finite.length < 2) return ''
  const min = Math.min(...finite)
  const max = Math.max(...finite)
  const span = Math.max(max - min, 0.1)
  const step = w / (finite.length - 1)
  return finite
    .map((v, i) => {
      const x = i * step
      const y = h - ((v - min) / span) * h
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

function formatTrend(delta: number | null, unit: string): string {
  if (delta == null || !Number.isFinite(delta)) return ''
  const sign = delta > 0 ? '+' : ''
  return `${sign}${delta.toFixed(1)}${unit}`
}

type Props = {
  bundle: OpenMeteoDashboardBundle | null
  trend: WeatherKpiTrend
  loading?: boolean
}

export function WeatherKpiBar({ bundle, trend, loading }: Props) {
  const snap = bundle?.snapshot
  const h0 = bundle?.hourlyForecast[0]

  const sparkTemps = useMemo(
    () => (bundle?.hourlyForecast ?? []).slice(0, 12).map(h => h.temperatureC ?? 0),
    [bundle?.hourlyForecast],
  )

  const kpis = [
    {
      label: 'Temperature',
      value: snap?.temperatureC != null ? `${snap.temperatureC.toFixed(1)} °C` : '—',
      trend: formatTrend(trend.temperatureC, '°C'),
      spark: sparkTemps,
    },
    {
      label: 'Apparent',
      value: h0?.apparentTemperatureC != null ? `${h0.apparentTemperatureC.toFixed(1)} °C` : '—',
      trend: '',
      spark: [],
    },
    {
      label: 'Humidity',
      value: snap?.humidityPct != null ? `${Math.round(snap.humidityPct)} %` : '—',
      trend: formatTrend(trend.humidityPct, '%'),
      spark: [],
    },
    {
      label: 'Wind',
      value: snap?.windSpeedKmh != null ? `${Math.round(snap.windSpeedKmh)} km/h` : '—',
      trend: formatTrend(trend.windSpeedKmh, ' km/h'),
      spark: [],
    },
    {
      label: 'Direction',
      value: snap?.windDirectionLabel ?? '—',
      trend: '',
      spark: [],
    },
    {
      label: 'Precipitation',
      value: snap?.precipMm != null ? `${snap.precipMm.toFixed(1)} mm` : '—',
      trend: formatTrend(trend.precipProbabilityPct, '%'),
      spark: [],
    },
    {
      label: 'Pressure',
      value: h0?.pressureHpa != null ? `${Math.round(h0.pressureHpa)} hPa` : '—',
      trend: formatTrend(trend.pressureHpa, ' hPa'),
      spark: [],
    },
    {
      label: 'Dew point',
      value: h0?.dewPointC != null ? `${h0.dewPointC.toFixed(1)} °C` : '—',
      trend: '',
      spark: [],
    },
    {
      label: 'Visibility',
      value: h0?.visibilityKm != null ? `${h0.visibilityKm.toFixed(1)} km` : '—',
      trend: '',
      spark: [],
    },
  ]

  return (
    <section
      className={`weather-kpis${loading ? ' weather-kpis--loading' : ''}`}
      aria-label="Weather KPIs"
    >
      {kpis.map(k => (
        <article key={k.label} className="weather-kpi-card">
          <div className="weather-kpi-card__value">{k.value}</div>
          <div className="weather-kpi-card__label">{k.label}</div>
          {k.trend ? <div className="weather-kpi-card__trend">{k.trend}</div> : null}
          {k.spark.length > 1 ? (
            <svg className="weather-kpi-card__spark" viewBox="0 0 48 14" aria-hidden>
              <path d={sparkPath(k.spark)} fill="none" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          ) : null}
        </article>
      ))}
    </section>
  )
}
