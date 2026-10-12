export function formatHourlyTimelineLabel(iso: string): string {
  const d = new Date(iso.replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return iso.replace('T', ' ').slice(0, 16)
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Index of the hour closest to now (for default scrubber position). */
export function findDefaultTimelineIndex(series: { time: string }[]): number {
  if (!series.length) return 0
  const now = Date.now()
  let best = 0
  let bestDiff = Infinity
  for (let i = 0; i < series.length; i++) {
    const t = new Date(series[i].time.replace(' ', 'T')).getTime()
    if (Number.isNaN(t)) continue
    const d = Math.abs(t - now)
    if (d < bestDiff) {
      bestDiff = d
      best = i
    }
  }
  return best
}
