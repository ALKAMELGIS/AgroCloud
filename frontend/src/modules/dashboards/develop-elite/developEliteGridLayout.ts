export const DEVELOP_ELITE_GRID_ROW_HEIGHT = 28
export const DEVELOP_ELITE_GRID_BREAKPOINTS = { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }
export const DEVELOP_ELITE_GRID_COLS = { lg: 24, md: 20, sm: 12, xs: 8, xxs: 4 }

export type DevelopEliteGridBreakpoint = keyof typeof DEVELOP_ELITE_GRID_BREAKPOINTS

const NARROW_GRID_BREAKPOINTS = new Set<DevelopEliteGridBreakpoint>(['sm', 'xs', 'xxs'])

export function isDevelopEliteNarrowGridBreakpoint(bp: DevelopEliteGridBreakpoint): boolean {
  return NARROW_GRID_BREAKPOINTS.has(bp)
}

/** Pick stacked layout preset for compact dashboard width (< 1200px). */
export function developEliteCompactStackBreakpoint(width: number): DevelopEliteGridBreakpoint {
  if (width >= DEVELOP_ELITE_GRID_BREAKPOINTS.sm) return 'sm'
  if (width >= DEVELOP_ELITE_GRID_BREAKPOINTS.xs) return 'xs'
  return 'xxs'
}

/** Fixed row height (px) when the grid scrolls vertically on phone layouts. */
export function developEliteNarrowGridRowPx(bp: DevelopEliteGridBreakpoint): number {
  if (bp === 'xxs') return 30
  if (bp === 'xs') return 32
  return 34
}

export type DevelopEliteGridLayoutItem = {
  i: string
  x: number
  y: number
  w: number
  h: number
  minW?: number
  minH?: number
}

export type DevelopEliteResponsiveGridLayouts = Partial<
  Record<DevelopEliteGridBreakpoint, DevelopEliteGridLayoutItem[]>
>

export const DEVELOP_ELITE_BODY_WIDGET_IDS = [
  'sidebar-farms',
  'sidebar-countries',
  'structures',
  'map',
  'chart-pie',
  'chart-bar',
  'chart-table',
] as const

const SIDEBAR_FARMS_HEIGHT_SHARE = 0.54

export type DevelopEliteBodyWidgetId = (typeof DEVELOP_ELITE_BODY_WIDGET_IDS)[number]

function clampInt(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(n)))
}

function isDevelopEliteGridLayoutCloneId(id: string): boolean {
  return /__copy[a-z0-9]+$/i.test(id)
}

function mergeLayoutItems(
  defaults: DevelopEliteGridLayoutItem[],
  saved: DevelopEliteGridLayoutItem[] | undefined,
  cols: number,
  hidden?: Set<string>,
): DevelopEliteGridLayoutItem[] {
  const byId = new Map((saved ?? []).map(item => [item.i, item]))
  const merged: DevelopEliteGridLayoutItem[] = []
  for (const def of defaults) {
    if (hidden?.has(def.i)) continue
    const prev = byId.get(def.i)
    if (!prev) {
      merged.push(def)
      continue
    }
    const w = clampInt(prev.w, 1, cols)
    const h = clampInt(prev.h, 1, 80)
    merged.push({
      ...def,
      ...prev,
      i: def.i,
      x: clampInt(prev.x, 0, Math.max(0, cols - w)),
      y: clampInt(prev.y, 0, 500),
      w,
      h,
      minW: Math.min(def.minW ?? 1, w),
      minH: Math.min(def.minH ?? 1, h),
    })
  }
  for (const item of saved ?? []) {
    if (merged.some(m => m.i === item.i)) continue
    if (hidden?.has(item.i)) continue
    merged.push({
      ...item,
      x: clampInt(item.x, 0, cols - 1),
      y: clampInt(item.y, 0, 500),
      w: clampInt(item.w, item.minW ?? 1, cols),
      h: clampInt(item.h, item.minH ?? 1, 80),
    })
  }
  return merged
}

function distributeGridWidths(totalCols: number, slotCount: number): number[] {
  if (slotCount <= 0) return []
  const base = Math.max(1, Math.floor(totalCols / slotCount))
  const widths = Array.from({ length: slotCount }, () => base)
  let used = base * slotCount
  let i = 0
  while (used < totalCols) {
    widths[i % slotCount]! += 1
    used += 1
    i += 1
  }
  return widths
}

