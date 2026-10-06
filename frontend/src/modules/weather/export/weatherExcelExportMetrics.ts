export type WeatherExcelExportMetricId =
  | 'temperature'
  | 'humidity'
  | 'wind'
  | 'precipitation'
  | 'pressure'
  | 'et0'
  | 'solar'

export const WEATHER_EXCEL_EXPORT_METRICS: Array<{
  id: WeatherExcelExportMetricId
  label: string
}> = [
  { id: 'temperature', label: 'Temperature' },
  { id: 'humidity', label: 'Humidity' },
  { id: 'wind', label: 'Wind speed' },
  { id: 'precipitation', label: 'Precipitation' },
  { id: 'pressure', label: 'Pressure' },
  { id: 'et0', label: 'ET₀ (evapotranspiration)' },
  { id: 'solar', label: 'Solar radiation' },
]

export const DEFAULT_WEATHER_EXCEL_METRICS: WeatherExcelExportMetricId[] =
  WEATHER_EXCEL_EXPORT_METRICS.map(m => m.id)

/** Maps chart section labels in the meteo workbook to export metric ids. */
export function chartSectionMatchesMetrics(sectionLabel: string, metrics: Set<string>): boolean {
  if (!metrics.size) return true
  const l = sectionLabel.toLowerCase()
  if (metrics.has('temperature') && (l.includes('temp') || l.includes('thermal'))) return true
  if (metrics.has('precipitation') && (l.includes('rain') || l.includes('precip'))) return true
  if (metrics.has('humidity') && (l.includes('humid') || l.includes('rh'))) return true
  if (metrics.has('wind') && l.includes('wind')) return true
  if (metrics.has('et0') && (l.includes('et0') || l.includes('evapotrans'))) return true
  if (metrics.has('solar') && (l.includes('solar') || l.includes('radiation') || l.includes('sunshine')))
    return true
  if (metrics.has('pressure') && l.includes('pressure')) return true
  return false
}
