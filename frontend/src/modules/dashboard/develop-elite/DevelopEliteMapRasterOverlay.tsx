import { useEffect, useMemo, useRef, useState } from 'react'
import type { TileLayer } from 'leaflet'
import { useMap } from 'react-leaflet'
import {
  createSentinelHubBboxTileLayer,
  updateSentinelHubBboxTileLayerUrl,
} from '@/modules/remote-sensing/imagery/sentinelHubWmsLeaflet'
import { sentinelHubWmsMinZoomForLatitude } from '@/modules/remote-sensing/imagery/sentinelHubWmsLayers'
import type { DevelopEliteMapLayerOptions } from './developEliteMapRasterConfig'
import { resolveDevelopEliteRasterImageryDate } from './developEliteMapRasterConfig'
import {
  buildDevelopEliteMapRasterStack,
  isDevelopEliteClippedRasterStackReady,
} from './developEliteMapRasterEngine'
import type { DevelopEliteMapView } from './developEliteKpiEngine'

const RASTER_PANE = 'develop-elite-raster'

type Props = {
  structuresGeoJson: GeoJSON.FeatureCollection
  mapLayerOptions: DevelopEliteMapLayerOptions
  mapView: DevelopEliteMapView | null
}

type MountedRasterTile = {
  slotIndex: number
  chunkIdx: number
  layer: TileLayer
  url: string
}

export function DevelopEliteMapRasterOverlay({
  structuresGeoJson,
  mapLayerOptions,
}: Props) {
  const map = useMap()
  const mountedRef = useRef<MountedRasterTile[]>([])
  const [viewportSync, setViewportSync] = useState(0)

  const anyRasterOn = mapLayerOptions.rasterSlots.some(s => s.showOnMap)

  useEffect(() => {
    if (!map || !anyRasterOn) return
    const pane = map.getPane(RASTER_PANE) ?? map.createPane(RASTER_PANE)
    pane.style.zIndex = '390'
  }, [map, anyRasterOn])

  useEffect(() => {
    if (!map || !anyRasterOn) return
    const bump = () => setViewportSync(n => n + 1)
    map.on('zoomend', bump)
    map.on('moveend', bump)
    return () => {
      map.off('zoomend', bump)
      map.off('moveend', bump)
    }
  }, [map, anyRasterOn])

  const imageryDate = resolveDevelopEliteRasterImageryDate(mapLayerOptions.rasterImageryDate)
  const structureSig = structuresGeoJson.features.length

  const stacks = useMemo(() => {
    if (!anyRasterOn) return []
    return mapLayerOptions.rasterSlots.map((slot, index) => {
      if (!slot.showOnMap) return null
      return buildDevelopEliteMapRasterStack({
        slot,
        slotIndex: index,
        structuresGeoJson,
        viewport: null,
        sentinelFetchDate: imageryDate,
      })
    })
  }, [anyRasterOn, imageryDate, mapLayerOptions.rasterSlots, structureSig, structuresGeoJson])

  useEffect(() => {
    if (!map) return

    if (!anyRasterOn) {
      for (const entry of mountedRef.current) {
        map.removeLayer(entry.layer)
      }
      mountedRef.current = []
      return
    }

    const center = map.getCenter()
    const minZoom = sentinelHubWmsMinZoomForLatitude(center.lat)
    if (map.getZoom() < minZoom) {
      for (const entry of mountedRef.current) {
        map.removeLayer(entry.layer)
      }
      mountedRef.current = []
      return
    }

    const nextMounted: MountedRasterTile[] = []
    const used = new Set<string>()

    mapLayerOptions.rasterSlots.forEach((slot, slotIndex) => {
      if (!slot.showOnMap) return
      const stack = stacks[slotIndex]
      if (!isDevelopEliteClippedRasterStackReady(slot, stack)) return

      stack.tileUrls.forEach((url, chunkIdx) => {
        const chunk = stack.displayChunks[chunkIdx]
        if (slot.clipmask && !chunk?.geometryWkt3857) return

        const mountKey = `${slotIndex}:${chunkIdx}`
        used.add(mountKey)
        // Clip is applied via WMS GEOMETRY + evalscript dataMask — Leaflet per-chunk bounds
        // only clip tile *requests* to AOI rectangles and leaves visible grid seams between chunks.
        const existing = mountedRef.current.find(m => m.slotIndex === slotIndex && m.chunkIdx === chunkIdx)
        if (existing) {
          if (existing.url !== url) {
            updateSentinelHubBboxTileLayerUrl(existing.layer, url)
            existing.url = url
          }
          existing.layer.setOpacity(slot.opacity)
          nextMounted.push(existing)
          return
        }

        const tileLayer = createSentinelHubBboxTileLayer(url, {
          pane: RASTER_PANE,
          opacity: slot.opacity,
          minZoom,
          latitudeDeg: center.lat,
          stableDuringInteraction: true,
          crossOrigin: false,
        })
        tileLayer.addTo(map)
        nextMounted.push({ slotIndex, chunkIdx, layer: tileLayer, url })
      })
    })

    for (const entry of mountedRef.current) {
      const mountKey = `${entry.slotIndex}:${entry.chunkIdx}`
      if (!used.has(mountKey)) {
        map.removeLayer(entry.layer)
      }
    }
    mountedRef.current = nextMounted
  }, [anyRasterOn, map, mapLayerOptions.rasterSlots, stacks, viewportSync])

  useEffect(() => {
    return () => {
      if (!map) return
      for (const entry of mountedRef.current) {
        map.removeLayer(entry.layer)
      }
      mountedRef.current = []
    }
  }, [map])

  return null
}

export function developEliteRasterMinZoomStatus(
  mapView: DevelopEliteMapView | null,
  latitudeDeg = 24,
): string | null {
  if (!mapView) return null
  const minZ = sentinelHubWmsMinZoomForLatitude(latitudeDeg)
  if (mapView.zoom >= minZ) return null
  return `Zoom in to level ${minZ} or higher to load Sentinel raster layers.`
}
