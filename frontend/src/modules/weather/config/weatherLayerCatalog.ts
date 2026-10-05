export type WeatherDataClass = 'realtime' | 'forecast' | 'climate' | 'satellite'

export type WeatherMapLayerId =
  | 'temperature'
  | 'apparent_temperature'
  | 'dew_point'
  | 'humidity'
  | 'wind_speed'
  | 'wind_direction'
  | 'precipitation'
  | 'rain'
  | 'snowfall'
  | 'cloud_cover'
  | 'pressure'
  | 'visibility'
  | 'shortwave_radiation'

export type WeatherHotspotMetric = 'pressure' | 'temperature' | 'humidity' | 'wind_speed'

export type WeatherMapLayerDef = {
  id: WeatherMapLayerId
  label: string
  unit: string
  dataClass: WeatherDataClass
  /** Open-Meteo map tiles variable segment */
  openMeteoVariable: string
  legendStops: Array<{ value: number; color: string }>
  supportsHotspot: boolean
  hotspotMetric?: WeatherHotspotMetric
}

const OPEN_METEO_MAP_MODEL = 'ecmwf_ifs'

/** Hour-precision ISO for Open-Meteo map tiles (ECMWF IFS). */
export function formatOpenMeteoMapTileTime(timeIso?: string): string | undefined {
  if (!timeIso) return undefined
  const normalized = timeIso.trim().replace(' ', 'T')
  if (normalized.length >= 16) return normalized.slice(0, 16)
  return normalized
}

export function buildOpenMeteoMapTileUrl(variable: string, timeIso?: string): string {
  const base = `https://map-tiles.open-meteo.com/v1/${OPEN_METEO_MAP_MODEL}/${variable}/{z}/{x}/{y}.png`
  const t = formatOpenMeteoMapTileTime(timeIso)
  if (!t) return base
  return `${base}?time=${encodeURIComponent(t)}`
}