function buildKpiLayoutItems(kpiCardIds: string[], cols: number, yOffset = 0): DevelopEliteGridLayoutItem[] {
  const kpiH = 2
  const slotCount = 2 + kpiCardIds.length
  const widths = distributeGridWidths(cols, slotCount)
  const items: DevelopEliteGridLayoutItem[] = []
  let x = 0
  const zoneHeroW = widths[0] ?? Math.min(3, cols)
  items.push({
    i: 'kpi-hero-zone',
    x: 0,
    y: yOffset,
    w: clampInt(zoneHeroW, 1, cols),
    h: kpiH,
    minW: Math.min(2, cols),
    minH: 2,
  })
  x += zoneHeroW
  const heroW = widths[1] ?? Math.min(3, cols)
  items.push({
    i: 'kpi-hero',
    x,
    y: yOffset,
    w: clampInt(heroW, 1, cols),
    h: kpiH,
    minW: Math.min(2, cols),
    minH: 2,
  })
  x += heroW
  kpiCardIds.forEach((id, index) => {
    const w = widths[index + 2] ?? Math.max(2, Math.floor((cols - x) / (kpiCardIds.length - index)))
    items.push({
      i: `kpi-${id}`,
      x,
      y: yOffset,
      w: clampInt(w, 1, cols),
      h: kpiH,
      minW: Math.min(2, cols),
      minH: 2,
    })
    x += w
  })
  return items
}

/** Elite reference dashboard: farms | structures | map + charts (pie, bar, table). */
function buildBodyLayoutItems(cols: number, bodyY: number): DevelopEliteGridLayoutItem[] {
  const sidebarW = cols >= 24 ? 5 : cols >= 20 ? 4 : Math.max(3, Math.round(cols * 0.2))
  const structW = cols >= 20 ? 2 : Math.max(2, Math.round(cols * 0.1))
  const leftW = sidebarW + structW
  const rightW = Math.max(4, cols - leftW)
  const mapH = cols >= 20 ? 10 : 9
  const chartsH = 5
  const bodyH = mapH + chartsH
  const chartsY = bodyY + mapH
  const chartPieW = Math.max(3, Math.round(rightW * 0.24))
  const chartBarW = Math.max(3, Math.round(rightW * 0.34))
  const chartTableW = Math.max(3, rightW - chartPieW - chartBarW)

  const farmsH = Math.max(4, Math.round(bodyH * SIDEBAR_FARMS_HEIGHT_SHARE))
  const countriesH = Math.max(3, bodyH - farmsH)

  return [
    {
      i: 'sidebar-farms',
      x: 0,
      y: bodyY,
      w: sidebarW,
      h: farmsH,
      minW: Math.min(3, cols),
      minH: 3,
    },
    {
      i: 'sidebar-countries',
      x: 0,
      y: bodyY + farmsH,
      w: sidebarW,
      h: countriesH,
      minW: Math.min(3, cols),
      minH: 3,
    },
    {
      i: 'structures',
      x: sidebarW,
      y: bodyY,
      w: structW,
      h: bodyH,
      minW: Math.min(2, cols),
      minH: 6,
    },
    {
      i: 'map',
      x: leftW,
      y: bodyY,
      w: rightW,
      h: mapH,
      minW: Math.min(4, cols),
      minH: 4,
    },
    {
      i: 'chart-pie',
      x: leftW,
      y: chartsY,
      w: chartPieW,
      h: chartsH,
      minW: Math.min(3, cols),
      minH: 3,
    },
    {
      i: 'chart-bar',
      x: leftW + chartPieW,
      y: chartsY,
      w: chartBarW,
      h: chartsH,
      minW: Math.min(3, cols),
      minH: 3,
    },
    {
      i: 'chart-table',
      x: leftW + chartPieW + chartBarW,
      y: chartsY,
      w: chartTableW,
      h: chartsH,
      minW: Math.min(3, cols),
      minH: 3,
    },
  ]
}

