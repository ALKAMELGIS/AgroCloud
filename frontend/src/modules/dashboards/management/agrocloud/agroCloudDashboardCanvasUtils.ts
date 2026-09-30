import type { AgroCloudDashboardConfig, AgroCloudDashboardElement } from './agroCloudDashboardData'
import { AGROCLOUD_DASHBOARD_ELEMENT_OPTIONS } from './agroCloudDashboardData'
import { formatDashboardNumber } from './agroCloudDashboardTimeRegion'
import {
  getBodyElements,
  getHeaderWidgetElements,
  getSidebarElements,
} from './agroCloudDashboardLayout'

export { getBodyElements, getHeaderWidgetElements, getSidebarElements }

const SAMPLE_VALUES: Record<string, number> = {
  Farm_Code: 1284,
  Area_Ha: 1_250_000,
  NDVI: 0.72,
  Crop_Type: 42,
  Value: 3847,
}

export function dashboardElementIcon(kind: AgroCloudDashboardElement['kind']): string {
  return AGROCLOUD_DASHBOARD_ELEMENT_OPTIONS.find(o => o.kind === kind)?.icon ?? 'fa-solid fa-cube'
}

export function classifyDashboardElements(elements: AgroCloudDashboardElement[]) {
  return {
    header: getHeaderWidgetElements(elements),
    sidebar: getSidebarElements(elements),
    body: getBodyElements(elements),
  }
}

export function widgetPreviewValue(el: AgroCloudDashboardElement, config: AgroCloudDashboardConfig): string {
  const field = el.field ?? 'Value'
  const raw = SAMPLE_VALUES[field] ?? SAMPLE_VALUES.Value
  if (el.aggregation === 'avg' && field === 'NDVI') return raw.toFixed(2)
  return formatDashboardNumber(raw, config)
}

export function widgetMetaLine(el: AgroCloudDashboardElement): string | null {
  const parts: string[] = []
  if (el.sourceLayer) parts.push(el.sourceLayer)
  if (el.field) parts.push(el.field)
  if (el.aggregation && el.aggregation !== 'none') parts.push(el.aggregation)
  return parts.length ? parts.join(' · ') : null
}
