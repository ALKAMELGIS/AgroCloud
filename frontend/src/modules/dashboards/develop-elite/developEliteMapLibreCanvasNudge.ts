import type { Map as MaplibreMap } from 'maplibre-gl'
import {
  syncDevelopEliteMapLibreViewportEnvironment,
  type RestoreDevelopElitePortfolioGlobeOpts,
} from './developEliteMapLibreGlobeBasemap'

/** Resize + projection/sky for Develop Elite — avoids SI cockpit nudge forcing globe + galaxy at field zoom. */
export function nudgeDevelopEliteMapLibreCanvas(
  map: MaplibreMap | null | undefined,
  host: HTMLElement | null | undefined,
  envOpts: RestoreDevelopElitePortfolioGlobeOpts,
): boolean {
  if (!map) return false
  try {
    if (host) {
      const { width, height } = host.getBoundingClientRect()
      if (width < 4 || height < 4) return false
    }
    map.resize?.()
    syncDevelopEliteMapLibreViewportEnvironment(map, envOpts)
    map.triggerRepaint?.()
    return true
  } catch {
    return false
  }
}
