import { useEffect } from 'react'
import { prefetchTerrainApiAvailability } from './agroCloudMapTerrain'

/** Probe api.eliteagrocloud.com terrain tiles before the user toggles 3D. */
export function usePrefetchTerrainApi(enabled = true): void {
  useEffect(() => {
    if (!enabled) return
    prefetchTerrainApiAvailability()
  }, [enabled])
}
