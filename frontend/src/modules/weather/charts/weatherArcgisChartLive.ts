import type { WeatherOperationsThresholds } from '../config/weatherThresholds'

/** User-facing chart guides (extremes) — separate from operational alert thresholds. */
export const WEATHER_CHART_DISPLAY_GUIDES = {
  heatExtremeC: 50,
  coldExtremeC: 10,
} as const

export type WeatherChartLiveCadence = '1s' | '1m' | '1h'

export function weatherChartLiveCadenceMs(cadence: WeatherChartLiveCadence): number {
  switch (cadence) {
    case '1s':
      return 1_000
    case '1m':
      return 60_000
    case '1h':
      return 3_600_000
  }
}

export function parseWeatherChartAxisTime(iso: string): number {
  const normalized = iso.trim().replace(' ', 'T')
  const d = new Date(normalized.length >= 16 ? normalized.slice(0, 16) : normalized)
  return d.getTime()
}

/** Open-Meteo hourly key aligned to the current clock hour (local). */
export function floorToOpenMeteoHourIso(nowMs: number): string {
  const d = new Date(nowMs)
  d.setMinutes(0, 0, 0)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  return `${y}-${m}-${day}T${h}:00`
}

/**
 * Fractional category index for a vertical "now" guide on hourly ISO labels.
 * Returns null when now falls outside the label span.
 */
export function computeWeatherChartNowIndex(labels: string[], nowMs: number): number | null {
  if (!labels.length) return null
  const times = labels.map(parseWeatherChartAxisTime)
  if (times.some(t => !Number.isFinite(t))) return null

  const first = times[0]
  const last = times[times.length - 1]
  if (nowMs < first || nowMs > last + 3_600_000) return null

  for (let i = 0; i < times.length - 1; i++) {
    const t0 = times[i]
    const t1 = times[i + 1]
    if (nowMs >= t0 && nowMs <= t1) {
      const span = t1 - t0
      if (span <= 0) return i
      return i + (nowMs - t0) / span
    }
  }

  if (nowMs >= last) return times.length - 1
  return 0
}

function readSeriesNumber(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null
  return value
}

function lerpCircularDeg(a: number, b: number, t: number): number {
  const diff = ((b - a + 540) % 360) - 180
  return (a + diff * t + 360) % 360
}

/** Interpolate a numeric series at wall-clock `nowMs` (between hourly ISO labels). */
export function interpolateWeatherChartValue(
  labels: string[],
  values: Array<number | null | undefined>,
  nowMs: number,
  options?: { circular?: boolean },
): number | null {
  const nowIndex = computeWeatherChartNowIndex(labels, nowMs)
  if (nowIndex == null || !labels.length) return null
  const i0 = Math.min(Math.max(0, Math.floor(nowIndex)), labels.length - 1)
  const i1 = Math.min(i0 + 1, labels.length - 1)
  const frac = nowIndex - i0
  const v0 = readSeriesNumber(values[i0])
  const v1 = readSeriesNumber(values[i1])
  if (v0 == null && v1 == null) return null
  if (frac <= 0 || i0 === i1) return v0 ?? v1
  if (v0 == null) return v1
  if (v1 == null) return v0
  if (options?.circular) return lerpCircularDeg(v0, v1, frac)
  return v0 + (v1 - v0) * frac
}

export type WeatherChartHorizontalGuide = {
  value: number
  color: string
  dash?: number[]
  label?: string
}

export type WeatherArcgisChartGuideSet = {
  nowIndex: number | null
  horizontal: WeatherChartHorizontalGuide[]
}

export function buildTemperatureChartGuides(
  ops: WeatherOperationsThresholds,
): WeatherChartHorizontalGuide[] {
  return [
    {
      value: WEATHER_CHART_DISPLAY_GUIDES.heatExtremeC,
      color: 'rgba(239, 68, 68, 0.85)',
      dash: [6, 4],
      label: `Heat ${WEATHER_CHART_DISPLAY_GUIDES.heatExtremeC}°C`,
    },
    {
      value: WEATHER_CHART_DISPLAY_GUIDES.coldExtremeC,
      color: 'rgba(56, 189, 248, 0.9)',
      dash: [6, 4],
      label: `Cold ${WEATHER_CHART_DISPLAY_GUIDES.coldExtremeC}°C`,
    },
    {
      value: ops.heatStressC,
      color: 'rgba(251, 146, 60, 0.75)',
      dash: [3, 3],
      label: `Stress ${ops.heatStressC}°C`,
    },
    {
      value: ops.frostC,
      color: 'rgba(147, 197, 253, 0.75)',
      dash: [3, 3],
      label: `Frost ${ops.frostC}°C`,
    },
  ]
}

export function buildWindSpeedChartGuides(ops: WeatherOperationsThresholds): WeatherChartHorizontalGuide[] {
  return [
    {
      value: ops.highWindAlertKmh,
      color: 'rgba(248, 113, 113, 0.85)',
      dash: [6, 4],
      label: `High wind ${ops.highWindAlertKmh} km/h`,
    },
    {
      value: ops.windSprayWarningKmh,
      color: 'rgba(251, 191, 36, 0.8)',
      dash: [4, 4],
      label: `Spray warn ${ops.windSprayWarningKmh} km/h`,
    },
    {
      value: ops.windSprayCautionKmh,
      color: 'rgba(163, 230, 53, 0.65)',
      dash: [2, 4],
      label: `Spray caution ${ops.windSprayCautionKmh} km/h`,
    },
  ]
}

export function buildHumidityChartGuides(ops: WeatherOperationsThresholds): WeatherChartHorizontalGuide[] {
  return [
    {
      value: ops.highHumidityPct,
      color: 'rgba(52, 211, 153, 0.85)',
      dash: [6, 4],
      label: `High ${ops.highHumidityPct}%`,
    },
    {
      value: ops.lowHumidityPct,
      color: 'rgba(244, 114, 182, 0.85)',
      dash: [6, 4],
      label: `Low ${ops.lowHumidityPct}%`,
    },
  ]
}

export function yScalePaddingForGuides(
  dataMin: number | null,
  dataMax: number | null,
  guides: WeatherChartHorizontalGuide[],
  floor = 0,
  ceiling?: number,
): { min?: number; max?: number } {
  const guideVals = guides.map(g => g.value)
  const gMin = guideVals.length ? Math.min(...guideVals) : null
  const gMax = guideVals.length ? Math.max(...guideVals) : null
  let min = dataMin
  let max = dataMax
  if (gMin != null) min = min == null ? gMin : Math.min(min, gMin)
  if (gMax != null) max = max == null ? gMax : Math.max(max, gMax)
  const out: { min?: number; max?: number } = {}
  if (min != null) out.min = Math.min(min, floor)
  if (max != null) out.max = ceiling != null ? Math.max(max, ceiling) : max + Math.max(2, max * 0.05)
  return out
}
