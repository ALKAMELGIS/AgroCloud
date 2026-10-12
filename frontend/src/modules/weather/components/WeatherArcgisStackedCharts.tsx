import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTheme } from '@mui/material/styles'
import type { AgroThemeMode } from '@/theme/createAgroTheme'
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  type ChartData,
} from 'chart.js'
import { Chart } from 'react-chartjs-2'
import {
  buildArcgisHumidityLineChart,
  buildTemperatureHourlyBarChart,
  buildArcgisWindDirectionChart,
  buildArcgisWindSpeedChart,
} from '../charts/weatherLiveChartBuilders'
import { arcgisStackChartOptions } from '../charts/weatherLiveChartTheme'
import {
  buildHumidityChartGuides,
  buildTemperatureChartGuides,
  buildWindSpeedChartGuides,
  computeWeatherChartNowIndex,
  floorToOpenMeteoHourIso,
  type WeatherChartLiveCadence,
  yScalePaddingForGuides,
} from '../charts/weatherArcgisChartLive'
import { ensureWeatherArcgisGuidesPluginRegistered } from '../charts/weatherArcgisChartPlugins'
import {
  downsampleHourlySeries,
  filterHourlyByDateRange,
  type WeatherChartDateRange,
} from '../config/weatherChartDateRange'
import {
  loadWeatherOperationsThresholds,
  subscribeWeatherOperationsThresholds,
} from '../config/weatherThresholds'
import { useWeatherArcgisChartLive } from '../hooks/useWeatherArcgisChartLive'
import {
  sliceHourlyFromAnchor,
  type OpenMeteoDashboardBundle,
  type OpenMeteoDashboardHourlyPoint,
} from '../services/openMeteoWeatherDashboard'

ensureWeatherArcgisGuidesPluginRegistered()
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Filler,
  Tooltip,
  Legend,
)

const HOURLY_WINDOW = 72

const LIVE_CADENCE_OPTIONS: { id: WeatherChartLiveCadence; label: string }[] = [
  { id: '1s', label: '1s' },
  { id: '1m', label: '1m' },
  { id: '1h', label: '1h' },
]

function chartWithIsoLabels<T extends 'line' | 'bar'>(
  data: ChartData<T>,
  series: OpenMeteoDashboardHourlyPoint[],
): ChartData<T> {
  return { ...data, labels: series.map(h => h.time) }
}

function numericExtent(values: Array<number | null | undefined>): { min: number | null; max: number | null } {
  const nums = values.filter((v): v is number => v != null && Number.isFinite(v))
  if (!nums.length) return { min: null, max: null }
  return { min: Math.min(...nums), max: Math.max(...nums) }
}

type ForecastMetricTab = 'temperature' | 'humidity'

type Props = {
  bundle: OpenMeteoDashboardBundle | null
  locationLabel: string
  mapTimeIso?: string
  dateRange: WeatherChartDateRange
  hourlyRange: OpenMeteoDashboardHourlyPoint[]
  /** Refresh Open-Meteo when live cadence ticks (minute / hour). */
  onLiveDataTick?: () => void
}

