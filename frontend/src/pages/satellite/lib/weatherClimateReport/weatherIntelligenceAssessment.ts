/**
 * Agricultural decision helpers for the Weather Intelligence Assessment Report (DOCX).
 */
import type { WeatherClimateReportPayload, WeatherDailyRecord } from './weatherClimateReportTypes'
import type { EnterpriseWeatherModel, HourlyRawRow } from './weatherEnterpriseAnalyticsEngine'

function finite(nums: Array<number | null | undefined>): number[] {
  return nums.filter((n): n is number => n != null && Number.isFinite(n))
}

function mean(nums: number[]): number | null {
  if (!nums.length) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function sum(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0)
}

function fmt(n: number | null | undefined, d = 1, suffix = ''): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return `${n.toFixed(d)}${suffix}`
}

export function heatIndexC(tempC: number, rhPct: number): number {
  const tF = tempC * 1.8 + 32
  const hiF =
    -42.379 +
    2.04901523 * tF +
    10.14333127 * rhPct -
    0.22475541 * tF * rhPct -
    0.00683783 * tF * tF -
    0.05481717 * rhPct * rhPct +
    0.00122874 * tF * tF * rhPct +
    0.00085282 * tF * rhPct * rhPct -
    0.00000199 * tF * tF * rhPct * rhPct
  return (hiF - 32) / 1.8
}

export function vpdKpa(tempC: number, rhPct: number): number {
  const es = 0.6108 * Math.exp((17.27 * tempC) / (tempC + 237.3))
  return Math.max(0, es * (1 - rhPct / 100))
}

export function feelsLikeC(tempC: number, rhPct: number, windKmh: number): number {
  if (tempC >= 27) return heatIndexC(tempC, rhPct)
  if (tempC <= 10 && windKmh > 4.8) {
    const v = windKmh
    return 13.12 + 0.6215 * tempC - 11.37 * v ** 0.16 + 0.3965 * tempC * v ** 0.16
  }
  return tempC
}

export type ParamStats = {
  name: string
  unit: string
  min: string
  max: string
  mean: string
  median: string
  std: string
  interpretation: string
}

function statsOf(
  name: string,
  unit: string,
  values: number[],
  interpretation: string,
): ParamStats {
  if (!values.length) {
    return { name, unit, min: '—', max: '—', mean: '—', median: '—', std: '—', interpretation }
  }
  const sorted = [...values].sort((a, b) => a - b)
  const m = mean(sorted)!
  const mid = sorted[Math.floor(sorted.length / 2)]!
  const sd =
    sorted.length > 1
      ? Math.sqrt(sum(sorted.map(v => (v - m) ** 2)) / (sorted.length - 1))
      : 0
  return {
    name,
    unit,
    min: fmt(sorted[0], 1),
    max: fmt(sorted[sorted.length - 1], 1),
    mean: fmt(m, 1),
    median: fmt(mid, 1),
    std: fmt(sd, 2),
    interpretation,
  }
}

export function buildParameterStatistics(hourly: HourlyRawRow[]): ParamStats[] {
  return [
    statsOf(
      'Temperature',
      '°C',
      finite(hourly.map(h => h.temperatureC)),
      'Thermal environment for crop development and heat/cold stress.',
    ),
    statsOf(
      'Relative Humidity',
      '%',
      finite(hourly.map(h => h.humidityPct)),
      'Controls disease pressure and plant water-use efficiency.',
    ),
    statsOf(
      'Rainfall',
      'mm',
      finite(hourly.map(h => h.rainfallMm)),
      'Effective moisture supply and runoff/flood risk.',
    ),
    statsOf(
      'Wind Speed',
      'km/h',
      finite(hourly.map(h => h.windSpeedKmh)),
      'Spray drift, lodging risk, and evaporative demand.',
    ),
    statsOf(
      'Pressure',
      'hPa',
      finite(hourly.map(h => h.pressureHpa)),
      'Synoptic change indicator for storm development.',
    ),
    statsOf(
      'Solar Radiation',
      'W/m²',
      finite(hourly.map(h => h.solarRadiationWm2)),
      'Photosynthetic energy and ET₀ driver.',
    ),
    statsOf(
      'ET₀',
      'mm',
      finite(hourly.map(h => h.et0Mm)),
      'Reference crop water demand (FAO Penman–Monteith).',
    ),
    statsOf(
      'Dew Point',
      '°C',
      finite(hourly.map(h => h.dewPointC)),
      'Condensation / fog likelihood and leaf wetness risk.',
    ),
    statsOf(
      'Cloud Cover',
      '%',
      finite(hourly.map(h => h.cloudCoverPct)),
      'Reduces incoming radiation and photosynthesis.',
    ),
    statsOf(
      'UV Index',
      'index',
      finite(hourly.map(h => h.uvIndex)),
      'Field worker exposure and plant UV stress proxy.',
    ),
  ]
}

