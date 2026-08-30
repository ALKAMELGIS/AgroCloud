/** Map FTW export / attribute status lines to a 0–100 progress bar width. */

export function pctFromDoneTotal(done: number, total: number, floor: number, ceil: number): number {
  if (!Number.isFinite(done) || !Number.isFinite(total) || total <= 0) return floor
  const t = Math.max(0, Math.min(1, done / total))
  return Math.round(floor + t * (ceil - floor))
}

export function mapExportProgressPct(message: string): number {
  const m = message.toLowerCase()
  const bracket = message.match(/\((\d+)\/(\d+)\)/)
  if (bracket) {
    return pctFromDoneTotal(Number(bracket[1]), Number(bracket[2]), 75, 98)
  }
  if (m.includes('building continuous raster') || m.includes('building continuous')) return 18
  if (m.includes('vectorizing')) return 42
  if (m.includes('clipping')) return 58
  if (m.includes('minimum area')) return 68
  if (m.includes('regularizing')) return 74
  if (m.includes('example.xlsx') || m.includes('attributes —')) return 78
  if (m.startsWith('export —') || m.startsWith('export -')) return 10
  return 24
}

export function mapAttributesProgressPct(message: string, done?: number, total?: number): number {
  if (typeof done === 'number' && typeof total === 'number' && total > 0) {
    return pctFromDoneTotal(done, total, 12, 96)
  }
  const bracket = message.match(/\((\d+)\/(\d+)\)/)
  if (bracket) {
    return pctFromDoneTotal(Number(bracket[1]), Number(bracket[2]), 12, 96)
  }
  return 8
}
