const LABELS: Record<string, string> = {
  'kpi-hero-zone': 'Zone layer area',
  'kpi-hero': 'Cultivated area',
  sidebar: 'Farms & countries',
  'sidebar-farms': 'Farms',
  'sidebar-countries': 'Countries',
  zones: 'Zones',
  structures: 'Structures',
  map: 'Map',
  'chart-pie': 'Pie chart',
  'chart-bar': 'Bar chart',
  'chart-table': 'Crops table',
}

export function developEliteGridWidgetLabel(widgetId: string): string {
  if (LABELS[widgetId]) return LABELS[widgetId]
  if (widgetId.startsWith('kpi-')) {
    return widgetId
      .slice(4)
      .split('-')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
  }
  return widgetId
}