export type RiskRow = { risk: string; level: string; evidence: string }

export function buildAgriculturalRisks(
  payload: WeatherClimateReportPayload,
  daily: WeatherDailyRecord[],
): RiskRow[] {
  const tmax = finite(daily.map(d => d.tempMaxC))
  const rain = finite(daily.map(d => d.rainfallMm))
  const wind = finite(daily.map(d => d.windSpeedKmh))
  const humid = finite(daily.map(d => d.humidityPct))
  const et0 = finite(daily.map(d => d.et0Mm))
  const avgTmax = mean(tmax)
  const avgRain = mean(rain)
  const avgWind = mean(wind)
  const avgRh = mean(humid)
  const avgEt = mean(et0)
  const heatDays = tmax.filter(t => t >= 35).length
  const frostDays = finite(daily.map(d => d.tempMinC)).filter(t => t <= 2).length
  const heavyRainDays = rain.filter(r => r >= 25).length

  const level = (score: number): string =>
    score >= 75 ? 'Critical' : score >= 55 ? 'High' : score >= 35 ? 'Moderate' : 'Low'

  return [
    {
      risk: 'Heat Stress',
      level: level(heatDays > 5 ? 70 : (avgTmax ?? 0) >= 32 ? 55 : 25),
      evidence: `${heatDays} day(s) with Tmax ≥ 35 °C; mean Tmax ${fmt(avgTmax, 1)} °C.`,
    },
    {
      risk: 'Water Stress',
      level: level((avgEt ?? 0) > (avgRain ?? 0) * 1.5 ? 65 : 30),
      evidence: `Mean daily ET₀ ${fmt(avgEt, 1)} mm vs rainfall ${fmt(avgRain, 1)} mm.`,
    },
    {
      risk: 'Disease Risk',
      level: level((avgRh ?? 0) >= 80 ? 60 : (avgRh ?? 0) >= 70 ? 40 : 20),
      evidence: `Mean RH ${fmt(avgRh, 0)} % — leaf wetness / fungal risk rises above ~70–80 %.`,
    },
    {
      risk: 'Wind Damage',
      level: level((avgWind ?? 0) >= 40 ? 60 : (avgWind ?? 0) >= 25 ? 40 : 15),
      evidence: `Mean wind ${fmt(avgWind, 1)} km/h.`,
    },
    {
      risk: 'Flood Risk',
      level: level(heavyRainDays >= 3 ? 70 : heavyRainDays >= 1 ? 45 : 15),
      evidence: `${heavyRainDays} day(s) with rainfall ≥ 25 mm.`,
    },
    {
      risk: 'Drought Risk',
      level: payload.impactAssessment.droughtProbabilityPct != null
        ? level(payload.impactAssessment.droughtProbabilityPct)
        : level((avgRain ?? 10) < 1 && (avgEt ?? 0) > 4 ? 55 : 25),
      evidence: payload.impactAssessment.waterStressLevel
        ? `Water stress level: ${payload.impactAssessment.waterStressLevel}.`
        : 'Inferred from ET₀–rainfall balance.',
    },
    {
      risk: 'Spray Risk',
      level: level((avgWind ?? 0) >= 15 || (avgRh ?? 50) < 35 ? 55 : 25),
      evidence: 'Wind > 15 km/h or very dry air reduces spray suitability.',
    },
    {
      risk: 'Frost Risk',
      level: level(frostDays >= 1 ? 60 : 10),
      evidence: `${frostDays} day(s) with Tmin ≤ 2 °C.`,
    },
    {
      risk: 'Dust Risk',
      level: level((avgWind ?? 0) >= 30 && (avgRain ?? 1) < 1 ? 50 : 15),
      evidence: 'Strong winds with low rainfall favour dust lofting.',
    },
  ]
}

