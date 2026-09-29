import type { CustomPageRecord } from '../types/systemSettings'
import { DEFAULT_AGRO_CLOUD_DASHBOARD_URL } from './agroCloudDashboardStorage'

export const AGROCLOUD_MANAGEMENT_PAGE_PATH = '/applications/agrocloud-management'

export const EAP_ARCGIS_DASHBOARD_PAGE_PATH = '/dashboards/eap-arcgis'

export const AGROCLOUD_MANAGEMENT_EXTERNAL_URL =
  'https://sublime-acceptance-production-ae33.up.railway.app/login'

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
