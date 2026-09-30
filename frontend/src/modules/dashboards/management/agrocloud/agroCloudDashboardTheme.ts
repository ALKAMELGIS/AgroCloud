import type { CSSProperties } from 'react'

/** ArcGIS Dashboards theme thumbnails (local copy + CDN source). */
export const ARCGIS_THEME_CDN_BASE = 'https://cdn-a.arcgis.com/dbcdn/1C32912/assets/images'

export type AgroCloudDashboardThemePreset = {
  id: string
  label: string
  swatch: string
}

export const AGROCLOUD_DASHBOARD_THEMES: AgroCloudDashboardThemePreset[] = [
  { id: 'light', label: 'Light', swatch: '#ffffff' },
  { id: 'dark', label: 'Dark', swatch: '#323130' },
  { id: 'meadow', label: 'Meadow', swatch: '#e8efd4' },
  { id: 'forest', label: 'Forest', swatch: '#4a5d23' },
  { id: 'daytime-blue', label: 'Daytime blue', swatch: '#c7e0f4' },
  { id: 'midnight-blue', label: 'Midnight blue', swatch: '#002050' },
  { id: 'bright-atlas', label: 'Bright atlas', swatch: '#f3f0ea' },
  { id: 'classic-atlas', label: 'Classic atlas', swatch: '#ebebeb' },
  { id: 'enhanced-contrast', label: 'Enhanced contrast', swatch: '#000000' },
]

export function agroCloudDashboardThemeThumbUrl(themeId: string): string {
  return `${import.meta.env.BASE_URL}dashboard-themes/theme-${themeId}.svg`
}

export function agroCloudDashboardThemeCdnThumbUrl(themeId: string): string {
  return `${ARCGIS_THEME_CDN_BASE}/theme-${themeId}.svg`
}

export type AgroCloudDashboardThemeCustom = {
  colorMode: 'inherit' | 'light' | 'dark'
  primaryColor: string
  secondaryColor: string
  accentColor: string
  backgroundColor: string
  fontFamily: string
  fontSizeScale: number
  widgetBackground: string
  widgetOpacity: number
  blurEffects: boolean
  borderRadius: number
  showShadows: boolean
  headerStyle: 'default' | 'compact' | 'branded'
  logoText: string
}

const THEME_DEFAULTS: Record<string, Partial<AgroCloudDashboardThemeCustom>> = {
  light: {
    colorMode: 'light',
    primaryColor: '#0079c1',
    secondaryColor: '#605e5c',
    accentColor: '#0079c1',
    backgroundColor: '#ffffff',
    widgetBackground: '#ffffff',
  },
  dark: {
    colorMode: 'dark',
    primaryColor: '#4da3ff',
    secondaryColor: '#c8c6c4',
    accentColor: '#4da3ff',
    backgroundColor: '#323130',
    widgetBackground: '#3b3a39',
  },
  meadow: {
    colorMode: 'light',
    primaryColor: '#5c7a29',
    secondaryColor: '#605e5c',
    accentColor: '#8fad3c',
    backgroundColor: '#f5f8ec',
    widgetBackground: '#ffffff',
  },
  forest: {
    colorMode: 'dark',
    primaryColor: '#a4c639',
    secondaryColor: '#d2d0ce',
    accentColor: '#a4c639',
    backgroundColor: '#4a5d23',
    widgetBackground: '#3d4f1d',
  },
  'daytime-blue': {
    colorMode: 'light',
    primaryColor: '#0078d4',
    secondaryColor: '#605e5c',
    accentColor: '#0078d4',
    backgroundColor: '#e8f4fc',
    widgetBackground: '#ffffff',
  },
  'midnight-blue': {
    colorMode: 'dark',
    primaryColor: '#3aa0ff',
    secondaryColor: '#c8c6c4',
    accentColor: '#3aa0ff',
    backgroundColor: '#002050',
    widgetBackground: '#003066',
  },
  'bright-atlas': {
    colorMode: 'light',
    primaryColor: '#5c2d91',
    secondaryColor: '#323130',
    accentColor: '#ffb900',
    backgroundColor: '#f3f0ea',
    widgetBackground: '#ffffff',
  },
  'classic-atlas': {
    colorMode: 'light',
    primaryColor: '#0079c1',
    secondaryColor: '#605e5c',
    accentColor: '#0079c1',
    backgroundColor: '#ebebeb',
    widgetBackground: '#ffffff',
  },
  'enhanced-contrast': {
    colorMode: 'dark',
    primaryColor: '#ffff00',
    secondaryColor: '#ffffff',
    accentColor: '#ffff00',
    backgroundColor: '#000000',
    widgetBackground: '#1a1a1a',
  },
}

export const DEFAULT_AGROCLOUD_THEME_CUSTOM: AgroCloudDashboardThemeCustom = {
  colorMode: 'inherit',
  primaryColor: '#0079c1',
  secondaryColor: '#605e5c',
  accentColor: '#0079c1',
  backgroundColor: '#ffffff',
  fontFamily: "'Segoe UI', 'Avenir Next', system-ui, sans-serif",
  fontSizeScale: 100,
  widgetBackground: '#ffffff',
  widgetOpacity: 100,
  blurEffects: false,
  borderRadius: 2,
  showShadows: true,
  headerStyle: 'default',
  logoText: 'Elite AgroCloud',
}

export function resolveAgroCloudThemeCustom(
  themeId: string,
  overrides?: Partial<AgroCloudDashboardThemeCustom>,
): AgroCloudDashboardThemeCustom {
  const preset = THEME_DEFAULTS[themeId] ?? {}
  return {
    ...DEFAULT_AGROCLOUD_THEME_CUSTOM,
    ...preset,
    ...overrides,
  }
}

export function dashboardThemeCanvasStyle(
  themeId: string,
  overrides?: Partial<AgroCloudDashboardThemeCustom>,
): CSSProperties {
  const t = resolveAgroCloudThemeCustom(themeId, overrides)
  return {
    backgroundColor: t.backgroundColor,
    color: t.colorMode === 'dark' ? '#ffffff' : '#323130',
    fontFamily: t.fontFamily,
    fontSize: `${(t.fontSizeScale / 100) * 14}px`,
    ['--dashboard-primary' as string]: t.primaryColor,
    ['--dashboard-accent' as string]: t.accentColor,
    ['--dashboard-widget-bg' as string]: t.widgetBackground,
    ['--dashboard-widget-opacity' as string]: String(t.widgetOpacity / 100),
    ['--dashboard-radius' as string]: `${t.borderRadius}px`,
  }
}