export function buildIrrigationAdvice(daily: WeatherDailyRecord[]): {
  rows: string[][]
  narrative: string
} {
  const et = finite(daily.map(d => d.et0Mm))
  const rain = finite(daily.map(d => d.rainfallMm))
  const meanEt = mean(et) ?? 0
  const meanRain = mean(rain) ?? 0
  const effectiveRain = meanRain * 0.8
  const netIrr = Math.max(0, meanEt - effectiveRain)
  const durationMin = netIrr > 0 ? Math.round((netIrr / 5) * 60) : 0
  return {
    rows: [
      ['Mean daily ET₀', fmt(meanEt, 2, ' mm')],
      ['Mean daily rainfall', fmt(meanRain, 2, ' mm')],
      ['Effective rainfall (×0.8)', fmt(effectiveRain, 2, ' mm')],
      ['Net irrigation requirement', fmt(netIrr, 2, ' mm')],
      ['Recommended depth (example)', fmt(netIrr, 1, ' mm')],
      ['Approx. set time @ 5 mm/h', durationMin > 0 ? `${durationMin} min` : 'Not required'],
      ['Preferred irrigation window', 'Early morning (05:00–08:00) or evening'],
    ],
    narrative:
      netIrr > 2
        ? `Evaporative demand exceeds effective rainfall by ~${fmt(netIrr, 1)} mm/day. Increase irrigation frequency and monitor soil moisture; prioritise morning sets to cut wind drift and evaporative loss.`
        : `Effective rainfall largely offsets ET₀. Maintain light irrigation only for sensitive stages and avoid over-watering to reduce disease pressure.`,
  }
}

export function buildSprayWindows(hourly: HourlyRawRow[]): {
  rows: string[][]
  narrative: string
} {
  let suitable = 0
  let marginal = 0
  let unsuitable = 0
  const windows: string[] = []
  for (const h of hourly) {
    const t = h.temperatureC
    const rh = h.humidityPct
    const w = h.windSpeedKmh
    const rain = h.rainfallMm ?? 0
    if (t == null || rh == null || w == null) continue
    const ok =
      rain < 0.2 && w >= 3 && w <= 12 && t >= 10 && t <= 28 && rh >= 40 && rh <= 85
    const marg =
      !ok && rain < 0.5 && w <= 18 && t >= 8 && t <= 32
    if (ok) {
      suitable += 1
      if (windows.length < 8) windows.push(`${h.date} ${h.time}`)
    } else if (marg) marginal += 1
    else unsuitable += 1
  }
  const total = suitable + marginal + unsuitable || 1
  return {
    rows: [
      ['Suitable hours', `${suitable} (${((suitable / total) * 100).toFixed(0)} %)`],
      ['Marginal hours', `${marginal} (${((marginal / total) * 100).toFixed(0)} %)`],
      ['Not suitable hours', `${unsuitable} (${((unsuitable / total) * 100).toFixed(0)} %)`],
      ['Best windows (sample)', windows.join('; ') || 'None in period'],
      ['Criteria', 'Wind 3–12 km/h · Temp 10–28 °C · RH 40–85 % · No rain'],
    ],
    narrative:
      suitable / total >= 0.25
        ? 'Adequate spray windows exist; schedule applications in the listed low-wind morning/evening slots and avoid rain-out.'
        : 'Spray windows are limited. Prefer early morning with low wind; postpone applications when gusts or rainfall are forecast.',
  }
}

export function enrichHourlyAnnexRow(
  h: HourlyRawRow,
  dayStats?: { tmax: number | null; tmean: number | null; tmin: number | null },
): string[] {
  const t = h.temperatureC
  const rh = h.humidityPct
  const w = h.windSpeedKmh ?? 0
  const feels = t != null && rh != null ? feelsLikeC(t, rh, w) : null
  const tmax = dayStats?.tmax ?? t
  const tmean = dayStats?.tmean ?? t
  const tmin = dayStats?.tmin ?? t
  return [
    h.date,
    h.time,
    fmt(tmax, 1),
    fmt(tmean, 1),
    fmt(tmin, 1),
    fmt(feels, 1),
    fmt(rh, 0),
    fmt(h.rainfallMm, 2),
    fmt(h.windSpeedKmh, 1),
  ]
}

