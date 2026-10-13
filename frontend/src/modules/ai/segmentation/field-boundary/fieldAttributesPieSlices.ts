import type { NamedCount } from './fieldAttributesDashboardModel'

export type PieSlice = NamedCount & {
  color: string
  pct: number
}

export type PreparePieSlicesOpts = {
  maxSlices?: number
  otherLabel?: string
}

/** Sort, cap categories, roll small tails into Other for readable proportion charts. */
export function preparePieSlices(
  rows: NamedCount[],
  colorFor: (label: string, index: number) => string,
  opts: PreparePieSlicesOpts = {},
): PieSlice[] {
  const maxSlices = Math.max(2, opts.maxSlices ?? 6)
  const otherLabel = opts.otherLabel ?? 'Other'
  const sorted = [...rows]
    .filter(r => r.count > 0 && String(r.label || '').trim())
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
  if (!sorted.length) return []

  const total = sorted.reduce((s, r) => s + r.count, 0) || 1
  const head = sorted.slice(0, maxSlices)
  const tail = sorted.slice(maxSlices)
  const tailCount = tail.reduce((s, r) => s + r.count, 0)

  const out: NamedCount[] = [...head]
  if (tailCount > 0) {
    out.push({ label: otherLabel, count: tailCount })
  }

  return out.map((r, i) => ({
    ...r,
    color: colorFor(r.label, i),
    pct: Math.round((r.count / total) * 1000) / 10,
  }))
}

export function pieSliceConicGradient(slices: Array<{ count: number; color: string }>): string {
  const total = slices.reduce((s, r) => s + r.count, 0)
  if (total <= 0) return 'conic-gradient(#e2e8f0 0% 100%)'
  let acc = 0
  const segs: string[] = []
  for (const r of slices) {
    const pct = (r.count / total) * 100
    const start = acc
    acc += pct
    segs.push(`${r.color} ${start.toFixed(3)}% ${acc.toFixed(3)}%`)
  }
  return `conic-gradient(from -90deg, ${segs.join(', ')})`
}
