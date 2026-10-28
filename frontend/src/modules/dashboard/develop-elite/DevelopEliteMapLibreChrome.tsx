import { useCallback, useEffect, useRef, useState } from 'react'
import { useDevelopEliteMapLibre } from './developEliteMapLibreContext'
import {
  pulseDevelopEliteMapLibreStructureHighlight,
  syncDevelopEliteMapLibreStructureHighlight,
} from './developEliteMapLibreStructureFlash'
import { syncDevelopEliteMapLibreOverlays } from './developEliteMapLibreOverlays'
import { isDevelopEliteMapLibreStyleReady } from './developEliteMapLibreStyle'
import type { DevelopEliteMapDataLayerId } from './developEliteDashboardConfig'
import type { DevelopEliteMapView } from './developEliteKpiEngine'
import {
  DEVELOP_ELITE_GRID_MAP_MERCATOR_ONLY,
  DEVELOP_ELITE_MAP_DEFAULT_VIEW_3D,
  DEVELOP_ELITE_MAP_VIEWPORT_PRESET_LS_KEY,
  DEVELOP_ELITE_MAP_VIEWPORT_PRESET_VERSION,
} from './developEliteMapViewport'
import {
  DEVELOP_ELITE_DASHBOARD_REFRESH_EVENT,
  developEliteDashboardRefreshResetsMapViewport,
} from './developEliteDashboardEvents'
import { applyDevelopElitePortfolioMapBrowserLoadDefault } from './developEliteMapLibreGlobeBasemap'
import { applyDevelopEliteMapLibrePerformanceTuning } from './developEliteMapLibrePerformance'
import {
  developEliteMapLibreApplyDefaultPortfolioView,
  developEliteMapLibreApplyPortfolioHome,
  developEliteMapLibreFitPortfolio,
  developEliteMapLibreFlyToFieldKey,
  developEliteMapLibreFlyToLatLng,
  developEliteMapLibreFitGeoJson,
  developEliteMapLibreReadView,
} from './developEliteMapLibreNavigation'
import { structureFeatureMatchesCountryFilter } from './developEliteCountryFilter'
import { findWorldCountryFeatureForFilter } from './developEliteWorldCountries'

type OverlayProps = {
  geojson: GeoJSON.FeatureCollection
  structuresDrawingInfo?: Record<string, unknown> | null
  worldCountriesDrawingInfo?: Record<string, unknown> | null
  treesDrawingInfo?: Record<string, unknown> | null
  irrigationValvesDrawingInfo?: Record<string, unknown> | null
  irrigationMainPipeDrawingInfo?: Record<string, unknown> | null
  agriLocationDrawingInfo?: Record<string, unknown> | null
  worldCountriesGeojson?: GeoJSON.FeatureCollection | null
  worldCountriesPortfolioExtentGeojson?: GeoJSON.FeatureCollection | null
  treesGeojson?: GeoJSON.FeatureCollection | null
  irrigationValvesGeojson?: GeoJSON.FeatureCollection | null
  irrigationMainPipeGeojson?: GeoJSON.FeatureCollection | null
  agriLocationGeojson?: GeoJSON.FeatureCollection | null
  mapLayerVisibility: Record<DevelopEliteMapDataLayerId, boolean>
  mapDataLayerOrder: DevelopEliteMapDataLayerId[]
  mapDataLayerOpacity: Record<DevelopEliteMapDataLayerId, number>
}

