import type { OpenMeteoWeatherSnapshot } from '../../../../lib/openMeteoWeather'

/** Map marker weather states shown as icon + container shape. */
export type AcpWeatherMarkerCondition = 'clear' | 'cloud' | 'rain' | 'wind' | 'storm' | 'snow' | 'fog'

export type AcpWeatherMarkerVisual = {
  temperatureLabel: string
  condition: AcpWeatherMarkerCondition
  iconClass: string
  conditionClass: string
  ariaLabel: string
}

const CONDITION_ICONS: Record<AcpWeatherMarkerCondition, string> = {
  clear: 'fa-solid fa-sun',
  cloud: 'fa-solid fa-cloud',
  rain: 'fa-solid fa-cloud-showers-heavy',
  wind: 'fa-solid fa-wind',
  storm: 'fa-solid fa-bolt',
  snow: 'fa-solid fa-snowflake',
  fog: 'fa-solid fa-smog',
}

export function formatAcpWeatherMarkerTemperature(tempC: number | null | undefined): string {
  if (tempC == null || !Number.isFinite(tempC)) return '—'
  return `${Math.round(tempC)}°`
}

export function resolveAcpWeatherMarkerCondition(
  snapshot: Pick<
    OpenMeteoWeatherSnapshot,
    'weatherCode' | 'windSpeedKmh' | 'precipMm' | 'conditionLabel'
  >,
): AcpWeatherMarkerCondition {
  const code = snapshot.weatherCode ?? 0
  const wind = snapshot.windSpeedKmh ?? 0
  const precip = snapshot.precipMm ?? 0

  if (wind >= 25) return 'wind'
  if (code >= 95) return 'storm'
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || precip >= 0.5) return 'rain'
  if (code >= 71 && code <= 77) return 'snow'
  if (code === 45 || code === 48) return 'fog'
  if (code === 0 || code === 1) return 'clear'
  return 'cloud'
}

export function resolveAcpWeatherMarkerVisual(
  snapshot: Pick<
    OpenMeteoWeatherSnapshot,
    'temperatureC' | 'weatherCode' | 'windSpeedKmh' | 'precipMm' | 'conditionLabel'
  >,
): AcpWeatherMarkerVisual {
  const condition = resolveAcpWeatherMarkerCondition(snapshot)
  const temperatureLabel = formatAcpWeatherMarkerTemperature(snapshot.temperatureC)
  const conditionLabel = snapshot.conditionLabel?.trim() || condition

  return {
    temperatureLabel,
    condition,
    iconClass: CONDITION_ICONS[condition],
    conditionClass: `acp-weather-marker--cond-${condition}`,
    ariaLabel: `${temperatureLabel} ${conditionLabel}`,
  }
}
