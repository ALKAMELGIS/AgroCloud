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
