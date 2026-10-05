import { useEffect, useMemo, useState } from 'react'
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  RadialLinearScale,
  Tooltip,
} from 'chart.js'
import { Chart } from 'react-chartjs-2'
import { wmoWeatherIconClass } from '@/modules/remote-sensing/weather/openMeteoWeather'
import {
  buildEt0VsRainChart,
  buildHumidityTrendChart,
  buildLocationCompareChart,
  buildRainfallTrendChart,
  buildTemperatureTrendChart,
  buildWindRoseChart,
  buildWindSpeedChart,
  type LocationCompareRow,
} from '../charts/weatherLiveChartBuilders'
import { baseLiveChartOptions } from '../charts/weatherLiveChartTheme'
import type { WeatherLocationId } from '../config/weatherFarmIds'
import type { WeatherMapLayerId } from '../config/weatherLayerCatalog'
import { getWeatherMapLayer } from '../config/weatherLayerCatalog'
import type { WeatherFarmCatalog } from '../services/weatherFarmService'
import {
  fetchOpenMeteoDashboardBundle,
  sliceHourlyFromAnchor,
  type OpenMeteoDashboardBundle,
} from '../services/openMeteoWeatherDashboard'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  RadialLinearScale,
  Filler,
  Tooltip,
  Legend,
)

const SPATIAL_COMPARE_MAX = 12
const HOURLY_WINDOW = 72

type LiveChartTab = 'temperature' | 'rainfall' | 'wind' | 'humidity' | 'et0' | 'locations'

const LIVE_TABS: { id: LiveChartTab; label: string; emoji: string }[] = [
  { id: 'temperature', label: 'Temperature', emoji: '🌡' },
  { id: 'rainfall', label: 'Rainfall', emoji: '🌧' },
  { id: 'wind', label: 'Wind', emoji: '💨' },
  { id: 'humidity', label: 'Humidity', emoji: '💧' },
  { id: 'et0', label: 'ET₀ vs Rain', emoji: '💦' },
  { id: 'locations', label: 'Locations', emoji: '📊' },
]

type Props = {
  bundle: OpenMeteoDashboardBundle | null
  catalog: WeatherFarmCatalog | null
  activeLayerId: WeatherMapLayerId
  locationLabel?: string
  queryLat?: number
  queryLng?: number
  mapTimeIso?: string
  compareFarmIds?: WeatherLocationId[]
  onCompareFarmIdsChange?: (ids: WeatherLocationId[]) => void
}

function formatTimelinePoint(iso: string): string {
  try {
    const d = new Date(iso.length > 10 && !iso.includes('T') ? `${iso}T12:00:00` : iso)
    if (Number.isNaN(d.getTime())) return iso.replace('T', ' ').slice(0, 16)
    return d.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso.replace('T', ' ').slice(0, 16)
  }
}