export function WeatherArcgisStackedCharts({
  bundle,
  locationLabel,
  mapTimeIso,
  dateRange,
  hourlyRange,
  onLiveDataTick,
}: Props) {
  const muiTheme = useTheme()
  const chartMode: AgroThemeMode = muiTheme.palette.mode === 'dark' ? 'dark' : 'light'
  const [metricTab, setMetricTab] = useState<ForecastMetricTab>('temperature')
  const [liveCadence, setLiveCadence] = useState<WeatherChartLiveCadence>('1s')
  const [thresholds, setThresholds] = useState(loadWeatherOperationsThresholds)
  const stackRef = useRef<HTMLDivElement>(null)

  useEffect(() => subscribeWeatherOperationsThresholds(() => setThresholds(loadWeatherOperationsThresholds())), [])

  const onLiveTick = useCallback(() => {
    onLiveDataTick?.()
  }, [onLiveDataTick])

  const nowMs = useWeatherArcgisChartLive({ cadence: liveCadence, onTick: onLiveTick })

  const liveAnchorIso = useMemo(() => floorToOpenMeteoHourIso(nowMs), [nowMs])
  const anchorIso =
    liveAnchorIso ?? mapTimeIso ?? bundle?.snapshot?.observedAt ?? bundle?.hourlyForecast?.[0]?.time

  const fallbackHourly = useMemo(() => {
    const series = bundle?.hourlyForecast?.length ? bundle.hourlyForecast : bundle?.hourly ?? []
    if (!series.length) return []
    const sliced = sliceHourlyFromAnchor(series, anchorIso ?? series[0].time, HOURLY_WINDOW)
    return filterHourlyByDateRange(sliced, dateRange)
  }, [bundle, anchorIso, dateRange])

  const hourly = useMemo(() => {
    const base = hourlyRange.length ? hourlyRange : fallbackHourly
    return downsampleHourlySeries(base)
  }, [hourlyRange, fallbackHourly])

  const isoLabels = useMemo(() => hourly.map(h => h.time), [hourly])
  const nowIndex = useMemo(() => computeWeatherChartNowIndex(isoLabels, nowMs), [isoLabels, nowMs])

  const tempGuides = useMemo(() => buildTemperatureChartGuides(thresholds), [thresholds])
  const windGuides = useMemo(() => buildWindSpeedChartGuides(thresholds), [thresholds])
  const humidityGuides = useMemo(() => buildHumidityChartGuides(thresholds), [thresholds])

  useEffect(() => {
    const root = stackRef.current
    if (!root) return
    const resizeCharts = () => {
      for (const canvas of root.querySelectorAll('canvas')) {
        try {
          ChartJS.getChart(canvas)?.update('none')
          ChartJS.getChart(canvas)?.resize()
        } catch {
          /* chart tearing down */
        }
      }
    }
    resizeCharts()
    const t = window.setTimeout(resizeCharts, 200)
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(resizeCharts)
    })
    ro.observe(root)
    return () => {
      window.clearTimeout(t)
      ro.disconnect()
    }
  }, [chartMode, hourly.length, metricTab, nowIndex])

  const windDirTitle = `Wind Direction for ${locationLabel}`
  const windSpeedTitle = `Wind Speed for ${locationLabel}`
  const tempTitle = `Temperature for ${locationLabel}`
  const humidityTitle = `Humidity for ${locationLabel}`

  const tempBars = useMemo(() => hourly.slice(-Math.min(48, hourly.length)), [hourly])
  const tempExtent = useMemo(
    () => numericExtent(tempBars.map(h => h.temperatureC)),
    [tempBars],
  )
  const windExtent = useMemo(
    () => numericExtent(hourly.map(h => h.windSpeedKmh)),
    [hourly],
  )
  const tempY = useMemo(
    () => yScalePaddingForGuides(tempExtent.min, tempExtent.max, tempGuides),
    [tempExtent, tempGuides],
  )
  const windY = useMemo(
    () => yScalePaddingForGuides(windExtent.min, windExtent.max, windGuides, 0),
    [windExtent, windGuides],
  )

  const liveMotion = liveCadence === '1s'

  const chartAnim = useMemo(
    () => ({ duration: liveMotion ? 0 : liveCadence === '1m' ? 280 : 420 }),
    [liveCadence, liveMotion],
  )

  const windDirGuides = useMemo(
    () => ({
      nowIndex,
      horizontal: [] as typeof tempGuides,
      showNowLine: true,
      liveMotion,
      isoLabels,
      liveSeries: hourly.map(h => h.windDirectionDeg),
      liveSeriesCircular: true,
    }),
    [hourly, isoLabels, liveMotion, nowIndex],
  )

  const windSpeedGuides = useMemo(
    () => ({
      nowIndex,
      horizontal: windGuides,
      showNowLine: true,
      liveMotion,
      isoLabels,
      liveSeries: hourly.map(h => h.windSpeedKmh),
    }),
    [hourly, isoLabels, liveMotion, nowIndex, windGuides],
  )

  const humidityChartGuides = useMemo(
    () => ({
      nowIndex,
      horizontal: humidityGuides,
      showNowLine: true,
      liveMotion,
      isoLabels,
      liveSeries: hourly.map(h => h.humidityPct),
    }),
    [hourly, humidityGuides, isoLabels, liveMotion, nowIndex],
  )

  const tempIsoLabels = useMemo(() => tempBars.map(h => h.time), [tempBars])
  const tempGuidesLive = useMemo(
    () => ({
      nowIndex: computeWeatherChartNowIndex(tempIsoLabels, nowMs),
      horizontal: tempGuides,
      showNowLine: true,
      liveMotion,
      isoLabels: tempIsoLabels,
      liveSeries: tempBars.map(h => h.temperatureC),
    }),
    [liveMotion, nowMs, tempBars, tempGuides, tempIsoLabels],
  )

  const windDirChart = useMemo(
    () => chartWithIsoLabels(buildArcgisWindDirectionChart(hourly, chartMode), hourly),
    [chartMode, hourly],
  )
  const windSpeedChart = useMemo(
    () => chartWithIsoLabels(buildArcgisWindSpeedChart(hourly, chartMode), hourly),
    [chartMode, hourly],
  )
  const humidityChart = useMemo(
    () => chartWithIsoLabels(buildArcgisHumidityLineChart(hourly), hourly),
    [hourly],
  )
  const tempBarChart = useMemo(
    () => chartWithIsoLabels(buildTemperatureHourlyBarChart(tempBars, chartMode), tempBars),
    [chartMode, tempBars],
  )

  const liveClockLabel = useMemo(
    () =>
      new Date(nowMs).toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
    [nowMs],
  )

  return (
    <div className="weather-arcgis-charts weather-arcgis-charts--with-date-bar weather-arcgis-charts--stacked-panel weather-arcgis-charts--live">
      <div className="weather-arcgis-charts__panel-head">
        <div className="weather-arcgis-charts__panel-head-row">
          <div>
            <h3 className="weather-arcgis-charts__panel-title">{locationLabel}</h3>
            <p className="weather-arcgis-charts__panel-sub">
              Live wind &amp; temperature · <span className="weather-arcgis-charts__live-clock">{liveClockLabel}</span>
            </p>
          </div>
          <div className="weather-arcgis-charts__live-cadence" role="group" aria-label="Live update cadence">
            {LIVE_CADENCE_OPTIONS.map(opt => (
              <button
                key={opt.id}
                type="button"
                className={`weather-arcgis-charts__live-cadence-btn${liveCadence === opt.id ? ' is-active' : ''}`}
                aria-pressed={liveCadence === opt.id}
                onClick={() => setLiveCadence(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <nav className="weather-arcgis-charts__metric-tabs" aria-label="Forecast metric">
        {(
          [
            { id: 'temperature' as const, label: 'Temperature Forecast', shortLabel: 'Temperature' },
            { id: 'humidity' as const, label: 'Humidity Forecast', shortLabel: 'Humidity' },
          ] as const
        ).map(t => (
          <button
            key={t.id}
            type="button"
            className={`weather-arcgis-charts__metric-tab${metricTab === t.id ? ' is-active' : ''}`}
            aria-selected={metricTab === t.id}
            onClick={() => setMetricTab(t.id)}
          >
            <span className="weather-arcgis-charts__metric-tab-label weather-arcgis-charts__metric-tab-label--long">
              {t.label}
            </span>
            <span
              className="weather-arcgis-charts__metric-tab-label weather-arcgis-charts__metric-tab-label--short"
              aria-hidden
            >
              {t.shortLabel}
            </span>
          </button>
        ))}
      </nav>
      <div className="weather-arcgis-charts__stack" ref={stackRef}>
        <section className="weather-arcgis-charts__block" aria-label={windDirTitle}>
          <div className="weather-arcgis-charts__plot">
            <Chart
              type="line"
              data={windDirChart}
              options={arcgisStackChartOptions(
                windDirTitle,
                {
                  animation: chartAnim,
                  scales: {
                    y: {
                      min: 0,
                      max: 360,
                      ticks: {
                        stepSize: 60,
                        callback(value) {
                          return `${value}°`
                        },
                      },
                    },
                  },
                },
                chartMode,
                windDirGuides,
              )}
            />
          </div>
        </section>
        <section className="weather-arcgis-charts__block" aria-label={windSpeedTitle}>
          <div className="weather-arcgis-charts__plot">
            <Chart
              type="line"
              data={windSpeedChart}
              options={arcgisStackChartOptions(
                windSpeedTitle,
                {
                  animation: chartAnim,
                  scales: {
                    y: {
                      min: windY.min ?? 0,
                      suggestedMax: windY.max,
                    },
                  },
                },
                chartMode,
                windSpeedGuides,
              )}
            />
          </div>
        </section>
        <section
          className="weather-arcgis-charts__block weather-arcgis-charts__block--grow"
          aria-label={metricTab === 'humidity' ? humidityTitle : tempTitle}
        >
          <div className="weather-arcgis-charts__plot">
            {metricTab === 'humidity' ? (
              <Chart
                type="line"
                data={humidityChart}
                options={arcgisStackChartOptions(
                  humidityTitle,
                  {
                    animation: chartAnim,
                    scales: { y: { min: 0, max: 100 } },
                  },
                  chartMode,
                  humidityChartGuides,
                )}
              />
            ) : (
              <Chart
                type="bar"
                data={tempBarChart}
                options={arcgisStackChartOptions(
                  tempTitle,
                  {
                    animation: chartAnim,
                    plugins: { legend: { display: false } },
                    scales: {
                      y: {
                        suggestedMin: tempY.min,
                        suggestedMax: tempY.max,
                      },
                    },
                  },
                  chartMode,
                  tempGuidesLive,
                )}
              />
            )}
          </div>
        </section>
      </div>
      {!hourly.length ? (
        <p className="weather-arcgis-charts__empty">
          No data for {dateRange.startDate} → {dateRange.endDate} — try a shorter range or refresh.
        </p>
      ) : null}
    </div>
  )
}
