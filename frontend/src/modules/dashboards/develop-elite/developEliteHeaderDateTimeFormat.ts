export function formatDevelopEliteHeaderDateTime(date: Date): string {
  return date.toLocaleString('en-US', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

export function dateToInputValue(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function timeToInputValue(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function parseLocalDateTime(datePart: string, timePart: string): Date | null {
  if (!datePart?.trim()) return null
  const [y, m, d] = datePart.split('-').map(n => Number(n))
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null
  let hours = 0
  let minutes = 0
  if (timePart?.trim()) {
    const [h, min] = timePart.split(':').map(n => Number(n))
    if (Number.isFinite(h)) hours = h
    if (Number.isFinite(min)) minutes = min
  }
  const parsed = new Date(y, m - 1, d, hours, minutes, 0, 0)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}
