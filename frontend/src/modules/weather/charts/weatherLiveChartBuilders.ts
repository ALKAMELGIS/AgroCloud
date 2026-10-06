import type { ChartData } from 'chart.js'
import type { OpenMeteoDailyForecast } from '@/modules/remote-sensing/weather/openMeteoWeather'
import type { OpenMeteoDashboardHourlyPoint } from '../services/openMeteoWeatherDashboard'
import {
  ARCGIS_ORANGE_AREA_LINE_STYLE,
  WEATHER_CHART_COLORS,
  arcgisLineDatasetStyle,
} from './weatherLiveChartTheme'
import type { AgroThemeMode } from '@/theme/createAgroTheme'

const WIND_BIN_LABELS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

export function formatShortAxisTime(iso: string): string {
  const day = iso.slice(0, 10)
  const clock = iso.slice(11, 16)
  return `${day.slice(5)} ${clock}`
}

function dailyByDate(daily: OpenMeteoDailyForecast[]): Map<string, OpenMeteoDailyForecast> {
  return new Map(daily.map(d => [d.date, d]))
}

export function buildTemperatureTrendChart(
  hourly: OpenMeteoDashboardHourlyPoint[],
  daily: OpenMeteoDailyForecast[],
): ChartData<'line'> {
  const labels = hourly.map(h => formatShortAxisTime(h.time))
  const byDay = dailyByDate(daily)
  const minLine = hourly.map(h => byDay.get(h.time.slice(0, 10))?.tempMinC ?? null)
  const maxLine = hourly.map(h => byDay.get(h.time.slice(0, 10))?.tempMaxC ?? null)
  return {
    labels,
    datasets: [
      {
        label: 'Min °C',
        data: minLine,
        borderColor: WEATHER_CHART_COLORS.tempMin,
        backgroundColor: 'transparent',
        borderDash: [4, 3],
        tension: 0.2,
        pointRadius: 0,
      },
      {
        label: 'Avg °C',
        data: hourly.map(h => h.temperatureC),
        borderColor: WEATHER_CHART_COLORS.temp,
        backgroundColor: 'rgba(249,115,22,0.15)',
        fill: true,
        tension: 0.3,
        pointRadius: 0,
      },
      {
        label: 'Max °C',
        data: maxLine,
        borderColor: WEATHER_CHART_COLORS.tempMax,
        backgroundColor: 'transparent',
        borderDash: [4, 3],
        tension: 0.2,
        pointRadius: 0,
      },
    ],
  }
}

export function buildRainfallTrendChart(daily: OpenMeteoDailyForecast[]): ChartData<'bar' | 'line'> {
  const labels = daily.map(d => d.date.slice(5))
  let cumulative = 0
  const cum = daily.map(d => {
    cumulative += d.precipMm ?? 0
    return cumulative
  })
  return {
    labels,
    datasets: [
      {
        type: 'bar' as const,
        label: 'Daily mm',
        data: daily.map(d => d.precipMm ?? 0),
        backgroundColor: 'rgba(59, 130, 246, 0.55)',
        borderColor: WEATHER_CHART_COLORS.precip,
        borderWidth: 1,
        yAxisID: 'y',
      },
      {
        type: 'line' as const,
        label: 'Cumulative mm',
        data: cum,
        borderColor: WEATHER_CHART_COLORS.precipCum,
        backgroundColor: 'transparent',
        tension: 0.25,
        pointRadius: 2,
        yAxisID: 'y1',
      },
    ],
  }
}

export function buildWindDirectionChart(hourly: OpenMeteoDashboardHourlyPoint[]): ChartData<'line'> {
  return {
    labels: hourly.map(h => formatShortAxisTime(h.time)),
    datasets: [
      {
        label: 'Direction °',
        data: hourly.map(h => h.windDirectionDeg),
        borderColor: '#f8fafc',
        backgroundColor: 'transparent',
        tension: 0.15,
        pointRadius: 0,
        borderWidth: 1.5,
      },
    ],
  }
}

