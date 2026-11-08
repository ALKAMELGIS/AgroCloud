/**
 * Imagery Time Series pulls Excel/PDF/Word export libraries (~2.5 MB). Load it only when the user
 * shows intent (hovering or opening the tool) instead of with the dashboard.
 */
let prefetchStarted = false

export function prefetchDevelopEliteImageryTimeSeriesPanel(): void {
  if (prefetchStarted) return
  prefetchStarted = true
  void import('@/modules/remote-sensing/temporal-analysis/SiImageryTimeSeriesPanel').catch(() => {
    prefetchStarted = false
  })
}

export function isDevelopEliteImageryTimeSeriesPrefetched(): boolean {
  return prefetchStarted
}
