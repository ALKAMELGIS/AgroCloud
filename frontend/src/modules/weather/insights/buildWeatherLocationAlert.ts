import type { WeatherLayerChipAnim } from '../config/weatherLayerChips'
import {
  DEFAULT_WEATHER_OPERATIONS_THRESHOLDS,
  loadWeatherOperationsThresholds,
  type WeatherOperationsThresholds,
} from '../config/weatherThresholds'
import type { WeatherLocationRow } from '../hooks/useWeatherLocationRows'

export type WeatherLocationAlertSeverity = 'warning' | 'caution'

export type WeatherLocationAlert = {
  id: string
  emoji: string
  anim: WeatherLayerChipAnim
  severity: WeatherLocationAlertSeverity
  shortLabel: string
  title: string
  priority: number
}

function isStormCode(code: number | null | undefined): boolean {
  if (code == null || !Number.isFinite(code)) return false
  return Math.round(code) >= 95
}

function isSnowCode(code: number | null | undefined): boolean {
  if (code == null || !Number.isFinite(code)) return false
  const c = Math.round(code)
  return (c >= 71 && c <= 77) || (c >= 85 && c <= 86)
}

function isRainCode(code: number | null | undefined): boolean {
  if (code == null || !Number.isFinite(code)) return false
  const c = Math.round(code)
  return (c >= 51 && c <= 67) || (c >= 80 && c <= 82)
}

function num(v: number | null | undefined): number | null {
  return v != null && Number.isFinite(v) ? v : null
}

