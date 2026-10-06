import { useMemo } from 'react'
import { windDirectionLabel } from '@/modules/remote-sensing/weather/openMeteoWeather'
import {
  type OpenMeteoDashboardBundle,
  type OpenMeteoDashboardHourlyPoint,
} from '../services/openMeteoWeatherDashboard'
import { dailyMinMaxMapFromHourly, mergeDailyMinMaxMaps } from '../utils/weatherDailyExtents'
import { WeatherWindBarb, kmhToKnots } from './WeatherWindBarb'

type Props = {
  bundle: OpenMeteoDashboardBundle | null
  locationLabel: string
  hourlyRange: OpenMeteoDashboardHourlyPoint[]
}

function formatArcgisHourlyWhen(iso: string): string {
  const normalized = iso.trim().replace(' ', 'T')
  const d = new Date(
    normalized.includes('T') ? normalized : `${normalized.slice(0, 10)}T12:00:00`,
  )
  if (Number.isNaN(d.getTime())) return iso.replace('T', ' ').slice(0, 16)
  const day = d.getDate()
  const month = d.getMonth() + 1
  const h = d.getHours()
  const m = d.getMinutes()
  return `${day}/${month} ${h}:${String(m).padStart(2, '0')}`
}

function dayKeyFromHourIso(iso: string): string {
  const normalized = iso.trim().replace(' ', 'T')
  return normalized.slice(0, 10)
}

export function WeatherArcgisHourlyForecast({
  bundle,
  locationLabel,
  hourlyRange,
}: Props) {
  const rows = hourlyRange

  const dailyByDate = useMemo(() => {
    const fromDaily = new Map<string, { min: number | null; max: number | null }>()
    for (const d of bundle?.daily7 ?? []) {
      fromDaily.set(d.date.slice(0, 10), { min: d.tempMinC, max: d.tempMaxC })
    }
    const fromHourly = dailyMinMaxMapFromHourly(rows)
    return mergeDailyMinMaxMaps(fromDaily, fromHourly)
  }, [bundle?.daily7, rows])

  return (
    <div
      className="weather-arcgis-hourly weather-arcgis-hourly--with-date-bar weather-arcgis-hourly--forecast-panel"
      aria-label={`Hourly forecast for ${locationLabel}`}
    >
      <div className="weather-arcgis-hourly__panel-head">
        <h3 className="weather-arcgis-hourly__panel-title">{locationLabel}</h3>
        <p className="weather-arcgis-hourly__panel-sub">Hourly forecast</p>
      </div>
      <div className="weather-arcgis-hourly__cols-head" aria-hidden="true">
        <span>Time</span>
        <span>Wind</span>
        <span>Temp</span>
        <span>Humidity</span>
      </div>
      <div className="weather-arcgis-hourly__scroll">
        {rows.map(h => {
          const knots = kmhToKnots(h.windSpeedKmh)
          const dir =
            h.windDirectionDeg != null ? windDirectionLabel(h.windDirectionDeg) : '—'
          const day = dailyByDate.get(dayKeyFromHourIso(h.time))
          return (
            <article key={h.time} className="weather-arcgis-hourly__row">
              <div className="weather-arcgis-hourly__when">
                <span className="weather-arcgis-hourly__place">{locationLabel}</span>
                <time className="weather-arcgis-hourly__time" dateTime={h.time}>
                  {formatArcgisHourlyWhen(h.time)}
                </time>
              </div>

              <section className="weather-arcgis-hourly__wind" aria-label="Wind">
                <WeatherWindBarb directionDeg={h.windDirectionDeg} variant="arcgis" />
                <div className="weather-arcgis-hourly__wind-main">
                  <div className="weather-arcgis-hourly__wind-speeds">
                    <span>{knots != null ? `${Math.round(knots)} knots` : '—'}</span>
                    <span>{h.windSpeedKmh != null ? `${Math.round(h.windSpeedKmh)} km/h` : '—'}</span>
                  </div>
                  <span className="weather-arcgis-hourly__wind-dir">{dir}</span>
                  <span className="weather-arcgis-hourly__section-label">Wind</span>
                </div>
              </section>

              <section className="weather-arcgis-hourly__temp" aria-label="Temperature">
                <span className="weather-arcgis-hourly__temp-val">
                  {h.temperatureC != null ? `${Math.round(h.temperatureC)}°C` : '—'}
                </span>
                <div className="weather-arcgis-hourly__temp-range">
                  <span className="weather-arcgis-hourly__temp-min">
                    Min:{' '}
                    {day?.min != null ? `${Math.round(day.min)}°C` : '—'}
                  </span>
                  <span className="weather-arcgis-hourly__temp-max">
                    Max:{' '}
                    {day?.max != null ? `${Math.round(day.max)}°C` : '—'}
                  </span>
                </div>
                <span className="weather-arcgis-hourly__section-label">Temperature</span>
              </section>

              <section className="weather-arcgis-hourly__hum" aria-label="Humidity">
                <span className="weather-arcgis-hourly__hum-val">
                  {h.humidityPct != null ? `${Math.round(h.humidityPct)}%` : '—'}
                </span>
                <span className="weather-arcgis-hourly__section-label">Humidity</span>
              </section>
            </article>
          )
        })}
      </div>
      {!rows.length ? (
        <p className="weather-arcgis-hourly__empty">No hourly forecast for {locationLabel}.</p>
      ) : null}
    </div>
  )
}
