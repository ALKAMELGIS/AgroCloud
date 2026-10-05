import { wmoWeatherTone, type WmoWeatherTone } from '@/modules/remote-sensing/weather/openMeteoWeather'
import type { WeatherLayerChipAnim } from './weatherLayerChips'

export type WmoWeatherEmojiMeta = {
  emoji: string
  anim: WeatherLayerChipAnim
}

const TONE_META: Record<WmoWeatherTone, WmoWeatherEmojiMeta> = {
  clear: { emoji: '☀️', anim: 'glow' },
  partly: { emoji: '⛅', anim: 'drift' },
  cloud: { emoji: '☁️', anim: 'drift' },
  fog: { emoji: '🌫️', anim: 'drift' },
  drizzle: { emoji: '🌦️', anim: 'rain' },
  rain: { emoji: '🌧️', anim: 'rain' },
  snow: { emoji: '❄️', anim: 'snow' },
  storm: { emoji: '⛈️', anim: 'pulse' },
  neutral: { emoji: '🌤️', anim: 'pulse' },
}

/** Premium live-map emoji + motion keyed to WMO weather code. */
export function wmoWeatherEmojiMeta(code: number | null | undefined): WmoWeatherEmojiMeta {
  if (code == null || !Number.isFinite(code)) return TONE_META.neutral
  const c = Math.round(code)
  if (c === 0) return { emoji: '☀️', anim: 'glow' }
  if (c === 1) return { emoji: '🌤️', anim: 'glow' }
  if (c === 2) return { emoji: '⛅', anim: 'drift' }
  if (c === 3) return { emoji: '☁️', anim: 'drift' }
  if (c === 45 || c === 48) return { emoji: '🌫️', anim: 'drift' }
  if (c >= 51 && c <= 57) return { emoji: '🌦️', anim: 'rain' }
  if (c >= 61 && c <= 67) return { emoji: '🌧️', anim: 'rain' }
  if (c >= 71 && c <= 77) return { emoji: '❄️', anim: 'snow' }
  if (c >= 80 && c <= 82) return { emoji: '🌧️', anim: 'rain' }
  if (c >= 85 && c <= 86) return { emoji: '🌨️', anim: 'snow' }
  if (c >= 95) return { emoji: '⛈️', anim: 'pulse' }
  return TONE_META[wmoWeatherTone(c)]
}

