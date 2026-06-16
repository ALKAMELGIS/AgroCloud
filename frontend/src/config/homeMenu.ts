/**
 * Home hub tiles — aligned with `nav/navManifest` groups + quick links.
 * Static hub metadata (used by previews / tooling). The `/` route uses `pages/Home.tsx` classic grid.
 */
import { NAV_DEFAULT_GROUPS } from '@/nav/navManifest'

export type SubMenuItem = {
  id: string
  labelEn: string
  labelAr: string
  path: string
}

export type MenuItem = {
  id: string
  labelEn: string
  labelAr: string
  path: string
  icon: string
  badge: string
  subItems?: SubMenuItem[]
}

const GROUP_TITLE: Record<string, { en: string; ar: string }> = {
  dashboard: { en: 'Dashboard', ar: 'لوحة التحكم' },
  aiAgroCloud: { en: 'AI AgroCloud', ar: 'سحابة Agro الذكية' },
  satellite: { en: 'Satellite Imagery', ar: 'صور الأقمار الصناعية' },
  data: { en: 'Operations', ar: 'العمليات' },
  sensors: { en: 'Sensors', ar: 'الحساسات' },
  master: { en: 'Master Data', ar: 'البيانات الرئيسية' },
  admin: { en: 'Settings', ar: 'الإعدادات' },
}

const LEAF_TITLE: Record<string, { en: string; ar: string }> = {
  developDashboard: { en: 'Develop Dashboard', ar: 'تطوير لوحة التحكم' },
  agroCloudDashboard: { en: 'Agro Cloud Dashboard', ar: 'لوحة Agro Cloud' },
  aiAgroChat: { en: 'AI Agro-Chat', ar: 'محادثة Agro الذكية' },
  satelliteIntelligence: { en: 'Satellite Intelligence', ar: 'التحليل الفضائي الذكي' },
  gisMap: { en: 'GIS Map', ar: 'خريطة GIS' },
  irrigation: { en: 'Irrigation Scheduling', ar: 'جدولة الري' },
  ecph: { en: 'EC/PH', ar: 'الملوحة والحموضة' },
  harvest: { en: 'Harvest Logging', ar: 'تسجيل الحصاد' },
  qhis: { en: 'QHIS', ar: 'الجودة والسلامة' },
  productTracking: { en: 'Product & Sales Tracking', ar: 'تتبع المنتجات والمبيعات' },
  soilSensors: { en: 'Soil Sensors', ar: 'حساسات التربة' },
  weatherSensors: { en: 'Weather Sensors', ar: 'حساسات الطقس' },
  irrigationSensors: { en: 'Irrigation Sensors', ar: 'حساسات الري' },
  camera: { en: 'Camera', ar: 'الكاميرا' },
  gpsVehicleTracking: { en: 'GPS Vehicle Tracking', ar: 'تتبع مركبات GPS' },
  workflowDataSources: { en: 'Data Management', ar: 'إدارة البيانات' },
  dashboardSettings: { en: 'Dashboard Settings', ar: 'إعدادات لوحة التحكم' },
  gisContent: { en: 'GIS Content', ar: 'محتوى نظم المعلومات الجغرافية' },
  userManagement: { en: 'User Management', ar: 'إدارة المستخدمين' },
  systemSettings: { en: 'System Settings', ar: 'إعدادات النظام' },
}

export function hubPathForGroupId(groupId: string, firstChildPath: string | undefined): string {
  if (groupId === 'aiAgroCloud') return '/dashboards/ai-agro-cloud'
  if (groupId === 'dashboard') return firstChildPath ?? '/dashboard/develop'
  return firstChildPath ?? '/'
}

export function homeHubBadgeForCount(n: number): string {
  if (n <= 0) return 'Open'
  if (n === 1) return 'Open'
  return `${n} items`
}

function menuItemFromNavGroup(group: (typeof NAV_DEFAULT_GROUPS)[number]): MenuItem {
  const t = GROUP_TITLE[group.id] ?? { en: group.id, ar: group.id }
  const n = group.children.length
  return {
    id: group.id,
    labelEn: t.en,
    labelAr: t.ar,
    path: hubPathForGroupId(group.id, group.children[0]?.path),
    icon: group.defaultIcon,
    badge: homeHubBadgeForCount(n),
    subItems: group.children.map(c => {
      const lt = LEAF_TITLE[c.i18nKey] ?? { en: c.id, ar: c.id }
      return {
        id: c.id,
        labelEn: lt.en,
        labelAr: lt.ar,
        path: c.path,
      }
    }),
  }
}

const NAV_MENU_ITEMS: MenuItem[] = NAV_DEFAULT_GROUPS.map(menuItemFromNavGroup)

/** Quick links not represented as top-level nav groups */
export const HOME_QUICK_TILES: MenuItem[] = [
  {
    id: 'camera',
    labelEn: 'Camera',
    labelAr: 'الكاميرا',
    path: '/sensors/camera',
    icon: 'fa-solid fa-camera',
    badge: 'Open',
  },
  {
    id: 'gps',
    labelEn: 'GPS Vehicle Tracking',
    labelAr: 'تتبع مركبات GPS',
    path: '/sensors/gps',
    icon: 'fa-solid fa-route',
    badge: 'Open',
  },
  {
    id: 'account',
    labelEn: 'Account',
    labelAr: 'الحساب',
    path: '/account/profile',
    icon: 'fa-solid fa-circle-user',
    badge: '2 items',
  },
]

/** Visual order on the home grid (matches common hub layout). */
export const HOME_TILE_ORDER = [
  'dashboard',
  'satellite',
  'data',
  'sensors',
  'aiAgroCloud',
  'camera',
  'gps',
  'master',
  'admin',
  'account',
] as const

function orderHomeTiles(items: MenuItem[], extras: MenuItem[]): MenuItem[] {
  const map = new Map<string, MenuItem>()
  for (const m of items) map.set(m.id, m)
  for (const e of extras) map.set(e.id, e)
  const out: MenuItem[] = []
  for (const id of HOME_TILE_ORDER) {
    const m = map.get(id)
    if (m) out.push(m)
  }
  return out
}

export const homeMenuItems: MenuItem[] = orderHomeTiles(NAV_MENU_ITEMS, HOME_QUICK_TILES)
