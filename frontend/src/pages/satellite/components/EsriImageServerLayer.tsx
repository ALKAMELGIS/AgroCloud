import { useEffect, useMemo, useRef, useState } from 'react'
import type { Map as LeafletMap } from 'leaflet'
import L from 'leaflet'
import { useMap } from 'react-leaflet'
import { getArcgisPortalToken, subscribeArcgisPortalToken } from '../../../lib/arcgisPortalToken'
import { createEsriImageServerGridLayer } from '../../../lib/arcgisImageServer'

type Props = {
  serviceUrl: string
  /** Optional per-layer token (e.g. legacy saved layer); otherwise System Settings / env token is used. */
  layerAuthToken?: string
  opacity: number
  visible: boolean
  zIndex: number
}

export function EsriImageServerLayer({ serviceUrl, layerAuthToken, opacity, visible, zIndex }: Props) {
  const map = useMap() as LeafletMap
  const layerRef = useRef<L.GridLayer | null>(null)
  const [portalTick, setPortalTick] = useState(0)

  useEffect(() => subscribeArcgisPortalToken(() => setPortalTick(n => n + 1)), [])

  const arcgisToken = useMemo(() => {
    const fromLayer = layerAuthToken?.trim()
    if (fromLayer) return fromLayer
    return getArcgisPortalToken().trim() || undefined
  }, [layerAuthToken, portalTick])

  useEffect(() => {
    if (!visible) {
      if (layerRef.current) {
        map.removeLayer(layerRef.current)
        layerRef.current = null
      }
      return
    }
    const layer = createEsriImageServerGridLayer(serviceUrl, { opacity, zIndex, arcgisToken })
    layer.setOpacity(opacity)
    layer.addTo(map)
    layerRef.current = layer
    return () => {
      map.removeLayer(layer)
      layerRef.current = null
    }
  }, [map, serviceUrl, visible, opacity, zIndex, arcgisToken])

  useEffect(() => {
    layerRef.current?.setOpacity(opacity)
  }, [opacity])

  return null
}
