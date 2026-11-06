/** Eagerly bundle Imagery Time Series for Develop Elite (no lazy chunk on first open). */
import '@/modules/remote-sensing/temporal-analysis/SiImageryTimeSeriesPanel'

let prefetchStarted = false

export function prefetchDevelopEliteImageryTimeSeriesPanel(): void {
  prefetchStarted = true
}

export function isDevelopEliteImageryTimeSeriesPrefetched(): boolean {
  return prefetchStarted
}