/** Highest-priority live alert for a location row (map + sidebar). */
export function buildWeatherLocationAlert(
  row: Pick<
    WeatherLocationRow,
    'temperatureC' | 'humidityPct' | 'windSpeedKmh' | 'precipMm' | 'weatherCode'
  >,
  thresholds: WeatherOperationsThresholds = DEFAULT_WEATHER_OPERATIONS_THRESHOLDS,
): WeatherLocationAlert | null {
  const temp = num(row.temperatureC)
  const rh = num(row.humidityPct)
  const wind = num(row.windSpeedKmh)
  const precip = num(row.precipMm)
  const code = row.weatherCode

  if (temp == null && rh == null && wind == null && code == null) return null

  const candidates: WeatherLocationAlert[] = []

  const push = (alert: WeatherLocationAlert) => {
    candidates.push(alert)
  }

  if (isStormCode(code)) {
    push({
      id: 'thunderstorm',
      emoji: '⛈️',
      anim: 'pulse',
      severity: 'warning',
      shortLabel: 'Storm',
      title: 'Thunderstorm — secure equipment and pause spraying',
      priority: 100,
    })
  }

  if (
    (isSnowCode(code) || (temp != null && temp <= 2)) &&
    wind != null &&
    wind >= thresholds.windSprayWarningKmh
  ) {
    push({
      id: 'snow-wind',
      emoji: '🌨️',
      anim: 'snow',
      severity: 'warning',
      shortLabel: 'Snow & wind',
      title: `Snow / ice with wind ${Math.round(wind)} km/h — cold stress risk`,
      priority: 95,
    })
  }

  if (
    temp != null &&
    temp >= thresholds.heatStressC &&
    rh != null &&
    rh >= thresholds.highHumidityPct &&
    wind != null &&
    wind >= thresholds.windSprayCautionKmh
  ) {
    push({
      id: 'heat-humidity-wind',
      emoji: '🥵',
      anim: 'wind',
      severity: 'warning',
      shortLabel: 'Heat+hum+wind',
      title: `${temp.toFixed(1)}°C, ${Math.round(rh)}% RH, wind ${Math.round(wind)} km/h — extreme discomfort`,
      priority: 90,
    })
  }

  if (temp != null && temp >= thresholds.heatStressC && rh != null && rh >= thresholds.highHumidityPct) {
    push({
      id: 'heat-humidity',
      emoji: '💦',
      anim: 'pulse',
      severity: 'warning',
      shortLabel: 'Heat & humid',
      title: `${temp.toFixed(1)}°C with ${Math.round(rh)}% humidity — heat stress`,
      priority: 85,
    })
  }

  if (temp != null && temp >= 50) {
    push({
      id: 'critical-heat-50',
      emoji: '🔥',
      anim: 'glow',
      severity: 'warning',
      shortLabel: 'Critical heat',
      title: `${temp.toFixed(1)}°C — critical heat above 50°C`,
      priority: 86,
    })
  }

  if (temp != null && temp >= thresholds.heatStressC) {
    push({
      id: 'extreme-heat',
      emoji: '🥵',
      anim: 'glow',
      severity: 'warning',
      shortLabel: 'Very hot',
      title: `${temp.toFixed(1)}°C — limit outdoor work and irrigation timing`,
      priority: 80,
    })
  }

  if (temp != null && temp <= thresholds.frostC) {
    push({
      id: 'extreme-cold',
      emoji: '🥶',
      anim: 'snow',
      severity: 'warning',
      shortLabel: 'Very cold',
      title: `${temp.toFixed(1)}°C — frost / cold alert`,
      priority: 78,
    })
  } else if (temp != null && temp <= 10) {
    push({
      id: 'cold-below-10',
      emoji: '❄️',
      anim: 'snow',
      severity: 'caution',
      shortLabel: 'Cold',
      title: `${temp.toFixed(1)}°C — below 10°C, monitor sensitive crops`,
      priority: 57,
    })
  }

  if (wind != null && wind >= thresholds.highWindAlertKmh + 10) {
    push({
      id: 'extreme-wind',
      emoji: '🌪️',
      anim: 'spin',
      severity: 'warning',
      shortLabel: 'High wind',
      title: `Wind ${Math.round(wind)} km/h — structures and spraying at risk`,
      priority: 75,
    })
  } else if (wind != null && wind >= thresholds.highWindAlertKmh) {
    push({
      id: 'high-wind',
      emoji: '💨',
      anim: 'wind',
      severity: 'warning',
      shortLabel: 'Wind alert',
      title: `Wind ${Math.round(wind)} km/h — delay spraying`,
      priority: 70,
    })
  } else if (wind != null && wind >= thresholds.windSprayWarningKmh) {
    push({
      id: 'wind-caution',
      emoji: '💨',
      anim: 'wind',
      severity: 'caution',
      shortLabel: 'Windy',
      title: `Wind ${Math.round(wind)} km/h — marginal for spraying`,
      priority: 45,
    })
  }

  if (
    temp != null &&
    temp >= thresholds.heatStressC - 3 &&
    wind != null &&
    wind >= thresholds.windSprayCautionKmh
  ) {
    push({
      id: 'heat-wind',
      emoji: '🌡️',
      anim: 'pulse',
      severity: 'caution',
      shortLabel: 'Heat & wind',
      title: `${temp.toFixed(1)}°C with wind ${Math.round(wind)} km/h`,
      priority: 50,
    })
  }

  if (rh != null && rh >= thresholds.highHumidityPct) {
    push({
      id: 'high-humidity',
      emoji: '💧',
      anim: 'drift',
      severity: 'caution',
      shortLabel: 'Humid',
      title: `${Math.round(rh)}% humidity — leaf wetness / disease pressure`,
      priority: 40,
    })
  }

  if (rh != null && rh <= thresholds.lowHumidityPct) {
    push({
      id: 'low-humidity',
      emoji: '🏜️',
      anim: 'glow',
      severity: 'caution',
      shortLabel: 'Dry air',
      title: `${Math.round(rh)}% humidity — irrigation / transpiration stress`,
      priority: 38,
    })
  }

  if (
    (precip != null && precip >= thresholds.heavyRainMm6h) ||
    (isRainCode(code) && precip != null && precip >= 1)
  ) {
    push({
      id: 'heavy-rain',
      emoji: '🌧️',
      anim: 'rain',
      severity: 'warning',
      shortLabel: 'Rain',
      title:
        precip != null
          ? `Precipitation ${precip.toFixed(1)} mm — field access limited`
          : 'Heavy rain — field access limited',
      priority: 65,
    })
  }

  if (isSnowCode(code) && !candidates.some(c => c.id === 'snow-wind')) {
    push({
      id: 'snow',
      emoji: '❄️',
      anim: 'snow',
      severity: 'caution',
      shortLabel: 'Snow',
      title: 'Snow / sleet — monitor crops and access',
      priority: 60,
    })
  }

  if (!candidates.length) return null

  candidates.sort((a, b) => b.priority - a.priority)
  return candidates[0]!
}

export function resolveWeatherLocationAlert(
  row: WeatherLocationRow,
  thresholds?: WeatherOperationsThresholds,
): WeatherLocationAlert | null {
  return buildWeatherLocationAlert(row, thresholds ?? loadWeatherOperationsThresholds())
}
