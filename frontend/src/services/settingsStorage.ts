import type { Role } from '../lib/auth'
import { normalizeRole } from '../lib/auth'
import { sanitizeCustomApiTokenSlot } from '../lib/customApiTokenSlotSanitize'
import {
  augmentCustomApiTokenSlotsFromVault,
  restoreBrowserApiSecretsFromVaultIntoLocalStorage,
} from '../lib/browserApiSecretsVault'
import type { CustomApiTokenSlot, CustomPageRecord, SystemSettingsPersistedV1 } from '../types/systemSettings'

import { SETTINGS_STORAGE_KEY } from './persistedStorageKeys'
export { SETTINGS_STORAGE_KEY }

/** Fired on the window after `saveSystemSettings` (same tab). Cross-tab still receives `storage`. */
export const SYSTEM_SETTINGS_UPDATED_EVENT = 'agri-system-settings-updated'

/** Legacy header label used two words; brand is one word. */
export function normalizeHeaderLogoText(text: string): string {
  const trimmed = text.trim()
  if (trimmed === 'Agro Cloud') return 'Elite AgroCloud'
  if (/^geosyntra$/i.test(trimmed)) return 'Elite AgroCloud'
  if (trimmed === 'AgroCloud') return 'Elite AgroCloud'
  return trimmed
}

/** Global role order — sign-up and directory pickers use a subset in this order. */
export const DIRECTORY_ROLES_CANONICAL: readonly Role[] = ['Admin', 'Manager', 'Admin Manager', 'Editor', 'Viewer']

export function sanitizeDirectoryRoleCatalog(raw: unknown): Role[] {
  if (!Array.isArray(raw) || raw.length === 0) return [...DIRECTORY_ROLES_CANONICAL]
  const want = new Set<Role>()
  for (const x of raw) {
    const n = normalizeRole(x)
    if ((DIRECTORY_ROLES_CANONICAL as readonly string[]).includes(n)) want.add(n)
  }
  const out = DIRECTORY_ROLES_CANONICAL.filter(r => want.has(r))
  return out.length ? out : [...DIRECTORY_ROLES_CANONICAL]
}

export const DEFAULT_SYSTEM_SETTINGS: SystemSettingsPersistedV1 = {
  version: 1,
  themeMode: 'system',
  customPrimaryHex: '#047857',
  logoLight: '',
  logoDark: '',
  logoIcon: '',
  navGroupOrder: [],
  navItemOrders: {},
  navOverrides: {},
  customPages: [],
  homePage: {
    showItemCounts: true,
    showCardChevron: true,
    cardDensity: 'comfortable',
    backgroundMode: 'default',
    backgroundColor: '#0b1220',
    backgroundGradientFrom: '#0f172a',
    backgroundGradientTo: '#14532d',
    backgroundImage: '',
  },
  headerSettings: {
    logoText: 'Elite AgroCloud',
    logoTextAr: 'Elite AgroCloud',
    useProjectName: false,
    fontFamily: 'var(--ds-font-sans)',
    fontSize: 15,
    fontWeight: 400,
    /** Brand default: white on the green header in both UI themes */
    textColorLight: '#ffffff',
    textColorDark: '#ffffff',
    letterSpacing: -0.02,
    paddingX: 20,
    paddingY: 6,
    showLogoText: true,
    showLogoIcon: true,
    showCenterLogo: true,
    logoAlign: 'space-between',
    mobileShowLogoText: true,
    tabletShowLogoText: true,
    sticky: true,
    transparent: false,
    blur: 12,
    enableAnimation: true,
    autoResize: true,
    iconClass: 'fa-solid fa-leaf',
    logoSvg: '',
    layoutPreset: 'default',
    autoSave: false,
  },
  customApiTokenSlots: [],
  directoryRoleCatalog: [...DIRECTORY_ROLES_CANONICAL],
}

export function loadSystemSettings(): SystemSettingsPersistedV1 {
  if (typeof window === 'undefined') return { ...DEFAULT_SYSTEM_SETTINGS }
  try {
    restoreBrowserApiSecretsFromVaultIntoLocalStorage()
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (!raw) {
      const base = { ...DEFAULT_SYSTEM_SETTINGS }
      const slots = augmentCustomApiTokenSlotsFromVault(base.customApiTokenSlots)
      if (slots.length === 0) return base
      const repaired = { ...base, customApiTokenSlots: slots }
      try {
        saveSystemSettings(repaired)
      } catch {
        // ignore
      }
      return repaired
    }
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_SYSTEM_SETTINGS }
    const o = parsed as Record<string, unknown>
    if (o.version !== 1) {
      const base = { ...DEFAULT_SYSTEM_SETTINGS }
      const slots = augmentCustomApiTokenSlotsFromVault(base.customApiTokenSlots)
      if (slots.length === 0) return base
      const repaired = { ...base, customApiTokenSlots: slots }
      try {
        saveSystemSettings(repaired)
      } catch {
        // ignore
      }
      return repaired
    }
    const merged = mergeWithDefaults(o as Partial<SystemSettingsPersistedV1>)
    const slots = augmentCustomApiTokenSlotsFromVault(merged.customApiTokenSlots)
    if (slots.length === merged.customApiTokenSlots.length) return merged
    const repaired = { ...merged, customApiTokenSlots: slots }
    try {
      saveSystemSettings(repaired)
    } catch {
      // ignore
    }
    return repaired
  } catch {
    return { ...DEFAULT_SYSTEM_SETTINGS }
  }
}

