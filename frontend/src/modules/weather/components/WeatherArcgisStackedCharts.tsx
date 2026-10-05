import { useMemo, useState } from 'react'
import type { ChartData } from 'chart.js'
import { Chart } from 'react-chartjs-2'
import {
  buildArcgisHumidityLineChart,
  buildTemperatureHourlyBarChart,
  buildArcgisWindDirectionChart,
  buildArcgisWindSpeedChart,
} from '../charts/weatherLiveChartBuilders'
import { arcgisStackChartOptions } from '../charts/weatherLiveChartTheme'
import {
  downsampleHourlySeries,
  filterHourlyByDateRange,
  type WeatherChartDateRange,
} from '../config/weatherChartDateRange'
import {
  sliceHourlyFromAnchor,
  type OpenMeteoDashboardBundle,
  type OpenMeteoDashboardHourlyPoint,
} from '../services/openMeteoWeatherDashboard'

const HOURLY_WINDOW = 72

function chartWithIsoLabels<T extends 'line' | 'bar'>(
  data: ChartData<T>,
  series: OpenMeteoDashboardHourlyPoint[],
): ChartData<T> {
  return { ...data, labels: series.map(h => h.time) }
}

type ForecastMetricTab = 'temperature' | 'humidity'

type Props = {
  bundle: OpenMeteoDashboardBundle | null
  locationLabel: string
  mapTimeIso?: string
  dateRange: WeatherChartDateRange
  hourlyRange: OpenMeteoDashboardHourlyPoint[]
}

export function WeatherArcgisStackedCharts({
  bundle,
  locationLabel,
  mapTimeIso,
  dateRange,
  hourlyRange,
}: Props) {
  const [metricTab, setMetricTab] = useState<ForecastMetricTab>('temperature')

  const anchorIso = mapTimeIso ?? bundle?.snapshot?.observedAt ?? bundle?.hourlyForecast?.[0]?.time

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

  const windDirTitle = `Wind Direction for ${locationLabel}`
  const windSpeedTitle = `Wind Speed for ${locationLabel}`
  const tempTitle = `Temperature for ${locationLabel}`
  const humidityTitle = `Humidity for ${locationLabel}`

  const tempBars = useMemo(() => hourly.slice(-Math.min(48, hourly.length)), [hourly])

  const windDirChart = useMemo(
    () => chartWithIsoLabels(buildArcgisWindDirectionChart(hourly), hourly),
    [hourly],
  )
  const windSpeedChart = useMemo(
    () => chartWithIsoLabels(buildArcgisWindSpeedChart(hourly), hourly),
    [hourly],
  )
  const humidityChart = useMemo(
    () => chartWithIsoLabels(buildArcgisHumidityLineChart(hourly), hourly),
    [hourly],
  )
  const tempBarChart = useMemo(
    () => chartWithIsoLabels(buildTemperatureHourlyBarChart(tempBars), tempBars),
    [tempBars],
  )

  return (
    <div className="weather-arcgis-charts weather-arcgis-charts--with-date-bar">
      <div className="weather-arcgis-charts__stack">
        <section className="weather-arcgis-charts__block" aria-label={windDirTitle}>
          <div className="weather-arcgis-charts__plot">
            <Chart
              type="line"
              data={windDirChart}
              options={arcgisStackChartOptions(windDirTitle, {
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
              })}
            />
          </div>
        </section>
        <section className="weather-arcgis-charts__block" aria-label={windSpeedTitle}>
          <div className="weather-arcgis-charts__plot">
            <Chart
              type="line"
              data={windSpeedChart}
              options={arcgisStackChartOptions(windSpeedTitle, {
                scales: { y: { min: 0 } },
              })}
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
                options={arcgisStackChartOptions(humidityTitle, {
                  scales: { y: { min: 0, max: 100 } },
                })}
              />
            ) : (
              <Chart
                type="bar"
                data={tempBarChart}
                options={arcgisStackChartOptions(tempTitle, {
                  plugins: { legend: { display: false } },
                })}
              />
            )}
          </div>
        </section>
      </div>
      <nav className="weather-arcgis-charts__metric-tabs" aria-label="Forecast metric">
        {(
          [
            { id: 'temperature' as const, label: 'Temperature Forecast' },
            { id: 'humidity' as const, label: 'Humidity Forecast' },
          ] as const
        ).map(t => (
          <button
            key={t.id}
            type="button"
            className={`weather-arcgis-charts__metric-tab${metricTab === t.id ? ' is-active' : ''}`}
            aria-selected={metricTab === t.id}
            onClick={() => setMetricTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {!hourly.length ? (
        <p className="weather-arcgis-charts__empty">
          No data for {dateRange.startDate} → {dateRange.endDate} — try a shorter range or refresh.
        </p>
      ) : null}
    </div>
  )
}
