import { useEffect, useMemo, useRef, useState } from 'react'

import { windDirectionLabel, wmoWeatherIconClass } from '@/modules/remote-sensing/weather/openMeteoWeather'

import type { WeatherLocationId } from '../config/weatherFarmIds'

import type { WeatherLocationRow } from '../hooks/useWeatherLocationRows'

import { useWeatherLocationTicker } from '../hooks/useWeatherLocationTicker'

import {
  loadWeatherOperationsThresholds,
  subscribeWeatherOperationsThresholds,
} from '../config/weatherThresholds'
import { resolveWeatherLocationAlert } from '../insights/buildWeatherLocationAlert'
import { sortWeatherLocationRowsByAlertRisk } from '../insights/sortWeatherLocationRowsByAlertRisk'
import { WeatherWindBarb, kmhToKnots } from './WeatherWindBarb'
import { WeatherLocationAlertChip } from './WeatherLocationAlertChip'



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

  /** Double-click row: fly map to location (single click still selects). */
  onLocationFlyTo?: (id: WeatherLocationId) => void

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

  onLocationFlyTo,

}: Props) {

  const [query, setQuery] = useState('')

  const [tickerOn, setTickerOn] = useState(false)

  const [boardPlaying, setBoardPlaying] = useState(true)

  const [hoverPause, setHoverPause] = useState(false)

  const [thresholds, setThresholds] = useState(loadWeatherOperationsThresholds)

  const listRef = useRef<HTMLUListElement>(null)

  const rowFlashTimerRef = useRef<number | null>(null)

  const [rowFlashId, setRowFlashId] = useState<WeatherLocationId | null>(null)

  useEffect(() => subscribeWeatherOperationsThresholds(() => setThresholds(loadWeatherOperationsThresholds())), [])

  useEffect(
    () => () => {
      if (rowFlashTimerRef.current != null) window.clearTimeout(rowFlashTimerRef.current)
    },
    [],
  )

  const handleRowDoubleClick = (id: WeatherLocationId) => {
    onSelect(id)
    onLocationFlyTo?.(id)
    setRowFlashId(id)
    if (rowFlashTimerRef.current != null) window.clearTimeout(rowFlashTimerRef.current)
    rowFlashTimerRef.current = window.setTimeout(() => {
      setRowFlashId(null)
      rowFlashTimerRef.current = null
    }, 1400)
  }

  const filtered = useMemo(() => {

    const q = query.trim().toLowerCase()

    if (!q) return rows

    return rows.filter(r => r.label.toLowerCase().includes(q))

  }, [rows, query])

  const displayRows = useMemo(() => {
    if (variant !== 'arcgis') return filtered
    return sortWeatherLocationRowsByAlertRisk(filtered, thresholds)
  }, [filtered, thresholds, variant])

  const compareCount = compareIds.filter(id => id !== 'all').length

  const arcgis = variant === 'arcgis'

  const arcgisBoard = arcgis && displayRows.length > 3

  const canTicker = (!arcgis && filtered.length > 3 && !query.trim()) || arcgisBoard

  const tickerActive = (tickerOn && canTicker && !arcgis) || arcgisBoard

  const tickerPaused = hoverPause || (arcgisBoard ? !boardPlaying : false)

  const listEntries = useMemo(() => {
    if (!arcgisBoard) {
      return displayRows.map(row => ({ row, key: row.id, ariaHidden: false }))
    }
    return [
      ...displayRows.map(row => ({ row, key: `${row.id}-a`, ariaHidden: false })),
      ...displayRows.map(row => ({ row, key: `${row.id}-b`, ariaHidden: true })),
    ]
  }, [arcgisBoard, displayRows])

  useWeatherLocationTicker(tickerActive, tickerPaused, listRef, listEntries.length, {
    seamlessLoop: arcgisBoard,
  })

  return (

    <aside

      className={[

        'weather-locations',

        arcgis ? 'weather-locations--arcgis' : '',

        arcgisBoard ? 'weather-locations--arcgis-board' : '',

        tickerActive ? 'weather-locations--ticker-on' : '',

        tickerPaused && tickerActive ? 'weather-locations--ticker-paused' : '',

        className,

      ]

        .filter(Boolean)

        .join(' ')}

      aria-label="Locations"
      aria-busy={arcgis && loading ? true : undefined}
    >
      {arcgis ? (
        <div className="weather-locations__head weather-locations__head--arcgis-ref">
          <div className="weather-locations__head-arcgis-inner">
            <h2 className="weather-locations__title">Current Forecast per Location</h2>
            <p className="weather-locations__board-sub" aria-live="polite">
              Live board · highest alert risk first
            </p>
          </div>
          <button
            type="button"
            className={`weather-locations__ticker-btn weather-locations__ticker-btn--head${boardPlaying ? ' is-playing' : ''}`}
            aria-pressed={boardPlaying}
            aria-label={boardPlaying ? 'Pause location scroll' : 'Play location scroll'}
            title={boardPlaying ? 'Pause scroll' : 'Play scroll'}
            disabled={!canTicker}
            onClick={() => setBoardPlaying(p => !p)}
          >
            <i className={`fa-solid fa-${boardPlaying ? 'pause' : 'play'}`} aria-hidden />
          </button>
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
          if (tickerActive && boardPlaying) setHoverPause(true)
        }}

        onMouseLeave={() => setHoverPause(false)}

      >

        {listEntries.map(({ row, key, ariaHidden }) => {

          const active = row.id === selectedId

          const compared = compareIds.includes(row.id)

          const compareDisabled =

            !compared && row.id !== 'all' && compareCount >= compareMax && Boolean(onToggleCompare)

          const knots = kmhToKnots(row.windSpeedKmh)

          const dirLabel =

            row.windDirectionDeg != null ? windDirectionLabel(row.windDirectionDeg) : null

          const alert = arcgis ? resolveWeatherLocationAlert(row, thresholds) : null

          if (arcgis) {
            const dir = dirLabel ?? '—'

            return (
              <li
                key={key}
                className={[
                  'weather-locations__row-arcgis',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-hidden={ariaHidden || undefined}
              >
                <button
                  type="button"
                  className={[
                    'weather-arcgis-hourly__row',
                    'weather-locations__arcgis-row',
                    active ? 'is-active' : '',
                    alert ? `weather-locations__arcgis-row--alert-${alert.severity}` : '',
                    rowFlashId === row.id ? 'is-flash' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => onSelect(row.id)}
                  onDoubleClick={e => {
                    e.preventDefault()
                    if (ariaHidden) return
                    handleRowDoubleClick(row.id)
                  }}
                  tabIndex={ariaHidden ? -1 : undefined}
                  title={`${row.label} — double-click to fly to map`}
                >
                  <div className="weather-locations__arcgis-place">
                    <span className="weather-arcgis-hourly__place" title={row.label}>
                      {row.label}
                    </span>
                    <WeatherLocationAlertChip row={row} variant="inline" />
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

            <li key={key}>

              <button

                type="button"

                className={[
                  'weather-locations__item',
                  active ? 'is-active' : '',
                  rowFlashId === row.id ? 'is-flash' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}

                onClick={() => onSelect(row.id)}

                onDoubleClick={e => {
                  e.preventDefault()
                  handleRowDoubleClick(row.id)
                }}

                title={`${row.label} — double-click to fly to map`}

              >

                <i

                  className={`weather-locations__wx-icon ${wmoWeatherIconClass(row.weatherCode)}`}

                  aria-hidden

                />

                <span className="weather-locations__body">

                  <span className="weather-locations__name">{row.label}</span>
                  <WeatherLocationAlertChip row={row} variant="inline" />

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

      {!displayRows.length && !loading ? (
        <p className="weather-locations__empty">No locations match your search.</p>
      ) : null}
    </aside>
  )
}
