import { geometryMetrics } from '../../../../lib/geoAiLiveMapContext'
import { fetchOpenMeteoHistoryRange, type OpenMeteoHourlyPoint } from '../../../../lib/openMeteoWeather'
import {
  formatImageryTimePeriodLabel,
  imageryTimePeriodKey,
  type ImageryTimeAggregation,
  type ImageryTimeSeriesLayerSeries,
} from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'

export type TimeSeriesWeatherPoint = {
  periodKey: string
  displayLabel: string
  temperatureC: number | null
  humidityPct: number | null
  rainfallMm: number | null
  windSpeedMs: number | null
}

export type TimeSeriesWeatherSummary = {
  avgTemperatureC: number | null
  totalRainfallMm: number | null
  avgHumidityPct: number | null
  avgWindSpeedMs: number | null
}

export type TimeSeriesWeatherBlock = {
  timezone: string
  lat: number
  lng: number
  aggregation: ImageryTimeAggregation
  points: TimeSeriesWeatherPoint[]
  hourlyPoints: OpenMeteoHourlyPoint[]
  summary: TimeSeriesWeatherSummary
  correlationNotes: string[]
  dataSource: string
}

type DailyWeather = {
  date: string
  temperatureC: number | null
  humidityPct: number | null
  rainfallMm: number | null
  windSpeedMs: number | null
}

const KMH_TO_MS = 1 / 3.6

function mean(nums: number[]): number | null {
  if (!nums.length) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function sum(nums: number[]): number | null {
  if (!nums.length) return null
  return nums.reduce((a, b) => a + b, 0)
}

function pearsonR(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 3) return null
  const n = xs.length
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let num = 0
  let dx = 0
  let dy = 0
  for (let i = 0; i < n; i++) {
    const x = xs[i]! - mx
    const y = ys[i]! - my
    num += x * y
    dx += x * x
    dy += y * y
  }
  const den = Math.sqrt(dx * dy)
  if (!den) return null
  return num / den
}

export function kmhToMs(kmh: number | null | undefined): number | null {
  if (kmh == null || !Number.isFinite(kmh)) return null
  return Number((kmh * KMH_TO_MS).toFixed(3))
}

export function buildDailyWeatherFromHourly(points: OpenMeteoHourlyPoint[]): DailyWeather[] {
  const byDate = new Map<string, { temps: number[]; humids: number[]; rains: number[]; winds: number[] }>()
  for (const p of points) {
    const date = p.time.trim().slice(0, 10)
    if (!date) continue
    if (!byDate.has(date)) byDate.set(date, { temps: [], humids: [], rains: [], winds: [] })
    const bucket = byDate.get(date)!
    if (p.temperatureC != null && Number.isFinite(p.temperatureC)) bucket.temps.push(p.temperatureC)
    if (p.humidityPct != null && Number.isFinite(p.humidityPct)) bucket.humids.push(p.humidityPct)
    if (p.precipitationMm != null && Number.isFinite(p.precipitationMm)) bucket.rains.push(p.precipitationMm)
    const windMs = kmhToMs(p.windSpeedKmh)
    if (windMs != null) bucket.winds.push(windMs)
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, bucket]) => ({
      date,
      temperatureC: mean(bucket.temps),
      humidityPct: mean(bucket.humids),
      rainfallMm: sum(bucket.rains),
      windSpeedMs: mean(bucket.winds),
    }))
}

export function aggregateWeatherByChartPeriods(
  daily: DailyWeather[],
  chartLabels: string[],
  displayLabels: string[],
  aggregation: ImageryTimeAggregation,
): TimeSeriesWeatherPoint[] {
  const displayByKey = new Map(chartLabels.map((key, i) => [key, displayLabels[i] ?? key]))
  const buckets = new Map<string, { temps: number[]; humids: number[]; rains: number[]; winds: number[] }>()

  for (const row of daily) {
    const key = imageryTimePeriodKey(row.date, aggregation)
    if (!key || !displayByKey.has(key)) continue
    if (!buckets.has(key)) buckets.set(key, { temps: [], humids: [], rains: [], winds: [] })
    const bucket = buckets.get(key)!
    if (row.temperatureC != null) bucket.temps.push(row.temperatureC)
    if (row.humidityPct != null) bucket.humids.push(row.humidityPct)
    if (row.rainfallMm != null) bucket.rains.push(row.rainfallMm)
    if (row.windSpeedMs != null) bucket.winds.push(row.windSpeedMs)
  }

  return chartLabels.map(key => {
    const bucket = buckets.get(key)
    return {
      periodKey: key,
      displayLabel: displayByKey.get(key) ?? formatImageryTimePeriodLabel(key, aggregation),
      temperatureC: bucket ? mean(bucket.temps) : null,
      humidityPct: bucket ? mean(bucket.humids) : null,
      rainfallMm: bucket ? sum(bucket.rains) : null,
      windSpeedMs: bucket ? mean(bucket.winds) : null,
    }
  })
}

