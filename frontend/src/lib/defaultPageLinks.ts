import type { CustomPageRecord } from '../types/systemSettings'

export const AGROCLOUD_MANAGEMENT_PAGE_PATH = '/applications/agrocloud-management'

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
]

export function isExternalPageLink(page: CustomPageRecord): boolean {
  return page.bindTarget === 'external'
}

export function findPageLinkByPath(pages: CustomPageRecord[], path: string): CustomPageRecord | undefined {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return pages.find(p => isExternalPageLink(p) && p.path === normalized)
}
