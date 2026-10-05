import type { OpenMeteoDashboardBundle } from '../services/openMeteoWeatherDashboard'
import { windDirectionLabel } from '@/modules/remote-sensing/weather/openMeteoWeather'
import type { WeatherOperationsThresholds } from '../config/weatherThresholds'

export type WeatherAlertSeverity = 'high' | 'elevated' | 'normal' | 'low'

export type WeatherAlert = {
  id: string
  type: string
  severity: WeatherAlertSeverity
  time: string
  location: string
  variable: string
  currentValue: string
  threshold: string
}

function alertSnapshotFromBundle(bundle: OpenMeteoDashboardBundle) {
  if (bundle.snapshot) return bundle.snapshot
  const h = bundle.hourlyForecast[0] ?? bundle.hourly[0]
  if (!h) return null
  const windDeg = h.windDirectionDeg
  return {
    lat: bundle.snapshot?.lat ?? 0,
    lng: bundle.snapshot?.lng ?? 0,
    timezone: bundle.snapshot?.timezone ?? 'UTC',
    elevationM: bundle.snapshot?.elevationM ?? null,
    observedAt: h.time,
    temperatureC: h.temperatureC,
    weatherCode: h.weatherCode,
    conditionLabel: '',
    windSpeedKmh: h.windSpeedKmh,
    windDirectionDeg: windDeg,
    windDirectionLabel: windDirectionLabel(windDeg),
    humidityPct: h.humidityPct,
    precipMm: h.precipitationMm,
    daily: bundle.daily7 ?? [],
    nextHours: [],
  }
}

export function buildWeatherAlerts(
  bundle: OpenMeteoDashboardBundle | null,
  locationLabel: string,
  thresholds: WeatherOperationsThresholds,
): WeatherAlert[] {
  if (!bundle) return []
  const s = alertSnapshotFromBundle(bundle)
  if (!s) return []
  const out: WeatherAlert[] = []
  const now = s.observedAt

  if (s.windSpeedKmh != null && s.windSpeedKmh >= thresholds.highWindAlertKmh) {
    out.push({
      id: 'high-wind',
      type: 'HIGH WIND',
      severity: 'high',
      time: now,
      location: locationLabel,
      variable: 'Wind',
      currentValue: `${Math.round(s.windSpeedKmh)} km/h`,
      threshold: `${thresholds.highWindAlertKmh} km/h`,
    })
  }

  if (s.temperatureC != null && s.temperatureC >= thresholds.heatStressC) {
    out.push({
      id: 'extreme-heat',
      type: 'EXTREME TEMPERATURE',
      severity: 'elevated',
      time: now,
      location: locationLabel,
      variable: 'Temperature',
      currentValue: `${s.temperatureC.toFixed(1)} °C`,
      threshold: `${thresholds.heatStressC} °C`,
    })
  }

  if (s.temperatureC != null && s.temperatureC <= thresholds.frostC) {
    out.push({
      id: 'frost',
      type: 'FROST',
      severity: 'high',
      time: now,
      location: locationLabel,
      variable: 'Temperature',
      currentValue: `${s.temperatureC.toFixed(1)} °C`,
      threshold: `${thresholds.frostC} °C`,
    })
  }

  const next6 = (
    bundle.hourlyForecast.length ? bundle.hourlyForecast : bundle.hourly.length ? bundle.hourly : []
  ).slice(0, 6)

  const rain6 = next6.reduce((sum, h) => sum + (h.precipitationMm ?? 0), 0)
  if (rain6 >= thresholds.heavyRainMm6h) {
    out.push({
      id: 'heavy-rain',
      type: 'HEAVY RAIN',
      severity: 'elevated',
      time: now,
      location: locationLabel,
      variable: 'Precipitation (6h)',
      currentValue: `${rain6.toFixed(1)} mm`,
      threshold: `${thresholds.heavyRainMm6h} mm`,
    })
  }

  if (s.humidityPct != null && s.humidityPct >= thresholds.highHumidityPct) {
    out.push({
      id: 'high-rh',
      type: 'HIGH HUMIDITY',
      severity: 'elevated',
      time: now,
      location: locationLabel,
      variable: 'Relative humidity',
      currentValue: `${Math.round(s.humidityPct)}%`,
      threshold: `${thresholds.highHumidityPct}%`,
    })
  }

  if (s.humidityPct != null && s.humidityPct <= thresholds.lowHumidityPct) {
    out.push({
      id: 'low-rh',
      type: 'LOW HUMIDITY',
      severity: 'elevated',
      time: now,
      location: locationLabel,
      variable: 'Relative humidity',
      currentValue: `${Math.round(s.humidityPct)}%`,
      threshold: `${thresholds.lowHumidityPct}%`,
    })
  }

  return out
}
