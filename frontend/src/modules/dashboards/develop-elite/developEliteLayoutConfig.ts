import type { CSSProperties } from 'react'
import { developEliteAccent } from '@/theme/dashboardTokens'
import type {
  DevelopEliteGridBreakpoint,
  DevelopEliteResponsiveGridLayouts,
} from './developEliteGridLayout'

export type DevelopEliteLayoutConfig = {
  kpiRowHeightPx: number
  kpiCardMinWidthPx: number
  heroKpiMinWidthPx: number
  kpiIconFontPx: number
  kpiValueFontPx: number
  colSidebarPx: number
  colZonesPx: number
  colStructurePx: number
  sidebarFarmsPercent: number
  mapHeightPercent: number
  chartPieWeight: number
  chartBarWeight: number
  chartTableWeight: number
  structureGlassFlex: number
  structureNethouseFlex: number
  structureGreenhouseFlex: number
  /** Per KPI card width (px), keyed by card id from dashboard config. */
  kpiCardWidths: Record<string, number>
  /** Free-form widget positions (% of dashboard canvas). Legacy; cleared when grid layout is active. */
  widgetFloat: Record<string, DevelopEliteWidgetPosition>
  /** ArcGIS-style responsive grid positions (react-grid-layout). */
  gridLayouts?: DevelopEliteResponsiveGridLayouts
  /** Widgets removed from the grid until restored from settings. */
  gridHiddenWidgets?: string[]
  /** Saved row height (px) per breakpoint so view mode matches layout edit after Done. */
  gridRowStrideByBp?: Partial<Record<DevelopEliteGridBreakpoint, number>>
  /** Dashboard border / line color (hex). */
  themeBorderColor: string
  /** Border width for panels and cards (px). */
  themeBorderWidthPx: number
  /** Icon color when unified theme icons are enabled. */
  themeIconColor: string
  /** Structure icons, map tools, brand icon size (px). */
  themeIconSizePx: number
  /** Apply theme icon color to KPI / structure / map icons. */
  themeIconsUnified: boolean
}

export type DevelopEliteWidgetPosition = {
  xPct: number
  yPct: number
  widthPx?: number
  heightPx?: number
  zIndex?: number
}

/** Bump when default spatial preset changes (one-time repair on load). */
export const DEVELOP_ELITE_LAYOUT_PRESET_VERSION = 9

export const DEFAULT_DEVELOP_ELITE_LAYOUT: DevelopEliteLayoutConfig = {
  kpiRowHeightPx: 58,
  kpiCardMinWidthPx: 104,
  heroKpiMinWidthPx: 136,
  kpiIconFontPx: 18,
  kpiValueFontPx: 22,
  colSidebarPx: 172,
  colZonesPx: 76,
  colStructurePx: 72,
  sidebarFarmsPercent: 54,
  mapHeightPercent: 62,
  chartPieWeight: 0.92,
  chartBarWeight: 1.08,
  chartTableWeight: 1.42,
  structureGlassFlex: 1,
  structureNethouseFlex: 1,
  structureGreenhouseFlex: 1,
  kpiCardWidths: {},
  widgetFloat: {},
  gridLayouts: undefined,
  gridHiddenWidgets: [],
  gridRowStrideByBp: undefined,
  themeBorderColor: '#2f6b4a',
  themeBorderWidthPx: 1,
  themeIconColor: developEliteAccent,
  themeIconSizePx: 16,
  themeIconsUnified: false,
}

function normalizeWidgetFloat(
  partial?: Record<string, DevelopEliteWidgetPosition> | null,
  fallback: Record<string, DevelopEliteWidgetPosition> = {},
): Record<string, DevelopEliteWidgetPosition> {
  const merged = { ...fallback, ...(partial ?? {}) }
  const out: Record<string, DevelopEliteWidgetPosition> = {}
  for (const [key, value] of Object.entries(merged)) {
    if (!value || typeof value !== 'object') continue
    const xPct = Number(value.xPct)
    const yPct = Number(value.yPct)
    if (!Number.isFinite(xPct) || !Number.isFinite(yPct)) continue
    const widthPx = value.widthPx != null ? Number(value.widthPx) : undefined
    const heightPx = value.heightPx != null ? Number(value.heightPx) : undefined
    const zIndex = value.zIndex != null ? Number(value.zIndex) : undefined
    out[key] = {
      xPct: clamp(xPct, 0, 100),
      yPct: clamp(yPct, 0, 100),
      ...(widthPx != null && Number.isFinite(widthPx) ? { widthPx: clamp(widthPx, 48, 1200) } : {}),
      ...(heightPx != null && Number.isFinite(heightPx) ? { heightPx: clamp(heightPx, 48, 900) } : {}),
      ...(zIndex != null && Number.isFinite(zIndex) ? { zIndex: clamp(zIndex, 1, 200) } : {}),
    }
  }
  return out
}

