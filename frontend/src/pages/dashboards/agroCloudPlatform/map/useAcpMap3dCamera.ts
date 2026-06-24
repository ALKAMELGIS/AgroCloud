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
} from '../../../../lib/agroCloudMapNavigation'
import {
  AGRO_CLOUD_TERRAIN_PITCH_THRESHOLD,
  cancelAgroCloudTerrainSync,
  syncAgroCloudTerrain3d,
  warmAgroCloudTerrainDemSource,
} from '../../../../lib/agroCloudMapTerrain'

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
}

export function useAcpMap3dCamera({
  mapRef,
  mapInstance,
  mapShellRef,
  basemapId,
  viewMode3d,
  setViewMode3d,
}: Options) {
  const basemapIdRef = useRef(basemapId)
  basemapIdRef.current = basemapId
  const viewMode3dRef = useRef(viewMode3d)
  viewMode3dRef.current = viewMode3d
  const mapViewStateRef = useRef<AgroCloudMapViewState>({ bearing: 0, pitch: 0 })
  const skipViewModeCameraRef = useRef(true)

  const syncTerrain = useCallback((map: MaplibreMap | null | undefined, pitch?: number) => {
    if (!map) return
    const nav = asNavMap(map)
    const livePitch = typeof pitch === 'number' ? pitch : map.getPitch()
    syncAgroCloudTerrain3d(nav, basemapIdRef.current, livePitch)
    syncAgroCloudMapProjectionForZoom(nav, map.getZoom())
  }, [])

  const applyCameraForViewMode = useCallback(
    (map: MaplibreMap, mode3d: boolean) => {
      if (mode3d) {
        const pitch = Math.max(map.getPitch(), ACP_3D_ENTER_PITCH)
        const bearing = map.getBearing()
        map.easeTo({ pitch, bearing, duration: ACP_CAMERA_EASE_MS })
        mapViewStateRef.current = { pitch, bearing }
        syncTerrain(map, pitch)
        return
      }
      map.easeTo({ pitch: 0, bearing: 0, duration: ACP_CAMERA_EASE_MS })
      mapViewStateRef.current = { pitch: 0, bearing: 0 }
      syncAgroCloudTerrain3d(asNavMap(map), basemapIdRef.current, 0)
    },
    [syncTerrain],
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
      syncTerrain(map, pitch)
      if (pitch >= AGRO_CLOUD_TERRAIN_PITCH_THRESHOLD && !viewMode3dRef.current) {
        setViewMode3d(true)
      }
    },
    [mapRef, setViewMode3d, syncTerrain],
  )

  const orbitNav = useAgroCloudMapOrbitNavigation({
    setViewState: setMapOrientation,
    getViewState: () => mapViewStateRef.current,
    getMapInstance: () => mapRef.current,
    onElevationOrbitEngaged: () => setViewMode3d(true),
  })

  const orbitNavRef = useRef(orbitNav)
  orbitNavRef.current = orbitNav

  const toggle3dView = useCallback(() => {
    setViewMode3d(!viewMode3dRef.current)
  }, [setViewMode3d])

  useEffect(() => {
    mapShellRef.current?.classList.toggle('acp-map--3d', viewMode3d)
  }, [viewMode3d, mapShellRef])

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

    applyAgroCloudMapPerformanceTuning(asNavMap(map))
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
      if (live.getPitch() >= AGRO_CLOUD_TERRAIN_PITCH_THRESHOLD) {
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
  }, [mapInstance, mapRef, syncTerrain])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    syncTerrain(map, map.getPitch())
  }, [basemapId, mapInstance, mapRef, syncTerrain])

  return {
    toggle3dView,
    maxPitch: AGRO_CLOUD_MAP_MAX_PITCH,
  }
}
