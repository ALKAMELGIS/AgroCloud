/**
 * Plugin-style widget registry for the AgroCloud GIS Dashboard UI system.
 * Each widget declares data requirements and layout zone (header / body / sidebar).
 */
import type { AgroCloudDashboardElementKind } from './agroCloudDashboardData'
import { widgetKindNeedsLayerSelection, widgetKindSkipsDataPicker } from './agroCloudDashboardLayerSelection'

export type DashboardWidgetZone = 'body' | 'header' | 'sidebar'

export type DashboardWidgetDefinition = {
  kind: AgroCloudDashboardElementKind
  label: string
  icon: string
  zone: DashboardWidgetZone
  /** Opens Select a layer / GIS Content on add. */
  requiresDataSource: boolean
  supportsCrossFilter: boolean
  supportsRealtime: boolean
  description: string
}

export const DASHBOARD_WIDGET_REGISTRY: DashboardWidgetDefinition[] = [
  {
    kind: 'map',
    label: 'Map',
    icon: 'fa-regular fa-map',
    zone: 'body',
    requiresDataSource: true,
    supportsCrossFilter: true,
    supportsRealtime: true,
    description: 'Interactive map with layer toggles, popups, and selection.',
  },
  {
    kind: 'serial-chart',
    label: 'Serial chart',
    icon: 'fa-solid fa-chart-column',
    zone: 'body',
    requiresDataSource: true,
    supportsCrossFilter: true,
    supportsRealtime: true,
    description: 'Bar or line chart with group-by and time series.',
  },
  {
    kind: 'pie-chart',
    label: 'Pie chart',
    icon: 'fa-solid fa-chart-pie',
    zone: 'body',
    requiresDataSource: true,
    supportsCrossFilter: true,
    supportsRealtime: true,
    description: 'Category proportions with map linkage.',
  },
  {
    kind: 'indicator',
    label: 'Indicator',
    icon: 'fa-solid fa-hashtag',
    zone: 'header',
    requiresDataSource: true,
    supportsCrossFilter: true,
    supportsRealtime: true,
    description: 'Single KPI with trend and dynamic color.',
  },
  {
    kind: 'gauge',
    label: 'Gauge',
    icon: 'fa-solid fa-gauge-high',
    zone: 'sidebar',
    requiresDataSource: true,
    supportsCrossFilter: true,
    supportsRealtime: true,
    description: 'Min/max gauge with color zones.',
  },
  {
    kind: 'list',
    label: 'List',
    icon: 'fa-solid fa-list',
    zone: 'sidebar',
    requiresDataSource: true,
    supportsCrossFilter: true,
    supportsRealtime: true,
    description: 'Searchable record list linked to map selection.',
  },
  {
    kind: 'table',
    label: 'Table',
    icon: 'fa-solid fa-table',
    zone: 'sidebar',
    requiresDataSource: true,
    supportsCrossFilter: true,
    supportsRealtime: false,
    description: 'Sortable paginated attribute table with CSV export.',
  },
  {
    kind: 'details',
    label: 'Details',
    icon: 'fa-solid fa-align-left',
    zone: 'sidebar',
    requiresDataSource: true,
    supportsCrossFilter: true,
    supportsRealtime: true,
    description: 'Single-feature attribute view with media.',
  },
  {
    kind: 'rich-text',
    label: 'Rich text',
    icon: 'fa-solid fa-font',
    zone: 'header',
    requiresDataSource: false,
    supportsCrossFilter: false,
    supportsRealtime: false,
    description: 'Formatted text with optional {field_name} tokens.',
  },
  {
    kind: 'embedded',
    label: 'Embedded content',
    icon: 'fa-regular fa-window-maximize',
    zone: 'body',
    requiresDataSource: false,
    supportsCrossFilter: false,
    supportsRealtime: false,
    description: 'Secure iframe for external apps and media.',
  },
]

export function getDashboardWidgetDefinition(
  kind: AgroCloudDashboardElementKind,
): DashboardWidgetDefinition | undefined {
  return DASHBOARD_WIDGET_REGISTRY.find(w => w.kind === kind)
}

export function widgetRequiresDataPicker(kind: AgroCloudDashboardElementKind): boolean {
  if (widgetKindSkipsDataPicker(kind)) return false
  return widgetKindNeedsLayerSelection(kind)
}
