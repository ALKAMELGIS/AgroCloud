import type { WeatherLocationRow } from '../hooks/useWeatherLocationRows'
import {
  loadWeatherOperationsThresholds,
  type WeatherOperationsThresholds,
} from '../config/weatherThresholds'
import { resolveWeatherLocationAlert } from './buildWeatherLocationAlert'

export function weatherLocationAlertPriority(
  row: WeatherLocationRow,
  thresholds?: WeatherOperationsThresholds,
): number {
  return resolveWeatherLocationAlert(row, thresholds ?? loadWeatherOperationsThresholds())?.priority ?? 0
}

function compareByRisk(
  a: WeatherLocationRow,
  b: WeatherLocationRow,
  thresholds: WeatherOperationsThresholds,
): number {
  const priA = weatherLocationAlertPriority(a, thresholds)
  const priB = weatherLocationAlertPriority(b, thresholds)
  if (priB !== priA) return priB - priA

  const tempA = a.temperatureC ?? -Infinity
  const tempB = b.temperatureC ?? -Infinity
  if (tempB !== tempA) return tempB - tempA

  const windA = a.windSpeedKmh ?? -Infinity
  const windB = b.windSpeedKmh ?? -Infinity
  if (windB !== windA) return windB - windA

  return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
}

/** Puts summary row first; remaining locations highest weather alert risk first. */
export function sortWeatherLocationRowsByAlertRisk(
  rows: WeatherLocationRow[],
  thresholds: WeatherOperationsThresholds = loadWeatherOperationsThresholds(),
): WeatherLocationRow[] {
  const summary = rows.filter(r => r.id === 'all')
  const rest = rows.filter(r => r.id !== 'all')
  rest.sort((a, b) => compareByRisk(a, b, thresholds))
  return [...summary, ...rest]
}
