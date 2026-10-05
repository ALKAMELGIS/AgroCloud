import type { CustomPageRecord } from '../types/systemSettings'
import { DEFAULT_AGRO_CLOUD_DASHBOARD_URL } from '@/modules/dashboards/management/agrocloud/agroCloudDashboardStorage'

export const AGROCLOUD_MANAGEMENT_PAGE_PATH = '/applications/agrocloud-management'

export const EAP_ARCGIS_DASHBOARD_PAGE_PATH = '/dashboards/eap-arcgis'

export const IRRIGATION_SENSORS_PAGE_PATH = '/sensors/irrigation'

export const GPS_VEHICLE_TRACKING_PAGE_PATH = '/sensors/gps'

export const AGROCLOUD_MANAGEMENT_EXTERNAL_URL =
  'https://sublime-acceptance-production-ae33.up.railway.app/login'

/** Default AgSense 365 farm grid — override in Settings → Pages. */
export const IRRIGATION_SENSORS_DEFAULT_URL = 'https://www.agsense365.com/farm/grid'

/** John Deere Operations Center map sign-in — override in Settings → Pages. */
export const GPS_VEHICLE_TRACKING_DEFAULT_URL =
  'https://signin.johndeere.com/oauth2/aus78tnlaysMraFhC1t7/v1/authorize?client_id=johndeere-8BsHt2wO5gtMpBazeVpXsvtORU6dwmL91OpMvK5e&response_type=code&redirect_uri=https%3A%2F%2Fmap.deere.com%2Flogin&scope=profile%20openid%20offline_access%20toggles'

/** Seeded when no user-defined link exists at this path. */
export const DEFAULT_PAGE_LINKS: CustomPageRecord[] = [
  {
    id: 'agrocloud-management-link',
    name: 'AgroCloud Management',
    nameAr: 'إدارة AgroCloud',
    path: AGROCLOUD_MANAGEMENT_PAGE_PATH,
    iconClass: 'fa-solid fa-building-user',
    visible: true,
    bindTarget: 'external',
    externalUrl: AGROCLOUD_MANAGEMENT_EXTERNAL_URL,
    navGroupId: 'application',
    subitemClass: 'nav-item-agrocloud-management',
  },
  {
    id: 'eap-arcgis-dashboard-link',
    name: 'EAP ArcGIS Dashboard',
    nameAr: 'لوحة ArcGIS - EAP',
    path: EAP_ARCGIS_DASHBOARD_PAGE_PATH,
    iconClass: 'fa-solid fa-chart-pie',
    visible: true,
    bindTarget: 'external',
    externalUrl: DEFAULT_AGRO_CLOUD_DASHBOARD_URL,
    navGroupId: 'dashboard',
    subitemClass: 'nav-item-dashboard-agro',
  },
  {
    id: 'irrigation-sensors-agsense-link',
    name: 'Irrigation Sensors',
    nameAr: 'حساسات الري',
    path: IRRIGATION_SENSORS_PAGE_PATH,
    iconClass: 'fa-solid fa-faucet-drip',
    visible: true,
    bindTarget: 'external',
    externalUrl: IRRIGATION_SENSORS_DEFAULT_URL,
    navGroupId: 'sensors',
    subitemClass: 'nav-item-sensor-irrigation',
  },
  {
    id: 'gps-vehicle-tracking-jd-link',
    name: 'GPS Vehicle Tracking',
    nameAr: 'تتبع مركبات GPS',
    path: GPS_VEHICLE_TRACKING_PAGE_PATH,
    iconClass: 'fa-solid fa-route',
    visible: true,
    bindTarget: 'external',
    externalUrl: GPS_VEHICLE_TRACKING_DEFAULT_URL,
    navGroupId: 'sensors',
    subitemClass: 'nav-item-sensor-gps',
  },
]

export function isExternalPageLink(page: CustomPageRecord): boolean {
  return page.bindTarget === 'external'
}

export function findPageLinkByPath(pages: CustomPageRecord[], path: string): CustomPageRecord | undefined {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return pages.find(p => isExternalPageLink(p) && p.path === normalized)
}

/** Resolved embed URL for AgroCloud Management (Railway login by default). */
export function resolveAgroCloudManagementUrl(pages: CustomPageRecord[]): string {
  const link = findPageLinkByPath(pages, AGROCLOUD_MANAGEMENT_PAGE_PATH)
  const trimmed = link?.externalUrl?.trim()
  if (trimmed) return trimmed
  return AGROCLOUD_MANAGEMENT_EXTERNAL_URL
}

/** Resolved embed URL for Irrigation Sensors (AgSense grid by default). */
export function resolveIrrigationSensorsUrl(pages: CustomPageRecord[]): string {
  const link = findPageLinkByPath(pages, IRRIGATION_SENSORS_PAGE_PATH)
  const trimmed = link?.externalUrl?.trim()
  if (trimmed) return trimmed
  return IRRIGATION_SENSORS_DEFAULT_URL
}

/** Resolved embed URL for GPS Vehicle Tracking (John Deere sign-in by default). */
export function resolveGpsVehicleTrackingUrl(pages: CustomPageRecord[]): string {
  const link = findPageLinkByPath(pages, GPS_VEHICLE_TRACKING_PAGE_PATH)
  const trimmed = link?.externalUrl?.trim()
  if (trimmed) return trimmed
  return GPS_VEHICLE_TRACKING_DEFAULT_URL
}

const DEDICATED_EXTERNAL_EMBED_PATHS = new Set<string>([
  IRRIGATION_SENSORS_PAGE_PATH,
  GPS_VEHICLE_TRACKING_PAGE_PATH,
  AGROCLOUD_MANAGEMENT_PAGE_PATH,
])

/** True when the current route should render a full-height external iframe (Settings → Pages). */
export function isExternalEmbedRoute(pages: CustomPageRecord[], pathname: string): boolean {
  const normalized = pathname.startsWith('/') ? pathname : `/${pathname}`
  if (DEDICATED_EXTERNAL_EMBED_PATHS.has(normalized)) return true
  return Boolean(findPageLinkByPath(pages, normalized))
}
