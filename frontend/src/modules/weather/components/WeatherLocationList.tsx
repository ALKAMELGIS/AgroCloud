import { useMemo, useRef, useState } from 'react'

import { windDirectionLabel, wmoWeatherIconClass } from '@/modules/remote-sensing/weather/openMeteoWeather'

import type { WeatherLocationId } from '../config/weatherFarmIds'

import type { WeatherLocationRow } from '../hooks/useWeatherLocationRows'

import { useWeatherLocationTicker } from '../hooks/useWeatherLocationTicker'

import { WeatherWindBarb, kmhToKnots } from './WeatherWindBarb'



type Props = {

  rows: WeatherLocationRow[]

  loading?: boolean

  selectedId: WeatherLocationId

  onSelect: (id: WeatherLocationId) => void

  compareIds?: WeatherLocationId[]

  onToggleCompare?: (id: WeatherLocationId) => void

  compareMax?: number

  variant?: 'default' | 'arcgis'

  className?: string

}



export function WeatherLocationList({

  rows,

  loading,

  selectedId,

  onSelect,

  compareIds = [],

  onToggleCompare,

  compareMax = 12,

  variant = 'default',

  className,

}: Props) {

  const [query, setQuery] = useState('')

  const [tickerOn, setTickerOn] = useState(false)

  const [hoverPause, setHoverPause] = useState(false)

  const listRef = useRef<HTMLUListElement>(null)



  const filtered = useMemo(() => {

    const q = query.trim().toLowerCase()

    if (!q) return rows

    return rows.filter(r => r.label.toLowerCase().includes(q))

  }, [rows, query])



  const compareCount = compareIds.filter(id => id !== 'all').length

  const arcgis = variant === 'arcgis'

  const canTicker = !arcgis && filtered.length > 3 && !query.trim()

  useWeatherLocationTicker(tickerOn && canTicker, hoverPause, listRef, filtered.length)

  return (

    <aside

      className={[

        'weather-locations',

        arcgis ? 'weather-locations--arcgis' : '',

        tickerOn && canTicker ? 'weather-locations--ticker-on' : '',

        hoverPause && tickerOn ? 'weather-locations--ticker-paused' : '',

        className,

      ]

        .filter(Boolean)

        .join(' ')}

      aria-label="Locations"
      aria-busy={arcgis && loading ? true : undefined}
    >
      {arcgis ? (
        <div className="weather-locations__head weather-locations__head--arcgis-ref">
          <h2 className="weather-locations__title">Current Forecast per Location</h2>
        </div>
      ) : (
        <div className="weather-locations__head">
          <h2 className="weather-locations__title">Locations</h2>
          <div className="weather-locations__head-actions">
            {loading ? <span className="weather-locations__status">Updating…</span> : null}
          </div>
        </div>
      )}

      {!arcgis ? (

        <input

          type="search"

          className="weather-locations__search"

          placeholder="Search…"

          value={query}

          onChange={e => setQuery(e.target.value)}

          aria-label="Search locations"

        />

      ) : null}



      <ul

        ref={listRef}

        className="weather-locations__list"

        onMouseEnter={() => {
          if (tickerOn) setHoverPause(true)
        }}

        onMouseLeave={() => setHoverPause(false)}

      >

        {filtered.map(row => {

          const active = row.id === selectedId

          const compared = compareIds.includes(row.id)

          const compareDisabled =

            !compared && row.id !== 'all' && compareCount >= compareMax && Boolean(onToggleCompare)

          const knots = kmhToKnots(row.windSpeedKmh)

          const dirLabel =

            row.windDirectionDeg != null ? windDirectionLabel(row.windDirectionDeg) : null



          if (arcgis) {
            const dir = dirLabel ?? '—'

            return (
              <li key={row.id} className="weather-locations__row-arcgis">
                <button
                  type="button"
                  className={[
                    'weather-arcgis-hourly__row',
                    'weather-locations__arcgis-row',
                    active ? 'is-active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => onSelect(row.id)}
                >
                  <div className="weather-locations__arcgis-place">
                    <span className="weather-arcgis-hourly__place" title={row.label}>
                      {row.label}
                    </span>
                  </div>

                  <section className="weather-arcgis-hourly__wind" aria-label="Wind">
                    <WeatherWindBarb directionDeg={row.windDirectionDeg} variant="arcgis" />
                    <div className="weather-arcgis-hourly__wind-main">
                      <div className="weather-arcgis-hourly__wind-speeds">
                        <span>{knots != null ? `${Math.round(knots)} knots` : '—'}</span>
                        <span>
                          {row.windSpeedKmh != null ? `${Math.round(row.windSpeedKmh)} km/h` : '—'}
                        </span>
                      </div>
                      <span className="weather-arcgis-hourly__wind-dir">{dir}</span>
                      <span className="weather-arcgis-hourly__section-label">Wind</span>
                    </div>
                  </section>

                  <section className="weather-arcgis-hourly__temp" aria-label="Temperature">
                    <span className="weather-arcgis-hourly__temp-val">
                      {row.temperatureC != null ? `${Math.round(row.temperatureC)}°C` : '—'}
                    </span>
                    <div className="weather-arcgis-hourly__temp-range">
                      <span className="weather-arcgis-hourly__temp-min">
                        Min: {row.dailyMinC != null ? `${Math.round(row.dailyMinC)}°C` : '—'}
                      </span>
                      <span className="weather-arcgis-hourly__temp-max">
                        Max: {row.dailyMaxC != null ? `${Math.round(row.dailyMaxC)}°C` : '—'}
                      </span>
                    </div>
                    <span className="weather-arcgis-hourly__section-label">Temperature</span>
                  </section>

                  <section className="weather-arcgis-hourly__hum" aria-label="Humidity">
                    <span className="weather-arcgis-hourly__hum-val">
                      {row.humidityPct != null ? `${Math.round(row.humidityPct)}%` : '—'}
                    </span>
                    <span className="weather-arcgis-hourly__section-label">Humidity</span>
                  </section>
                </button>
              </li>
            )
          }



          return (

            <li key={row.id}>

              <button

                type="button"

                className={`weather-locations__item${active ? ' is-active' : ''}`}

                onClick={() => onSelect(row.id)}

              >

                <i

                  className={`weather-locations__wx-icon ${wmoWeatherIconClass(row.weatherCode)}`}

                  aria-hidden

                />

                <span className="weather-locations__body">

                  <span className="weather-locations__name">{row.label}</span>

                  <span

                    className="weather-locations__temp"

                    title="Temperature"

                    aria-label={

                      row.temperatureC != null

                        ? `Temperature ${row.temperatureC.toFixed(1)} degrees Celsius`

                        : 'Temperature unavailable'

                    }

                  >

                    {row.temperatureC != null ? `${row.temperatureC.toFixed(1)}°C` : '…'}

                  </span>

                  <span className="weather-locations__metrics">

                    <span title="Humidity">

                      <i className="fa-solid fa-droplet" aria-hidden />

                      {row.humidityPct != null ? `${Math.round(row.humidityPct)}%` : '—'}

                    </span>

                    <span title="Wind speed">

                      <i className="fa-solid fa-wind" aria-hidden />

                      {row.windSpeedKmh != null ? `${Math.round(row.windSpeedKmh)} km/h` : '—'}

                    </span>

                    <span title="Precipitation">

                      <i className="fa-solid fa-cloud-rain" aria-hidden />

                      {row.precipMm != null ? `${row.precipMm.toFixed(1)} mm` : '—'}

                    </span>

                  </span>

                </span>

              </button>

              {onToggleCompare && row.id !== 'all' ? (

                <button

                  type="button"

                  className={`weather-locations__compare${compared ? ' is-on' : ''}`}

                  title={compared ? 'Remove from compare' : 'Add to compare chart'}

                  disabled={compareDisabled}

                  aria-pressed={compared}

                  onClick={() => onToggleCompare(row.id)}

                >

                  <i className="fa-solid fa-chart-column" aria-hidden />

                </button>

              ) : null}

            </li>

          )

        })}

      </ul>

      {!filtered.length && !loading ? (
        <p className="weather-locations__empty">No locations match your search.</p>
      ) : null}
    </aside>
  )
}
