import { geometryMetrics } from '../../../lib/geoAiLiveMapContext'
import type { OpenMeteoHourlyPoint } from '../../../lib/openMeteoWeather'
import {
  formatImageryTimePeriodLabel,
  imageryTimePeriodKey,
  type ImageryTimeAggregation,
} from '../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import { kmhToMs } from './timeSeriesReport/timeSeriesWeatherTimeline'

export type WeatherStormAnalysisMode = 'snow_storm' | 'storm'

export type StormSeverity = 'none' | 'advisory' | 'warning' | 'severe'

export type StormLegendClass = {
  label: string
  rangeLabel: string
  color: string
}

export type StormEventPeriod = {
  periodKey: string
  displayLabel: string
  intensity: number
  severity: StormSeverity
  temperatureC: number | null
  windSpeedMs: number | null
  precipitationMm: number | null
  snowfallMm: number | null
  affectedAreaHa: number | null
}

export type StormAnalysisResult = {
  mode: WeatherStormAnalysisMode
  events: StormEventPeriod[]
  peakEvent: StormEventPeriod | null
  summary: {
    maxIntensity: number
    peakSeverity: StormSeverity
    totalSnowfallMm: number | null
    totalPrecipitationMm: number | null
    maxWindSpeedMs: number | null
    minTemperatureC: number | null
    affectedAreaHa: number | null
    eventCount: number
  }
  interpretation: string
  legend: StormLegendClass[]
  mapFillColor: string
  mapLineColor: string
  mapFillOpacity: number
}

export type SiTsWeatherStormMapOverlay = {
  mode: WeatherStormAnalysisMode
  geometry: GeoJSON.Geometry
  fillColor: string
  lineColor: string
  fillOpacity: number
  peakSeverity: StormSeverity
  peakIntensity: number
}

const SNOW_STORM_LEGEND: StormLegendClass[] = [
  { label: 'No snow storm', rangeLabel: '0', color: '#4a4a4a' },
  { label: 'Light snow', rangeLabel: '1–25', color: '#b3d9ff' },
  { label: 'Moderate snow', rangeLabel: '26–50', color: '#29b6f6' },
  { label: 'Heavy snow', rangeLabel: '51–75', color: '#1565c0' },
  { label: 'Severe blizzard', rangeLabel: '76–100', color: '#e3f2fd' },
]