export function buildArcgisWindDirectionChart(
  hourly: OpenMeteoDashboardHourlyPoint[],
  mode: AgroThemeMode = 'dark',
): ChartData<'line'> {
  return {
    labels: hourly.map(h => formatShortAxisTime(h.time)),
    datasets: [
      {
        label: 'Direction °',
        data: hourly.map(h => h.windDirectionDeg),
        ...arcgisLineDatasetStyle(mode),
      },
    ],
  }
}

export function buildTemperatureHourlyBarChart(
  hourly: OpenMeteoDashboardHourlyPoint[],
  mode: AgroThemeMode = 'dark',
): ChartData<'bar'> {
  const barFill =
    mode === 'light' ? 'rgba(30, 41, 59, 0.72)' : 'rgba(248, 250, 252, 0.82)'
  const barEdge =
    mode === 'light' ? 'rgba(15, 23, 42, 0.85)' : 'rgba(248, 250, 252, 0.95)'
  return {
    labels: hourly.map(h => {
      const clock = h.time.slice(11, 16)
      return clock || formatShortAxisTime(h.time)
    }),
    datasets: [
      {
        label: '°C',
        data: hourly.map(h => h.temperatureC),
        backgroundColor: barFill,
        borderColor: barEdge,
        borderWidth: 0,
        borderRadius: 1,
      },
    ],
  }
}

export function buildWindSpeedChart(hourly: OpenMeteoDashboardHourlyPoint[]): ChartData<'line'> {
  return {
    labels: hourly.map(h => formatShortAxisTime(h.time)),
    datasets: [
      {
        label: 'Wind km/h',
        data: hourly.map(h => h.windSpeedKmh),
        borderColor: WEATHER_CHART_COLORS.wind,
        backgroundColor: 'rgba(167, 139, 250, 0.12)',
        fill: true,
        tension: 0.25,
        pointRadius: 0,
      },
    ],
  }
}

export function buildArcgisWindSpeedChart(
  hourly: OpenMeteoDashboardHourlyPoint[],
  mode: AgroThemeMode = 'dark',
): ChartData<'line'> {
  return {
    labels: hourly.map(h => formatShortAxisTime(h.time)),
    datasets: [
      {
        label: 'Wind km/h',
        data: hourly.map(h => h.windSpeedKmh),
        ...arcgisLineDatasetStyle(mode),
      },
    ],
  }
}

/** Min / max daily bands + orange hourly line — ArcGIS temperature panel. */
export function buildArcgisTemperatureLineChart(
  hourly: OpenMeteoDashboardHourlyPoint[],
  daily: OpenMeteoDailyForecast[],
): ChartData<'line'> {
  const byDay = dailyByDate(daily)
  const minLine = hourly.map(h => byDay.get(h.time.slice(0, 10))?.tempMinC ?? null)
  const maxLine = hourly.map(h => byDay.get(h.time.slice(0, 10))?.tempMaxC ?? null)
  return {
    labels: hourly.map(h => formatShortAxisTime(h.time)),
    datasets: [
      {
        label: 'Min',
        data: minLine,
        borderColor: '#e8c547',
        backgroundColor: 'transparent',
        borderDash: [5, 4],
        tension: 0.35,
        pointRadius: 0,
        pointHoverRadius: 0,
        borderWidth: 2,
        spanGaps: true,
      },
      {
        label: 'Max',
        data: maxLine,
        borderColor: '#ef4444',
        backgroundColor: 'transparent',
        borderDash: [5, 4],
        tension: 0.35,
        pointRadius: 0,
        pointHoverRadius: 0,
        borderWidth: 2,
        spanGaps: true,
      },
      {
        label: 'Temperature',
        data: hourly.map(h => h.temperatureC),
        ...ARCGIS_ORANGE_AREA_LINE_STYLE,
      },
    ],
  }
}

/** Orange line with transparent fill — ArcGIS humidity panel. */
export function buildArcgisHumidityLineChart(hourly: OpenMeteoDashboardHourlyPoint[]): ChartData<'line'> {
  return {
    labels: hourly.map(h => formatShortAxisTime(h.time)),
    datasets: [
      {
        label: 'RH %',
        data: hourly.map(h => h.humidityPct),
        ...ARCGIS_ORANGE_AREA_LINE_STYLE,
      },
    ],
  }
}

