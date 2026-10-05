import { DEFAULT_DEVELOP_ELITE_CHART_PALETTE } from './developEliteChartsConfig'

/** Pie / bar only: highest value → orange, lowest → yellow. */
const DEVELOP_ELITE_CHART_GRADIENT_DARK = { r: 234, g: 88, b: 12 } /* #ea580c */
const DEVELOP_ELITE_CHART_GRADIENT_LIGHT = { r: 250, g: 204, b: 21 } /* #facc15 */

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)))
}

function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map(v => clampByte(v).toString(16).padStart(2, '0')).join('')}`
}

/**
 * Rank 0 = highest value (orange). Rank count-1 = lowest (yellow).
 * `total` is the number of visible slices in the chart.
 */
export function colorForChartValueRank(rankIndex: number, total: number): string {
  const n = Math.max(1, total)
  const rank = Math.max(0, Math.min(rankIndex, n - 1))
  if (n === 1) return toHex(DEVELOP_ELITE_CHART_GRADIENT_DARK.r, DEVELOP_ELITE_CHART_GRADIENT_DARK.g, DEVELOP_ELITE_CHART_GRADIENT_DARK.b)
  const t = rank / (n - 1)
  const r = DEVELOP_ELITE_CHART_GRADIENT_DARK.r + (DEVELOP_ELITE_CHART_GRADIENT_LIGHT.r - DEVELOP_ELITE_CHART_GRADIENT_DARK.r) * t
  const g = DEVELOP_ELITE_CHART_GRADIENT_DARK.g + (DEVELOP_ELITE_CHART_GRADIENT_LIGHT.g - DEVELOP_ELITE_CHART_GRADIENT_DARK.g) * t
  const b = DEVELOP_ELITE_CHART_GRADIENT_DARK.b + (DEVELOP_ELITE_CHART_GRADIENT_LIGHT.b - DEVELOP_ELITE_CHART_GRADIENT_DARK.b) * t
  return toHex(r, g, b)
}

export function normalizeDevelopEliteCropChartLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** @deprecated Use colorForChartValueRank; kept for callers passing rank as paletteIndex. */
export function colorForCropChartLabel(_label: string, paletteIndex: number, palette?: string[]): string {
  const pal = palette?.length ? palette : DEFAULT_DEVELOP_ELITE_CHART_PALETTE
  return colorForChartValueRank(paletteIndex, pal.length)
}

export function barFillColorForCropLabel(label: string, paletteIndex: number, palette?: string[]): string {
  return colorForCropChartLabel(label, paletteIndex, palette)
}

export function resolveDevelopEliteSliceColor(
  _label: string,
  index: number,
  palette: string[],
  _mode: 'pie' | 'bar',
): string {
  const pal = palette?.length ? palette : DEFAULT_DEVELOP_ELITE_CHART_PALETTE
  return pal[index % pal.length]!
}

function relativeLuminanceHex(hex: string): number {
  const raw = hex.replace('#', '').trim()
  if (raw.length !== 6) return 0
  const r = parseInt(raw.slice(0, 2), 16) / 255
  const g = parseInt(raw.slice(2, 4), 16) / 255
  const b = parseInt(raw.slice(4, 6), 16) / 255
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** Bar value labels: white on dark fills; dark green on white / yellow slices. */
export function developEliteChartValueLabelColor(fillColor: string, tickOnDark: string): string {
  if (relativeLuminanceHex(fillColor) > 0.62) return '#14532d'
  return tickOnDark || '#ffffff'
}

/** Pie callout leader lines (matte white). */
export const DEVELOP_ELITE_PIE_CALLOUT_LINE_COLOR = 'rgba(255, 255, 255, 0.48)'
