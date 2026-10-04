import { DEFAULT_DEVELOP_ELITE_CHART_PALETTE } from './developEliteChartsConfig'

/** Slice fill from the dashboard agro palette (unique index per ranked slice). */
export function colorForCropChartLabel(label: string, paletteIndex: number, palette?: string[]): string {
  const pal = palette?.length ? palette : DEFAULT_DEVELOP_ELITE_CHART_PALETTE
  return pal[paletteIndex % pal.length] ?? pal[0]!
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
  return pal[index % pal.length] ?? pal[0]!
}

/** Dark text on pale chart fills (lemon / white / light yellow). */
export function developEliteChartValueLabelColor(fillColor: string, tickOnDark: string): string {
  const bg = fillColor.trim().toLowerCase()
  if (bg === '#ecfdf5' || bg === '#f8fafc' || bg === '#ffffff' || bg === '#fef9c3' || bg === '#fef08a') {
    return '#14532d'
  }
  return tickOnDark
}
