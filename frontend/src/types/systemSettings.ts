/** Stored in localStorage — see services/settingsStorage.ts */

import type { Role } from '../lib/auth'

export type ThemeMode = 'light' | 'dark' | 'custom' | 'system'

export type NavItemOverride = {
  labelEn?: string
  labelAr?: string
  iconClass?: string
  hidden?: boolean
}

export type CustomPageRecord = {
  id: string
  /** Display name (English UI default) */
  name: string
  /** Arabic label for sidebar — falls back to name when empty */
  nameAr?: string
  /** Normalized path without hash, e.g. /pages/demo */
  path: string
  iconClass: string
  visible: boolean
  /** Which built-in screen to render */
  bindTarget: 'placeholder' | 'home' | 'gis' | 'satellite-indices' | 'dashboards-overview'
  /**
   * Sidebar group id — matches NAV_DEFAULT_GROUPS / DOM sublists (`nav-group-${id}`).
   * Use `data` for Operations (nav-group-data).
   */
  navGroupId: string
  /**
   * CSS classes on the sublist row — same pattern as manifest leaves (e.g. nav-item-ec-ph).
   * Empty string uses the default style for the chosen group.
   */
  subitemClass?: string
}

export type HomePageSettings = {
  showItemCounts: boolean
  showCardChevron: boolean
  cardDensity: 'comfortable' | 'compact'
  backgroundMode: 'default' | 'solid' | 'gradient' | 'image'
  backgroundColor: string
  backgroundGradientFrom: string
  backgroundGradientTo: string
  backgroundImage: string
}

export type HeaderSettings = {
  logoText: string
  logoTextAr: string
  useProjectName: boolean
  fontFamily: string
  fontSize: number
  fontWeight: number
  textColorLight: string
  textColorDark: string
  letterSpacing: number
  paddingX: number
  paddingY: number
  showLogoText: boolean
  showLogoIcon: boolean
  showCenterLogo: boolean
  logoAlign: 'start' | 'center' | 'space-between'
  mobileShowLogoText: boolean
  tabletShowLogoText: boolean
  sticky: boolean
  transparent: boolean
  blur: number
  enableAnimation: boolean
  autoResize: boolean
  iconClass: string
  logoSvg: string
  layoutPreset: 'default' | 'balanced' | 'branding' | 'minimal'
  autoSave: boolean
}

/** User-defined API token cards (metadata in settings; secret values in localStorage and on the Node server when `/api/system/api-secrets` is available). */
export type CustomApiTokenSlot = {
  id: string
  /** Card title (English default) */
  title: string
  titleAr?: string
  description: string
  descriptionAr?: string
  /** Label for the secret input */
  fieldLabel: string
  fieldLabelAr?: string
  placeholder?: string
  placeholderAr?: string
  iconClass: string
}

export type SystemSettingsPersistedV1 = {
  version: 1
  themeMode: ThemeMode
  /** Used when themeMode === 'custom' */
  customPrimaryHex: string
  logoLight: string
  logoDark: string
  logoIcon: string
  navGroupOrder: string[]
  /** groupId -> ordered child item ids */
  navItemOrders: Record<string, string[]>
  /** Key: group id or item id */
  navOverrides: Record<string, NavItemOverride>
  customPages: CustomPageRecord[]
  homePage: HomePageSettings
  headerSettings: HeaderSettings
  /** Extra API token types admins add without a code change */
  customApiTokenSlots: CustomApiTokenSlot[]
  /**
   * Canonical ordered subset of {@link Role} values offered on public sign-up and in User Management
   * role pickers. Order follows the global role order; omit roles by excluding them from the array.
   */
  directoryRoleCatalog: Role[]
}

export type SystemSettingsDraft = SystemSettingsPersistedV1 & { dirty?: boolean }
