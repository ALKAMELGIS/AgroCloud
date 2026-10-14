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
  buildArcgisWindDirectionChart,
  buildArcgisWindSpeedChart,
  buildDailyTemperatureBarSeries,
  buildTemperatureDailyBarChart,
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
  sliceHourlyForChartWindow,
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
    const series = bundle?.hourly?.length ? bundle.hourly : bundle?.hourlyForecast ?? []
    if (!series.length) return []
    const inRange = filterHourlyByDateRange(series, dateRange)
    if (inRange.length) return inRange
    const anchor = anchorIso ?? series[0]?.time
    if (!anchor) return []
    return filterHourlyByDateRange(sliceHourlyForChartWindow(series, anchor), dateRange)
  }, [bundle, anchorIso, dateRange])

  const hourlyRawInRange = useMemo(() => {
    const merged = hourlyRange.length ? hourlyRange : fallbackHourly
    const inRange = filterHourlyByDateRange(merged, dateRange)
    return inRange.length ? inRange : fallbackHourly
  }, [hourlyRange, fallbackHourly, dateRange])

  const hourly = useMemo(() => downsampleHourlySeries(hourlyRawInRange), [hourlyRawInRange])

  const dailyTempSeries = useMemo(
    () =>
      buildDailyTemperatureBarSeries(
        hourlyRawInRange,
        bundle?.snapshot?.daily?.length ? bundle.snapshot.daily : bundle?.daily7,
        dateRange,
      ),
    [hourlyRawInRange, bundle?.snapshot?.daily, bundle?.daily7, dateRange],
  )

  const isoLabels = useMemo(() => hourly.map(h => h.time), [hourly])
  const dailyIsoLabels = useMemo(() => dailyTempSeries.map(d => d.time), [dailyTempSeries])
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
  }, [chartMode, dailyTempSeries.length, hourly.length, metricTab])

  const windDirTitle = `Wind Direction for ${locationLabel}`
  const windSpeedTitle = `Wind Speed for ${locationLabel}`
  const tempTitle = `Temperature for ${locationLabel}`
  const humidityTitle = `Humidity for ${locationLabel}`

  const tempExtent = useMemo(
    () => numericExtent(dailyTempSeries.map(h => h.temperatureC)),
    [dailyTempSeries],
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

  const chartAnim = useMemo(() => ({ duration: 0 }), [])

  const lineLiveGuides = useCallback(
    (
      horizontal: typeof tempGuides,
      liveSeries: Array<number | null | undefined>,
      labels: string[],
      circular?: boolean,
    ) => ({
      nowIndex: liveMotion ? null : nowIndex,
      horizontal,
      showNowLine: !liveMotion,
      showLiveRangeLine: liveMotion,
      liveMotion,
      isoLabels: labels,
      liveSeries,
      liveSeriesCircular: circular,
    }),
    [liveMotion, nowIndex],
  )

  const windDirGuides = useMemo(
    () => lineLiveGuides([], hourly.map(h => h.windDirectionDeg), isoLabels, true),
    [hourly, isoLabels, lineLiveGuides],
  )

  const windSpeedGuides = useMemo(
    () => lineLiveGuides(windGuides, hourly.map(h => h.windSpeedKmh), isoLabels),
    [hourly, isoLabels, lineLiveGuides, windGuides],
  )

  const humidityChartGuides = useMemo(
    () => lineLiveGuides(humidityGuides, hourly.map(h => h.humidityPct), isoLabels),
    [hourly, humidityGuides, isoLabels, lineLiveGuides],
  )

  const tempChartGuides = useMemo(() => {
    const base = lineLiveGuides(tempGuides, dailyTempSeries.map(h => h.temperatureC), dailyIsoLabels)
    return { ...base, showLiveRangeLine: false, isoLabels: dailyIsoLabels }
  }, [dailyIsoLabels, dailyTempSeries, lineLiveGuides, tempGuides])

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
  const tempDailyBarChart = useMemo(
    () => chartWithIsoLabels(buildTemperatureDailyBarChart(dailyTempSeries, chartMode), dailyTempSeries),
    [chartMode, dailyTempSeries],
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
              updateMode="none"
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
              updateMode="none"
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
                updateMode="none"
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
                data={tempDailyBarChart}
                updateMode="none"
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
                  tempChartGuides,
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
