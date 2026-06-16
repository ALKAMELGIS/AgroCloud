import { useMemo } from 'react'
import type { GisContentMapLayerConfig, GisContentMapRegistry } from '../lib/gisContentRepository'
import {
  buildGisContentMapLayerPayload,
  getGisContentMapRegistry,
  getGisContentRowById,
  isGisContentRowInRecycle,
  registerGisContentMapLayer,
  reorderGisContentMapLayers,
  unregisterGisContentMapLayer,
  updateGisContentMapLayerConfig,
  useGisContentPortal,
} from '../lib/gisContentPortalStore'
import { hostedFeatureLayerGeoJsonForRow } from '../lib/gisHostedFeatureLayerPortal'
import type { GisContentRow } from '../pages/master/gisContentPortalData'

export type GisContentRepositoryMapLayer = {
  row: GisContentRow
  config: GisContentMapLayerConfig
  geojson: ReturnType<typeof hostedFeatureLayerGeoJsonForRow>
  payload: ReturnType<typeof buildGisContentMapLayerPayload>
}

export function useGisContentRepositoryMapLayers() {
  const portal = useGisContentPortal()

  const registry = useMemo(() => getGisContentMapRegistry(), [portal.version])

  const layers = useMemo((): GisContentRepositoryMapLayer[] => {
    const out: GisContentRepositoryMapLayer[] = []
    registry.activeItemIds.forEach((id, index) => {
      const row = getGisContentRowById(id)
      if (!row || isGisContentRowInRecycle(row)) return
      const config = registry.configs[id] ?? {
        visible: true,
        opacity: 1,
        order: index,
      }
      if (!config.visible) return
      const geojson = hostedFeatureLayerGeoJsonForRow(row)
      out.push({
        row,
        config: { ...config, order: config.order ?? index },
        geojson,
        payload: buildGisContentMapLayerPayload(row),
      })
    })
    return out.sort((a, b) => a.config.order - b.config.order)
  }, [registry])

  return {
    registry,
    layers,
    register: registerGisContentMapLayer,
    unregister: unregisterGisContentMapLayer,
    updateConfig: updateGisContentMapLayerConfig,
    reorder: reorderGisContentMapLayers,
  }
}

export function useGisContentMapRegistry(): GisContentMapRegistry {
  const portal = useGisContentPortal()
  return useMemo(() => getGisContentMapRegistry(), [portal.version])
}
