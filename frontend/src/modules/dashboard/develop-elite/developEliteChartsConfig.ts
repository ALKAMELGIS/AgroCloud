import { normalizeDevelopEliteHexColor } from './developEliteLayoutConfig'

/** Agro brand palette — dark green → lime → lemon → gold (no duplicates). */
export const DEFAULT_DEVELOP_ELITE_CHART_PALETTE = [
  '#14532d',
  '#166534',
  '#22c55e',
  '#4ade80',
  '#a3e635',
  '#ecfdf5',
  '#fef08a',
  '#facc15',
]

export type DevelopEliteChartsConfig = {
  pieMaxSlices: number
  barMaxSlices: number
  sortByValueDesc: boolean
  groupRemainderAsOther: boolean
  labelColor: string
  axisColor: string
  tickColor: string
  gridColor: string
  fontFamily: string
  legendFontPx: number
  axisFontPx: number
  tableFontPx: number
  tableHeaderBg: string
  palette: string[]
}

export const DEFAULT_DEVELOP_ELITE_CHARTS: DevelopEliteChartsConfig = {
  pieMaxSlices: 8,
  barMaxSlices: 10,
  sortByValueDesc: true,
  groupRemainderAsOther: true,
  labelColor: '#b7f7c8',
  axisColor: '#86efac',
  tickColor: '#ecfdf5',
  gridColor: 'rgba(74, 222, 128, 0.12)',
  fontFamily: "'Segoe UI', system-ui, sans-serif",
  legendFontPx: 7,
  axisFontPx: 9,
  tableFontPx: 9,
  tableHeaderBg: 'rgba(74, 222, 128, 0.12)',
  palette: [...DEFAULT_DEVELOP_ELITE_CHART_PALETTE],
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function normalizePalette(raw: unknown): string[] {
  const base = DEFAULT_DEVELOP_ELITE_CHART_PALETTE
  if (!Array.isArray(raw) || raw.length === 0) return [...base]
  const out = raw
    .map(c => normalizeDevelopEliteHexColor(c, base[0]!))
    .filter((c, i, arr) => arr.indexOf(c) === i)
  return out.length ? out : [...base]
}

export function normalizeDevelopEliteChartsConfig(
  partial?: Partial<DevelopEliteChartsConfig> | null,
): DevelopEliteChartsConfig {
  const d = DEFAULT_DEVELOP_ELITE_CHARTS
  const p = partial ?? {}
  return {
    pieMaxSlices: clamp(Number(p.pieMaxSlices ?? d.pieMaxSlices), 3, 16),
    barMaxSlices: clamp(Number(p.barMaxSlices ?? d.barMaxSlices), 3, 20),
    sortByValueDesc: p.sortByValueDesc ?? d.sortByValueDesc,
    groupRemainderAsOther: p.groupRemainderAsOther ?? d.groupRemainderAsOther,
    labelColor: String(p.labelColor ?? d.labelColor),
    axisColor: String(p.axisColor ?? d.axisColor),
    tickColor: String(p.tickColor ?? d.tickColor),
    gridColor: String(p.gridColor ?? d.gridColor),
    fontFamily: String(p.fontFamily ?? d.fontFamily).trim() || d.fontFamily,
    legendFontPx: clamp(Number(p.legendFontPx ?? d.legendFontPx), 7, 16),
    axisFontPx: clamp(Number(p.axisFontPx ?? d.axisFontPx), 7, 16),
    tableFontPx: clamp(Number(p.tableFontPx ?? d.tableFontPx), 7, 14),
    tableHeaderBg: String(p.tableHeaderBg ?? d.tableHeaderBg),
    palette: normalizePalette(p.palette),
  }
}