export function mergeWithDefaults(partial: Partial<SystemSettingsPersistedV1>): SystemSettingsPersistedV1 {
  const homeRaw = partial.homePage as Partial<SystemSettingsPersistedV1['homePage']> | undefined
  const cardDensity = homeRaw?.cardDensity === 'compact' ? 'compact' : 'comfortable'
  const backgroundMode =
    homeRaw?.backgroundMode === 'solid' ||
    homeRaw?.backgroundMode === 'gradient' ||
    homeRaw?.backgroundMode === 'image'
      ? homeRaw.backgroundMode
      : 'default'
  const isHex = (value: unknown, fallback: string) =>
    typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value) ? value : fallback
  const hdrRaw = partial.headerSettings as Partial<SystemSettingsPersistedV1['headerSettings']> | undefined
  /** Brand lock: system name on the green header is always white (ignores stale saved colors). */
  const mergedHeaderTextLight = '#ffffff'
  const mergedHeaderTextDark = '#ffffff'
  return {
    ...DEFAULT_SYSTEM_SETTINGS,
    ...partial,
    navGroupOrder: Array.isArray(partial.navGroupOrder) ? partial.navGroupOrder : DEFAULT_SYSTEM_SETTINGS.navGroupOrder,
    navItemOrders:
      partial.navItemOrders && typeof partial.navItemOrders === 'object' ? { ...partial.navItemOrders } : {},
    navOverrides:
      partial.navOverrides && typeof partial.navOverrides === 'object' ? { ...partial.navOverrides } : {},
    customPages: Array.isArray(partial.customPages)
      ? partial.customPages.map(sanitizeCustomPage).filter(Boolean) as CustomPageRecord[]
      : [],
    customApiTokenSlots: Array.isArray(partial.customApiTokenSlots)
      ? (partial.customApiTokenSlots as unknown[])
          .map(sanitizeCustomApiTokenSlot)
          .filter((s): s is CustomApiTokenSlot => s != null)
      : [],
    directoryRoleCatalog: sanitizeDirectoryRoleCatalog(partial.directoryRoleCatalog),
    themeMode:
      partial.themeMode === 'dark' ||
      partial.themeMode === 'custom' ||
      partial.themeMode === 'system'
        ? partial.themeMode
        : 'light',
    homePage: {
      showItemCounts: homeRaw?.showItemCounts !== false,
      showCardChevron: homeRaw?.showCardChevron !== false,
      cardDensity,
      backgroundMode,
      backgroundColor: isHex(homeRaw?.backgroundColor, DEFAULT_SYSTEM_SETTINGS.homePage.backgroundColor),
      backgroundGradientFrom: isHex(homeRaw?.backgroundGradientFrom, DEFAULT_SYSTEM_SETTINGS.homePage.backgroundGradientFrom),
      backgroundGradientTo: isHex(homeRaw?.backgroundGradientTo, DEFAULT_SYSTEM_SETTINGS.homePage.backgroundGradientTo),
      backgroundImage: typeof homeRaw?.backgroundImage === 'string' ? homeRaw.backgroundImage : '',
    },
    headerSettings: {
      logoText:
        typeof hdrRaw?.logoText === 'string'
          ? normalizeHeaderLogoText(hdrRaw.logoText).slice(0, 120)
          : DEFAULT_SYSTEM_SETTINGS.headerSettings.logoText,
      logoTextAr: typeof hdrRaw?.logoTextAr === 'string' ? normalizeHeaderLogoText(hdrRaw.logoTextAr).slice(0, 120) : DEFAULT_SYSTEM_SETTINGS.headerSettings.logoTextAr,
      useProjectName: hdrRaw?.useProjectName === true,
      fontFamily: typeof hdrRaw?.fontFamily === 'string' && hdrRaw.fontFamily.trim() ? hdrRaw.fontFamily.trim().slice(0, 120) : DEFAULT_SYSTEM_SETTINGS.headerSettings.fontFamily,
      fontSize: Math.max(10, Math.min(42, Number(hdrRaw?.fontSize ?? DEFAULT_SYSTEM_SETTINGS.headerSettings.fontSize) || DEFAULT_SYSTEM_SETTINGS.headerSettings.fontSize)),
      fontWeight: Math.max(300, Math.min(900, Number(hdrRaw?.fontWeight ?? DEFAULT_SYSTEM_SETTINGS.headerSettings.fontWeight) || DEFAULT_SYSTEM_SETTINGS.headerSettings.fontWeight)),
      textColorLight: mergedHeaderTextLight,
      textColorDark: mergedHeaderTextDark,
      letterSpacing: Math.max(-0.08, Math.min(0.2, Number(hdrRaw?.letterSpacing ?? DEFAULT_SYSTEM_SETTINGS.headerSettings.letterSpacing) || 0)),
      paddingX: Math.max(0, Math.min(60, Number(hdrRaw?.paddingX ?? DEFAULT_SYSTEM_SETTINGS.headerSettings.paddingX) || DEFAULT_SYSTEM_SETTINGS.headerSettings.paddingX)),
      paddingY: Math.max(0, Math.min(24, Number(hdrRaw?.paddingY ?? DEFAULT_SYSTEM_SETTINGS.headerSettings.paddingY) || DEFAULT_SYSTEM_SETTINGS.headerSettings.paddingY)),
      showLogoText: hdrRaw?.showLogoText !== false,
      showLogoIcon: hdrRaw?.showLogoIcon !== false,
      showCenterLogo: hdrRaw?.showCenterLogo !== false,
      logoAlign:
        hdrRaw?.logoAlign === 'start' || hdrRaw?.logoAlign === 'center' || hdrRaw?.logoAlign === 'space-between'
          ? hdrRaw.logoAlign
          : DEFAULT_SYSTEM_SETTINGS.headerSettings.logoAlign,
      mobileShowLogoText: hdrRaw?.mobileShowLogoText === true,
      tabletShowLogoText: hdrRaw?.tabletShowLogoText !== false,
      sticky: hdrRaw?.sticky !== false,
      transparent: hdrRaw?.transparent === true,
      blur: Math.max(0, Math.min(30, Number(hdrRaw?.blur ?? DEFAULT_SYSTEM_SETTINGS.headerSettings.blur) || DEFAULT_SYSTEM_SETTINGS.headerSettings.blur)),
      enableAnimation: hdrRaw?.enableAnimation !== false,
      autoResize: hdrRaw?.autoResize !== false,
      iconClass: typeof hdrRaw?.iconClass === 'string' && hdrRaw.iconClass.trim() ? hdrRaw.iconClass.trim().slice(0, 120) : DEFAULT_SYSTEM_SETTINGS.headerSettings.iconClass,
      logoSvg: typeof hdrRaw?.logoSvg === 'string' ? hdrRaw.logoSvg.slice(0, 4000) : '',
      layoutPreset:
        hdrRaw?.layoutPreset === 'balanced' ||
        hdrRaw?.layoutPreset === 'branding' ||
        hdrRaw?.layoutPreset === 'minimal' ||
        hdrRaw?.layoutPreset === 'default'
          ? hdrRaw.layoutPreset
          : DEFAULT_SYSTEM_SETTINGS.headerSettings.layoutPreset,
      autoSave: hdrRaw?.autoSave === true,
    },
  }
}