const KPI_CARD_WIDTH_MIN = 72
const KPI_CARD_WIDTH_MAX = 320

function normalizeKpiCardWidths(
  partial?: Record<string, number> | null,
  fallback: Record<string, number> = {},
): Record<string, number> {
  const merged = { ...fallback, ...(partial ?? {}) }
  const out: Record<string, number> = {}
  for (const [key, value] of Object.entries(merged)) {
    const n = Number(value)
    if (!Number.isFinite(n)) continue
    out[key] = clamp(n, KPI_CARD_WIDTH_MIN, KPI_CARD_WIDTH_MAX)
  }
  return out
}

export function resolveDevelopEliteKpiCardWidthPx(
  layout: DevelopEliteLayoutConfig,
  cardId: string,
): number {
  const custom = layout.kpiCardWidths[cardId]
  if (custom != null && Number.isFinite(custom)) {
    return clamp(custom, KPI_CARD_WIDTH_MIN, KPI_CARD_WIDTH_MAX)
  }
  return clamp(layout.kpiCardMinWidthPx, KPI_CARD_WIDTH_MIN, KPI_CARD_WIDTH_MAX)
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

const GRID_ROW_STRIDE_MIN = 20
const GRID_ROW_STRIDE_MAX = 200

function normalizeGridRowStrideByBp(
  partial?: Partial<Record<DevelopEliteGridBreakpoint, number>> | null,
): Partial<Record<DevelopEliteGridBreakpoint, number>> | undefined {
  if (!partial || typeof partial !== 'object') return undefined
  const out: Partial<Record<DevelopEliteGridBreakpoint, number>> = {}
  for (const [key, value] of Object.entries(partial)) {
    const n = Number(value)
    if (!Number.isFinite(n)) continue
    out[key as DevelopEliteGridBreakpoint] = clamp(n, GRID_ROW_STRIDE_MIN, GRID_ROW_STRIDE_MAX)
  }
  return Object.keys(out).length ? out : undefined
}

const DEFAULT_BORDER_HEX = '#2f6b4a'
const DEFAULT_ICON_HEX = developEliteAccent

export function normalizeDevelopEliteHexColor(raw: unknown, fallback: string): string {
  const s = String(raw ?? '').trim()
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase()
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    const h = s.slice(1)
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toLowerCase()
  }
  return fallback.toLowerCase()
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const n = normalizeDevelopEliteHexColor(hex, DEFAULT_BORDER_HEX)
  const r = parseInt(n.slice(1, 3), 16)
  const g = parseInt(n.slice(3, 5), 16)
  const b = parseInt(n.slice(5, 7), 16)
  if (![r, g, b].every(v => Number.isFinite(v))) return null
  return { r, g, b }
}

