import type { WeatherMapLayerId } from './weatherLayerCatalog'

export type WeatherLayerChipAnim =
  | 'pulse'
  | 'wind'
  | 'spin'
  | 'rain'
  | 'snow'
  | 'drift'
  | 'glow'

export type WeatherLayerChipMeta = {
  emoji: string
  anim: WeatherLayerChipAnim
}

export const WEATHER_LAYER_CHIP_META: Record<WeatherMapLayerId, WeatherLayerChipMeta> = {
  temperature: { emoji: '🌡️', anim: 'pulse' },
  apparent_temperature: { emoji: '🥵', anim: 'pulse' },
  dew_point: { emoji: '💧', anim: 'drift' },
  humidity: { emoji: '💦', anim: 'drift' },
  wind_speed: { emoji: '💨', anim: 'wind' },
  wind_direction: { emoji: '🧭', anim: 'spin' },
  precipitation: { emoji: '🌧️', anim: 'rain' },
  rain: { emoji: '☔', anim: 'rain' },
  snowfall: { emoji: '❄️', anim: 'snow' },
  cloud_cover: { emoji: '☁️', anim: 'drift' },
  pressure: { emoji: '🌀', anim: 'spin' },
  visibility: { emoji: '👁️', anim: 'glow' },
}

export function weatherLayerChipMeta(id: WeatherMapLayerId): WeatherLayerChipMeta {
  return WEATHER_LAYER_CHIP_META[id] ?? { emoji: '🌤️', anim: 'pulse' }
}
