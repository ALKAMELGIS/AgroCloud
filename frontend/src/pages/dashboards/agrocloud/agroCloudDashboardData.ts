import type { AgroCloudDashboardThemeCustom } from './agroCloudDashboardTheme'
import type { AgroCloudUnitPrefixFormat, AgroCloudUnitPrefixId, AgroCloudUnitPrefixSetting } from './agroCloudDashboardTimeRegion'
import { buildDefaultUnitPrefixes } from './agroCloudDashboardTimeRegion'
import type {
  AgroCloudDashboardHeaderConfig,
  AgroCloudDashboardSidebarConfig,
  AgroCloudDashboardViewSettings,
  AgroCloudLayoutMode,
} from './agroCloudDashboardLayout'
import type { AgroCloudDashboardMapWidgetSettings } from './agroCloudDashboardMapWidgetSettings'
import type { AgroCloudDashboardIndicatorWidgetSettings } from './agroCloudDashboardIndicatorWidgetSettings'
import type { DashboardBodyLayoutNode } from './agroCloudDashboardBodyLayout'

export type AgroCloudDashboardElementKind =
  | 'map'
  | 'serial-chart'
  | 'pie-chart'
  | 'indicator'
  | 'gauge'
  | 'list'
  | 'table'
  | 'details'
  | 'rich-text'
  | 'embedded'

export type AgroCloudDashboardAggregation = 'count' | 'sum' | 'avg' | 'min' | 'max' | 'none'

export type AgroCloudDashboardElement = {
  id: string
  kind: AgroCloudDashboardElementKind
  label: string
  /** GIS Content portal item bound to this element (maps / layers). */
  gisContentId?: string
  gisContentType?: string
  /** Linked data source id (`ds-{gisContentId}`) for chart/indicator/table widgets. */
  dataSourceId?: string
  /** Layer name within the data source schema. */
  sourceLayer?: string
  /** Field name the widget reads from the layer. */
  field?: string
  aggregation?: AgroCloudDashboardAggregation
  /** ArcGIS Dashboards-style map widget configuration. */
  mapSettings?: AgroCloudDashboardMapWidgetSettings
  /** ArcGIS Dashboards-style indicator widget configuration. */
  indicatorSettings?: AgroCloudDashboardIndicatorWidgetSettings
  /** Custom card size in edit mode (px). */
  size?: AgroCloudDashboardElementSize
}

export type AgroCloudDashboardElementSize = {
  width?: number
  height?: number
}

export type AgroCloudDashboardDataSourceRecord = {
  id: string
  gisContentId: string
  title: string
  typeLabel: string
}

export type AgroCloudDashboardConfig = {
  theme: string
  /** Per-dashboard theme overrides (colors, typography, effects, branding). */
  themeCustom?: Partial<AgroCloudDashboardThemeCustom>
  timeZone: 'device' | 'specific'
  /** IANA time zone when `timeZone` is `specific`. */
  specificTimeZone?: string
  /** How numeric values are abbreviated across the dashboard. */
  unitPrefixFormat?: AgroCloudUnitPrefixFormat
  unitPrefixes?: Partial<Record<AgroCloudUnitPrefixId, AgroCloudUnitPrefixSetting>>
  /** Active layout mode while editing (Desktop / Mobile). */
  layoutMode?: AgroCloudLayoutMode
  mobileViewEnabled?: boolean
  /** Top header bar (title, logo, menu). */
  header?: Partial<AgroCloudDashboardHeaderConfig>
  /** Sidebar layout region. */
  sidebar?: Partial<AgroCloudDashboardSidebarConfig>
  /** Dashboard behavior settings (View → Settings tab). */
  viewSettings?: Partial<AgroCloudDashboardViewSettings>
  sharing?: 'private' | 'shared' | 'organization' | 'public'
  folderId?: string
  badgeEnabled?: boolean
  /** Registered GIS Content portal data sources (Web Map, Feature Layer, …). */
  dataSources?: AgroCloudDashboardDataSourceRecord[]
  elements: AgroCloudDashboardElement[]
  /** Body canvas layout tree (dock / stack / group). */
  bodyLayout?: DashboardBodyLayoutNode | null
}

export type AgroCloudDashboardGalleryCard = {
  id: string
  title: string
  author: string
  lastUpdate: string
  thumbnail: 'photo' | 'placeholder'
  portalAppId?: string
}

export const AGROCLOUD_DASHBOARD_AUTHOR = 'subscriptions@eliteprojects.ae'
export const AGROCLOUD_DASHBOARD_ORG = 'Elite Agro Projects LLC'
/** Product name shown in dashboard builder / GIS Content (not GeoSyntra). */
export const AGROCLOUD_PRODUCT_NAME = 'Elite AgroCloud'