const KNOWN_NAV_GROUP_IDS = ['dashboard', 'aiAgroCloud', 'satellite', 'data', 'sensors', 'master', 'admin'] as const

function sanitizeNavGroupId(raw: unknown): string {
  const id = String(raw ?? 'data').trim()
  return (KNOWN_NAV_GROUP_IDS as readonly string[]).includes(id) ? id : 'data'
}

function sanitizeCustomPage(raw: unknown): CustomPageRecord | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const id = String(r.id ?? '').trim() || `page-${Date.now()}`
  const name = String(r.name ?? 'Page').trim() || 'Page'
  const nameArRaw = r.nameAr != null ? String(r.nameAr).trim().slice(0, 160) : ''
  let path = String(r.path ?? '/pages/new').trim()
  if (!path.startsWith('/')) path = `/${path}`
  const iconClass = String(r.iconClass ?? 'fa-solid fa-file').trim() || 'fa-solid fa-file'
  const visible = r.visible !== false
  const bindTarget = (
    ['placeholder', 'home', 'gis', 'satellite-indices', 'dashboards-overview'].includes(String(r.bindTarget))
      ? r.bindTarget
      : 'placeholder'
  ) as CustomPageRecord['bindTarget']
  const navGroupId = sanitizeNavGroupId(r.navGroupId)
  const subRaw = r.subitemClass != null ? String(r.subitemClass).trim().slice(0, 160) : ''
  if (path === '/dashboards/agro-dashboard' || path === '/dashboards/esri-app') return null
  return {
    id,
    name,
    ...(nameArRaw ? { nameAr: nameArRaw } : {}),
    path,
    iconClass,
    visible,
    bindTarget,
    navGroupId,
    ...(subRaw ? { subitemClass: subRaw } : {}),
  }
}

export function saveSystemSettings(next: SystemSettingsPersistedV1): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next))
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(SYSTEM_SETTINGS_UPDATED_EVENT))
    }
  } catch {
    console.warn('[settings] Failed to persist')
  }
}

/** Normalize path segments — single leading slash */
export function normalizeAppPath(path: string): string {
  let p = path.trim().replace(/\\/g, '/')
  if (!p.startsWith('/')) p = `/${p}`
  const parts = p.split('/').filter(Boolean)
  return `/${parts.join('/')}`
}
