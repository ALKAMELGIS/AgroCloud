import type { OpenMeteoDashboardBundle } from '../services/openMeteoWeatherDashboard'
import {
  DEFAULT_WEATHER_OPERATIONS_THRESHOLDS,
  type WeatherOperationsThresholds,
} from '../config/weatherThresholds'

export type OperationalIndicatorStatus = 'ok' | 'caution' | 'warning'

export type OperationalWeatherIndicator = {
  id: string
  label: string
  status: OperationalIndicatorStatus
  message: string
  disclaimer: string
}

const DISCLAIMER =
  'Operational indicator only — not agronomic advice. Verify locally before field work.'

function statusIcon(status: OperationalIndicatorStatus): string {
  if (status === 'ok') return '✓'
  if (status === 'warning') return '⚠'
  return '◐'
}

export function formatOperationalIndicatorLine(ind: OperationalWeatherIndicator): string {
  return `${statusIcon(ind.status)} ${ind.label}: ${ind.message}`
}

function forecastHourly(bundle: OpenMeteoDashboardBundle): OpenMeteoDashboardBundle['hourlyForecast'] {
  if (bundle.hourlyForecast.length) return bundle.hourlyForecast
  if (bundle.hourly.length) return bundle.hourly
  return bundle.snapshot.nextHours.map(h => ({
    ...h,
    apparentTemperatureC: null,
    dewPointC: null,
    cloudCoverPct: null,
    visibilityKm: null,
    precipitationProbabilityPct: null,
    rainMm: null,
    pressureHpa: null,
    et0Mm: null,
    shortwaveRadiationWm2: null,
  }))
}

export function buildOperationalWeatherIndicators(
  bundle: OpenMeteoDashboardBundle | null,
  thresholds: WeatherOperationsThresholds = DEFAULT_WEATHER_OPERATIONS_THRESHOLDS,
  loading = false,
  errorMessage: string | null = null,
): OperationalWeatherIndicator[] {
  const snap = bundle?.snapshot
  const hasSnap =
    snap &&
    (snap.temperatureC != null ||
      snap.windSpeedKmh != null ||
      snap.humidityPct != null ||
      snap.weatherCode != null)

  if (!hasSnap) {
    return [
      {
        id: 'loading',
        label: 'Weather data',
        status: loading ? 'caution' : 'warning',
        message: loading
          ? 'Loading Open-Meteo…'
          : errorMessage
            ? `Unavailable — ${errorMessage}`
            : 'Waiting for Open-Meteo — use Refresh',
        disclaimer: DISCLAIMER,
      },
    ]
  }

  const s = snap
  const wind = s.windSpeedKmh
  const rh = s.humidityPct
  const temp = s.temperatureC
  const next6 = forecastHourly(bundle!).slice(0, 6)
  const maxPrecipProb = next6.reduce(
    (m, h) => Math.max(m, h.precipitationProbabilityPct ?? 0),
    0,
  )
  const rainSoon = maxPrecipProb >= 50 || next6.some(h => (h.precipitationMm ?? 0) >= 0.5)

  const indicators: OperationalWeatherIndicator[] = []

  if (wind != null && wind >= thresholds.windSprayWarningKmh) {
    indicators.push({
      id: 'spray',
      label: 'Spraying',
      status: 'warning',
      message: `Not recommended — wind ${Math.round(wind)} km/h`,
      disclaimer: DISCLAIMER,
    })
  } else if (wind != null && wind >= thresholds.windSprayCautionKmh) {
    indicators.push({
      id: 'spray',
      label: 'Spraying',
      status: 'caution',
      message: `Marginal — wind ${Math.round(wind)} km/h`,
      disclaimer: DISCLAIMER,
    })
  } else {
    indicators.push({
      id: 'spray',
      label: 'Spraying',
      status: 'ok',
      message: wind != null ? `Suitable — wind ${Math.round(wind)} km/h` : 'Suitable — light wind',
      disclaimer: DISCLAIMER,
    })
  }

  if (rainSoon) {
    indicators.push({
      id: 'rain',
      label: 'Rain',
      status: 'warning',
      message: `${Math.round(maxPrecipProb)}% probability within 6 hours`,
      disclaimer: DISCLAIMER,
    })
  } else {
    indicators.push({
      id: 'rain',
      label: 'Rain',
      status: 'ok',
      message: 'Low probability within 6 hours',
      disclaimer: DISCLAIMER,
    })
  }

  if (wind != null && wind >= 35) {
    indicators.push({
      id: 'high-wind',
      label: 'High wind',
      status: 'warning',
      message: `${Math.round(wind)} km/h — secure equipment`,
      disclaimer: DISCLAIMER,
    })
  }

  if (temp != null && temp >= thresholds.heatStressC) {
    indicators.push({
      id: 'heat',
      label: 'Heat stress',
      status: 'warning',
      message: `${temp.toFixed(1)} °C — limit outdoor labor`,
      disclaimer: DISCLAIMER,
    })
  } else if (temp != null && temp <= thresholds.frostC) {
    indicators.push({
      id: 'frost',
      label: 'Frost',
      status: 'warning',
      message: `${temp.toFixed(1)} °C — monitor sensitive crops`,
      disclaimer: DISCLAIMER,
    })
  }

  if (rh != null && rh >= thresholds.highHumidityPct) {
    indicators.push({
      id: 'humidity',
      label: 'High humidity',
      status: 'caution',
      message: `${Math.round(rh)}% — extended leaf wetness possible`,
      disclaimer: DISCLAIMER,
    })
  }

  const irrigationOk = !rainSoon && (temp == null || temp < 38)
  indicators.push({
    id: 'irrigation',
    label: 'Irrigation',
    status: irrigationOk ? 'ok' : 'caution',
    message: irrigationOk ? 'Suitable window' : 'Review schedule — heat or rain expected',
    disclaimer: DISCLAIMER,
  })

  const fieldOk =
    (wind == null || wind < 30) && !rainSoon && (temp == null || (temp > 0 && temp < 36))
  indicators.push({
    id: 'field-ops',
    label: 'Field operations',
    status: fieldOk ? 'ok' : 'caution',
    message: fieldOk ? 'Generally suitable' : 'Check wind, rain, and temperature',
    disclaimer: DISCLAIMER,
  })

  return indicators
}
