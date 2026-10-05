import { useMemo } from 'react'
import { windDirectionLabel } from '@/modules/remote-sensing/weather/openMeteoWeather'
import {
  hourlyTableHumidityCellColors,
  hourlyTableTempCellColors,
} from '../map/weatherHourlyTableColors'
import type { OpenMeteoDashboardHourlyPoint } from '../services/openMeteoWeatherDashboard'
import { WeatherWindBarb, kmhToKnots } from './WeatherWindBarb'

type Props = {
  locationLabel: string
  hourlyRange: OpenMeteoDashboardHourlyPoint[]
}

function formatArcgisTableDateTime(iso: string): string {
  const normalized = iso.trim().replace(' ', 'T')
  const d = new Date(
    normalized.includes('T') ? normalized : `${normalized.slice(0, 10)}T12:00:00`,
  )
  if (Number.isNaN(d.getTime())) return iso.replace('T', ' ').slice(0, 16)
  const day = d.getDate()
  const month = d.getMonth() + 1
  const h = d.getHours()
  const m = d.getMinutes()
  const clock = `${h}:${String(m).padStart(2, '0')}`
  return `${day}/${month} ${clock}`
}

export function WeatherHourlyTable({ locationLabel, hourlyRange }: Props) {
  const rows = hourlyRange
  const title = useMemo(() => `Tabled Hourly Forecast for ${locationLabel}`, [locationLabel])

  return (
    <div
      className="weather-hourly-table weather-hourly-table--arcgis weather-hourly-table--with-date-bar"
      aria-label={title}
    >
      <p className="weather-hourly-table__title">{title}</p>
      <div className="weather-hourly-table__scroll">
        <table>
          <colgroup>
            <col className="weather-hourly-table__col-date" />
            <col className="weather-hourly-table__col-wind" />
            <col className="weather-hourly-table__col-speed" />
            <col className="weather-hourly-table__col-speed" />
            <col className="weather-hourly-table__col-dir" />
            <col className="weather-hourly-table__col-temp" />
            <col className="weather-hourly-table__col-hum" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col" className="weather-hourly-table__th-wind" aria-label="Wind barb">
                Wind
              </th>
              <th scope="col" title="Wind speed in knots">
                <span className="weather-hourly-table__th-text">Wind Speed</span>
              </th>
              <th scope="col" title="Wind speed in km/h">
                <span className="weather-hourly-table__th-text">Wind Speed</span>
              </th>
              <th scope="col">Wind Dir</th>
              <th scope="col">Temp</th>
              <th scope="col">Hum</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(h => {
              const knots = kmhToKnots(h.windSpeedKmh)
              const dir =
                h.windDirectionDeg != null ? windDirectionLabel(h.windDirectionDeg) : '—'
              const tempStyle = hourlyTableTempCellColors(h.temperatureC)
              const humStyle = hourlyTableHumidityCellColors(h.humidityPct)
              return (
                <tr key={h.time}>
                  <td className="weather-hourly-table__date">{formatArcgisTableDateTime(h.time)}</td>
                  <td className="weather-hourly-table__wind-cell">
                    <WeatherWindBarb directionDeg={h.windDirectionDeg} variant="arcgis" />
                  </td>
                  <td className="weather-hourly-table__num">
                    {knots != null ? `${Math.round(knots)} knots` : '—'}
                  </td>
                  <td className="weather-hourly-table__num">
                    {h.windSpeedKmh != null ? `${Math.round(h.windSpeedKmh)} km/h` : '—'}
                  </td>
                  <td className="weather-hourly-table__dir">{dir}</td>
                  <td className="weather-hourly-table__heat" style={tempStyle}>
                    {h.temperatureC != null ? `${Math.round(h.temperatureC)}°C` : '—'}
                  </td>
                  <td className="weather-hourly-table__heat" style={humStyle}>
                    {h.humidityPct != null ? `${Math.round(h.humidityPct)}%` : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {!rows.length ? (
        <p className="weather-hourly-table__empty">No hourly rows for {locationLabel}.</p>
      ) : null}
    </div>
  )
}
