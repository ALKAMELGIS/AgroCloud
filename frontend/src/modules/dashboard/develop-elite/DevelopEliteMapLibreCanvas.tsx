import { useCallback, useEffect, useRef, useState } from 'react'
import maplibregl, { type Map as MaplibreMap, type StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import {
  buildBasemapCatalog,
  catalogEntryById,
  DEFAULT_BASEMAP_ID,
  mapboxGlStyleForEntry,
  resolveBasemapId,
} from '@/modules/gis/map/basemapCatalog'
import { getMapboxAccessToken } from '@/core/config/mapboxAccessToken'
import { listDevelopEliteBasemapEntries } from '@/modules/gis/map/BasemapGallery'
import {
  agroCloudMapboxTransformRequest,
  cancelAgroCloudTerrainSync,
  prefetchTerrainApiAvailability,
} from '@/modules/remote-sensing/terrain/agroCloudMapTerrain'
import {
  AGRO_CLOUD_MAP_MAX_PITCH,
  bindAgroCloudMapGoogleEarthMouseHandlers,
} from '@/modules/gis/map/agroCloudMapNavigation'
import {
  DEVELOP_ELITE_ORBIT_SENSITIVITY,
  developEliteMapAllowsPrimaryPointerOrbit,
} from './developEliteMapLibreOrbit'
import {
  applyDevelopEliteMapLibrePerformanceTuning,
  bindDevelopEliteMapLibreGestureTileWarmup,
  DEVELOP_ELITE_MAPLIBRE_PERFORMANCE_OPTIONS,
} from './developEliteMapLibrePerformance'
import { ensureRasterStyleMaxNativeZoom } from '@/modules/gis/layers/raster/rasterTileZoom'
import {
  resolveDevelopEliteMapDefaultView,
  DEVELOP_ELITE_MAP_DEFAULT_VIEW_3D,
  DEVELOP_ELITE_GRID_MAP_MERCATOR_ONLY,
  DEVELOP_ELITE_MAP_MIN_ZOOM,
  DEVELOP_ELITE_MAP_PORTFOLIO_GLOBE_PRESENTATION,
} from './developEliteMapViewport'
import { useDevelopEliteMapDraw } from './DevelopEliteMapDraw'
import { useDevelopEliteMapLibre } from './developEliteMapLibreContext'
import { useAcpMap3dCamera } from '@/modules/dashboards/gis/agroCloudPlatform/map/useAcpMap3dCamera'
import {
  DE_LAYER_LIVE_TILE_PLACEHOLDER_PNG,
  isDevelopEliteLayerLiveTileUrl,
  resolveDevelopEliteLayerLiveTileFetchUrl,
} from './developEliteMapLayerLiveMaplibreProtocol'
import { ensureDevelopEliteLayerLiveMaplibreProtocol } from './developEliteMapLayerLiveMaplibreProtocolRegister'
import {
  restoreDevelopElitePortfolioGlobeBasemap,
  syncDevelopEliteMapLibreViewportEnvironment,
} from './developEliteMapLibreGlobeBasemap'
import { developEliteMapLibreTrySwapRasterBasemap } from './developEliteMapLibreRasterBasemapSwap'
import {
  dispatchDevelopEliteMapBasemapApplied,
  prepareDevelopEliteMapLibreForBasemapChange,
} from './developEliteMapLibreBasemapOverlayRestore'
import { bindSiMapboxGlobeCanvasBoot } from '@/modules/gis/map/siGlobeCockpit'
import { nudgeDevelopEliteMapLibreCanvas } from './developEliteMapLibreCanvasNudge'
import {
  applyDevelopEliteMapSpaceEnvironment,
  bindDevelopEliteMapSpaceEnvironment,
} from './developEliteMapSpaceEnvironment'

type Props = {
  basemapId: string
  shellRef: React.RefObject<HTMLDivElement | null>
}

const developEliteMapStyleCache = new Map<string, StyleSpecification>()

function resolveDevelopEliteMapStyle(basemapId: string): StyleSpecification {
  const resolved = resolveBasemapId(basemapId)
  const cached = developEliteMapStyleCache.get(resolved)
  if (cached) return cached

  const catalog = buildBasemapCatalog(getMapboxAccessToken())
  const entry =
    catalogEntryById(catalog, resolved) ?? catalogEntryById(catalog, DEFAULT_BASEMAP_ID)
  const style = entry ? mapboxGlStyleForEntry(entry) : mapboxGlStyleForEntry(catalog[0]!)
  const raw = typeof style === 'string' ? JSON.parse(style) : style
  const normalized = ensureRasterStyleMaxNativeZoom(raw as Record<string, unknown>) as StyleSpecification
  developEliteMapStyleCache.set(resolved, normalized)
  return normalized
}

export function DevelopEliteMapLibreCanvas({ basemapId, shellRef }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const { mapRef, mapReady, registerMap, viewMode3d, setViewMode3d } = useDevelopEliteMapLibre()
  const appliedBasemapRef = useRef<string | null>(null)
  const [mapInstance, setMapInstance] = useState<MaplibreMap | null>(null)
  const flatBasemapId = resolveBasemapId(basemapId)
  const basemapRef = useRef(flatBasemapId)
  basemapRef.current = flatBasemapId
  const viewMode3dRef = useRef(viewMode3d)
  viewMode3dRef.current = viewMode3d
  const draw = useDevelopEliteMapDraw()
  const drawingActiveRef = useRef(false)
  drawingActiveRef.current = Boolean(draw?.drawingActive)

  useAcpMap3dCamera({
    mapRef,
    mapInstance,
    mapShellRef: shellRef,
    basemapId: flatBasemapId,
    viewMode3d,
    setViewMode3d,
    lockMercatorProjection: DEVELOP_ELITE_GRID_MAP_MERCATOR_ONLY,
    forceGlobeProjection: false,
    portfolioGlobeShell3d: DEVELOP_ELITE_MAP_PORTFOLIO_GLOBE_PRESENTATION,
    terrainLayerEnabled: viewMode3d,
    terrainExplicitToolbarGate: true,
    autoPromoteViewMode3dFromPitch: false,
    promoteViewMode3dOnElevationOrbit: false,
    cameraEaseMs: 220,
    isOrbitBlocked: () => drawingActiveRef.current,
    allowPrimaryPointerOrbit: () =>
      !drawingActiveRef.current &&
      developEliteMapAllowsPrimaryPointerOrbit(mapRef.current, viewMode3dRef.current),
    orbitSensitivity: DEVELOP_ELITE_ORBIT_SENSITIVITY,
    syncTerrainDuringOrientationDrag: false,
    mapPerformanceTuning: { ...DEVELOP_ELITE_MAPLIBRE_PERFORMANCE_OPTIONS },
  })

  const viewportEnvOpts = useCallback(
    () => ({
      basemapId: basemapRef.current,
      viewMode3d: viewMode3dRef.current,
    }),
    [],
  )

  const restoreGlobeBasemap = useCallback(
    (map: MaplibreMap) => {
      restoreDevelopElitePortfolioGlobeBasemap(map, viewportEnvOpts())
    },
    [viewportEnvOpts],
  )

  const syncViewportEnvironment = useCallback(
    (map: MaplibreMap) => {
      if (!map.isStyleLoaded?.() && !map.loaded?.()) return
      syncDevelopEliteMapLibreViewportEnvironment(map, viewportEnvOpts())
    },
    [viewportEnvOpts],
  )

  const applyStyle = useCallback(
    (map: MaplibreMap, id: string) => {
      const resolved = resolveBasemapId(id)
      if (appliedBasemapRef.current === resolved) return
      appliedBasemapRef.current = resolved
      cancelAgroCloudTerrainSync(map as never)
      applyDevelopEliteMapLibrePerformanceTuning(map)
      prepareDevelopEliteMapLibreForBasemapChange(map)

      const nextStyle = resolveDevelopEliteMapStyle(resolved)
      const notifyBasemapApplied = () => {
        dispatchDevelopEliteMapBasemapApplied(resolved)
      }
      if (developEliteMapLibreTrySwapRasterBasemap(map, nextStyle)) {
        nudgeDevelopEliteMapLibreCanvas(map, containerRef.current, viewportEnvOpts())
        notifyBasemapApplied()
        return
      }

      const onStyleReady = () => {
        applyDevelopEliteMapLibrePerformanceTuning(map)
        restoreGlobeBasemap(map)
        nudgeDevelopEliteMapLibreCanvas(map, containerRef.current, viewportEnvOpts())
        if (!DEVELOP_ELITE_GRID_MAP_MERCATOR_ONLY) {
          applyDevelopEliteMapSpaceEnvironment(map, shellRef.current)
        }
        notifyBasemapApplied()
      }
      map.once('style.load', onStyleReady)
      map.setStyle(nextStyle, { diff: false })
    },
    [restoreGlobeBasemap, shellRef, viewportEnvOpts],
  )

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    ensureDevelopEliteLayerLiveMaplibreProtocol()

    const initialView = resolveDevelopEliteMapDefaultView()
    const map = new maplibregl.Map({
      container: el,
      canvasContextAttributes: {
        alpha: !DEVELOP_ELITE_GRID_MAP_MERCATOR_ONLY,
        antialias: false,
        desynchronized: !DEVELOP_ELITE_GRID_MAP_MERCATOR_ONLY,
        powerPreference: 'high-performance',
      },
      style: resolveDevelopEliteMapStyle(basemapRef.current),
      center: [initialView.center[1], initialView.center[0]],
      zoom: initialView.zoom,
      pitch: initialView.pitch,
      bearing: initialView.bearing,
      maxPitch: AGRO_CLOUD_MAP_MAX_PITCH,
      projection: DEVELOP_ELITE_GRID_MAP_MERCATOR_ONLY
        ? { type: 'mercator' }
        : { type: 'globe' },
      attributionControl: false,
      fadeDuration: 0,
      dragRotate: false,
      pitchWithRotate: false,
      renderWorldCopies: false,
      minZoom: DEVELOP_ELITE_MAP_MIN_ZOOM,
      transformRequest: (url, resourceType) => {
        if (isDevelopEliteLayerLiveTileUrl(url)) {
          const resolved = resolveDevelopEliteLayerLiveTileFetchUrl(url)
          return {
            url: resolved ?? DE_LAYER_LIVE_TILE_PLACEHOLDER_PNG,
            credentials: 'omit' as const,
          }
        }
        return agroCloudMapboxTransformRequest(url, resourceType ?? undefined) as {
          url: string
          credentials?: 'omit' | 'same-origin' | 'include'
        }
      },
    })

    const markMapReady = () => {
      registerMap(map)
      setMapInstance(map)
    }
    appliedBasemapRef.current = basemapRef.current
    if (map.loaded()) markMapReady()
    else map.once('load', markMapReady)
    applyDevelopEliteMapLibrePerformanceTuning(map)
    const unbindEarthMouse = bindAgroCloudMapGoogleEarthMouseHandlers(map as never)
    restoreDevelopElitePortfolioGlobeBasemap(map, {
      basemapId: basemapRef.current,
      viewMode3d: DEVELOP_ELITE_MAP_DEFAULT_VIEW_3D,
    })
    const unbindGlobeCanvasBoot = DEVELOP_ELITE_GRID_MAP_MERCATOR_ONLY
      ? () => {}
      : bindSiMapboxGlobeCanvasBoot(() => map, () => el)
    const unbindSpaceEnvironment = DEVELOP_ELITE_GRID_MAP_MERCATOR_ONLY
      ? () => {}
      : bindDevelopEliteMapSpaceEnvironment(map, shellRef.current)
    const reapplyAfterStyle = () => {
      applyDevelopEliteMapLibrePerformanceTuning(map)
      restoreGlobeBasemap(map)
      nudgeDevelopEliteMapLibreCanvas(map, el, viewportEnvOpts())
    }
    let viewportEnvTimer = 0
    const scheduleViewportEnvironment = () => {
      if (viewportEnvTimer) window.clearTimeout(viewportEnvTimer)
      viewportEnvTimer = window.setTimeout(() => {
        viewportEnvTimer = 0
        if (typeof map.isMoving === 'function' && map.isMoving()) return
        syncViewportEnvironment(map)
      }, 420)
    }
    map.on('load', reapplyAfterStyle)
    map.on('style.load', reapplyAfterStyle)
    if (!DEVELOP_ELITE_GRID_MAP_MERCATOR_ONLY) {
      map.on('zoomend', scheduleViewportEnvironment)
      map.on('moveend', scheduleViewportEnvironment)
    }
    const unbindTileWarmup = bindDevelopEliteMapLibreGestureTileWarmup(map)

    let canvasResizeTimer = 0
    const ro = new ResizeObserver(() => {
      if (canvasResizeTimer) window.clearTimeout(canvasResizeTimer)
      canvasResizeTimer = window.setTimeout(() => {
        canvasResizeTimer = 0
        requestAnimationFrame(() => map.resize())
      }, 100)
    })
    ro.observe(el)
    if (shellRef.current) ro.observe(shellRef.current)

    return () => {
      map.off('load', markMapReady)
      map.off('load', reapplyAfterStyle)
      map.off('style.load', reapplyAfterStyle)
      if (viewportEnvTimer) window.clearTimeout(viewportEnvTimer)
      if (canvasResizeTimer) window.clearTimeout(canvasResizeTimer)
      if (!DEVELOP_ELITE_GRID_MAP_MERCATOR_ONLY) {
        map.off('zoomend', scheduleViewportEnvironment)
        map.off('moveend', scheduleViewportEnvironment)
      }
      unbindEarthMouse()
      unbindTileWarmup()
      unbindGlobeCanvasBoot()
      unbindSpaceEnvironment()
      ro.disconnect()
      cancelAgroCloudTerrainSync(map as never)
      registerMap(null)
      setMapInstance(null)
      map.remove()
    }
  }, [registerMap, restoreGlobeBasemap, shellRef, syncViewportEnvironment])

  useEffect(() => {
    for (const entry of listDevelopEliteBasemapEntries()) {
      resolveDevelopEliteMapStyle(entry.id)
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    if (appliedBasemapRef.current === flatBasemapId) return
    applyStyle(map, flatBasemapId)
  }, [applyStyle, flatBasemapId, mapReady, mapRef])

  useEffect(() => {
    if (viewMode3d) prefetchTerrainApiAvailability()
  }, [viewMode3d])

  useEffect(() => {
    shellRef.current?.classList.toggle('develop-elite-map__viewport--3d', viewMode3d)
    shellRef.current?.classList.toggle('develop-elite-map__viewport--gpu-3d', viewMode3d)
  }, [shellRef, viewMode3d])

  return (
    <div
      className={`develop-elite-map__webgl${DEVELOP_ELITE_GRID_MAP_MERCATOR_ONLY ? ' develop-elite-map__webgl--field' : ' develop-elite-map__galaxy-backdrop'}`}
      ref={containerRef}
      aria-label="Develop Elite map"
    />
  )
}
