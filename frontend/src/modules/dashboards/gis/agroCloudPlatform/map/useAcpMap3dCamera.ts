import {
  useCallback,
  useEffect,
  useRef,
  type RefObject,
  type SetStateAction,
} from 'react'
import type { Map as MaplibreMap, MapMouseEvent } from 'maplibre-gl'
import {
  AGRO_CLOUD_MAP_MAX_PITCH,
  applyAgroCloudMapPerformanceTuning,
  canStartAgroCloudRightElevationOrbitDrag,
  syncAgroCloudMapProjectionForZoom,
  syncAgroCloudMapboxCamera,
  useAgroCloudMapOrbitNavigation,
  type AgroCloudMapViewState,
  type AgroCloudMapboxMapScrollLike,
} from '@/modules/gis/map/agroCloudMapNavigation'
import { setMapLibreGlobeProjection } from '@/modules/gis/map/maplibreGlobeEnvironment'
import {
  AGRO_CLOUD_TERRAIN_PITCH_THRESHOLD,
  cancelAgroCloudTerrainSync,
  syncAgroCloudTerrain3d,
  warmAgroCloudTerrainDemSource,
} from '@/modules/remote-sensing/terrain/agroCloudMapTerrain'

const ACP_3D_ENTER_PITCH = 52
const ACP_CAMERA_EASE_MS = 650

function asNavMap(map: MaplibreMap): AgroCloudMapboxMapScrollLike {
  return map as unknown as AgroCloudMapboxMapScrollLike
}

type Options = {
  mapRef: RefObject<MaplibreMap | null>
  mapInstance: MaplibreMap | null
  mapShellRef: RefObject<HTMLDivElement | null>
  basemapId: string
  viewMode3d: boolean
  setViewMode3d: (on: boolean) => void
  /** Leaflet overlay stack: stay on Web Mercator so vectors align with the GL basemap. */
  lockMercatorProjection?: boolean
  /** Always `globe` projection (Develop Elite portfolio — no zoom-based Mercator). */
  forceGlobeProjection?: boolean
  /** Keep `acp-map--3d` shell class while `viewMode3d` is false (portfolio globe home). */
  portfolioGlobeShell3d?: boolean
  /** Pitch does not enable terrain; only `terrainLayerEnabled` / viewMode3d (Develop Elite). */
  terrainExplicitToolbarGate?: boolean
  /**
   * When set, enable Esri DEM on the current style (no basemap style swap).
   * Develop Elite 3D rendering uses this for instant GPU extrusion + terrain.
   */
  terrainLayerEnabled?: boolean
  /** When false, high pitch from orbit does not flip `viewMode3d` on (Develop Elite default). */
  autoPromoteViewMode3dFromPitch?: boolean
  /** When false, elevation orbit drag does not enable `viewMode3d`. */
  promoteViewMode3dOnElevationOrbit?: boolean
  /** Camera ease when entering/exiting 3D (ms). */
  cameraEaseMs?: number
  /** Primary-button drag orbits instead of pan when this returns true (3D explore). */
  allowPrimaryPointerOrbit?: () => boolean
  orbitSensitivity?: { bearing?: number; pitch?: number }
  /** When false, skip DEM/terrain resync on every orbit frame (sync on orbit end instead). */
  syncTerrainDuringOrientationDrag?: boolean
  mapPerformanceTuning?: {
    tileCacheMb?: number
    maxParallelImageRequests?: number
    prefetchZoomDelta?: number
  }
}