export const AGROCLOUD_DASHBOARD_GALLERY_SEED: AgroCloudDashboardGalleryCard[] = [
  { id: 'seed-agrocloud-1', title: 'AgroCloud', author: AGROCLOUD_DASHBOARD_AUTHOR, lastUpdate: 'Jun 4, 2024', thumbnail: 'photo' },
  { id: 'seed-test-1', title: 'Test', author: AGROCLOUD_DASHBOARD_AUTHOR, lastUpdate: 'Jun 4, 2024', thumbnail: 'placeholder' },
  { id: 'seed-veg-1', title: 'Vegetation Health Mapping', author: AGROCLOUD_DASHBOARD_AUTHOR, lastUpdate: 'Jun 4, 2024', thumbnail: 'placeholder' },
  { id: 'seed-agrocloud-2', title: 'AgroCloud', author: AGROCLOUD_DASHBOARD_AUTHOR, lastUpdate: 'Jun 4, 2024', thumbnail: 'placeholder' },
  { id: 'seed-water', title: 'Water Availability Dashboard', author: AGROCLOUD_DASHBOARD_AUTHOR, lastUpdate: 'Jun 4, 2024', thumbnail: 'placeholder' },
  { id: 'seed-ndvi', title: 'NDVI Dashboard', author: AGROCLOUD_DASHBOARD_AUTHOR, lastUpdate: 'Jun 4, 2024', thumbnail: 'placeholder' },
  { id: 'seed-test-2', title: 'Test', author: AGROCLOUD_DASHBOARD_AUTHOR, lastUpdate: 'Jun 4, 2024', thumbnail: 'placeholder' },
  { id: 'seed-veg-2', title: 'Vegetation Health Mapping', author: AGROCLOUD_DASHBOARD_AUTHOR, lastUpdate: 'Jun 4, 2024', thumbnail: 'placeholder' },
]

export { AGROCLOUD_DASHBOARD_THEMES } from './agroCloudDashboardTheme'

export const AGROCLOUD_DASHBOARD_ELEMENT_OPTIONS: {
  kind: AgroCloudDashboardElementKind
  label: string
  icon: string
}[] = [
  { kind: 'map', label: 'Map', icon: 'fa-regular fa-map' },
  { kind: 'serial-chart', label: 'Serial chart', icon: 'fa-solid fa-chart-column' },
  { kind: 'pie-chart', label: 'Pie chart', icon: 'fa-solid fa-chart-pie' },
  { kind: 'indicator', label: 'Indicator', icon: 'fa-solid fa-hashtag' },
  { kind: 'gauge', label: 'Gauge', icon: 'fa-solid fa-gauge-high' },
  { kind: 'list', label: 'List', icon: 'fa-solid fa-list' },
  { kind: 'table', label: 'Table', icon: 'fa-solid fa-table' },
  { kind: 'details', label: 'Details', icon: 'fa-solid fa-align-left' },
  { kind: 'rich-text', label: 'Rich text', icon: 'fa-solid fa-font' },
  { kind: 'embedded', label: 'Embedded content', icon: 'fa-regular fa-window-maximize' },
]

export const DEFAULT_AGROCLOUD_DASHBOARD_CONFIG: AgroCloudDashboardConfig = {
  theme: 'light',
  timeZone: 'device',
  specificTimeZone: 'Etc/UTC',
  unitPrefixFormat: 'custom',
  unitPrefixes: buildDefaultUnitPrefixes(),
  layoutMode: 'desktop',
  mobileViewEnabled: false,
  sharing: 'organization',
  folderId: 'all',
  badgeEnabled: false,
  elements: [],
}

export type AgroCloudEditorPanel =
  | 'view'
  | 'dataSources'
  | 'theme'
  | 'themeCustomize'
  | 'timeRegion'

export type AgroCloudViewTab = 'body' | 'header' | 'sidebar' | 'settings'

export type AgroCloudDashboardAppMenuItem = {
  id: string
  label: string
  path: string
}

/** ArcGIS-style app launcher links shown from the dashboard builder hamburger menu. */
export function getAgroCloudDashboardAppMenuItems(dashboardId?: string): AgroCloudDashboardAppMenuItem[] {
  const items: AgroCloudDashboardAppMenuItem[] = [
    { id: 'home', label: 'Home', path: '/' },
    { id: 'content', label: 'Content', path: '/master/gis-content' },
    { id: 'organization', label: 'Organization', path: '/dashboards/overview' },
    { id: 'dashboards', label: 'Dashboards', path: '/dashboard/develop' },
  ]
  if (dashboardId) {
    items.push({
      id: 'item-details',
      label: 'Dashboard item details',
      path: `/master/gis-content/item/${encodeURIComponent(dashboardId)}`,
    })
  }
  return items
}