/** Map date → daily temp extremes for hourly annex enrichment. */
export function buildDailyTempIndex(
  daily: Array<{ date: string; tempMaxC: number | null; tempAvgC: number | null; tempMinC: number | null }>,
): Map<string, { tmax: number | null; tmean: number | null; tmin: number | null }> {
  const map = new Map<string, { tmax: number | null; tmean: number | null; tmin: number | null }>()
  for (const d of daily) {
    map.set(d.date, { tmax: d.tempMaxC, tmean: d.tempAvgC, tmin: d.tempMinC })
  }
  return map
}

export function buildWeeklySummary(daily: WeatherDailyRecord[]): string[][] {
  const byWeek = new Map<string, WeatherDailyRecord[]>()
  for (const d of daily) {
    const dt = new Date(`${d.date}T12:00:00Z`)
    const oneJan = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1))
    const week = Math.ceil((((dt.getTime() - oneJan.getTime()) / 86400000) + oneJan.getUTCDay() + 1) / 7)
    const key = `${dt.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
    const arr = byWeek.get(key) ?? []
    arr.push(d)
    byWeek.set(key, arr)
  }
  return [...byWeek.entries()].slice(0, 26).map(([week, rows]) => {
    const tavg = mean(finite(rows.map(r => r.tempAvgC)))
    const tmax = mean(finite(rows.map(r => r.tempMaxC))) // weekly mean of daily maxima
    const tmin = mean(finite(rows.map(r => r.tempMinC)))
    const rain = sum(finite(rows.map(r => r.rainfallMm)))
    const rh = mean(finite(rows.map(r => r.humidityPct)))
    return [week, fmt(tmax, 1), fmt(tavg, 1), fmt(tmin, 1), fmt(rain, 1), fmt(rh, 0), String(rows.length)]
  })
}

export function buildDataQualityReport(
  payload: WeatherClimateReportPayload,
  enterprise: EnterpriseWeatherModel,
): string[][] {
  const hourly = enterprise.hourlyRaw
  const fields: Array<[string, (h: HourlyRawRow) => number | null]> = [
    ['Temperature', h => h.temperatureC],
    ['Humidity', h => h.humidityPct],
    ['Rainfall', h => h.rainfallMm],
    ['Wind', h => h.windSpeedKmh],
    ['Pressure', h => h.pressureHpa],
    ['Solar', h => h.solarRadiationWm2],
    ['ET₀', h => h.et0Mm],
  ]
  const n = hourly.length || 1
  return fields.map(([name, getter]) => {
    const missing = hourly.filter(h => getter(h) == null).length
    const vals = finite(hourly.map(getter))
    const m = mean(vals)
    const sd = vals.length > 1 ? Math.sqrt(sum(vals.map(v => (v - m!) ** 2)) / (vals.length - 1)) : 0
    const outliers = vals.filter(v => m != null && sd > 0 && Math.abs(v - m) > 3 * sd).length
    return [
      name,
      String(missing),
      `${((missing / n) * 100).toFixed(1)} %`,
      String(outliers),
      missing / n < 0.05 ? 'High' : missing / n < 0.15 ? 'Moderate' : 'Low',
    ]
  })
}

export function expandCorrelations(enterprise: EnterpriseWeatherModel): string[][] {
  const base = enterprise.correlations.map(c => [
    c.a,
    c.b,
    c.r != null ? c.r.toFixed(3) : '—',
    c.r == null
      ? 'Insufficient pairs'
      : Math.abs(c.r) >= 0.7
        ? 'Strong'
        : Math.abs(c.r) >= 0.4
          ? 'Moderate'
          : 'Weak',
  ])
  return [
    ...base,
    ['Temperature', 'ET₀', '—', 'Positive coupling expected (energy-driven)'],
    ['Solar Radiation', 'ET₀', '—', 'Strong physical driver of evaporative demand'],
    ['Humidity', 'Disease Risk', '—', 'High RH elevates fungal disease likelihood'],
    ['Wind', 'Evaporation', '—', 'Higher wind increases aerodynamic conductance'],
  ]
}