function borderRgba(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return `rgba(47, 107, 74, ${alpha})`
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`
}

/** Fixes broken chart/map proportions and clears stray float positions. */
export function repairDevelopEliteLayout(
  partial?: Partial<DevelopEliteLayoutConfig> | null,
): DevelopEliteLayoutConfig {
  const base = normalizeDevelopEliteLayout({ ...DEFAULT_DEVELOP_ELITE_LAYOUT, ...partial })
  const chartSum = base.chartPieWeight + base.chartBarWeight + base.chartTableWeight
  const chartBroken =
    chartSum < 2.2 ||
    chartSum > 5.5 ||
    base.chartTableWeight < 1 ||
    base.chartPieWeight > 1.6
  const mapBroken = base.mapHeightPercent > 78 || base.mapHeightPercent < 48
  const floats = Object.keys(base.widgetFloat).length

  if (!chartBroken && !mapBroken && floats === 0) return base

  return normalizeDevelopEliteLayout({
    ...base,
    ...(chartBroken
      ? {
          chartPieWeight: DEFAULT_DEVELOP_ELITE_LAYOUT.chartPieWeight,
          chartBarWeight: DEFAULT_DEVELOP_ELITE_LAYOUT.chartBarWeight,
          chartTableWeight: DEFAULT_DEVELOP_ELITE_LAYOUT.chartTableWeight,
        }
      : {}),
    ...(mapBroken ? { mapHeightPercent: DEFAULT_DEVELOP_ELITE_LAYOUT.mapHeightPercent } : {}),
    ...(floats > 0 ? { widgetFloat: {}, kpiCardWidths: {} } : {}),
    gridLayouts: undefined,
  })
}

export function normalizeDevelopEliteLayout(
  partial?: Partial<DevelopEliteLayoutConfig> | null,
): DevelopEliteLayoutConfig {
  const d = DEFAULT_DEVELOP_ELITE_LAYOUT
  const p = partial ?? {}
  return {
    kpiRowHeightPx: clamp(Number(p.kpiRowHeightPx ?? d.kpiRowHeightPx), 56, 140),
    kpiCardMinWidthPx: clamp(Number(p.kpiCardMinWidthPx ?? d.kpiCardMinWidthPx), 72, 220),
    heroKpiMinWidthPx: clamp(Number(p.heroKpiMinWidthPx ?? d.heroKpiMinWidthPx), 96, 220),
    kpiIconFontPx: clamp(Number(p.kpiIconFontPx ?? d.kpiIconFontPx), 14, 32),
    kpiValueFontPx: clamp(Number(p.kpiValueFontPx ?? d.kpiValueFontPx), 12, 28),
    colSidebarPx: clamp(Number(p.colSidebarPx ?? d.colSidebarPx), 120, 280),
    colZonesPx: clamp(Number(p.colZonesPx ?? d.colZonesPx), 56, 140),
    colStructurePx: clamp(Number(p.colStructurePx ?? d.colStructurePx), 56, 120),
    sidebarFarmsPercent: clamp(Number(p.sidebarFarmsPercent ?? d.sidebarFarmsPercent), 35, 75),
    mapHeightPercent: clamp(Number(p.mapHeightPercent ?? d.mapHeightPercent), 45, 85),
    chartPieWeight: clamp(Number(p.chartPieWeight ?? d.chartPieWeight), 0.6, 2),
    chartBarWeight: clamp(Number(p.chartBarWeight ?? d.chartBarWeight), 0.6, 2.5),
    chartTableWeight: clamp(Number(p.chartTableWeight ?? d.chartTableWeight), 0.8, 3),
    structureGlassFlex: clamp(Number(p.structureGlassFlex ?? d.structureGlassFlex), 0.35, 2.5),
    structureNethouseFlex: clamp(Number(p.structureNethouseFlex ?? d.structureNethouseFlex), 0.35, 2.5),
    structureGreenhouseFlex: clamp(
      Number(p.structureGreenhouseFlex ?? d.structureGreenhouseFlex),
      0.35,
      2.5,
    ),
    kpiCardWidths: normalizeKpiCardWidths(p.kpiCardWidths, d.kpiCardWidths),
    widgetFloat: normalizeWidgetFloat(p.widgetFloat, d.widgetFloat),
    gridLayouts: p.gridLayouts ?? d.gridLayouts,
    gridHiddenWidgets: Array.isArray(p.gridHiddenWidgets)
      ? p.gridHiddenWidgets.map(id => String(id).trim()).filter(Boolean)
      : d.gridHiddenWidgets ?? [],
    gridRowStrideByBp: normalizeGridRowStrideByBp(p.gridRowStrideByBp) ?? d.gridRowStrideByBp,
    themeBorderColor: normalizeDevelopEliteHexColor(p.themeBorderColor, d.themeBorderColor),
    themeBorderWidthPx: clamp(Number(p.themeBorderWidthPx ?? d.themeBorderWidthPx), 1, 4),
    themeIconColor: normalizeDevelopEliteHexColor(p.themeIconColor, d.themeIconColor),
    themeIconSizePx: clamp(Number(p.themeIconSizePx ?? d.themeIconSizePx), 10, 40),
    themeIconsUnified: Boolean(p.themeIconsUnified ?? d.themeIconsUnified),
  }
}

/** CSS variables applied on `.develop-elite` root for layout sizing. */
export function developEliteLayoutCssProperties(layout: DevelopEliteLayoutConfig): CSSProperties {
  const mapFr = layout.mapHeightPercent / Math.max(15, 100 - layout.mapHeightPercent)
  const chartsFr = 1
  const countriesPct = 100 - layout.sidebarFarmsPercent
  const borderHex = normalizeDevelopEliteHexColor(layout.themeBorderColor, DEFAULT_BORDER_HEX)
  const iconHex = normalizeDevelopEliteHexColor(layout.themeIconColor, DEFAULT_ICON_HEX)
  return {
    ['--de-border' as string]: borderRgba(borderHex, 0.95),
    ['--de-border-soft' as string]: borderRgba(borderHex, 0.55),
    ['--de-border-strong' as string]: borderHex,
    ['--de-theme-border-width' as string]: `${layout.themeBorderWidthPx}px`,
    ['--de-theme-icon-color' as string]: iconHex,
    ['--de-theme-icon-size' as string]: `${layout.themeIconSizePx}px`,
    ['--de-layout-kpi-height' as string]: `${layout.kpiRowHeightPx}px`,
    ['--de-layout-kpi-card-min' as string]: `${layout.kpiCardMinWidthPx}px`,
    ['--de-layout-hero-min' as string]: `${layout.heroKpiMinWidthPx}px`,
    ['--de-layout-kpi-icon-fs' as string]: `${layout.kpiIconFontPx}px`,
    ['--de-layout-kpi-value-fs' as string]: `${layout.kpiValueFontPx}px`,
    ['--de-layout-col-sidebar' as string]: `${layout.colSidebarPx}px`,
    ['--de-layout-col-zones' as string]: `${layout.colZonesPx}px`,
    ['--de-layout-col-structure' as string]: `${layout.colStructurePx}px`,
    ['--de-layout-farms-pct' as string]: `${layout.sidebarFarmsPercent}%`,
    ['--de-layout-countries-pct' as string]: `${countriesPct}%`,
    ['--de-layout-map-fr' as string]: String(mapFr),
    ['--de-layout-charts-fr' as string]: String(chartsFr),
    ['--de-layout-chart-pie' as string]: `${layout.chartPieWeight}fr`,
    ['--de-layout-chart-bar' as string]: `${layout.chartBarWeight}fr`,
    ['--de-layout-chart-table' as string]: `${layout.chartTableWeight}fr`,
    ['--de-layout-structure-glass-fr' as string]: String(layout.structureGlassFlex),
    ['--de-layout-structure-net-fr' as string]: String(layout.structureNethouseFlex),
    ['--de-layout-structure-green-fr' as string]: String(layout.structureGreenhouseFlex),
  }
}

export type DevelopEliteLayoutFieldMeta = {
  key: keyof DevelopEliteLayoutConfig
  label: string
  min: number
  max: number
  step: number
  unit?: string
}

export const DEVELOP_ELITE_LAYOUT_FIELDS: DevelopEliteLayoutFieldMeta[] = [
  { key: 'kpiRowHeightPx', label: 'KPI row height', min: 56, max: 140, step: 2, unit: 'px' },
  { key: 'kpiCardMinWidthPx', label: 'KPI card min width', min: 72, max: 220, step: 4, unit: 'px' },
  { key: 'heroKpiMinWidthPx', label: 'Hero KPI min width', min: 96, max: 220, step: 4, unit: 'px' },
  { key: 'kpiIconFontPx', label: 'KPI icon size', min: 14, max: 32, step: 1, unit: 'px' },
  { key: 'kpiValueFontPx', label: 'KPI value size', min: 12, max: 28, step: 1, unit: 'px' },
  { key: 'colSidebarPx', label: 'Farms / countries column', min: 120, max: 280, step: 4, unit: 'px' },
  { key: 'colZonesPx', label: 'Zones column', min: 56, max: 140, step: 2, unit: 'px' },
  { key: 'colStructurePx', label: 'Structure stack column', min: 56, max: 120, step: 2, unit: 'px' },
  { key: 'sidebarFarmsPercent', label: 'Farms list height share', min: 35, max: 75, step: 1, unit: '%' },
  { key: 'mapHeightPercent', label: 'Map height (vs charts)', min: 45, max: 85, step: 1, unit: '%' },
  { key: 'chartPieWeight', label: 'Pie chart width weight', min: 0.6, max: 2, step: 0.05 },
  { key: 'chartBarWeight', label: 'Bar chart width weight', min: 0.6, max: 2.5, step: 0.05 },
  { key: 'chartTableWeight', label: 'Table width weight', min: 0.8, max: 3, step: 0.05 },
]
