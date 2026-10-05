export type WeatherVizMode =
  | 'heatmap'
  | 'points'
  | 'interpolated'
  | 'contours'
  | 'wind'
  | 'animated'

export const WEATHER_VIZ_MODES: Array<{ id: WeatherVizMode; label: string; hint?: string }> = [
  { id: 'heatmap', label: 'Heatmap', hint: 'Windy-style ECMWF forecast tiles' },
  { id: 'interpolated', label: 'Interpolated', hint: 'Smooth IDW field + forecast tiles' },
  { id: 'contours', label: 'Contours', hint: 'Forecast tiles (continuous field)' },
  { id: 'wind', label: 'Wind field', hint: 'Speed tiles + direction arrows' },
  { id: 'animated', label: 'Timeline', hint: 'Animate forecast along timeline' },
  { id: 'points', label: 'Samples', hint: 'Discrete grid points & hotspots' },
]

export type WeatherPrecipWindow = '1h' | '3h' | '6h' | '12h' | '24h' | '7d'

export const WEATHER_PRECIP_WINDOWS: WeatherPrecipWindow[] = ['1h', '3h', '6h', '12h', '24h', '7d']
