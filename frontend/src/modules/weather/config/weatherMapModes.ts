export type WeatherMapMode = 'weather' | 'satellite' | 'climate' | 'agriculture' | 'analysis'

export const WEATHER_MAP_MODES: Array<{ id: WeatherMapMode; label: string }> = [
  { id: 'weather', label: 'Weather' },
  { id: 'satellite', label: 'Satellite' },
  { id: 'climate', label: 'Climate' },
  { id: 'agriculture', label: 'Agriculture' },
  { id: 'analysis', label: 'Analysis' },
]
