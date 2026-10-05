import type { WeatherLayerChipAnim } from './weatherLayerChips'

export type WeatherMapToolbarAction = 'identify' | 'statistics' | 'hotspot' | 'timeseries' | 'export'

export const WEATHER_MAP_TOOLBAR_CHIPS: Array<{
  id: WeatherMapToolbarAction
  label: string
  emoji: string
  anim: WeatherLayerChipAnim
}> = [
  { id: 'identify', label: 'Identify', emoji: '🔍', anim: 'glow' },
  { id: 'statistics', label: 'Statistics', emoji: '📊', anim: 'pulse' },
  { id: 'hotspot', label: 'Hotspot', emoji: '🔥', anim: 'pulse' },
  { id: 'timeseries', label: 'Time series', emoji: '📈', anim: 'drift' },
  { id: 'export', label: 'Export', emoji: '📤', anim: 'wind' },
]