const STORM_LEGEND: StormLegendClass[] = [
  { label: 'Calm', rangeLabel: '0', color: '#64748b' },
  { label: 'Advisory', rangeLabel: '1–33', color: '#facc15' },
  { label: 'Warning', rangeLabel: '34–66', color: '#f97316' },
  { label: 'Severe storm', rangeLabel: '67–100', color: '#ef4444' },
]

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function mean(nums: number[]): number | null {
  if (!nums.length) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function sum(nums: number[]): number | null {
  if (!nums.length) return null
  return nums.reduce((a, b) => a + b, 0)
}

function snowfallMmFromHourly(point: OpenMeteoHourlyPoint): number {
  const cm = point.snowfallCm
  if (cm != null && Number.isFinite(cm) && cm > 0) return cm * 10
  const code = point.weatherCode ?? 0
  const temp = point.temperatureC
  const precip = point.precipitationMm ?? 0
  if (code >= 71 && code <= 77 && temp != null && temp <= 2) return precip > 0 ? precip : 0.5
  if (temp != null && temp <= 0 && precip > 0) return precip
  return 0
}

function isSnowCode(code: number | null | undefined): boolean {
  if (code == null || !Number.isFinite(code)) return false
  const c = Math.round(code)
  return c >= 71 && c <= 77
}

function isStormCode(code: number | null | undefined): boolean {
  if (code == null || !Number.isFinite(code)) return false
  const c = Math.round(code)
  return c >= 95 || c === 82
}

export function scoreSnowStormHour(point: OpenMeteoHourlyPoint): number {
  const temp = point.temperatureC
  const wind = point.windSpeedKmh ?? 0
  const snowMm = snowfallMmFromHourly(point)
  const code = point.weatherCode ?? 0
  if (temp == null || temp > 3) return 0
  if (snowMm <= 0 && !isSnowCode(code)) return 0

  let score = 0
  score += clamp(snowMm * 12, 0, 45)
  if (temp <= 0) score += 15
  else if (temp <= 2) score += 8
  score += clamp(wind / 2.5, 0, 25)
  if (code >= 75) score += 20
  else if (code >= 73) score += 12
  else if (code >= 71) score += 6
  return clamp(Math.round(score), 0, 100)
}

export function scoreStormHour(point: OpenMeteoHourlyPoint): number {
  const precip = point.precipitationMm ?? 0
  const wind = point.windSpeedKmh ?? 0
  const code = point.weatherCode ?? 0
  let score = 0
  if (isStormCode(code)) score += 55
  score += clamp(precip * 8, 0, 35)
  score += clamp(wind / 2.2, 0, 30)
  if (precip >= 5 && wind >= 30) score += 15
  if (code >= 95) score += 20
  return clamp(Math.round(score), 0, 100)
}

export function intensityToSeverity(intensity: number): StormSeverity {
  if (intensity >= 67) return 'severe'
  if (intensity >= 34) return 'warning'
  if (intensity >= 1) return 'advisory'
  return 'none'
}

function severityRank(severity: StormSeverity): number {
  if (severity === 'severe') return 3
  if (severity === 'warning') return 2
  if (severity === 'advisory') return 1
  return 0
}

function severityColor(mode: WeatherStormAnalysisMode, severity: StormSeverity): string {
  const legend = mode === 'snow_storm' ? SNOW_STORM_LEGEND : STORM_LEGEND
  if (severity === 'severe') return legend[legend.length - 1]!.color
  if (severity === 'warning') return legend[legend.length - 2]!.color
  if (severity === 'advisory') return legend[legend.length - 3]!.color
  return legend[0]!.color
}

function buildStormInterpretation(
  mode: WeatherStormAnalysisMode,
  peak: StormEventPeriod | null,
  summary: StormAnalysisResult['summary'],
): string {
  if (!peak || peak.severity === 'none') {
    return mode === 'snow_storm'
      ? 'No snow-storm conditions detected at the AOI centroid for this period — temperatures and snowfall remained below storm thresholds.'
      : 'No significant storm events detected at the AOI centroid for this period — precipitation and wind remained within normal bounds.'
  }

  if (mode === 'snow_storm') {
    return [
      `Peak snow-storm intensity ${peak.intensity}/100 (${peak.severity}) on ${peak.displayLabel}.`,
      `Snowfall rate up to ${peak.snowfallMm?.toFixed(1) ?? '—'} mm/h, temperature ${peak.temperatureC?.toFixed(1) ?? '—'}°C, wind ${peak.windSpeedMs?.toFixed(1) ?? '—'} m/s.`,
      `Affected area ≈ ${summary.affectedAreaHa?.toFixed(1) ?? '—'} ha at the AOI.`,
      summary.eventCount > 1
        ? `${summary.eventCount} snow-storm periods identified — monitor NDSI and field access after heavy snowfall.`
        : 'Single snow-storm period — verify snow cover on satellite NDSI and plan field operations accordingly.',
    ].join(' ')
  }

  return [
    `Peak storm severity ${peak.intensity}/100 (${peak.severity}) on ${peak.displayLabel}.`,
    `Precipitation ${peak.precipitationMm?.toFixed(1) ?? '—'} mm, wind ${peak.windSpeedMs?.toFixed(1) ?? '—'} m/s.`,
    `Storm alert covers ≈ ${summary.affectedAreaHa?.toFixed(1) ?? '—'} ha (AOI extent at centroid conditions).`,
    summary.eventCount > 1
      ? `${summary.eventCount} storm periods detected — correlate with NDMI/NDWI dips for crop damage risk.`
      : 'Isolated storm event — scout for lodging, erosion, and waterlogging after peak rainfall.',
  ].join(' ')
}

export function buildStormAnalysis(
  mode: WeatherStormAnalysisMode,
  hourlyPoints: OpenMeteoHourlyPoint[],
  chartLabels: string[],
  displayLabels: string[],
  aggregation: ImageryTimeAggregation,
  geometry: GeoJSON.Geometry | null,
): StormAnalysisResult {
  const areaHa = geometry ? (geometryMetrics(geometry)?.areaM2 ?? 0) / 10_000 : null
  const displayByKey = new Map(chartLabels.map((key, i) => [key, displayLabels[i] ?? key]))
  const buckets = new Map<
    string,
    {
      intensities: number[]
      temps: number[]
      winds: number[]
      rains: number[]
      snows: number[]
    }
  >()

  for (const point of hourlyPoints) {
    const date = point.time.trim().slice(0, 10)
    const key = imageryTimePeriodKey(date, aggregation)
    if (!key || !displayByKey.has(key)) continue
    if (!buckets.has(key)) {
      buckets.set(key, { intensities: [], temps: [], winds: [], rains: [], snows: [] })
    }
    const bucket = buckets.get(key)!
    const intensity = mode === 'snow_storm' ? scoreSnowStormHour(point) : scoreStormHour(point)
    if (intensity > 0) bucket.intensities.push(intensity)
    if (point.temperatureC != null) bucket.temps.push(point.temperatureC)
    const windMs = kmhToMs(point.windSpeedKmh)
    if (windMs != null) bucket.winds.push(windMs)
    if (point.precipitationMm != null) bucket.rains.push(point.precipitationMm)
    const snow = snowfallMmFromHourly(point)
    if (snow > 0) bucket.snows.push(snow)
  }

  const events: StormEventPeriod[] = chartLabels.map(key => {
    const bucket = buckets.get(key)
    const intensity = bucket?.intensities.length ? Math.max(...bucket.intensities) : 0
    const severity = intensityToSeverity(intensity)
    const coverage = intensity > 0 ? clamp(intensity / 100, 0.35, 1) : 0
    return {
      periodKey: key,
      displayLabel: displayByKey.get(key) ?? formatImageryTimePeriodLabel(key, aggregation),
      intensity,
      severity,
      temperatureC: bucket ? mean(bucket.temps) : null,
      windSpeedMs: bucket ? mean(bucket.winds) : null,
      precipitationMm: bucket ? sum(bucket.rains) : null,
      snowfallMm: bucket ? sum(bucket.snows) : null,
      affectedAreaHa: areaHa != null && coverage > 0 ? Number((areaHa * coverage).toFixed(2)) : null,
    }
  })

  const activeEvents = events.filter(e => e.intensity > 0)
  const peakEvent =
    activeEvents.length > 0
      ? activeEvents.reduce((best, e) => (e.intensity > best.intensity ? e : best), activeEvents[0]!)
      : null

  const peakSeverity =
    activeEvents.reduce<StormSeverity>(
      (best, e) => (severityRank(e.severity) > severityRank(best) ? e.severity : best),
      'none',
    )

  const summary = {
    maxIntensity: peakEvent?.intensity ?? 0,
    peakSeverity,
    totalSnowfallMm: sum(events.map(e => e.snowfallMm ?? 0).filter(v => v > 0)),
    totalPrecipitationMm: sum(events.map(e => e.precipitationMm ?? 0).filter(v => v > 0)),
    maxWindSpeedMs: events.reduce<number | null>((max, e) => {
      if (e.windSpeedMs == null) return max
      return max == null ? e.windSpeedMs : Math.max(max, e.windSpeedMs)
    }, null),
    minTemperatureC: events.reduce<number | null>((min, e) => {
      if (e.temperatureC == null) return min
      return min == null ? e.temperatureC : Math.min(min, e.temperatureC)
    }, null),
    affectedAreaHa: peakEvent?.affectedAreaHa ?? null,
    eventCount: activeEvents.length,
  }

  const legend = mode === 'snow_storm' ? SNOW_STORM_LEGEND : STORM_LEGEND
  const mapFillColor = severityColor(mode, peakSeverity)
  const mapLineColor = mode === 'snow_storm' ? '#7dd3fc' : '#fb923c'
  const mapFillOpacity = peakEvent ? clamp(0.18 + peakEvent.intensity / 200, 0.15, 0.55) : 0

  return {
    mode,
    events,
    peakEvent,
    summary,
    interpretation: buildStormInterpretation(mode, peakEvent, summary),
    legend,
    mapFillColor,
    mapLineColor,
    mapFillOpacity,
  }
}

export function buildStormMapOverlay(
  analysis: StormAnalysisResult | null,
  geometry: GeoJSON.Geometry | null,
): SiTsWeatherStormMapOverlay | null {
  if (!analysis || !geometry || !analysis.peakEvent || analysis.peakEvent.severity === 'none') {
    return null
  }
  return {
    mode: analysis.mode,
    geometry,
    fillColor: analysis.mapFillColor,
    lineColor: analysis.mapLineColor,
    fillOpacity: analysis.mapFillOpacity,
    peakSeverity: analysis.summary.peakSeverity,
    peakIntensity: analysis.summary.maxIntensity,
  }
}
