/** Phase 2 — optional layers (env-driven). Shown in UI as disabled/stub until configured. */

export type WeatherPhase2LayerId = 'climate_era5_annual_temp' | 'satellite_viirs_truecolor'

export type WeatherPhase2LayerDef = {
  id: WeatherPhase2LayerId
  label: string
  dataClass: 'climate' | 'satellite'
  envKey: string
  sourceLabel: string
  resolutionLabel: string
  periodLabel?: string
}

export const WEATHER_PHASE2_LAYERS: WeatherPhase2LayerDef[] = [
  {
    id: 'climate_era5_annual_temp',
    label: 'Average Annual Temperature (1981–2010)',
    dataClass: 'climate',
    envKey: 'VITE_WEATHER_CLIMATE_LAYER_URL',
    sourceLabel: 'ERA5 / Copernicus',
    resolutionLabel: '~9 km',
    periodLabel: '1981–2010',
  },
  {
    id: 'satellite_viirs_truecolor',
    label: 'True-color Satellite (VIIRS)',
    dataClass: 'satellite',
    envKey: 'VITE_WEATHER_VIIRS_IMAGE_SERVER',
    sourceLabel: 'Esri Living Atlas · NOAA-20 VIIRS',
    resolutionLabel: '375 m',
  },
]

export function isWeatherPhase2LayerConfigured(layer: WeatherPhase2LayerDef): boolean {
  const raw = import.meta.env[layer.envKey as keyof ImportMetaEnv]
  return Boolean(String(raw ?? '').trim())
}

/** Leaflet `{z}/{y}/{x}` tile URL — used when VITE_WEATHER_VIIRS_IMAGE_SERVER is unset. */
export const DEFAULT_WEATHER_SATELLITE_TILE_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'

export function getWeatherSatelliteTileUrl(): string {
  const custom = String(import.meta.env.VITE_WEATHER_VIIRS_IMAGE_SERVER ?? '').trim()
  if (custom) {
    if (custom.includes('{z}')) return custom
    const base = custom.replace(/\/+$/, '')
    if (/\/MapServer$/i.test(base)) return `${base}/tile/{z}/{y}/{x}`
    if (/\/ImageServer$/i.test(base)) {
      return `${base}/exportImage?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256&f=image&format=jpg&interpolation=RSP_BilinearInterpolation`
    }
    return custom
  }
  return DEFAULT_WEATHER_SATELLITE_TILE_URL
}

export function isWeatherSatelliteUsingDefaultTiles(): boolean {
  return !String(import.meta.env.VITE_WEATHER_VIIRS_IMAGE_SERVER ?? '').trim()
}

export function isWeatherClimateMapModeAvailable(): boolean {
  const layer = WEATHER_PHASE2_LAYERS.find(l => l.id === 'climate_era5_annual_temp')
  return layer ? isWeatherPhase2LayerConfigured(layer) : false
}
