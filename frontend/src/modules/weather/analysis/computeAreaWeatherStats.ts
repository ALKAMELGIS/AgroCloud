import type { WeatherGridSample } from '../services/weatherGridSampler'

export type AreaWeatherStats = {
  count: number
  mean: number | null
  min: number | null
  max: number | null
  range: number | null
  stdDev: number | null
  p25: number | null
  p75: number | null
}

export function computeAreaWeatherStats(samples: WeatherGridSample[]): AreaWeatherStats {
  const values = samples.map(s => s.value).filter(v => Number.isFinite(v))
  if (!values.length) {
    return { count: 0, mean: null, min: null, max: null, range: null, stdDev: null, p25: null, p75: null }
  }
  const sorted = [...values].sort((a, b) => a - b)
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const min = sorted[0]!
  const max = sorted[sorted.length - 1]!
  const p25 = sorted[Math.floor(sorted.length * 0.25)] ?? null
  const p75 = sorted[Math.floor(sorted.length * 0.75)] ?? null
  const stdDev =
    values.length > 1
      ? Math.sqrt(values.reduce((s, x) => s + (x - mean) ** 2, 0) / (values.length - 1))
      : null
  return { count: values.length, mean, min, max, range: max - min, stdDev, p25, p75 }
}
