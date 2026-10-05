import type { WeatherOperationsSettings } from '@/core/types/systemSettings'
import { loadSystemSettings } from '@/core/services/settingsStorage'
import { SYSTEM_SETTINGS_UPDATED_EVENT } from '@/core/services/settingsStorage'

export type WeatherOperationsThresholds = WeatherOperationsSettings

export const DEFAULT_WEATHER_OPERATIONS_THRESHOLDS: WeatherOperationsThresholds = {
  windSprayWarningKmh: 25,
  windSprayCautionKmh: 15,
  heatStressC: 38,
  frostC: 2,
  heavyRainMm6h: 5,
  highHumidityPct: 85,
  lowHumidityPct: 25,
  highWindAlertKmh: 28,
}

/** Optional persisted override (localStorage) until System Settings UI section is saved. */
const LS_KEY = 'agro_weather_ops_thresholds_v1'

function mergeThresholdLayers(): WeatherOperationsThresholds {
  const fromSettings = loadSystemSettings().weatherOperations
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return { ...DEFAULT_WEATHER_OPERATIONS_THRESHOLDS, ...fromSettings }
    const parsed = JSON.parse(raw) as Partial<WeatherOperationsThresholds>
    return { ...DEFAULT_WEATHER_OPERATIONS_THRESHOLDS, ...fromSettings, ...parsed }
  } catch {
    return { ...DEFAULT_WEATHER_OPERATIONS_THRESHOLDS, ...fromSettings }
  }
}

export function loadWeatherOperationsThresholds(): WeatherOperationsThresholds {
  return mergeThresholdLayers()
}

/** Re-read when System Settings change in the same tab. */
export function subscribeWeatherOperationsThresholds(onChange: () => void): () => void {
  const handler = () => onChange()
  window.addEventListener(SYSTEM_SETTINGS_UPDATED_EVENT, handler)
  return () => window.removeEventListener(SYSTEM_SETTINGS_UPDATED_EVENT, handler)
}

export function saveWeatherOperationsThresholds(next: WeatherOperationsThresholds): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(next))
  } catch {
    /* quota */
  }
}