function buildDefaultLayoutForCols(kpiCardIds: string[], cols: number): DevelopEliteGridLayoutItem[] {
  const kpiItems = buildKpiLayoutItems(kpiCardIds, cols, 0)
  const bodyY = kpiItems[0]?.h ?? 3
  return [...kpiItems, ...buildBodyLayoutItems(cols, bodyY)]
}

/** Stacked layout for narrow breakpoints (lists live in the slide drawer when `includeListPanels` is false). */
function buildStackedLayoutForCols(
  kpiCardIds: string[],
  cols: number,
  includeListPanels = true,
): DevelopEliteGridLayoutItem[] {
  const items: DevelopEliteGridLayoutItem[] = []
  let y = 0
  items.push({
    i: 'kpi-hero-zone',
    x: 0,
    y,
    w: cols,
    h: 3,
    minW: Math.min(2, cols),
    minH: 2,
  })
  y += 3
  items.push({
    i: 'kpi-hero',
    x: 0,
    y,
    w: cols,
    h: 3,
    minW: Math.min(2, cols),
    minH: 2,
  })
  y += 3
  for (const id of kpiCardIds) {
    items.push({
      i: `kpi-${id}`,
      x: 0,
      y,
      w: cols,
      h: 3,
      minW: Math.min(2, cols),
      minH: 2,
    })
    y += 3
  }
  const stack = (id: string, h: number) => {
    items.push({ i: id, x: 0, y, w: cols, h, minW: Math.min(2, cols), minH: 2 })
    y += h
  }
  if (includeListPanels) {
    stack('sidebar-farms', 6)
    stack('sidebar-countries', 4)
    stack('structures', 6)
  }
  stack('map', 12)
  stack('chart-pie', 7)
  stack('chart-bar', 7)
  stack('chart-table', 8)
  return items
}

export function buildDefaultDevelopEliteGridLayouts(kpiCardIds: string[]): DevelopEliteResponsiveGridLayouts {
  return {
    lg: buildDefaultLayoutForCols(kpiCardIds, DEVELOP_ELITE_GRID_COLS.lg),
    md: buildDefaultLayoutForCols(kpiCardIds, DEVELOP_ELITE_GRID_COLS.md),
    sm: buildStackedLayoutForCols(kpiCardIds, DEVELOP_ELITE_GRID_COLS.sm, false),
    xs: buildStackedLayoutForCols(kpiCardIds, DEVELOP_ELITE_GRID_COLS.xs, false),
    xxs: buildStackedLayoutForCols(kpiCardIds, DEVELOP_ELITE_GRID_COLS.xxs, false),
  }
}

export function normalizeDevelopEliteGridLayouts(
  partial: DevelopEliteResponsiveGridLayouts | null | undefined,
  kpiCardIds: string[],
  hiddenWidgetIds: string[] = [],
): DevelopEliteResponsiveGridLayouts {
  const defaults = buildDefaultDevelopEliteGridLayouts(kpiCardIds)
  const p = partial ?? {}
  const hidden = new Set(hiddenWidgetIds)
  const out: DevelopEliteResponsiveGridLayouts = {}
  for (const bp of Object.keys(DEVELOP_ELITE_GRID_COLS) as DevelopEliteGridBreakpoint[]) {
    const cols = DEVELOP_ELITE_GRID_COLS[bp]
    const def = defaults[bp] ?? []
    if (isDevelopEliteNarrowGridBreakpoint(bp)) {
      out[bp] = def.filter(item => !hidden.has(item.i))
    } else {
      out[bp] = mergeLayoutItems(def, p[bp], cols, hidden)
    }
  }
  return out
}

/** Keeps only active widgets and packs layout (after hide/remove). */
function isDevelopEliteKpiWidgetId(id: string): boolean {
  return id === 'kpi-hero-zone' || id === 'kpi-hero' || id.startsWith('kpi-')
}

