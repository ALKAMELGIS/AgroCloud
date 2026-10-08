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
import {
  agroCloudMapboxTransformRequest,
  cancelAgroCloudTerrainSync,
  prefetchTerrainApiAvailability,
} from '@/modules/remote-sensing/terrain/agroCloudMapTerrain'
import {
  AGRO_CLOUD_MAP_MAX_PITCH,
  bindAgroCloudMapGoogleEarthMouseHandlers,
  bindAgroCloudMapViewportTileWarmup,
} from '@/modules/gis/map/agroCloudMapNavigation'
import {
  DEVELOP_ELITE_ORBIT_SENSITIVITY,
  developEliteMapAllowsPrimaryPointerOrbit,
} from './developEliteMapLibreOrbit'
import {
  applyDevelopEliteMapLibrePerformanceTuning,
  DEVELOP_ELITE_MAPLIBRE_PERFORMANCE_OPTIONS,
  DEVELOP_ELITE_MAPLIBRE_WHEEL_ZOOM_RATE,
} from './developEliteMapLibrePerformance'
import { ensureRasterStyleMaxNativeZoom } from '@/modules/gis/layers/raster/rasterTileZoom'
import {
  DEVELOP_ELITE_MAP_DEFAULT_VIEW,
  DEVELOP_ELITE_MAP_DEFAULT_VIEW_3D,
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

type Props = {
  basemapId: string
  shellRef: React.RefObject<HTMLDivElement | null>
}

function resolveDevelopEliteMapStyle(basemapId: string): StyleSpecification {
  const catalog = buildBasemapCatalog('')
  const resolved = resolveBasemapId(basemapId)
  const entry =
    catalogEntryById(catalog, resolved) ?? catalogEntryById(catalog, DEFAULT_BASEMAP_ID)
  const style = entry ? mapboxGlStyleForEntry(entry) : mapboxGlStyleForEntry(catalog[0]!)
  const raw = typeof style === 'string' ? JSON.parse(style) : style
  return ensureRasterStyleMaxNativeZoom(raw as Record<string, unknown>) as StyleSpecification
}

export function DevelopEliteMapLibreCanvas({ basemapId, shellRef }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const { mapRef, registerMap, viewMode3d, setViewMode3d } = useDevelopEliteMapLibre()
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
    /** Develop Elite portfolio: always globe — no Mercator flat fallback at field zoom. */
    forceGlobeProjection: true,
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
      cancelAgroCloudTerrainSync(map as never)
      const onStyleReady = () => {
        map.off('style.load', onStyleReady)
        restoreGlobeBasemap(map)
      }
      map.on('style.load', onStyleReady)
      map.setStyle(resolveDevelopEliteMapStyle(id))
    },
    [restoreGlobeBasemap],
  )

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    ensureDevelopEliteLayerLiveMaplibreProtocol()

    const map = new maplibregl.Map({
      container: el,
      canvasContextAttributes: { alpha: true, antialias: true },
      style: resolveDevelopEliteMapStyle(basemapRef.current),
      center: [
        DEVELOP_ELITE_MAP_DEFAULT_VIEW.center[1],
        DEVELOP_ELITE_MAP_DEFAULT_VIEW.center[0],
      ],
      zoom: DEVELOP_ELITE_MAP_DEFAULT_VIEW.zoom,
      pitch: DEVELOP_ELITE_MAP_DEFAULT_VIEW.pitch,
      bearing: DEVELOP_ELITE_MAP_DEFAULT_VIEW.bearing,
      maxPitch: AGRO_CLOUD_MAP_MAX_PITCH,
      projection: { type: 'globe' },
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
    if (map.loaded()) markMapReady()
    else map.once('load', markMapReady)
    applyDevelopEliteMapLibrePerformanceTuning(map)
    const unbindEarthMouse = bindAgroCloudMapGoogleEarthMouseHandlers(map as never)
    restoreDevelopElitePortfolioGlobeBasemap(map, {
      basemapId: basemapRef.current,
      viewMode3d: DEVELOP_ELITE_MAP_DEFAULT_VIEW_3D,
    })
    const reapplyAfterStyle = () => {
      applyDevelopEliteMapLibrePerformanceTuning(map)
      restoreGlobeBasemap(map)
    }
    let viewportEnvRaf = 0
    const scheduleViewportEnvironment = () => {
      if (viewportEnvRaf) cancelAnimationFrame(viewportEnvRaf)
      viewportEnvRaf = requestAnimationFrame(() => {
        viewportEnvRaf = 0
        syncViewportEnvironment(map)
      })
    }
    map.on('load', reapplyAfterStyle)
    map.on('style.load', reapplyAfterStyle)
    map.on('zoomend', scheduleViewportEnvironment)
    map.on('moveend', scheduleViewportEnvironment)
    const unbindTileWarmup = bindAgroCloudMapViewportTileWarmup(map as never, {
      performance: { ...DEVELOP_ELITE_MAPLIBRE_PERFORMANCE_OPTIONS },
      repaintOnInteractionEnd: false,
      wheelZoomRate: DEVELOP_ELITE_MAPLIBRE_WHEEL_ZOOM_RATE,
    })

    const ro = new ResizeObserver(() => {
      requestAnimationFrame(() => map.resize())
    })
    ro.observe(el)
    if (shellRef.current) ro.observe(shellRef.current)

    return () => {
      map.off('load', markMapReady)
      map.off('load', reapplyAfterStyle)
      map.off('style.load', reapplyAfterStyle)
      if (viewportEnvRaf) cancelAnimationFrame(viewportEnvRaf)
      map.off('zoomend', scheduleViewportEnvironment)
      map.off('moveend', scheduleViewportEnvironment)
      unbindEarthMouse()
      unbindTileWarmup()
      ro.disconnect()
      cancelAgroCloudTerrainSync(map as never)
      registerMap(null)
      setMapInstance(null)
      map.remove()
    }
  }, [registerMap, restoreGlobeBasemap, shellRef, syncViewportEnvironment])

  useEffect(() => {
    if (viewMode3d) prefetchTerrainApiAvailability()
  }, [viewMode3d])


  useEffect(() => {
    shellRef.current?.classList.toggle('develop-elite-map__viewport--3d', viewMode3d)
    shellRef.current?.classList.toggle('develop-elite-map__viewport--gpu-3d', viewMode3d)
  }, [shellRef, viewMode3d])

  return (
    <div
      className="develop-elite-map__webgl develop-elite-map__galaxy-backdrop"
      ref={containerRef}
      aria-label="Develop Elite map"
    />
  )
}
