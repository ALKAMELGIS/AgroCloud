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
  DEVELOP_ELITE_MAP_DEFAULT_VIEW_3D,
  DEVELOP_ELITE_MAP_VIEWPORT_PRESET_LS_KEY,
  DEVELOP_ELITE_MAP_VIEWPORT_PRESET_VERSION,
} from './developEliteMapViewport'
import {
  DEVELOP_ELITE_DASHBOARD_REFRESH_EVENT,
  developEliteDashboardRefreshResetsMapViewport,
} from './developEliteDashboardEvents'
import { applyDevelopElitePortfolioMapBrowserLoadDefault } from './developEliteMapLibreGlobeBasemap'
import {
  developEliteMapLibreApplyDefaultPortfolioView,
  developEliteMapLibreFlyToFieldKey,
  developEliteMapLibreFitGeoJson,
  developEliteMapLibreReadView,
} from './developEliteMapLibreNavigation'

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
    applyOverlaySync(map, false)
  }, [applyOverlaySync, mapReady, mapRef, mapDataLayerOrder, mapLayerVisibility, viewMode3d])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    let raf = 0
    const runSync = () => {
      applyOverlaySync(map, true)
    }
    const scheduleSync = () => {
      if (raf) cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        raf = 0
        runSync()
      })
    }
    const onGestureEnd = () => scheduleSync()

    applyOverlaySync(map, false)
    map.on('style.load', runSync)
    map.on('load', runSync)
    map.on('zoomend', onGestureEnd)
    map.on('moveend', onGestureEnd)
    return () => {
      if (raf) cancelAnimationFrame(raf)
      map.off('style.load', runSync)
      map.off('load', runSync)
      map.off('zoomend', onGestureEnd)
      map.off('moveend', onGestureEnd)
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
  mapCountryFlyRequest,
}: {
  basemapId: string
  countryFilter: string
  worldCountriesGeojson?: GeoJSON.FeatureCollection | null
  portfolioExtentGeojson?: GeoJSON.FeatureCollection | null
  worldCountryDomain?: Map<string, string>
  geojson: GeoJSON.FeatureCollection
  highlightFieldKey: string | null
  mapFlyToRequest?: number
  mapCountryFlyRequest?: number
}) {
  const { mapRef, mapReady, viewMode3d, setViewMode3d } = useDevelopEliteMapLibre()

  useEffect(() => {
    if (!mapReady || !mapCountryFlyRequest) return
    const map = mapRef.current
    if (!map) return

    if (countryFilter === 'all') {
      setViewMode3d(DEVELOP_ELITE_MAP_DEFAULT_VIEW_3D)
      developEliteMapLibreApplyDefaultPortfolioView(map, { animate: true, cinematic: false })
      return
    }

    if (!worldCountriesGeojson?.features?.length) return
    const code = countryFilter
    const label = worldCountryDomain?.get(code)
    const hit = worldCountriesGeojson.features.find(f => {
      const p = (f.properties ?? {}) as Record<string, unknown>
      const c = String(p.Country ?? p.COUNTRY ?? p.country ?? '').trim()
      const n = String(p.Country_Name ?? p.NAME ?? '').trim()
      return c === code || n === label
    })
    if (!hit) return
    developEliteMapLibreFitGeoJson(map, { type: 'FeatureCollection', features: [hit] }, { maxZoom: 8 })
  }, [
    countryFilter,
    mapCountryFlyRequest,
    mapReady,
    mapRef,
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
    const flew = developEliteMapLibreFlyToFieldKey(map, geojson, highlightFieldKey, {
      viewMode3d,
    })
    if (flew) {
      syncDevelopEliteMapLibreStructureHighlight(map, geojson, highlightFieldKey, viewMode3d)
      pulseDevelopEliteMapLibreStructureHighlight(map)
    }
  }, [geojson, highlightFieldKey, mapFlyToRequest, mapReady, mapRef, viewMode3d])

  useEffect(() => {
    if (!mapReady) return
    const map = mapRef.current
    if (!map) return
    setViewMode3d(DEVELOP_ELITE_MAP_DEFAULT_VIEW_3D)
    applyDevelopElitePortfolioMapBrowserLoadDefault(map, basemapId)
  }, [basemapId, mapReady, mapRef, setViewMode3d])

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
    try {
      window.localStorage.setItem(
        DEVELOP_ELITE_MAP_VIEWPORT_PRESET_LS_KEY,
        String(DEVELOP_ELITE_MAP_VIEWPORT_PRESET_VERSION),
      )
    } catch {
      /* ignore */
    }
  }, [basemapId, mapReady, mapRef, setViewMode3d])

  useEffect(() => {
    if (!mapReady) return
    const map = mapRef.current
    if (!map) return
    const onDashboardRefresh = (event: Event) => {
      if (!developEliteDashboardRefreshResetsMapViewport(event)) return
      setViewMode3d(DEVELOP_ELITE_MAP_DEFAULT_VIEW_3D)
      applyDevelopElitePortfolioMapBrowserLoadDefault(map, basemapId)
    }
    window.addEventListener(DEVELOP_ELITE_DASHBOARD_REFRESH_EVENT, onDashboardRefresh)
    return () => window.removeEventListener(DEVELOP_ELITE_DASHBOARD_REFRESH_EVENT, onDashboardRefresh)
  }, [basemapId, mapReady, mapRef, setViewMode3d])
  return null
}
