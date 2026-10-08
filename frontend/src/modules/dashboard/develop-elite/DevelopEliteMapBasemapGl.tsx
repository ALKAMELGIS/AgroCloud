import { useEffect, useRef, useState } from 'react'
import maplibregl, { type Map as MaplibreMap, type StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useMap } from 'react-leaflet'
import type { Map as LeafletMap } from 'leaflet'
import {
  buildBasemapCatalog,
  catalogEntryById,
  DEFAULT_BASEMAP_ID,
  mapboxGlStyleForEntry,
  resolveBasemapId,
} from '@/modules/gis/map/basemapCatalog'
import {
  agroCloudMapboxTransformRequest,
  cancelAgroCloudTerrainSync,
  isTerrain3dBasemapId,
  SATELLITE_3D_BASEMAP_ID,
} from '@/modules/remote-sensing/terrain/agroCloudMapTerrain'
import { AGRO_CLOUD_MAP_MAX_PITCH, applyAgroCloudMapPerformanceTuning } from '@/modules/gis/map/agroCloudMapNavigation'
import { useAcpMap3dCamera } from '@/modules/dashboards/gis/agroCloudPlatform/map/useAcpMap3dCamera'
import { useDevelopEliteMapLibre } from './developEliteMapLibreContext'

const DE_3D_ENTER_PITCH = 45
const DE_CAMERA_EASE_MS = 650

function resolveStyle(basemapId: string): StyleSpecification {
  const catalog = buildBasemapCatalog('')
  const resolved = resolveBasemapId(basemapId)
  const entry =
    catalogEntryById(catalog, resolved) ?? catalogEntryById(catalog, DEFAULT_BASEMAP_ID)
  const style = entry ? mapboxGlStyleForEntry(entry) : mapboxGlStyleForEntry(catalog[0]!)
  return typeof style === 'string' ? JSON.parse(style) : (style as StyleSpecification)
}

type UnderlayProps = {
  basemapId: string
  shellRef: React.RefObject<HTMLDivElement | null>
}

/** WebGL basemap under Leaflet overlays (no Leaflet tile layers). */
export function DevelopEliteMapBasemapUnderlay({ basemapId, shellRef }: UnderlayProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const { mapRef, registerMap, viewMode3d, setViewMode3d } = useDevelopEliteMapLibre()
  const [mapInstance, setMapInstance] = useState<MaplibreMap | null>(null)
  const basemapRef = useRef(resolveBasemapId(basemapId))
  basemapRef.current = resolveBasemapId(basemapId)

  const effectiveBasemapId =
    viewMode3d || isTerrain3dBasemapId(basemapRef.current)
      ? SATELLITE_3D_BASEMAP_ID
      : basemapRef.current

  useAcpMap3dCamera({
    mapRef,
    mapInstance,
    mapShellRef: shellRef,
    basemapId: effectiveBasemapId,
    viewMode3d,
    setViewMode3d,
    lockMercatorProjection: true,
  })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const map = new maplibregl.Map({
      container: el,
      style: resolveStyle(basemapRef.current),
      center: [32, 18],
      zoom: 3,
      pitch: 0,
      bearing: 0,
      maxPitch: AGRO_CLOUD_MAP_MAX_PITCH,
      projection: { name: 'mercator' },
      attributionControl: false,
      fadeDuration: 0,
      interactive: false,
      transformRequest: (url, resourceType) =>
        agroCloudMapboxTransformRequest(url, resourceType ?? undefined) as {
          url: string
          credentials?: 'omit' | 'same-origin' | 'include'
        },
    })
    registerMap(map)
    setMapInstance(map)
    applyAgroCloudMapPerformanceTuning(map as never)

    const ro = new ResizeObserver(() => requestAnimationFrame(() => map.resize()))
    ro.observe(el)
    if (shellRef.current) ro.observe(shellRef.current)

    return () => {
      ro.disconnect()
      cancelAgroCloudTerrainSync(map as never)
      registerMap(null)
      setMapInstance(null)
      map.remove()
    }
  }, [registerMap, shellRef])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const flatId = resolveBasemapId(basemapId)
    basemapRef.current = flatId
    const styleId = viewMode3d ? SATELLITE_3D_BASEMAP_ID : flatId
    map.setStyle(resolveStyle(styleId))
  }, [basemapId, mapRef, viewMode3d])

  useEffect(() => {
    shellRef.current?.classList.toggle('develop-elite-map__viewport--3d', viewMode3d)
  }, [shellRef, viewMode3d])

  return <div className="develop-elite-map__webgl develop-elite-map__webgl--underlay" ref={containerRef} aria-hidden />
}

/** Keeps MapLibre basemap aligned with the Leaflet map (layers stay on Leaflet). */
export function DevelopEliteMapBasemapLeafletSync() {
  const leafletMap = useMap() as LeafletMap
  const { mapRef, viewMode3d } = useDevelopEliteMapLibre()
  const syncing = useRef(false)

  useEffect(() => {
    const gl = mapRef.current
    if (!gl) return

    const pushLeafletToGl = () => {
      if (syncing.current) return
      syncing.current = true
      const c = leafletMap.getCenter()
      const z = leafletMap.getZoom()
      if (!viewMode3d) {
        gl.jumpTo({ center: [c.lng, c.lat], zoom: z, pitch: 0, bearing: 0 })
      } else {
        gl.jumpTo({ center: [c.lng, c.lat], zoom: z })
      }
      syncing.current = false
    }

    const pullGlToLeaflet = () => {
      if (!viewMode3d || syncing.current) return
      syncing.current = true
      const c = gl.getCenter()
      const z = gl.getZoom()
      leafletMap.setView([c.lat, c.lng], z, { animate: false })
      syncing.current = false
    }

    const onGlStyleData = () => {
      pushLeafletToGl()
    }

    leafletMap.on('move', pushLeafletToGl)
    leafletMap.on('zoom', pushLeafletToGl)
    leafletMap.on('moveend', pushLeafletToGl)
    gl.on('moveend', pullGlToLeaflet)
    gl.on('style.load', onGlStyleData)

    pushLeafletToGl()

    return () => {
      leafletMap.off('move', pushLeafletToGl)
      leafletMap.off('zoom', pushLeafletToGl)
      leafletMap.off('moveend', pushLeafletToGl)
      gl.off('moveend', pullGlToLeaflet)
      gl.off('style.load', onGlStyleData)
    }
  }, [leafletMap, mapRef, viewMode3d])

  useEffect(() => {
    const gl = mapRef.current
    if (viewMode3d) {
      leafletMap.dragging.disable()
      leafletMap.scrollWheelZoom.disable()
      leafletMap.doubleClickZoom.disable()
      gl?.dragPan.enable()
      gl?.scrollZoom.enable()
      gl?.easeTo({
        pitch: Math.max(gl.getPitch(), DE_3D_ENTER_PITCH),
        duration: DE_CAMERA_EASE_MS,
      })
    } else {
      leafletMap.dragging.enable()
      leafletMap.scrollWheelZoom.enable()
      leafletMap.doubleClickZoom.enable()
      gl?.dragPan.disable()
      gl?.scrollZoom.disable()
      gl?.easeTo({ pitch: 0, bearing: 0, duration: DE_CAMERA_EASE_MS })
    }
  }, [leafletMap, mapRef, viewMode3d])

  return null
}