export function buildWindRoseChart(hourly: OpenMeteoDashboardHourlyPoint[]): ChartData<'polarArea'> {
  const speeds = new Array(8).fill(0)
  const counts = new Array(8).fill(0)
  for (const h of hourly) {
    if (h.windDirectionDeg == null || h.windSpeedKmh == null) continue
    const idx = Math.round(((h.windDirectionDeg % 360) / 45)) % 8
    speeds[idx] += h.windSpeedKmh
    counts[idx] += 1
  }
  const data = speeds.map((s, i) => (counts[i] ? s / counts[i] : 0))
  return {
    labels: WIND_BIN_LABELS,
    datasets: [
      {
        label: 'Mean speed km/h',
        data,
        backgroundColor: [
          'rgba(167, 139, 250, 0.65)',
          'rgba(129, 140, 248, 0.6)',
          'rgba(96, 165, 250, 0.58)',
          'rgba(56, 189, 248, 0.55)',
          'rgba(45, 212, 191, 0.52)',
          'rgba(52, 211, 153, 0.5)',
          'rgba(74, 222, 128, 0.48)',
          'rgba(134, 239, 172, 0.45)',
        ],
        borderWidth: 0,
      },
    ],
  }
}

export function buildHumidityTrendChart(
  hourly: OpenMeteoDashboardHourlyPoint[],
): ChartData<'line'> {
  const values = hourly.map(h => h.humidityPct).filter((v): v is number => v != null)
  const min = values.length ? Math.min(...values) : null
  const max = values.length ? Math.max(...values) : null
  return {
    labels: hourly.map(h => formatShortAxisTime(h.time)),
    datasets: [
      {
        label: 'Min %',
        data: hourly.map(() => min),
        borderColor: WEATHER_CHART_COLORS.tempMin,
        borderDash: [3, 3],
        pointRadius: 0,
      },
      {
        label: 'RH %',
        data: hourly.map(h => h.humidityPct),
        borderColor: WEATHER_CHART_COLORS.humidity,
        backgroundColor: 'rgba(52, 211, 153, 0.12)',
        fill: true,
        tension: 0.3,
        pointRadius: 0,
      },
      {
        label: 'Max %',
        data: hourly.map(() => max),
        borderColor: WEATHER_CHART_COLORS.tempMax,
        borderDash: [3, 3],
        pointRadius: 0,
      },
    ],
  }
}

export function buildEt0VsRainChart(daily: OpenMeteoDailyForecast[]): ChartData<'bar' | 'line'> {
  const labels = daily.map(d => d.date.slice(5))
  const deficit = daily.map(d => {
    const et0 = d.et0Mm ?? 0
    const rain = d.precipMm ?? 0
    return Math.max(0, et0 - rain)
  })
  return {
    labels,
    datasets: [
      {
        type: 'bar' as const,
        label: 'Rain mm',
        data: daily.map(d => d.precipMm ?? 0),
        backgroundColor: 'rgba(59, 130, 246, 0.5)',
        yAxisID: 'y',
      },
      {
        type: 'bar' as const,
        label: 'ET₀ mm',
        data: daily.map(d => d.et0Mm ?? 0),
        backgroundColor: 'rgba(251, 191, 36, 0.55)',
        yAxisID: 'y',
      },
      {
        type: 'line' as const,
        label: 'Deficit mm',
        data: deficit,
        borderColor: WEATHER_CHART_COLORS.deficit,
        tension: 0.2,
        pointRadius: 2,
        yAxisID: 'y1',
      },
    ],
  }
}

export type LocationCompareRow = {
  label: string
  temperatureC: number | null
  precipMm: number | null
  et0Mm: number | null
}

export function buildLocationCompareChart(rows: LocationCompareRow[]): ChartData<'bar'> {
  return {
    labels: rows.map(r => r.label),
    datasets: [
      {
        label: 'Temp °C',
        data: rows.map(r => r.temperatureC),
        backgroundColor: 'rgba(249, 115, 22, 0.65)',
      },
      {
        label: 'Rain mm',
        data: rows.map(r => r.precipMm),
        backgroundColor: 'rgba(59, 130, 246, 0.55)',
      },
      {
        label: 'ET₀ mm',
        data: rows.map(r => r.et0Mm),
        backgroundColor: 'rgba(251, 191, 36, 0.55)',
      },
    ],
  }
}
