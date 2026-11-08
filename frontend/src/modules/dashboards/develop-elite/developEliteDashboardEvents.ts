export const DEVELOP_ELITE_DASHBOARD_REFRESH_EVENT = 'develop-elite-dashboard-refresh'

export type DevelopEliteDashboardRefreshDetail = {
  /** Return map to {@link DEVELOP_ELITE_MAP_DEFAULT_VIEW} (header refresh, not layout-only). */
  resetMapViewport?: boolean
}

export function dispatchDevelopEliteDashboardRefresh(
  detail?: DevelopEliteDashboardRefreshDetail,
): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent<DevelopEliteDashboardRefreshDetail>(DEVELOP_ELITE_DASHBOARD_REFRESH_EVENT, {
      detail: detail ?? {},
    }),
  )
}

export function developEliteDashboardRefreshResetsMapViewport(event: Event): boolean {
  if (!(event instanceof CustomEvent)) return false
  return Boolean((event.detail as DevelopEliteDashboardRefreshDetail | undefined)?.resetMapViewport)
}

export const DEVELOP_ELITE_MAP_FOCUS_LEGEND_LAYER_EVENT = 'develop-elite-map-focus-legend-layer'

export type DevelopEliteMapFocusLegendLayerDetail = {
  layerId: import('./developEliteMapDataLayers').DevelopEliteMapDataLayerId
}

export function dispatchDevelopEliteMapFocusLegendLayer(
  layerId: DevelopEliteMapFocusLegendLayerDetail['layerId'],
): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent<DevelopEliteMapFocusLegendLayerDetail>(DEVELOP_ELITE_MAP_FOCUS_LEGEND_LAYER_EVENT, {
      detail: { layerId },
    }),
  )
}
