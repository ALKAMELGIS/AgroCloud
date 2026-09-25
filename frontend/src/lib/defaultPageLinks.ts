import type { CustomPageRecord } from '../types/systemSettings'

export const AGROCLOUD_MANAGEMENT_PAGE_PATH = '/applications/agrocloud-management'

export const AGROCLOUD_MANAGEMENT_EXTERNAL_URL =
  'https://sublime-acceptance-production-ae33.up.railway.app/login'

export const JOHN_DEERE_SIGN_IN_PAGE_PATH = '/applications/john-deere-sign-in'

/** Stable Okta portal entry — do not embed one-off /authorize URLs (PKCE expires → blank footer). */
export const JOHN_DEERE_SIGN_IN_EMBED_URL = 'https://signin.johndeere.com/'

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
    id: 'john-deere-sign-in-link',
    name: 'John Deere Sign-In',
    nameAr: 'تسجيل دخول John Deere',
    path: JOHN_DEERE_SIGN_IN_PAGE_PATH,
    iconClass: 'fa-solid fa-user-lock',
    visible: true,
    bindTarget: 'external',
    externalUrl: JOHN_DEERE_SIGN_IN_EMBED_URL,
    navGroupId: 'application',
    subitemClass: 'nav-item-john-deere-sign-in',
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