export function useAcpMap3dCamera({
  mapRef,
  mapInstance,
  mapShellRef,
  basemapId,
  viewMode3d,
  setViewMode3d,
  lockMercatorProjection = false,
  forceGlobeProjection = false,
  portfolioGlobeShell3d = false,
  terrainExplicitToolbarGate = false,
  terrainLayerEnabled,
  autoPromoteViewMode3dFromPitch = true,
  promoteViewMode3dOnElevationOrbit = true,
  cameraEaseMs = ACP_CAMERA_EASE_MS,
  allowPrimaryPointerOrbit,
  orbitSensitivity,
  syncTerrainDuringOrientationDrag = true,
  mapPerformanceTuning,
}: Options) {
  const basemapIdRef = useRef(basemapId)
  basemapIdRef.current = basemapId
  const viewMode3dRef = useRef(viewMode3d)
  viewMode3dRef.current = viewMode3d
  const terrainLayerEnabledRef = useRef(terrainLayerEnabled)
  terrainLayerEnabledRef.current = terrainLayerEnabled
  const terrainExplicitToolbarGateRef = useRef(terrainExplicitToolbarGate)
  terrainExplicitToolbarGateRef.current = terrainExplicitToolbarGate
  const mapViewStateRef = useRef<AgroCloudMapViewState>({ bearing: 0, pitch: 0 })
  const skipViewModeCameraRef = useRef(true)

  const syncTerrain = useCallback((map: MaplibreMap | null | undefined, pitch?: number) => {
    if (!map) return
    const nav = asNavMap(map)
    const livePitch = typeof pitch === 'number' ? pitch : map.getPitch()
    const terrainOpts =
      terrainLayerEnabledRef.current !== undefined
        ? {
            terrainLayerEnabled: Boolean(terrainLayerEnabledRef.current),
            terrainExplicitToolbarGate: terrainExplicitToolbarGateRef.current,
          }
        : undefined
    syncAgroCloudTerrain3d(nav, basemapIdRef.current, livePitch, terrainOpts)
    if (lockMercatorProjection) {
      try {
        nav.setProjection?.({ name: 'mercator' })
      } catch {
        /* style swap race */
      }
    } else if (forceGlobeProjection) {
      setMapLibreGlobeProjection(nav)
    } else {
      syncAgroCloudMapProjectionForZoom(nav, map.getZoom())
    }
  }, [forceGlobeProjection, lockMercatorProjection, terrainLayerEnabled])

  const applyCameraForViewMode = useCallback(
    (map: MaplibreMap, mode3d: boolean) => {
      if (mode3d) {
        const pitch = Math.max(map.getPitch(), ACP_3D_ENTER_PITCH)
        const bearing = map.getBearing()
        map.easeTo({ pitch, bearing, duration: cameraEaseMs })
        mapViewStateRef.current = { pitch, bearing }
        syncTerrain(map, pitch)
        return
      }
      map.easeTo({ pitch: 0, bearing: 0, duration: cameraEaseMs })
      mapViewStateRef.current = { pitch: 0, bearing: 0 }
      const terrainOpts =
        terrainLayerEnabledRef.current !== undefined
          ? {
              terrainLayerEnabled: false,
              terrainExplicitToolbarGate: terrainExplicitToolbarGateRef.current,
            }
          : undefined
      syncAgroCloudTerrain3d(asNavMap(map), basemapIdRef.current, 0, terrainOpts)
    },
    [cameraEaseMs, syncTerrain],
  )

  const setMapOrientation = useCallback(
    (updater: SetStateAction<AgroCloudMapViewState>) => {
      const prev = mapViewStateRef.current
      const next = typeof updater === 'function' ? updater(prev) : updater
      mapViewStateRef.current = { ...prev, ...next }
      const map = mapRef.current
      if (!map) return
      syncAgroCloudMapboxCamera(asNavMap(map), next, { orientationOnly: true })
      const pitch = typeof next.pitch === 'number' ? next.pitch : map.getPitch()
      const bearing = typeof next.bearing === 'number' ? next.bearing : map.getBearing()
      mapViewStateRef.current = { pitch, bearing }
      if (syncTerrainDuringOrientationDrag) syncTerrain(map, pitch)
      if (
        autoPromoteViewMode3dFromPitch &&
        pitch >= AGRO_CLOUD_TERRAIN_PITCH_THRESHOLD &&
        !viewMode3dRef.current
      ) {
        setViewMode3d(true)
      }
    },
    [autoPromoteViewMode3dFromPitch, mapRef, setViewMode3d, syncTerrain, syncTerrainDuringOrientationDrag],
  )

  const orbitNav = useAgroCloudMapOrbitNavigation({
    setViewState: setMapOrientation,
    getViewState: () => mapViewStateRef.current,
    getMapInstance: () => mapRef.current,
    allowPrimaryPointerOrbit,
    orbitSensitivity,
    onElevationOrbitEngaged: () => {
      if (promoteViewMode3dOnElevationOrbit) setViewMode3d(true)
    },
    onOrbitEnd: () => {
      const map = mapRef.current
      if (map) syncTerrain(map, map.getPitch())
    },
  })

  const orbitNavRef = useRef(orbitNav)
  orbitNavRef.current = orbitNav

  const toggle3dView = useCallback(() => {
    setViewMode3d(!viewMode3dRef.current)
  }, [setViewMode3d])

  useEffect(() => {
    mapShellRef.current?.classList.toggle('acp-map--3d', viewMode3d || portfolioGlobeShell3d)
  }, [portfolioGlobeShell3d, viewMode3d, mapShellRef])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapInstance) return
    if (skipViewModeCameraRef.current) {
      skipViewModeCameraRef.current = false
      return
    }
    applyCameraForViewMode(map, viewMode3d)
  }, [viewMode3d, mapInstance, mapRef, applyCameraForViewMode])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapInstance) return
    syncTerrain(map, map.getPitch())
  }, [viewMode3d, mapInstance, mapRef, syncTerrain])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapInstance) return

    applyAgroCloudMapPerformanceTuning(asNavMap(map), mapPerformanceTuning)
    warmAgroCloudTerrainDemSource(asNavMap(map))
    syncTerrain(map, map.getPitch())

    const onMouseDown = (e: MapMouseEvent) => {
      orbitNavRef.current.tryStartOrbitFromMapEvent(e)
    }
    const onMouseMove = (e: MapMouseEvent) => {
      orbitNavRef.current.applyOrbitMoveFromMapEvent(e)
    }
    const onContextMenu = (e: MapMouseEvent) => {
      if (canStartAgroCloudRightElevationOrbitDrag(e.originalEvent)) {
        e.preventDefault()
      }
    }
    const onMove = () => {
      const live = mapRef.current
      if (!live) return
      mapViewStateRef.current = { bearing: live.getBearing(), pitch: live.getPitch() }
      if (
        syncTerrainDuringOrientationDrag &&
        live.getPitch() >= AGRO_CLOUD_TERRAIN_PITCH_THRESHOLD
      ) {
        syncTerrain(live, live.getPitch())
      }
    }

    map.on('mousedown', onMouseDown)
    map.on('mousemove', onMouseMove)
    map.on('contextmenu', onContextMenu)
    map.on('move', onMove)

    return () => {
      map.off('mousedown', onMouseDown)
      map.off('mousemove', onMouseMove)
      map.off('contextmenu', onContextMenu)
      map.off('move', onMove)
      cancelAgroCloudTerrainSync(asNavMap(map))
    }
  }, [mapInstance, mapPerformanceTuning, mapRef, syncTerrain, syncTerrainDuringOrientationDrag])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    syncTerrain(map, map.getPitch())
  }, [basemapId, mapInstance, mapRef, syncTerrain])

  useEffect(() => {
    if (lockMercatorProjection) return
    const map = mapRef.current
    if (!map || !mapInstance) return
    let projectionRaf = 0
    const syncProjection = () => {
      if (projectionRaf) cancelAnimationFrame(projectionRaf)
      projectionRaf = requestAnimationFrame(() => {
        projectionRaf = 0
        if (typeof map.isMoving === 'function' && map.isMoving()) return
        if (forceGlobeProjection) setMapLibreGlobeProjection(asNavMap(map))
        else syncAgroCloudMapProjectionForZoom(asNavMap(map), map.getZoom())
      })
    }
    syncProjection()
    map.on('zoomend', syncProjection)
    map.on('moveend', syncProjection)
    return () => {
      if (projectionRaf) cancelAnimationFrame(projectionRaf)
      map.off('zoomend', syncProjection)
      map.off('moveend', syncProjection)
    }
  }, [forceGlobeProjection, lockMercatorProjection, mapInstance, mapRef])

  return {
    toggle3dView,
    maxPitch: AGRO_CLOUD_MAP_MAX_PITCH,
  }
}
