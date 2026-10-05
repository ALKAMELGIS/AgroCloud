export type WeatherChartDateRange = {
  startDate: string
  endDate: string
}

export const WEATHER_CHART_DATE_MIN = '1980-01-01'
export const WEATHER_CHART_DATE_MAX = '3000-12-31'
/** Default chart window: last 7 days through today. */
export const WEATHER_CHART_DEFAULT_LOOKBACK_DAYS = 7

export function formatLocalDateYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function getWeatherChartTodayYmd(): string {
  return formatLocalDateYmd(new Date())
}

/** Inclusive day count from `fromYmd` through `toYmd` (local calendar days). */
export function daysBetweenYmdInclusive(fromYmd: string, toYmd: string): number {
  const a = Date.parse(`${fromYmd}T12:00:00`)
  const b = Date.parse(`${toYmd}T12:00:00`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0
  return Math.max(0, Math.round((b - a) / 86_400_000))
}

export function addDaysToYmd(ymd: string, deltaDays: number): string {
  const d = new Date(`${ymd}T12:00:00`)
  if (Number.isNaN(d.getTime())) return ymd
  d.setDate(d.getDate() + deltaDays)
  return formatLocalDateYmd(d)
}

export function getDefaultWeatherChartStartYmd(lookbackDays = WEATHER_CHART_DEFAULT_LOOKBACK_DAYS): string {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() - Math.max(0, lookbackDays))
  return formatLocalDateYmd(d)
}

export function getDefaultWeatherChartDateRange(): WeatherChartDateRange {
  return {
    startDate: getDefaultWeatherChartStartYmd(),
    endDate: getWeatherChartTodayYmd(),
  }
}

function clampYmd(ymd: string, min: string, max: string): string {
  if (ymd < min) return min
  if (ymd > max) return max
  return ymd
}

export function clampWeatherChartDateRange(range: WeatherChartDateRange): WeatherChartDateRange {
  let startDate = clampYmd(range.startDate, WEATHER_CHART_DATE_MIN, WEATHER_CHART_DATE_MAX)
  let endDate = clampYmd(range.endDate, WEATHER_CHART_DATE_MIN, WEATHER_CHART_DATE_MAX)
  if (startDate > endDate) endDate = startDate
  return { startDate, endDate }
}

export function filterHourlyByDateRange<T extends { time: string }>(
  points: T[],
  range: WeatherChartDateRange,
): T[] {
  const { startDate, endDate } = clampWeatherChartDateRange(range)
  return points.filter(p => {
    const day = p.time.slice(0, 10)
    return day >= startDate && day <= endDate
  })
}

/** Keep charts responsive for long ranges. */
export function downsampleHourlySeries<T>(points: T[], maxPoints = 420): T[] {
  if (points.length <= maxPoints) return points
  const step = Math.ceil(points.length / maxPoints)
  const out: T[] = []
  for (let i = 0; i < points.length; i += step) out.push(points[i])
  if (out[out.length - 1] !== points[points.length - 1]) out.push(points[points.length - 1])
  return out
}
