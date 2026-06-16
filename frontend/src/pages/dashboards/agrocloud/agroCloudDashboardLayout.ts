import type { AgroCloudDashboardConfig, AgroCloudDashboardElement } from './agroCloudDashboardData'

export type AgroCloudLayoutMode = 'desktop' | 'mobile'

export type AgroCloudDashboardHeaderConfig = {
  enabled: boolean
  title: string
  subtitle: string
  subtitlePlacement: 'sameLine' | 'below'
  textColor: string
  foregroundColor: string
  headerMargin: boolean
  logoEnabled: boolean
  logoUrl?: string
  backgroundImageUrl?: string
  menuEnabled: boolean
}

export type AgroCloudDashboardSidebarConfig = {
  enabled: boolean
}

export type AgroCloudDashboardViewSettings = {
  autoRefresh: boolean
  autoRefreshMinutes: number
}

export const DEFAULT_DASHBOARD_HEADER: AgroCloudDashboardHeaderConfig = {
  enabled: false,
  title: '{{Item Title}}',
  subtitle: '',
  subtitlePlacement: 'sameLine',
  textColor: '#323130',
  foregroundColor: '#ffffff',
  headerMargin: true,
  logoEnabled: false,
  menuEnabled: true,
}

export const DEFAULT_DASHBOARD_SIDEBAR: AgroCloudDashboardSidebarConfig = {
  enabled: false,
}

export const DEFAULT_DASHBOARD_VIEW_SETTINGS: AgroCloudDashboardViewSettings = {
  autoRefresh: false,
  autoRefreshMinutes: 5,
}

const BODY_KINDS = new Set<AgroCloudDashboardElement['kind']>(['map', 'serial-chart', 'pie-chart', 'embedded'])
const HEADER_WIDGET_KINDS = new Set<AgroCloudDashboardElement['kind']>(['indicator', 'rich-text'])
const SIDEBAR_KINDS = new Set<AgroCloudDashboardElement['kind']>(['list', 'table', 'gauge', 'details'])

export function resolveDashboardHeader(config: AgroCloudDashboardConfig): AgroCloudDashboardHeaderConfig {
  return { ...DEFAULT_DASHBOARD_HEADER, ...config.header }
}

export function resolveDashboardSidebar(config: AgroCloudDashboardConfig): AgroCloudDashboardSidebarConfig {
  return { ...DEFAULT_DASHBOARD_SIDEBAR, ...config.sidebar }
}

export function resolveDashboardViewSettings(config: AgroCloudDashboardConfig): AgroCloudDashboardViewSettings {
  return { ...DEFAULT_DASHBOARD_VIEW_SETTINGS, ...config.viewSettings }
}

export function resolveDashboardHeaderTitle(template: string, itemTitle: string): string {
  return template.replace(/\{\{Item Title\}\}/gi, itemTitle).replace(/\{\{\s*\}\}/g, '').trim()
}

export function getBodyElements(elements: AgroCloudDashboardElement[]): AgroCloudDashboardElement[] {
  return elements.filter(el => BODY_KINDS.has(el.kind))
}

export function getHeaderWidgetElements(elements: AgroCloudDashboardElement[]): AgroCloudDashboardElement[] {
  return elements.filter(el => HEADER_WIDGET_KINDS.has(el.kind))
}

export function getSidebarElements(elements: AgroCloudDashboardElement[]): AgroCloudDashboardElement[] {
  return elements.filter(el => SIDEBAR_KINDS.has(el.kind))
}

export function patchDashboardHeader(
  config: AgroCloudDashboardConfig,
  patch: Partial<AgroCloudDashboardHeaderConfig>,
): AgroCloudDashboardConfig {
  return { ...config, header: { ...resolveDashboardHeader(config), ...patch, enabled: true } }
}

export function patchDashboardSidebar(
  config: AgroCloudDashboardConfig,
  patch: Partial<AgroCloudDashboardSidebarConfig>,
): AgroCloudDashboardConfig {
  return { ...config, sidebar: { ...resolveDashboardSidebar(config), ...patch, enabled: true } }
}

export function ensureLayoutDefaults(config: AgroCloudDashboardConfig): AgroCloudDashboardConfig {
  return {
    ...config,
    layoutMode: config.layoutMode ?? 'desktop',
    header: config.header ? { ...DEFAULT_DASHBOARD_HEADER, ...config.header } : config.header,
    sidebar: config.sidebar ? { ...DEFAULT_DASHBOARD_SIDEBAR, ...config.sidebar } : config.sidebar,
    viewSettings: config.viewSettings
      ? { ...DEFAULT_DASHBOARD_VIEW_SETTINGS, ...config.viewSettings }
      : config.viewSettings,
  }
}
