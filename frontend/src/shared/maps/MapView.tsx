import type React from 'react'
import { useEffect } from 'react'
import { MapContainer, TileLayer, ZoomControl, ScaleControl, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { DEVELOP_ELITE_MAP_CONTAINER_OPTIONS } from '@/modules/dashboard/develop-elite/developEliteMapInteraction'

type Props = {
  center?: [number, number]
  zoom?: number
  zoomSnap?: number
  zoomDelta?: number
  mapboxToken?: string
  children?: React.ReactNode
  onMapReady?: (map: any) => void
  showBaseLayer?: boolean
  showZoomControl?: boolean
  zoomControlPosition?: 'topleft' | 'topright' | 'bottomleft' | 'bottomright'
  showScaleControl?: boolean
  attributionControl?: boolean
  /** Smoother pan/zoom inertia for dashboard maps. */
  smoothInteraction?: boolean
  /** Snappy wheel/button zoom (no zoom animation, low debounce). */
  fastZoom?: boolean
  /** Develop Elite: light fast pan/zoom, SVG-friendly (no preferCanvas). */
  developEliteMap?: boolean
}

export default function MapView({
  center = [25, 55],
  zoom = 10,
  zoomSnap,
  zoomDelta,
  mapboxToken,
  children,
  onMapReady,
  showBaseLayer = true,
  showZoomControl = true,
  zoomControlPosition = 'topright',
  showScaleControl = true,
  attributionControl = true,
  smoothInteraction = false,
  fastZoom = false,
  developEliteMap = false,
}: Props) {
  const useMapbox = Boolean(mapboxToken)
  const url = useMapbox
    ? `https://api.mapbox.com/styles/v1/mapbox/streets-v11/tiles/{z}/{x}/{y}?access_token=${mapboxToken}`
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
  const attribution = useMapbox
    ? '© Mapbox © OpenStreetMap'
    : '© OpenStreetMap contributors'
  return (
    <MapContainer
      center={center}
      zoom={zoom}
      zoomSnap={zoomSnap}
      zoomDelta={zoomDelta}
      style={{ height: '100%', width: '100%' }}
      zoomControl={false}
      attributionControl={attributionControl}
      {...(developEliteMap ? { ...DEVELOP_ELITE_MAP_CONTAINER_OPTIONS } : fastZoom
        ? {
            inertia: true,
            inertiaDeceleration: 3000,
            inertiaMaxSpeed: 2200,
            zoomAnimation: false,
            fadeAnimation: false,
            markerZoomAnimation: false,
            preferCanvas: true,
            wheelDebounceTime: 12,
            wheelPxPerZoomLevel: 72,
          }
        : smoothInteraction
          ? {
              inertia: true,
              inertiaDeceleration: 2400,
              inertiaMaxSpeed: 1800,
              zoomAnimation: true,
              fadeAnimation: true,
              markerZoomAnimation: true,
              wheelDebounceTime: 60,
              wheelPxPerZoomLevel: 90,
            }
          : {})}
    >
      {showBaseLayer ? <TileLayer url={url} attribution={attribution} /> : null}
      <MapReady onMapReady={onMapReady} developEliteMap={developEliteMap} />
      {children}
      {showZoomControl ? <ZoomControl position={zoomControlPosition} /> : null}
      {showScaleControl ? <ScaleControl position="bottomleft" /> : null}
    </MapContainer>
  )
}

function MapReady({
  onMapReady,
  developEliteMap = false,
}: {
  onMapReady?: (map: any) => void
  developEliteMap?: boolean
}) {
  const map = useMap()
  useEffect(() => {
    onMapReady?.(map)
    let cancelled = false
    let resizeDebounce: number | null = null
    const runInvalidate = () => {
      const container = map.getContainer?.()
      if (!container?.isConnected) return
      try {
        map.invalidateSize?.({ animate: false })
      } catch {
        /* map mid-teardown */
      }
    }
    const safeInvalidate = () => {
      if (developEliteMap) {
        if (resizeDebounce != null) window.clearTimeout(resizeDebounce)
        resizeDebounce = window.setTimeout(() => {
          resizeDebounce = null
          runInvalidate()
        }, 140)
        return
      }
      runInvalidate()
    }
    const timer = window.setTimeout(() => {
      if (cancelled) return
      runInvalidate()
    }, 0)
    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        safeInvalidate()
      })
      ro.observe(map.getContainer())
    } else {
      const onResize = () => safeInvalidate()
      window.addEventListener('resize', onResize)
      return () => {
        cancelled = true
        window.clearTimeout(timer)
        window.removeEventListener('resize', onResize)
      }
    }
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      if (resizeDebounce != null) window.clearTimeout(resizeDebounce)
      ro?.disconnect()
    }
  }, [developEliteMap, map, onMapReady])
  return null
}
