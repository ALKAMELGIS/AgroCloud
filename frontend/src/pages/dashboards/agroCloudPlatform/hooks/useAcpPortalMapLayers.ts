import { useEffect, useMemo, useState } from 'react'
import {
  buildGisContentMapLayerPayload,
  buildGisContentMapLayerPayloadAsync,
  getGisContentMapRegistry,
  getGisContentRowById,
  isGisContentRowInRecycle,
  useGisContentPortal,
} from '../../../../lib/gisContentPortalStore'
import { hostedFeatureLayerGeoJsonForRow } from '../../../../lib/gisHostedFeatureLayerPortal'
import type { GisContentRepositoryMapLayer } from '../../../../hooks/useGisContentRepositoryMapLayers'
import { isAcpExcludedPortalMapRow } from '../map/acpPortalMapLayers'
import { isAcpOgcRasterPortalRow } from '../../../../lib/acpOgcLayerMeta'

export type AcpPortalMapLayerEntry = GisContentRepositoryMapLayer & {
  isOgcRaster: boolean
}

export function useAcpPortalMapLayers() {
  const portal = useGisContentPortal()
  const registry = useMemo(() => getGisContentMapRegistry(), [portal.version])
  const [geojsonById, setGeojsonById] = useState<Record<string, GeoJSON.FeatureCollection>>({})
  const registryKey = registry.activeItemIds.join('|')

  useEffect(() => {
    const activeIds = registry.activeItemIds.filter(id => {
      const row = getGisContentRowById(id)
      return row && !isGisContentRowInRecycle(row) && !isAcpExcludedPortalMapRow(row)
    })
    if (!activeIds.length) {
      setGeojsonById({})
      return
    }

    let cancelled = false
    for (const id of activeIds) {
      const row = getGisContentRowById(id)
      if (!row || isAcpOgcRasterPortalRow(row)) continue
      void (async () => {
        try {
          const payload = await buildGisContentMapLayerPayloadAsync(row)
          if (cancelled) return
          setGeojsonById(prev => {
            const next = payload.geojson as GeoJSON.FeatureCollection
            const prevFc = prev[id]
            const nextCount = next.features?.length ?? 0
            const prevCount = prevFc?.features?.length ?? 0
            if (prevFc && prevCount === nextCount) return prev
            return { ...prev, [id]: next }
          })
        } catch {
          if (cancelled) return
          setGeojsonById(prev => {
            const next = hostedFeatureLayerGeoJsonForRow(row) as GeoJSON.FeatureCollection
            const prevFc = prev[id]
            const nextCount = next.features?.length ?? 0
            const prevCount = prevFc?.features?.length ?? 0
            if (prevFc && prevCount === nextCount) return prev
            return { ...prev, [id]: next }
          })
        }
      })()
    }

    return () => {
      cancelled = true
    }
  }, [registryKey, portal.version])

  const layers = useMemo((): AcpPortalMapLayerEntry[] => {
    const out: AcpPortalMapLayerEntry[] = []
    registry.activeItemIds.forEach((id, index) => {
      const row = getGisContentRowById(id)
      if (!row || isGisContentRowInRecycle(row) || isAcpExcludedPortalMapRow(row)) return
      const config = registry.configs[id] ?? {
        visible: true,
        opacity: 1,
        order: index,
      }
      const isOgcRaster = isAcpOgcRasterPortalRow(row)
      const geojson = isOgcRaster
        ? ({ type: 'FeatureCollection', features: [] } as GeoJSON.FeatureCollection)
        : (geojsonById[id] ?? (hostedFeatureLayerGeoJsonForRow(row) as GeoJSON.FeatureCollection))
      out.push({
        row,
        config: { ...config, order: config.order ?? index },
        geojson,
        payload: buildGisContentMapLayerPayload(row),
        isOgcRaster,
      })
    })
    return out.sort((a, b) => a.config.order - b.config.order)
  }, [registryKey, geojsonById, registry.configs])

  return { layers, registry }
}