export function summarizeWeatherPoints(points: TimeSeriesWeatherPoint[]): TimeSeriesWeatherSummary {
  const temps = points.map(p => p.temperatureC).filter((v): v is number => v != null && Number.isFinite(v))
  const humids = points.map(p => p.humidityPct).filter((v): v is number => v != null && Number.isFinite(v))
  const rains = points.map(p => p.rainfallMm).filter((v): v is number => v != null && Number.isFinite(v))
  const winds = points.map(p => p.windSpeedMs).filter((v): v is number => v != null && Number.isFinite(v))
  return {
    avgTemperatureC: mean(temps),
    totalRainfallMm: sum(rains),
    avgHumidityPct: mean(humids),
    avgWindSpeedMs: mean(winds),
  }
}

export function buildWeatherVegetationCorrelationNotes(
  weather: TimeSeriesWeatherPoint[],
  layerSeries: ImageryTimeSeriesLayerSeries[],
): string[] {
  const notes: string[] = []
  const pairs: Array<{ layerId: string; label: string }> = [
    { layerId: 'NDVI', label: 'vegetation vigor (NDVI)' },
    { layerId: 'NDMI', label: 'canopy moisture (NDMI)' },
    { layerId: 'NDWI', label: 'surface water (NDWI)' },
  ]

  for (const { layerId, label } of pairs) {
    const series = layerSeries.find(s => s.layerId.toUpperCase() === layerId)
    if (!series) continue

    const align = (pick: (w: TimeSeriesWeatherPoint) => number | null) => {
      const xs: number[] = []
      const ys: number[] = []
      for (let i = 0; i < weather.length; i++) {
        const iv = series.values[i]
        const wv = pick(weather[i]!)
        if (iv == null || !Number.isFinite(iv) || wv == null || !Number.isFinite(wv)) continue
        xs.push(iv)
        ys.push(wv)
      }
      return pearsonR(xs, ys)
    }

    const rTemp = align(w => w.temperatureC)
    const rRain = align(w => w.rainfallMm)
    const rHumid = align(w => w.humidityPct)

    if (rTemp != null && Math.abs(rTemp) >= 0.35) {
      notes.push(
        `${label} shows a ${rTemp > 0 ? 'positive' : 'negative'} association with temperature (r≈${rTemp.toFixed(2)}) — ${
          rTemp > 0
            ? 'warmer periods align with higher index values; monitor heat stress if temperatures rise further.'
            : 'cooler periods align with higher index values; heat may be limiting canopy performance.'
        }`,
      )
    }
    if (rRain != null && Math.abs(rRain) >= 0.35) {
      notes.push(
        `${label} correlates ${rRain > 0 ? 'positively' : 'negatively'} with rainfall (r≈${rRain.toFixed(2)}) — ${
          rRain > 0
            ? 'precipitation events support vegetation response in this period.'
            : 'index peaks occur during drier periods; verify irrigation or residual soil moisture.'
        }`,
      )
    }
    if (rHumid != null && Math.abs(rHumid) >= 0.35) {
      notes.push(
        `${label} tracks humidity ${rHumid > 0 ? 'upward' : 'downward'} (r≈${rHumid.toFixed(2)}) — atmospheric moisture ${
          rHumid > 0 ? 'supports' : 'may lag'
        } canopy condition signals from satellite.`,
      )
    }
  }

  const primary = layerSeries[0]
  if (primary && notes.length === 0) {
    notes.push(
      `Weather and ${primary.layerId.toUpperCase()} co-varied within normal bounds for the selected period — no strong linear correlation was detected; interpret satellite trends alongside field scouting.`,
    )
  }

  return notes.slice(0, 5)
}

export type BuildTimeSeriesWeatherTimelineInput = {
  geometry: GeoJSON.Geometry | null
  fromDate: string
  toDate: string
  chartLabels: string[]
  displayLabels: string[]
  timeAggregation: ImageryTimeAggregation
  layerSeries: ImageryTimeSeriesLayerSeries[]
}

export async function buildTimeSeriesWeatherTimeline(
  input: BuildTimeSeriesWeatherTimelineInput,
): Promise<TimeSeriesWeatherBlock | null> {
  const metrics = input.geometry ? geometryMetrics(input.geometry) : null
  const centroid = metrics?.centroid
  if (!centroid || centroid.length < 2) return null

  const lat = centroid[1]!
  const lng = centroid[0]!
  const from = input.fromDate.trim().slice(0, 10)
  const to = input.toDate.trim().slice(0, 10)
  if (!from || !to || from >= to) return null

  let history
  try {
    history = await fetchOpenMeteoHistoryRange(lat, lng, from, to)
  } catch {
    return null
  }

  const daily = buildDailyWeatherFromHourly(history.points)
  const points = aggregateWeatherByChartPeriods(
    daily,
    input.chartLabels,
    input.displayLabels,
    input.timeAggregation,
  )
  if (!points.some(p => p.temperatureC != null || p.rainfallMm != null)) return null

  const summary = summarizeWeatherPoints(points)
  const correlationNotes = buildWeatherVegetationCorrelationNotes(points, input.layerSeries)

  return {
    timezone: history.timezone,
    lat,
    lng,
    aggregation: input.timeAggregation,
    points,
    hourlyPoints: history.points,
    summary,
    correlationNotes,
    dataSource: 'Open-Meteo ERA5 archive (AOI centroid)',
  }
}
