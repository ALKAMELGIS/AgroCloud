/** Per-calendar-day min/max °C from an hourly series (fallback when Open-Meteo daily is missing). */
export function dailyMinMaxMapFromHourly(
  points: Array<{ time: string; temperatureC: number | null }>,
): Map<string, { min: number | null; max: number | null }> {
  const acc = new Map<string, { min: number; max: number }>()
  for (const p of points) {
    if (p.temperatureC == null || !Number.isFinite(p.temperatureC)) continue
    const day = p.time.trim().replace(' ', 'T').slice(0, 10)
    const hit = acc.get(day)
    if (!hit) acc.set(day, { min: p.temperatureC, max: p.temperatureC })
    else {
      hit.min = Math.min(hit.min, p.temperatureC)
      hit.max = Math.max(hit.max, p.temperatureC)
    }
  }
  const out = new Map<string, { min: number | null; max: number | null }>()
  for (const [day, v] of acc) out.set(day, { min: v.min, max: v.max })
  return out
}

export function mergeDailyMinMaxMaps(
  primary: Map<string, { min: number | null; max: number | null }>,
  fallback: Map<string, { min: number | null; max: number | null }>,
): Map<string, { min: number | null; max: number | null }> {
  const out = new Map(primary)
  for (const [day, v] of fallback) {
    const hit = out.get(day)
    if (!hit || hit.min == null || hit.max == null) {
      out.set(day, {
        min: hit?.min ?? v.min,
        max: hit?.max ?? v.max,
      })
    }
  }
  return out
}
