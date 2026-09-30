import type React from 'react'
import { useEffect } from 'react'
import { MapContainer, TileLayer, ZoomControl, ScaleControl, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

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
  showScaleControl?: boolean
  /** Smoother pan/zoom inertia for dashboard maps. */
  smoothInteraction?: boolean
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
  showScaleControl = true,
  smoothInteraction = false,
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
      {...(smoothInteraction
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
      <MapReady onMapReady={onMapReady} />
      {children}
      {showZoomControl ? <ZoomControl position="topright" /> : null}
      {showScaleControl ? <ScaleControl position="bottomleft" /> : null}
    </MapContainer>
  )
}

function MapReady({ onMapReady }: { onMapReady?: (map: any) => void }) {
  const map = useMap()
  useEffect(() => {
    onMapReady?.(map)
    let cancelled = false
    const timer = window.setTimeout(() => {
      if (cancelled) return
      const container = map.getContainer?.()
      if (!container?.isConnected) return
      try {
        map.invalidateSize?.()
      } catch {
        /* map mid-teardown */
      }
    }, 0)
    let ro: ResizeObserver | null = null
    const safeInvalidate = () => {
      const container = map.getContainer?.()
      if (!container?.isConnected) return
      try {
        map.invalidateSize?.()
      } catch {
        /* map mid-teardown */
      }
    }
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
      ro?.disconnect()
    }
  }, [map, onMapReady])
  return null
}