export function DevelopEliteMapLibreOverlays({
  geojson,
  structuresDrawingInfo,
  worldCountriesDrawingInfo,
  treesDrawingInfo,
  irrigationValvesDrawingInfo,
  irrigationMainPipeDrawingInfo,
  agriLocationDrawingInfo,
  worldCountriesGeojson,
  worldCountriesPortfolioExtentGeojson,
  treesGeojson,
  irrigationValvesGeojson,
  irrigationMainPipeGeojson,
  agriLocationGeojson,
  mapLayerVisibility,
  mapDataLayerOrder,
  mapDataLayerOpacity,
}: OverlayProps) {
  const { mapRef, mapReady, viewMode3d } = useDevelopEliteMapLibre()
  const [iconReloadToken, setIconReloadToken] = useState(0)
  const overlaySyncOptsRef = useRef({
    mapDataLayerOrder,
    mapLayerVisibility,
    mapDataLayerOpacity,
    viewMode3d,
    structuresDrawingInfo,
    worldCountriesDrawingInfo,
    treesDrawingInfo,
    irrigationValvesDrawingInfo,
    irrigationMainPipeDrawingInfo,
    agriLocationDrawingInfo,
    worldCountriesGeojson,
    geojson,
    worldCountriesPortfolioExtentGeojson,
    treesGeojson,
    irrigationValvesGeojson,
    irrigationMainPipeGeojson,
    agriLocationGeojson,
  })
  overlaySyncOptsRef.current = {
    mapDataLayerOrder,
    mapLayerVisibility,
    mapDataLayerOpacity,
    viewMode3d,
    structuresDrawingInfo,
    worldCountriesDrawingInfo,
    treesDrawingInfo,
    irrigationValvesDrawingInfo,
    irrigationMainPipeDrawingInfo,
    agriLocationDrawingInfo,
    worldCountriesGeojson,
    geojson,
    worldCountriesPortfolioExtentGeojson,
    treesGeojson,
    irrigationValvesGeojson,
    irrigationMainPipeGeojson,
    agriLocationGeojson,
  }
  const onArcgisIconsLoaded = useCallback(() => {
    setIconReloadToken(t => t + 1)
  }, [])
  const lastGestureOverlayZoomRef = useRef<number | null>(null)

  const applyOverlaySync = useCallback(
    (map: NonNullable<typeof mapRef.current>, skipWhileMoving = true) => {
      if (!isDevelopEliteMapLibreStyleReady(map)) return
      if (skipWhileMoving && typeof map.isMoving === 'function' && map.isMoving()) return
      const o = overlaySyncOptsRef.current
      try {
        syncDevelopEliteMapLibreOverlays(map, {
          mapDataLayerOrder: o.mapDataLayerOrder,
          mapLayerVisibility: o.mapLayerVisibility,
          mapDataLayerOpacity: o.mapDataLayerOpacity,
          mapZoom: map.getZoom(),
          viewMode3d: o.viewMode3d,
          structuresDrawingInfo: o.structuresDrawingInfo,
          worldCountriesDrawingInfo: o.worldCountriesDrawingInfo,
          treesDrawingInfo: o.treesDrawingInfo,
          irrigationValvesDrawingInfo: o.irrigationValvesDrawingInfo,
          irrigationMainPipeDrawingInfo: o.irrigationMainPipeDrawingInfo,
          agriLocationDrawingInfo: o.agriLocationDrawingInfo,
          onArcgisIconsLoaded,
          worldCountries: o.worldCountriesGeojson ?? null,
          structures: o.geojson,
          portfolioExtent: o.worldCountriesPortfolioExtentGeojson ?? null,
          trees: o.treesGeojson ?? null,
          irrigationValves: o.irrigationValvesGeojson ?? null,
          irrigationMainPipe: o.irrigationMainPipeGeojson ?? null,
          agriLocation: o.agriLocationGeojson ?? null,
        })
      } catch (err) {
        console.warn('[develop-elite-map] overlay sync failed', err)
      }
    },
    [onArcgisIconsLoaded],
  )

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    lastGestureOverlayZoomRef.current = null
    applyOverlaySync(map, false)
  }, [applyOverlaySync, mapReady, mapRef, mapDataLayerOrder, mapLayerVisibility, viewMode3d])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    let raf = 0
    let gestureTimer = 0
    const runSync = () => {
      applyOverlaySync(map, false)
    }
    const scheduleSync = () => {
      if (raf) cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        raf = 0
        runSync()
      })
    }
    const onGestureEnd = () => {
      if (gestureTimer) window.clearTimeout(gestureTimer)
      gestureTimer = window.setTimeout(() => {
        gestureTimer = 0
        scheduleSync()
      }, DEVELOP_ELITE_GRID_MAP_MERCATOR_ONLY ? 320 : 200)
    }
    const onGridZoomEnd = () => {
      const zoomQ = Math.round(map.getZoom() * 2) / 2
      if (lastGestureOverlayZoomRef.current === zoomQ) return
      lastGestureOverlayZoomRef.current = zoomQ
      onGestureEnd()
    }

    applyOverlaySync(map, false)
    map.on('style.load', runSync)
    map.on('load', runSync)
    if (DEVELOP_ELITE_GRID_MAP_MERCATOR_ONLY) {
      map.on('zoomend', onGridZoomEnd)
      map.on('moveend', onGestureEnd)
    } else {
      map.on('zoomend', onGestureEnd)
      map.on('moveend', onGestureEnd)
    }
    return () => {
      if (raf) cancelAnimationFrame(raf)
      if (gestureTimer) window.clearTimeout(gestureTimer)
      map.off('style.load', runSync)
      map.off('load', runSync)
      if (DEVELOP_ELITE_GRID_MAP_MERCATOR_ONLY) {
        map.off('zoomend', onGridZoomEnd)
        map.off('moveend', onGestureEnd)
      } else {
        map.off('zoomend', onGestureEnd)
        map.off('moveend', onGestureEnd)
      }
    }
  }, [
    agriLocationDrawingInfo,
    agriLocationGeojson,
    applyOverlaySync,
    geojson,
    iconReloadToken,
    irrigationMainPipeDrawingInfo,
    irrigationMainPipeGeojson,
    irrigationValvesDrawingInfo,
    irrigationValvesGeojson,
    mapDataLayerOrder,
    mapDataLayerOpacity,
    mapLayerVisibility,
    mapReady,
    mapRef,
    structuresDrawingInfo,
    treesDrawingInfo,
    treesGeojson,
    worldCountriesDrawingInfo,
    worldCountriesGeojson,
    worldCountriesPortfolioExtentGeojson,
  ])

  return null
}