export function WeatherChartsPanel({
  bundle,
  catalog,
  activeLayerId,
  locationLabel = 'All locations',
  queryLat,
  queryLng,
  mapTimeIso,
  compareFarmIds = [],
  onCompareFarmIdsChange,
}: Props) {
  const [tab, setTab] = useState<LiveChartTab>('temperature')

  const anchorIso = mapTimeIso ?? bundle?.snapshot?.observedAt ?? bundle?.hourlyForecast?.[0]?.time

  const hourly = useMemo(() => {
    const series = bundle?.hourlyForecast?.length ? bundle.hourlyForecast : bundle?.hourly ?? []
    if (!series.length) return []
    return sliceHourlyFromAnchor(series, anchorIso ?? series[0].time, HOURLY_WINDOW)
  }, [bundle, anchorIso])

  const daily = bundle?.daily7 ?? []

  const timelineRange = useMemo(() => {
    if (!hourly.length) return '—'
    return `${formatTimelinePoint(hourly[0].time)} → ${formatTimelinePoint(hourly[hourly.length - 1].time)}`
  }, [hourly])

  const layer = getWeatherMapLayer(activeLayerId)
  const weatherCategoryLabel = bundle?.snapshot?.conditionLabel ?? '—'
  const mapCategoryLabel = `${layer.label} · ${layer.unit}`
  const selectedCompareCount = compareFarmIds.filter(id => id !== 'all').length

  const locationSites = useMemo(
    () => (catalog?.sites ?? []).filter(s => s.id !== 'all'),
    [catalog?.sites],
  )

  const sitesForCompare = useMemo((): Array<{ label: string; lat: number; lng: number }> => {
    const compareSet = new Set<WeatherLocationId>(
      compareFarmIds.filter((id): id is WeatherLocationId => id !== 'all'),
    )
    if (!compareSet.size) {
      if (queryLat != null && queryLng != null && Number.isFinite(queryLat) && Number.isFinite(queryLng)) {
        return [{ label: locationLabel, lat: queryLat, lng: queryLng }]
      }
      return []
    }
    return locationSites.filter(s => compareSet.has(s.id)).slice(0, SPATIAL_COMPARE_MAX)
  }, [locationSites, compareFarmIds, queryLat, queryLng, locationLabel])

  const [compareRows, setCompareRows] = useState<LocationCompareRow[]>([])

  useEffect(() => {
    if (!sitesForCompare.length) {
      setCompareRows([])
      return
    }
    let cancelled = false
    void Promise.all(
      sitesForCompare.map(async s => {
        const b = await fetchOpenMeteoDashboardBundle(s.lat, s.lng)
        const snap = b.snapshot
        const d0 = b.daily7[0]
        const et0Sum = b.daily7.reduce((sum, d) => sum + (d.et0Mm ?? 0), 0)
        const rainSum = b.daily7.reduce((sum, d) => sum + (d.precipMm ?? 0), 0)
        return {
          label: s.label,
          temperatureC: snap?.temperatureC ?? null,
          precipMm: rainSum > 0 ? rainSum : (d0?.precipMm ?? null),
          et0Mm: et0Sum > 0 ? et0Sum : (d0?.et0Mm ?? null),
        }
      }),
    ).then(rows => {
      if (!cancelled) setCompareRows(rows)
    })
    return () => {
      cancelled = true
    }
  }, [sitesForCompare, bundle?.fetchedAt])

  const updatedLabel = bundle?.fetchedAt ? new Date(bundle.fetchedAt).toLocaleTimeString() : '—'

  const chartWrap = 'weather-charts-panel__chart-wrap weather-charts-panel__chart-wrap--live'

  const contextBar = (
    <div className="weather-charts-panel__context" aria-label="Timeline, location, and weather category">
      <div className="weather-charts-panel__context-item">
        <span className="weather-charts-panel__context-label">Timeline</span>
        <span className="weather-charts-panel__context-value" title={timelineRange}>{timelineRange}</span>
      </div>
      <div className="weather-charts-panel__context-item">
        <span className="weather-charts-panel__context-label">Location</span>
        <span className="weather-charts-panel__context-value" title={locationLabel}>{locationLabel}</span>
      </div>
      <div className="weather-charts-panel__context-item">
        <span className="weather-charts-panel__context-label">Category</span>
        <span
          className="weather-charts-panel__context-value"
          title={`Map: ${mapCategoryLabel} · Condition: ${weatherCategoryLabel}`}
        >
          <span className="weather-charts-panel__context-map">{mapCategoryLabel}</span>
          <span className="weather-charts-panel__context-sep" aria-hidden>·</span>
          <i className={`weather-charts-panel__context-wx ${wmoWeatherIconClass(bundle?.snapshot?.weatherCode)}`} aria-hidden />
          <span>{weatherCategoryLabel}</span>
        </span>
      </div>
    </div>
  )

  return (
    <div className="weather-charts-panel weather-charts-panel--tabs weather-charts-panel--live">
      <header className="weather-charts-panel__header">
        <nav className="weather-charts-panel__tabs weather-charts-panel__tabs--live" aria-label="Live weather charts">
          {LIVE_TABS.map(t => (
            <button
              key={t.id}
              type="button"
              className={`weather-charts-panel__tab weather-charts-panel__tab--live${tab === t.id ? ' is-active' : ''}`}
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              title={t.label}
            >
              <span className="weather-charts-panel__tab-emoji" aria-hidden>{t.emoji}</span>
              <span className="weather-charts-panel__tab-text">{t.label}</span>
              {t.id === 'locations' && selectedCompareCount > 0 ? (
                <span className="weather-charts-panel__tab-badge">{selectedCompareCount}</span>
              ) : null}
            </button>
          ))}
        </nav>
        <p className="weather-charts-panel__source">
          <span className="weather-charts-panel__source-dot" aria-hidden />
          Open-Meteo · {bundle?.resolutionLabel ?? '—'} · {updatedLabel}
        </p>
      </header>

      <div className="weather-charts-panel__body">
        {contextBar}

        {tab === 'temperature' ? (
          <section className="weather-charts-panel__pane" aria-label="Temperature trend">
            <div className={chartWrap}>
              <Chart
                type="line"
                data={buildTemperatureTrendChart(hourly, daily)}
                options={baseLiveChartOptions()}
              />
            </div>
          </section>
        ) : null}

        {tab === 'rainfall' ? (
          <section className="weather-charts-panel__pane" aria-label="Rainfall trend">
            <div className={chartWrap}>
              <Chart
                type="bar"
                data={buildRainfallTrendChart(daily)}
                options={baseLiveChartOptions({
                  scales: {
                    x: { ticks: { color: '#94a3b8', font: { size: 8 } }, grid: { display: false } },
                    y: { position: 'left', title: { display: true, text: 'Daily mm', color: '#94a3b8' } },
                    y1: {
                      position: 'right',
                      grid: { display: false },
                      title: { display: true, text: 'Cumulative mm', color: '#94a3b8' },
                    },
                  },
                })}
              />
            </div>
          </section>
        ) : null}

        {tab === 'wind' ? (
          <section className="weather-charts-panel__pane weather-charts-panel__pane--wind" aria-label="Wind">
            <div className="weather-charts-panel__split-charts">
              <div className={`${chartWrap} weather-charts-panel__chart-wrap--wind-line`}>
                <Chart type="line" data={buildWindSpeedChart(hourly)} options={baseLiveChartOptions()} />
              </div>
              <div className={`${chartWrap} weather-charts-panel__chart-wrap--wind-rose`}>
                <Chart
                  type="polarArea"
                  data={buildWindRoseChart(hourly)}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                      r: {
                        ticks: { display: false, backdropColor: 'transparent' },
                        grid: { color: 'rgba(255,255,255,0.08)' },
                      },
                    },
                  }}
                />
              </div>
            </div>
          </section>
        ) : null}

        {tab === 'humidity' ? (
          <section className="weather-charts-panel__pane" aria-label="Humidity trend">
            <div className={chartWrap}>
              <Chart type="line" data={buildHumidityTrendChart(hourly)} options={baseLiveChartOptions()} />
            </div>
          </section>
        ) : null}

        {tab === 'et0' ? (
          <section className="weather-charts-panel__pane" aria-label="ET0 versus rainfall">
            <p className="weather-charts-panel__meta weather-charts-panel__meta--hint">
              Deficit = ET₀ − rain (positive → irrigation demand signal).
            </p>
            <div className={chartWrap}>
              <Chart
                type="bar"
                data={buildEt0VsRainChart(daily)}
                options={baseLiveChartOptions({
                  scales: {
                    y: { position: 'left', title: { display: true, text: 'mm', color: '#94a3b8' } },
                    y1: {
                      position: 'right',
                      grid: { display: false },
                      title: { display: true, text: 'Deficit', color: '#94a3b8' },
                    },
                  },
                })}
              />
            </div>
          </section>
        ) : null}

        {tab === 'locations' ? (
          <section className="weather-charts-panel__pane weather-charts-panel__pane--compare" aria-label="Location comparison">
            {catalog && onCompareFarmIdsChange ? (
              <div className="weather-spatial__head">
                <p className="weather-charts-panel__meta">
                  Temperature · Rain (7d) · ET₀ (7d) · up to {SPATIAL_COMPARE_MAX} sites
                </p>
                <div className="weather-spatial__actions">
                  <span className="weather-spatial__count">{selectedCompareCount} selected</span>
                  <button
                    type="button"
                    className="weather-spatial__action-btn"
                    disabled={!selectedCompareCount}
                    onClick={() => onCompareFarmIdsChange([])}
                  >
                    Clear
                  </button>
                </div>
              </div>
            ) : null}
            {catalog && onCompareFarmIdsChange && !selectedCompareCount ? (
              <p className="weather-charts-panel__meta weather-charts-panel__meta--hint">
                Add sites via the chart icon in Locations, or view the current map location below.
              </p>
            ) : null}
            {compareRows.length ? (
              <div className={chartWrap}>
                <Chart
                  type="bar"
                  data={buildLocationCompareChart(compareRows)}
                  options={baseLiveChartOptions({ scales: { x: { stacked: false } } })}
                />
              </div>
            ) : (
              <p className="weather-spatial__empty">No comparison data — select sites or refresh weather.</p>
            )}
          </section>
        ) : null}
      </div>
    </div>
  )
}
