/**
 * GIS Map — Charts tool + Geo AI “Configure chart” shared preferences (localStorage).
 */

export type GisChartSortMode = 'name' | 'countDesc' | 'countAsc'

/** Bar orientation when viz is bars. Ignored for donut. */
export type GisChartLayoutMode = 'horizontal' | 'vertical'

/** Layer summary visualization in the Charts side panel. */
export type GisChartVizMode = 'bars' | 'donut'

export type GisChartPanelConfig = {
  sort: GisChartSortMode
  layout: GisChartLayoutMode
  viz: GisChartVizMode
}

export const GIS_CHART_PANEL_CONFIG_LS_KEY = 'gis-map-chart-panel-config-v1'

export function defaultGisChartPanelConfig(): GisChartPanelConfig {
  return { sort: 'countDesc', layout: 'horizontal', viz: 'bars' }
}

function coerceConfig(raw: unknown): GisChartPanelConfig {
  const d = defaultGisChartPanelConfig()
  if (!raw || typeof raw !== 'object') return d
  const o = raw as Record<string, unknown>
  const sort = o.sort === 'name' || o.sort === 'countDesc' || o.sort === 'countAsc' ? o.sort : d.sort
  const layout = o.layout === 'horizontal' || o.layout === 'vertical' ? o.layout : d.layout
  const viz = o.viz === 'bars' || o.viz === 'donut' ? o.viz : d.viz
  return { sort, layout, viz }
}

export function loadGisMapChartPanelConfig(): GisChartPanelConfig {
  if (typeof window === 'undefined') return defaultGisChartPanelConfig()
  try {
    const raw = window.localStorage.getItem(GIS_CHART_PANEL_CONFIG_LS_KEY)
    if (!raw?.trim()) return defaultGisChartPanelConfig()
    return coerceConfig(JSON.parse(raw))
  } catch {
    return defaultGisChartPanelConfig()
  }
}

export function persistGisMapChartPanelConfig(config: GisChartPanelConfig): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(GIS_CHART_PANEL_CONFIG_LS_KEY, JSON.stringify(config))
  } catch {
    /* ignore */
  }
}