/** Pull every KPI card onto the top KPI row so they share one line. */
export function alignDevelopEliteKpiCardsOnOneRow(
  layout: DevelopEliteGridLayoutItem[],
  cols: number,
): DevelopEliteGridLayoutItem[] {
  const kpiItems = layout.filter(item => isDevelopEliteKpiWidgetId(item.i))
  if (kpiItems.length < 2) return layout
  const rowY = Math.min(...kpiItems.map(item => item.y))
  if (kpiItems.every(item => item.y === rowY)) return layout
  const ordered = [...kpiItems].sort((a, b) => a.y - b.y || a.x - b.x)
  const rowH = Math.max(...kpiItems.filter(item => item.y === rowY).map(item => item.h), 2)
  const widths = distributeGridWidths(cols, ordered.length)
  const next = new Map<string, DevelopEliteGridLayoutItem>()
  let x = 0
  ordered.forEach((item, index) => {
    const w = widths[index] ?? 1
    next.set(item.i, { ...item, x, y: rowY, w: clampInt(w, 1, cols), h: rowH })
    x += w
  })
  return layout.map(item => next.get(item.i) ?? item)
}

/** Equal-width KPI slots on the top row (visual parity across cards). */
export function rebalanceDevelopEliteKpiRow(
  layout: DevelopEliteGridLayoutItem[],
  cols: number,
): DevelopEliteGridLayoutItem[] {
  const kpiItems = layout.filter(item => isDevelopEliteKpiWidgetId(item.i))
  if (kpiItems.length < 2) return layout
  const rowY = Math.min(...kpiItems.map(item => item.y))
  const onRow = kpiItems.filter(item => item.y === rowY).sort((a, b) => a.x - b.x)
  if (onRow.length < 2) return layout
  const widths = distributeGridWidths(cols, onRow.length)
  let x = 0
  const next = new Map<string, DevelopEliteGridLayoutItem>()
  const kpiRowH = 2
  onRow.forEach((item, index) => {
    const w = widths[index] ?? 1
    next.set(item.i, { ...item, x, w: clampInt(w, 1, cols), h: kpiRowH })
    x += w
  })
  return layout.map(item => next.get(item.i) ?? item)
}

/** Drop legacy `zones` column from saved layouts and shift widgets left. */
export function stripDevelopEliteZonesGridWidget(
  layout: DevelopEliteGridLayoutItem[],
): DevelopEliteGridLayoutItem[] {
  const zones = layout.find(item => item.i === 'zones')
  if (!zones) return layout.filter(item => item.i !== 'zones')
  const shiftW = zones.w
  const zonesX = zones.x
  return layout
    .filter(item => item.i !== 'zones')
    .map(item => {
      if (item.x > zonesX) return { ...item, x: Math.max(0, item.x - shiftW) }
      return item
    })
}

export function syncDevelopEliteGridLayoutsForWidgets(
  partial: DevelopEliteResponsiveGridLayouts | null | undefined,
  kpiCardIds: string[],
  reflow: (layout: DevelopEliteGridLayoutItem[], cols: number) => DevelopEliteGridLayoutItem[],
  hiddenWidgetIds: string[] = [],
): DevelopEliteResponsiveGridLayouts {
  const allowed = new Set(developEliteGridWidgetIds(kpiCardIds))
  const hidden = new Set(hiddenWidgetIds)
  const normalized = normalizeDevelopEliteGridLayouts(partial, kpiCardIds, hiddenWidgetIds)
  const out: DevelopEliteResponsiveGridLayouts = {}
  for (const bp of Object.keys(DEVELOP_ELITE_GRID_COLS) as DevelopEliteGridBreakpoint[]) {
    const cols = DEVELOP_ELITE_GRID_COLS[bp]
    const migrated = stripDevelopEliteZonesGridWidget(migrateDevelopEliteSidebarGridItem(normalized[bp] ?? []))
    const pruned = migrated.filter(
      item => !hidden.has(item.i) && (allowed.has(item.i) || isDevelopEliteGridLayoutCloneId(item.i)),
    )
    const reflowed = reflow(pruned, cols)
    out[bp] = reflowed
  }
  return out
}

export function developEliteGridWidgetIds(kpiCardIds: string[]): string[] {
  return ['kpi-hero-zone', 'kpi-hero', ...kpiCardIds.map(id => `kpi-${id}`), ...DEVELOP_ELITE_BODY_WIDGET_IDS]
}

const FULL_HEIGHT_BODY_WIDGET_IDS = new Set<string>(['sidebar', 'structures'])