export const WEATHER_MAP_LAYERS: WeatherMapLayerDef[] = [
  {
    id: 'temperature',
    label: 'Air Temperature',
    unit: '°C',
    dataClass: 'forecast',
    openMeteoVariable: 'temperature_2m',
    supportsHotspot: true,
    hotspotMetric: 'temperature',
    legendStops: [
      { value: -10, color: '#312e81' },
      { value: 0, color: '#3b82f6' },
      { value: 15, color: '#22c55e' },
      { value: 25, color: '#eab308' },
      { value: 35, color: '#ef4444' },
    ],
  },
  {
    id: 'apparent_temperature',
    label: 'Apparent Temperature',
    unit: '°C',
    dataClass: 'forecast',
    openMeteoVariable: 'apparent_temperature',
    supportsHotspot: true,
    hotspotMetric: 'temperature',
    legendStops: [
      { value: -5, color: '#312e81' },
      { value: 10, color: '#3b82f6' },
      { value: 25, color: '#eab308' },
      { value: 38, color: '#ef4444' },
    ],
  },
  {
    id: 'dew_point',
    label: 'Dew Point',
    unit: '°C',
    dataClass: 'forecast',
    openMeteoVariable: 'dew_point_2m',
    supportsHotspot: false,
    legendStops: [
      { value: -5, color: '#1e3a8a' },
      { value: 5, color: '#06b6d4' },
      { value: 15, color: '#84cc16' },
      { value: 25, color: '#f97316' },
    ],
  },
  {
    id: 'humidity',
    label: 'Relative Humidity',
    unit: '%',
    dataClass: 'forecast',
    openMeteoVariable: 'relative_humidity_2m',
    supportsHotspot: true,
    hotspotMetric: 'humidity',
    legendStops: [
      { value: 20, color: '#fef3c7' },
      { value: 50, color: '#86efac' },
      { value: 80, color: '#0ea5e9' },
      { value: 100, color: '#1e40af' },
    ],
  },
  {
    id: 'wind_speed',
    label: 'Wind Speed',
    unit: 'km/h',
    dataClass: 'forecast',
    openMeteoVariable: 'wind_speed_10m',
    supportsHotspot: true,
    hotspotMetric: 'wind_speed',
    legendStops: [
      { value: 0, color: '#f8fafc' },
      { value: 20, color: '#fde047' },
      { value: 40, color: '#f97316' },
      { value: 60, color: '#dc2626' },
    ],
  },
  {
    id: 'wind_direction',
    label: 'Wind Direction',
    unit: '°',
    dataClass: 'forecast',
    openMeteoVariable: 'wind_direction_10m',
    supportsHotspot: false,
    legendStops: [
      { value: 0, color: '#94a3b8' },
      { value: 180, color: '#64748b' },
      { value: 360, color: '#94a3b8' },
    ],
  },
  {
    id: 'precipitation',
    label: 'Precipitation',
    unit: 'mm',
    dataClass: 'forecast',
    openMeteoVariable: 'precipitation',
    supportsHotspot: false,
    legendStops: [
      { value: 0, color: '#f1f5f9' },
      { value: 2, color: '#93c5fd' },
      { value: 10, color: '#2563eb' },
      { value: 30, color: '#1e3a8a' },
    ],
  },
  {
    id: 'rain',
    label: 'Rain',
    unit: 'mm',
    dataClass: 'forecast',
    openMeteoVariable: 'rain',
    supportsHotspot: false,
    legendStops: [
      { value: 0, color: '#f1f5f9' },
      { value: 2, color: '#93c5fd' },
      { value: 10, color: '#2563eb' },
    ],
  },
  {
    id: 'snowfall',
    label: 'Snowfall',
    unit: 'cm',
    dataClass: 'forecast',
    openMeteoVariable: 'snowfall',
    supportsHotspot: false,
    legendStops: [
      { value: 0, color: '#f8fafc' },
      { value: 5, color: '#bae6fd' },
      { value: 20, color: '#ffffff' },
    ],
  },
  {
    id: 'cloud_cover',
    label: 'Cloud Cover',
    unit: '%',
    dataClass: 'forecast',
    openMeteoVariable: 'cloud_cover',
    supportsHotspot: false,
    legendStops: [
      { value: 0, color: '#0f172a' },
      { value: 50, color: '#64748b' },
      { value: 100, color: '#e2e8f0' },
    ],
  },
  {
    id: 'pressure',
    label: 'Surface Pressure',
    unit: 'hPa',
    dataClass: 'forecast',
    openMeteoVariable: 'surface_pressure',
    supportsHotspot: true,
    hotspotMetric: 'pressure',
    legendStops: [
      { value: 990, color: '#7c3aed' },
      { value: 1010, color: '#22c55e' },
      { value: 1030, color: '#f59e0b' },
    ],
  },
  {
    id: 'visibility',
    label: 'Visibility',
    unit: 'km',
    dataClass: 'forecast',
    openMeteoVariable: 'visibility',
    supportsHotspot: false,
    legendStops: [
      { value: 1, color: '#78350f' },
      { value: 5, color: '#ca8a04' },
      { value: 20, color: '#a7f3d0' },
    ],
  },
  {
    id: 'shortwave_radiation',
    label: 'Solar Radiation',
    unit: 'W/m²',
    dataClass: 'forecast',
    openMeteoVariable: 'shortwave_radiation',
    supportsHotspot: false,
    legendStops: [
      { value: 0, color: '#1e1b4b' },
      { value: 200, color: '#7c3aed' },
      { value: 500, color: '#fbbf24' },
      { value: 900, color: '#fef9c3' },
    ],
  },
]

export function getWeatherMapLayer(id: WeatherMapLayerId): WeatherMapLayerDef {
  return WEATHER_MAP_LAYERS.find(l => l.id === id) ?? WEATHER_MAP_LAYERS[0]!
}

export const WEATHER_HOTSPOT_METRICS: WeatherHotspotMetric[] = [
  'pressure',
  'temperature',
  'humidity',
  'wind_speed',
]
