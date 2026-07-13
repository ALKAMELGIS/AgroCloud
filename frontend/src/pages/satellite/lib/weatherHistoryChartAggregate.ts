import {
  formatImageryTimePeriodLabel,
  imageryTimePeriodKey,
  type ImageryTimeAggregation,
} from '../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import {
  metricValueFromHourly,
  type OpenMeteoHourlyPoint,
  type WeatherHistoryMetric,
} from '../../../lib/openMeteoWeather'

export type WeatherTimeAggregation = ImageryTimeAggregation

export type WeatherChartSeries = {
  labels: string[]
  displayLabels: string[]
  values: Array<number | null>
}

function mean(nums: number[]): number | null {
  if (!nums.length) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

/** Collapse hourly observations to one value per calendar day. */
export function buildWeatherDailySeries(
  points: OpenMeteoHourlyPoint[],
  metric: WeatherHistoryMetric,
): Array<{ date: string; value: number }> {
  const useSum = metric === 'rain'
  const map = new Map<string, { sum: number; count: number }>()
  points.forEach(p => {
    const v = metricValueFromHourly(p, metric)
    if (v == null || !Number.isFinite(v)) return
    const d = p.time.slice(0, 10)
    const cur = map.get(d) ?? { sum: 0, count: 0 }
    cur.sum += v
    cur.count += 1
    map.set(d, cur)
  })
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { sum, count }]) => ({
      date,
      value: useSum ? sum : count > 0 ? sum / count : 0,
    }))
}

/** Re-bucket daily weather values into week / month / year series for charting. */
export function aggregateWeatherChartSeries(
  daily: Array<{ date: string; value: number }>,
  metric: WeatherHistoryMetric,
  aggregation: WeatherTimeAggregation,
): WeatherChartSeries {
  if (!daily.length) return { labels: [], displayLabels: [], values: [] }

  if (aggregation === 'day') {
    return {
      labels: daily.map(d => d.date),
      displayLabels: daily.map(d => d.date.slice(5)),
      values: daily.map(d => d.value),
    }
  }

  const useSum = metric === 'rain'
  const buckets = new Map<string, number[]>()
  const order: string[] = []

  daily.forEach(row => {
    const key = imageryTimePeriodKey(row.date, aggregation)
    if (!key) return
    if (!buckets.has(key)) {
      buckets.set(key, [])
      order.push(key)
    }
    buckets.get(key)!.push(row.value)
  })

  const labels = order
  const displayLabels = labels.map(k => formatImageryTimePeriodLabel(k, aggregation))
  const values = labels.map(key => {
    const nums = buckets.get(key) ?? []
    if (!nums.length) return null
    return useSum ? nums.reduce((a, b) => a + b, 0) : mean(nums)
  })

  return { labels, displayLabels, values }
}

export function buildWeatherHistoryChartSeries(
  points: OpenMeteoHourlyPoint[],
  metric: WeatherHistoryMetric,
  aggregation: WeatherTimeAggregation,
): WeatherChartSeries {
  const daily = buildWeatherDailySeries(points, metric)
  return aggregateWeatherChartSeries(daily, metric, aggregation)
}
