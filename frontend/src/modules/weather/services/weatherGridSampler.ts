import { fetchOpenMeteoWeatherMapPick } from '@/modules/remote-sensing/weather/openMeteoWeather'
import type { WeatherHotspotMetric } from '../config/weatherLayerCatalog'

export type WeatherGridSample = {
  lat: number
  lng: number
  value: number
}

export type WeatherHotspotTier = 'critical' | 'high' | 'normal' | 'low'

export type WeatherHotspot = WeatherGridSample & {
  kind: 'high' | 'low'
  delta: number
  tier: WeatherHotspotTier
}

export type LngLatBBox = { west: number; south: number; east: number; north: number }

function metricValue(
  metric: WeatherHotspotMetric,
  snap: Awaited<ReturnType<typeof fetchOpenMeteoWeatherMapPick>>,
): number | null {
  switch (metric) {
    case 'temperature':
      return snap.temperatureC
    case 'humidity':
      return snap.humidityPct
    case 'wind_speed':
      return snap.windSpeedKmh
    case 'pressure':
      return snap.pressureHpa ?? null
    default:
      return null
  }
}

export async function sampleWeatherGrid(
  bbox: LngLatBBox,
  gridSize: number,
  metric: WeatherHotspotMetric,
): Promise<WeatherGridSample[]> {
  const samples: WeatherGridSample[] = []
  const steps = Math.max(2, Math.min(gridSize, 8))
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < steps; j++) {
      const lng = bbox.west + ((bbox.east - bbox.west) * (j + 0.5)) / steps
      const lat = bbox.south + ((bbox.north - bbox.south) * (i + 0.5)) / steps
      try {
        const snap = await fetchOpenMeteoWeatherMapPick(lat, lng)
        const value = metricValue(metric, snap)
        if (value == null || !Number.isFinite(value)) continue
        samples.push({ lat, lng, value })
      } catch {
        /* skip failed cell */
      }
    }
  }
  return samples
}

export function detectWeatherHotspots(
  samples: WeatherGridSample[],
  thresholdPct = 0.2,
): WeatherHotspot[] {
  if (samples.length < 4) return []
  const values = samples.map(s => s.value)
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const sorted = [...values].sort((a, b) => a - b)
  const pLow = sorted[Math.floor(sorted.length * 0.15)] ?? mean
  const pHigh = sorted[Math.floor(sorted.length * 0.85)] ?? mean
  const span = Math.max(pHigh - pLow, 1e-6)
  const hotspots: WeatherHotspot[] = []
  for (const s of samples) {
    if (s.value >= pHigh && s.value - mean >= span * thresholdPct) {
      const tier: WeatherHotspotTier =
        s.value - mean >= span * 0.45 ? 'critical' : 'high'
      hotspots.push({ ...s, kind: 'high', delta: s.value - mean, tier })
    } else if (s.value <= pLow && mean - s.value >= span * thresholdPct) {
      const tier: WeatherHotspotTier =
        mean - s.value >= span * 0.45 ? 'low' : 'normal'
      hotspots.push({ ...s, kind: 'low', delta: s.value - mean, tier })
    }
  }
  return hotspots.slice(0, 24)
}
