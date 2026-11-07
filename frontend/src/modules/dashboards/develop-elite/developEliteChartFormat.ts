/** Default unit shown beside pie / bar values (not as a chart header). */
export const DEVELOP_ELITE_CHART_VALUE_UNIT = 'Tons'

export function resolveDevelopEliteChartValueUnit(configured?: string): string {
  const raw = String(configured ?? '').trim()
  if (!raw) return DEVELOP_ELITE_CHART_VALUE_UNIT
  return raw.replace(/^per\s+/i, '').trim() || DEVELOP_ELITE_CHART_VALUE_UNIT
}

export function formatDevelopEliteChartValueWithUnit(
  value: number,
  unit: string = DEVELOP_ELITE_CHART_VALUE_UNIT,
): string {
  const n = formatDevelopEliteChartValue(value)
  const u = unit.trim()
  return u ? `${n} ${u}` : n
}

/** Compact axis / in-bar labels for large crop area values. */
export function formatDevelopEliteChartAxisTick(value: number): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return ''
  if (n === 0) return '0'
  const abs = Math.abs(n)
  if (abs >= 1_000_000) {
    const v = n / 1_000_000
    return `${v >= 10 ? Math.round(v) : Number(v.toFixed(1))}M`
  }
  if (abs >= 1000) {
    const v = n / 1000
    if (v >= 100) return `${Math.round(v)}k`
    if (v >= 10) return `${Math.round(v)}k`
    return `${Number(v.toFixed(1))}k`
  }
  return String(Math.round(n))
}

export function formatDevelopEliteChartValue(value: number): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return ''
  if (Math.abs(n) >= 1000) return formatDevelopEliteChartAxisTick(n)
  return String(Math.round(n))
}

/** Pie callout second line: percent plus compact value with unit. */
export function formatDevelopElitePieCalloutMetricLine(
  value: number,
  total: number,
  unit: string = DEVELOP_ELITE_CHART_VALUE_UNIT,
): string {
  const pct = total > 0 ? ((value / total) * 100).toFixed(2) : '0.00'
  return `${pct}% · ${formatDevelopEliteChartValueWithUnit(value, unit)}`
}