export function DevelopEliteMapLibreViewportBridge({
  onViewportChange,
}: {
  onViewportChange?: (view: DevelopEliteMapView) => void
}) {
  const { mapRef, mapReady } = useDevelopEliteMapLibre()

  useEffect(() => {
    if (!onViewportChange || !mapReady) return
    const map = mapRef.current
    if (!map) return
    const publish = () => onViewportChange(developEliteMapLibreReadView(map))
    publish()
    map.on('moveend', publish)
    map.on('zoomend', publish)
    return () => {
      map.off('moveend', publish)
      map.off('zoomend', publish)
    }
  }, [mapReady, mapRef, onViewportChange])

  return null
}

export function DevelopEliteMapLibreFlyBridge({
  basemapId,
  countryFilter,
  worldCountriesGeojson,
  portfolioExtentGeojson,
  worldCountryDomain,
  geojson,
  highlightFieldKey,
  mapFlyToRequest,
  mapFlyToLngLat,
  mapCountryFlyRequest,
  mapExtentFly,
}: {
  basemapId: string
  countryFilter: string
  worldCountriesGeojson?: GeoJSON.FeatureCollection | null
  portfolioExtentGeojson?: GeoJSON.FeatureCollection | null
  worldCountryDomain?: Map<string, string>
  geojson: GeoJSON.FeatureCollection
  highlightFieldKey: string | null
  mapFlyToRequest?: number
  mapFlyToLngLat?: { lat: number; lng: number; nonce: number } | null
  mapCountryFlyRequest?: number
  mapExtentFly?: { fc: GeoJSON.FeatureCollection; nonce: number } | null
}) {
  const { mapRef, mapReady, viewMode3d, setViewMode3d } = useDevelopEliteMapLibre()

  useEffect(() => {
    if (!mapReady || !mapCountryFlyRequest) return
    const map = mapRef.current
    if (!map) return

    const flyCountry = () => {
      applyDevelopEliteMapLibrePerformanceTuning(map)

      if (countryFilter === 'all') {
        setViewMode3d(DEVELOP_ELITE_MAP_DEFAULT_VIEW_3D)
        developEliteMapLibreApplyPortfolioHome(map, {
          animate: true,
          worldCountries: portfolioExtentGeojson ?? worldCountriesGeojson,
        })
        return
      }

      const outline = findWorldCountryFeatureForFilter(
        worldCountriesGeojson,
        countryFilter,
        worldCountryDomain,
      )
      if (outline) {
        developEliteMapLibreFitGeoJson(
          map,
          { type: 'FeatureCollection', features: [outline] },
          { maxZoom: 8 },
        )
        return
      }

      const structHits = geojson.features.filter(f =>
        structureFeatureMatchesCountryFilter((f.properties ?? {}) as Record<string, unknown>, countryFilter, {
          worldCountryDomain,
        }),
      )
      if (structHits.length) {
        developEliteMapLibreFitGeoJson(map, { type: 'FeatureCollection', features: structHits }, { maxZoom: 10 })
      }
    }

    if (!isDevelopEliteMapLibreStyleReady(map)) {
      const onReady = () => {
        map.off('idle', onReady)
        flyCountry()
      }
      map.once('idle', onReady)
      return () => map.off('idle', onReady)
    }
    flyCountry()
  }, [
    countryFilter,
    mapCountryFlyRequest,
    mapReady,
    mapRef,
    geojson,
    portfolioExtentGeojson,
    worldCountriesGeojson,
    worldCountryDomain,
    setViewMode3d,
  ])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    syncDevelopEliteMapLibreStructureHighlight(map, geojson, highlightFieldKey, viewMode3d)
  }, [geojson, highlightFieldKey, mapReady, mapRef, viewMode3d])

  useEffect(() => {
    if (!mapReady || !highlightFieldKey || !mapFlyToRequest) return
    const map = mapRef.current
    if (!map) return
    applyDevelopEliteMapLibrePerformanceTuning(map)

    const fly = () => {
      const flew = developEliteMapLibreFlyToFieldKey(map, geojson, highlightFieldKey, {
        viewMode3d,
      })
      if (flew) {
        syncDevelopEliteMapLibreStructureHighlight(map, geojson, highlightFieldKey, viewMode3d)
        pulseDevelopEliteMapLibreStructureHighlight(map)
      }
    }

    if (!isDevelopEliteMapLibreStyleReady(map)) {
      const onReady = () => {
        map.off('idle', onReady)
        fly()
      }
      map.once('idle', onReady)
      return () => map.off('idle', onReady)
    }
    fly()
  }, [geojson, highlightFieldKey, mapFlyToRequest, mapReady, mapRef, viewMode3d])

  useEffect(() => {
    if (!mapReady || !mapFlyToLngLat?.nonce) return
    const map = mapRef.current
    if (!map) return
    developEliteMapLibreFlyToLatLng(map, mapFlyToLngLat.lat, mapFlyToLngLat.lng, 16, { viewMode3d })
  }, [mapFlyToLngLat?.lat, mapFlyToLngLat?.lng, mapFlyToLngLat?.nonce, mapReady, mapRef, viewMode3d])

  useEffect(() => {
    if (!mapReady || !mapExtentFly?.nonce) return
    const map = mapRef.current
    if (!map) return
    const fly = () => {
      applyDevelopEliteMapLibrePerformanceTuning(map)
      developEliteMapLibreFitGeoJson(map, mapExtentFly.fc, { maxZoom: 16, viewMode3d })
    }
    if (isDevelopEliteMapLibreStyleReady(map)) {
      fly()
      return
    }
    const onReady = () => {
      map.off('idle', onReady)
      fly()
    }
    map.once('idle', onReady)
    return () => map.off('idle', onReady)
  }, [mapExtentFly?.fc, mapExtentFly?.nonce, mapReady, mapRef, viewMode3d])

  const portfolioBasemapAppliedRef = useRef<string | null>(null)
  const gridPortfolioFitRef = useRef(false)

  useEffect(() => {
    if (!mapReady) return
    const map = mapRef.current
    if (!map) return
    applyDevelopEliteMapLibrePerformanceTuning(map)

    if (portfolioBasemapAppliedRef.current === basemapId) return

    const pendingNavigation =
      mapFlyToRequest > 0 ||
      mapCountryFlyRequest > 0 ||
      Boolean(mapFlyToLngLat?.nonce) ||
      Boolean(mapExtentFly?.nonce) ||
      Boolean(highlightFieldKey?.trim())

    if (portfolioBasemapAppliedRef.current === null && pendingNavigation) {
      portfolioBasemapAppliedRef.current = basemapId
      return
    }

    portfolioBasemapAppliedRef.current = basemapId
    setViewMode3d(DEVELOP_ELITE_MAP_DEFAULT_VIEW_3D)
    const portfolioFc = portfolioExtentGeojson ?? worldCountriesGeojson
    applyDevelopElitePortfolioMapBrowserLoadDefault(map, basemapId, { worldCountries: portfolioFc })
    if (DEVELOP_ELITE_GRID_MAP_MERCATOR_ONLY && portfolioFc?.features?.length) {
      gridPortfolioFitRef.current = true
    }
  }, [
    basemapId,
    highlightFieldKey,
    mapCountryFlyRequest,
    mapExtentFly?.nonce,
    mapFlyToLngLat?.nonce,
    mapFlyToRequest,
    mapReady,
    mapRef,
    portfolioExtentGeojson,
    setViewMode3d,
    worldCountriesGeojson,
  ])

  useEffect(() => {
    if (!mapReady || !DEVELOP_ELITE_GRID_MAP_MERCATOR_ONLY || gridPortfolioFitRef.current) return
    const portfolioFc = portfolioExtentGeojson ?? worldCountriesGeojson
    if (!portfolioFc?.features?.length) return
    const map = mapRef.current
    if (!map) return
    gridPortfolioFitRef.current = true
    developEliteMapLibreFitPortfolio(map, portfolioFc, { animate: false })
  }, [mapReady, mapRef, portfolioExtentGeojson, worldCountriesGeojson])

  useEffect(() => {
    if (!mapReady) return
    const map = mapRef.current
    if (!map) return
    let stored = 0
    try {
      stored = Number(window.localStorage.getItem(DEVELOP_ELITE_MAP_VIEWPORT_PRESET_LS_KEY) || 0)
    } catch {
      stored = 0
    }
    if (stored >= DEVELOP_ELITE_MAP_VIEWPORT_PRESET_VERSION) return
    const portfolioFc = portfolioExtentGeojson ?? worldCountriesGeojson
    developEliteMapLibreApplyPortfolioHome(map, { animate: false, worldCountries: portfolioFc })
    if (DEVELOP_ELITE_GRID_MAP_MERCATOR_ONLY && portfolioFc?.features?.length) {
      gridPortfolioFitRef.current = true
    }
    try {
      window.localStorage.setItem(
        DEVELOP_ELITE_MAP_VIEWPORT_PRESET_LS_KEY,
        String(DEVELOP_ELITE_MAP_VIEWPORT_PRESET_VERSION),
      )
    } catch {
      /* ignore */
    }
  }, [basemapId, mapReady, mapRef, portfolioExtentGeojson, worldCountriesGeojson])

  useEffect(() => {
    if (!mapReady) return
    const map = mapRef.current
    if (!map) return
    const onDashboardRefresh = (event: Event) => {
      if (!developEliteDashboardRefreshResetsMapViewport(event)) return
      setViewMode3d(DEVELOP_ELITE_MAP_DEFAULT_VIEW_3D)
      const portfolioFc = portfolioExtentGeojson ?? worldCountriesGeojson
      applyDevelopElitePortfolioMapBrowserLoadDefault(map, basemapId, { worldCountries: portfolioFc })
    }
    window.addEventListener(DEVELOP_ELITE_DASHBOARD_REFRESH_EVENT, onDashboardRefresh)
    return () => window.removeEventListener(DEVELOP_ELITE_DASHBOARD_REFRESH_EVENT, onDashboardRefresh)
  }, [basemapId, mapReady, mapRef, portfolioExtentGeojson, setViewMode3d, worldCountriesGeojson])
  return null
}
