import type { ImageryTimeSeriesLayerSeries } from '../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import type { TimeSeriesWeatherPoint, TimeSeriesWeatherSummary } from './timeSeriesReport/timeSeriesWeatherTimeline'

export type WeatherCompareMetric = 'temperature' | 'humidity' | 'rainfall' | 'wind'

export type WeatherCompareMetricDef = {
  id: WeatherCompareMetric
  label: string
  shortLabel: string
  unit: string
  color: string
  pick: (point: TimeSeriesWeatherPoint) => number | null
}

export const WEATHER_COMPARE_METRICS: readonly WeatherCompareMetricDef[] = [
  {
    id: 'temperature',
    label: 'Temperature',
    shortLabel: 'Temp',
    unit: '°C',
    color: '#f97316',
    pick: p => p.temperatureC,
  },
  {
    id: 'humidity',
    label: 'Humidity',
    shortLabel: 'Humid',
    unit: '%',
    color: '#06b6d4',
    pick: p => p.humidityPct,
  },
  {
    id: 'rainfall',
    label: 'Rainfall',
    shortLabel: 'Rain',
    unit: 'mm',
    color: '#3b82f6',
    pick: p => p.rainfallMm,
  },
  {
    id: 'wind',
    label: 'Wind Speed',
    shortLabel: 'Wind',
    unit: 'm/s',
    color: '#10b981',
    pick: p => p.windSpeedMs,
  },
] as const

export function weatherMetricDef(id: WeatherCompareMetric): WeatherCompareMetricDef {
  return WEATHER_COMPARE_METRICS.find(m => m.id === id)!
}

function trendLabel(first: number | null, last: number | null, higherIsMore: boolean): string {
  if (first == null || last == null || !Number.isFinite(first) || !Number.isFinite(last)) return 'stable'
  const delta = last - first
  if (Math.abs(delta) < 0.02 * Math.max(Math.abs(first), 1)) return 'stable'
  if (delta > 0) return higherIsMore ? 'increasing' : 'rising'
  return higherIsMore ? 'decreasing' : 'falling'
}

function fmtMetric(value: number | null, unit: string, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${value.toFixed(digits)}${unit}`
}

export function buildWeatherIndexInterpretation(
  metric: WeatherCompareMetric,
  weatherPoints: TimeSeriesWeatherPoint[],
  layerId: string,
  indexValues: Array<number | null>,
  summary: TimeSeriesWeatherSummary,
): string {
  const def = weatherMetricDef(metric)
  const weatherVals = weatherPoints.map(def.pick)
  const indexNums = indexValues.filter((v): v is number => v != null && Number.isFinite(v))
  const weatherNums = weatherVals.filter((v): v is number => v != null && Number.isFinite(v))

  if (!weatherNums.length || !indexNums.length) {
    return 'Run satellite analysis and enable a weather parameter to compare field conditions with vegetation indices.'
  }

  const wFirst = weatherNums[0]!
  const wLast = weatherNums[weatherNums.length - 1]!
  const iFirst = indexNums[0]!
  const iLast = indexNums[indexNums.length - 1]!
  const indexDelta = iLast - iFirst
  const layer = layerId.toUpperCase()

  const tempHigh = summary.avgTemperatureC != null && summary.avgTemperatureC >= 32
  const tempLow = summary.avgTemperatureC != null && summary.avgTemperatureC <= 12
  const rainLow = summary.totalRainfallMm != null && summary.totalRainfallMm < 5
  const humidLow = summary.avgHumidityPct != null && summary.avgHumidityPct < 35

  const parts: string[] = []

  if (metric === 'temperature') {
    parts.push(
      `Average temperature ${fmtMetric(summary.avgTemperatureC, '°C')} across the analysis window (range ${fmtMetric(wFirst, '°C')} → ${fmtMetric(wLast, '°C')}).`,
    )
    if (tempHigh && indexDelta < -0.03) {
      parts.push(
        `High temperature (${fmtMetric(summary.avgTemperatureC, '°C')}) with ${layer} declining to ${iLast.toFixed(3)} suggests heat-related vegetation stress — verify irrigation and canopy health in the field.`,
      )
    } else if (tempLow && indexDelta > 0.03) {
      parts.push(
        `Cooler conditions (${fmtMetric(summary.avgTemperatureC, '°C')}) align with improving ${layer} (${iFirst.toFixed(3)} → ${iLast.toFixed(3)}), indicating favourable growing conditions.`,
      )
    } else {
      parts.push(
        `${layer} moved ${indexDelta >= 0 ? 'up' : 'down'} (${iFirst.toFixed(3)} → ${iLast.toFixed(3)}) while temperature trend was ${trendLabel(wFirst, wLast, false)}.`,
      )
    }
  }

  if (metric === 'humidity') {
    parts.push(
      `Average humidity ${fmtMetric(summary.avgHumidityPct, '%', 0)} (period ${fmtMetric(wFirst, '%', 0)} → ${fmtMetric(wLast, '%', 0)}).`,
    )
    if (humidLow && indexDelta < -0.03) {
      parts.push(
        `Low atmospheric humidity (${fmtMetric(summary.avgHumidityPct, '%', 0)}) coincides with reduced ${layer}, indicating possible moisture-limited stress.`,
      )
    } else {
      parts.push(
        `Humidity ${trendLabel(wFirst, wLast, true)} while ${layer} ${indexDelta >= 0 ? 'recovered' : 'declined'} over the same periods.`,
      )
    }
  }

  if (metric === 'rainfall') {
    parts.push(
      `Total rainfall ${fmtMetric(summary.totalRainfallMm, ' mm', 1)} for the AOI period.`,
    )
    if (rainLow && indexDelta < -0.03) {
      parts.push(
        `Low rainfall (${fmtMetric(summary.totalRainfallMm, ' mm', 1)}) corresponds with ${layer} reduction (${iFirst.toFixed(3)} → ${iLast.toFixed(3)}), indicating possible water-deficit stress.`,
      )
    } else if (!rainLow && indexDelta > 0.03) {
      parts.push(
        `Adequate rainfall supports ${layer} gain (${iFirst.toFixed(3)} → ${iLast.toFixed(3)}); monitor drainage if totals exceed crop demand.`,
      )
    } else {
      parts.push(
        `Rainfall distribution and ${layer} trend should be interpreted together — scout fields after dry spells even when the index remains moderate.`,
      )
    }
  }

  if (metric === 'wind') {
    parts.push(
      `Average wind speed ${fmtMetric(summary.avgWindSpeedMs, ' m/s', 2)} (${fmtMetric(wFirst, ' m/s', 2)} → ${fmtMetric(wLast, ' m/s', 2)}).`,
    )
    const windy = summary.avgWindSpeedMs != null && summary.avgWindSpeedMs >= 6
    if (windy && humidLow) {
      parts.push(
        `Elevated wind with low humidity (avg ${fmtMetric(summary.avgHumidityPct, '%', 0)}) can increase evapotranspiration and amplify ${layer} stress signals.`,
      )
    } else {
      parts.push(
        `Wind remained ${trendLabel(wFirst, wLast, false)} while ${layer} changed from ${iFirst.toFixed(3)} to ${iLast.toFixed(3)}.`,
      )
    }
  }

  return parts.join(' ')
}

export function primaryIndexSeries(
  layerSeries: ImageryTimeSeriesLayerSeries[],
  layerId: string,
): ImageryTimeSeriesLayerSeries | null {
  const want = layerId.trim().toUpperCase()
  return layerSeries.find(s => s.layerId.toUpperCase() === want) ?? layerSeries[0] ?? null
}