/** View mode: one sidebar card (same look as before layout edit). */
export function coalesceDevelopEliteSidebarInLayout(
  layout: DevelopEliteGridLayoutItem[],
): DevelopEliteGridLayoutItem[] {
  const farms = layout.find(item => item.i === 'sidebar-farms')
  const countries = layout.find(item => item.i === 'sidebar-countries')
  if (!farms || !countries) return layout
  const rest = layout.filter(item => item.i !== 'sidebar-farms' && item.i !== 'sidebar-countries')
  const y = Math.min(farms.y, countries.y)
  const bottom = Math.max(farms.y + farms.h, countries.y + countries.h)
  return [
    ...rest,
    {
      i: 'sidebar',
      x: farms.x,
      y,
      w: farms.w,
      h: bottom - y,
      minW: farms.minW,
      minH: (farms.minH ?? 3) + (countries.minH ?? 3),
    },
  ]
}

export function coalesceDevelopEliteSidebarLayouts(
  layouts: DevelopEliteResponsiveGridLayouts,
): DevelopEliteResponsiveGridLayouts {
  const out: DevelopEliteResponsiveGridLayouts = {}
  for (const bp of Object.keys(DEVELOP_ELITE_GRID_COLS) as DevelopEliteGridBreakpoint[]) {
    out[bp] = coalesceDevelopEliteSidebarInLayout(layouts[bp] ?? [])
  }
  return out
}

export function developEliteGridWidgetIdsForDisplay(
  kpiCardIds: string[],
  layoutEditMode: boolean,
): string[] {
  const ids = developEliteGridWidgetIds(kpiCardIds)
  if (layoutEditMode) return ids
  const out: string[] = []
  let sidebarInserted = false
  for (const id of ids) {
    if (id === 'sidebar-farms') {
      if (!sidebarInserted) {
        out.push('sidebar')
        sidebarInserted = true
      }
      continue
    }
    if (id === 'sidebar-countries') continue
    out.push(id)
  }
  return out
}

/** Split legacy combined sidebar cell into farms + countries widgets. */
export function migrateDevelopEliteSidebarGridItem(
  layout: DevelopEliteGridLayoutItem[],
): DevelopEliteGridLayoutItem[] {
  const legacy = layout.find(item => item.i === 'sidebar')
  if (!legacy) return layout
  const rest = layout.filter(item => item.i !== 'sidebar')
  const farmsH = Math.max(legacy.minH ?? 3, Math.round(legacy.h * SIDEBAR_FARMS_HEIGHT_SHARE))
  const countriesH = Math.max(3, legacy.h - farmsH)
  return [
    ...rest,
    {
      ...legacy,
      i: 'sidebar-farms',
      h: farmsH,
      minH: Math.min(legacy.minH ?? 3, farmsH),
    },
    {
      ...legacy,
      i: 'sidebar-countries',
      y: legacy.y + farmsH,
      h: countriesH,
      minH: 3,
    },
  ]
}

/** Visual-only: extend left body columns to the grid bottom (no persist). */
export function stretchBodyColumnsToGridBottom(
  layout: DevelopEliteGridLayoutItem[],
  rowCount: number,
): DevelopEliteGridLayoutItem[] {
  if (rowCount <= 0) return layout
  const farms = layout.find(item => item.i === 'sidebar-farms')
  const countries = layout.find(item => item.i === 'sidebar-countries')
  let next = layout
  if (farms && countries) {
    const totalH = Math.max(rowCount - farms.y, (farms.minH ?? 3) + (countries.minH ?? 3))
    const farmsH = Math.max(farms.minH ?? 3, Math.round(totalH * SIDEBAR_FARMS_HEIGHT_SHARE))
    const countriesH = Math.max(countries.minH ?? 3, totalH - farmsH)
    next = layout.map(item => {
      if (item.i === 'sidebar-farms') return { ...item, h: farmsH }
      if (item.i === 'sidebar-countries') return { ...item, y: farms.y + farmsH, h: countriesH }
      return item
    })
  }
  return next.map(item => {
    if (!FULL_HEIGHT_BODY_WIDGET_IDS.has(item.i)) return item
    const minH = item.minH ?? 1
    const fullH = Math.max(item.h, rowCount - item.y, minH)
    if (fullH === item.h) return item
    return { ...item, h: fullH }
  })
}
