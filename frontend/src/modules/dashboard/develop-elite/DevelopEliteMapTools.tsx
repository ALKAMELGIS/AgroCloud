import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import {
  DEVELOP_ELITE_MAP_FOCUS_LEGEND_LAYER_EVENT,
  type DevelopEliteMapFocusLegendLayerDetail,
} from './developEliteDashboardEvents'
import type { Map as MaplibreMap } from 'maplibre-gl'
import { searchAcpPlaces } from '@/modules/dashboards/gis/agroCloudPlatform/map/acpMapSearch'
import {
  developEliteMapGeoJsonForLayer,
  searchDevelopEliteMapLocal,
  type DevelopEliteMapSearchHit,
  type DevelopEliteMapSearchSources,
} from './developEliteMapSearch'
import { listDevelopEliteBasemapEntries } from '@/modules/gis/map/BasemapGallery'
import { resolveBasemapId } from '@/modules/gis/map/basemapCatalog'
import { useDevelopEliteMapLibre } from './developEliteMapLibreContext'
import { useDevelopEliteMapLayerLiveOptional } from './developEliteMapLayerLiveContext'
import { parseLatLngQuery } from '@/modules/remote-sensing/weather/openMeteoWeather'
import type { DevelopEliteMapDataLayerId } from './developEliteDashboardConfig'
import { isDevelopEliteMapDataLayerVisible } from './developEliteMapDataLayers'
import { DevelopEliteMapDataLayerList } from './DevelopEliteMapDataLayerList'
import {
  DevelopEliteMapDataLayerActionDialogs,
  type DevelopEliteMapDataLayerDialogState,
} from './DevelopEliteMapDataLayerActionDialogs'
import {
  developEliteDataSourceForMapLayer,
  developEliteMapServiceUrlForLayer,
} from './developEliteDataSourceRegistry'
import type { DevelopEliteDashboardConfig } from './developEliteDashboardConfig'
import { buildDevelopEliteMapLegendSections, type DevelopEliteMapLegendRow } from './developEliteMapLegend'
import { DevelopEliteMapLegendSwatch } from './DevelopEliteMapLegendSwatch'
import { DEVELOP_ELITE_MAP_DEFAULT_VIEW_3D } from './developEliteMapViewport'
import { restoreDevelopElitePortfolioGlobeBasemap } from './developEliteMapLibreGlobeBasemap'
import {
  developEliteMapLibreFitGeoJson,
  developEliteMapLibreApplyDefaultPortfolioView,
  developEliteMapLibreFlyToFieldKey,
  developEliteMapLibreFlyToGeoJsonFeatureIndex,
  developEliteMapLibreFlyToLatLng,
} from './developEliteMapLibreNavigation'
import { DevelopEliteMapInsightToolbar } from './DevelopEliteMapInsightTools'
import { DevelopEliteMapLayerLivePanel } from './DevelopEliteMapLayerLivePanel'
import { useDevelopEliteMapChrome, type DevelopEliteMapPanelId } from './DevelopEliteMapChrome'
import { useDevelopEliteCompactViewport } from './developEliteCompactViewport'

const TOPOGRAPHIC_3D_TOOL_LABEL =
  '3D Topographic — instant Esri relief basemap with terrain mesh and Agro Structure extrusion. Shift+drag or right-drag to orbit.'

const TOOLS: Array<{ id: string; icon: string; label: string }> = [
  { id: 'search', icon: 'fa-magnifying-glass', label: 'Search map' },
  { id: 'layers', icon: 'fa-layer-group', label: 'Layers' },
  { id: 'satellite', icon: 'fa-satellite-dish', label: 'Satellite Intelligence' },
  { id: 'basemap', icon: 'fa-table-cells', label: 'Basemap' },
  { id: 'fullscreen', icon: 'fa-expand', label: 'Full screen' },
  { id: 'home', icon: 'fa-house', label: 'Portfolio map extent' },
  { id: 'locate', icon: 'fa-location-crosshairs', label: 'My location' },
  { id: 'topographic3d', icon: 'fa-mountain', label: TOPOGRAPHIC_3D_TOOL_LABEL },
]

type PanelId = 'search' | 'layers' | 'satellite' | 'basemap' | null

type ToolbarProps = {
  rootRef: RefObject<HTMLDivElement | null>
  viewportRef: RefObject<HTMLDivElement | null>
  geojson: GeoJSON.FeatureCollection
  treesGeojson?: GeoJSON.FeatureCollection | null
  irrigationValvesGeojson?: GeoJSON.FeatureCollection | null
  irrigationMainPipeGeojson?: GeoJSON.FeatureCollection | null
  agriLocationGeojson?: GeoJSON.FeatureCollection | null
  worldCountriesGeojson?: GeoJSON.FeatureCollection | null
  countryLabels: Map<string, string> | null
  basemapId: string
  mapLayerVisibility: Record<DevelopEliteMapDataLayerId, boolean>
  mapDataLayerOrder: DevelopEliteMapDataLayerId[]
  mapDataLayerOpacity: Record<DevelopEliteMapDataLayerId, number>
  dashboardConfig: DevelopEliteDashboardConfig
  drawingInfo: Record<string, unknown> | null
  treesDrawingInfo?: Record<string, unknown> | null
  irrigationValvesDrawingInfo?: Record<string, unknown> | null
  irrigationMainPipeDrawingInfo?: Record<string, unknown> | null
  agriLocationDrawingInfo?: Record<string, unknown> | null
  onMapLayerVisibilityChange: (id: DevelopEliteMapDataLayerId, visible: boolean) => void
  onMapDataLayerOrderChange: (order: DevelopEliteMapDataLayerId[]) => void
  onMapDataLayerOpacityChange: (id: DevelopEliteMapDataLayerId, opacity: number) => void
  onBasemapChange: (id: string) => void
  onSelectFieldKey: (key: string | null) => void
  onPin: (pos: [number, number] | null) => void
}

export function DevelopEliteMapLegendRail({
  drawingInfo,
  treesDrawingInfo,
  irrigationValvesDrawingInfo,
  irrigationMainPipeDrawingInfo,
  agriLocationDrawingInfo,
  mapLayerVisibility,
  onSelectFieldKey,
}: {
  drawingInfo: Record<string, unknown> | null
  treesDrawingInfo?: Record<string, unknown> | null
  irrigationValvesDrawingInfo?: Record<string, unknown> | null
  irrigationMainPipeDrawingInfo?: Record<string, unknown> | null
  agriLocationDrawingInfo?: Record<string, unknown> | null
  mapLayerVisibility: Record<DevelopEliteMapDataLayerId, boolean>
  onSelectFieldKey?: (key: string | null) => void
}) {
  const legend = useMemo(
    () =>
      buildDevelopEliteMapLegendSections(
        drawingInfo,
        treesDrawingInfo,
        agriLocationDrawingInfo,
        irrigationValvesDrawingInfo,
        irrigationMainPipeDrawingInfo,
      ),
    [
      agriLocationDrawingInfo,
      drawingInfo,
      irrigationMainPipeDrawingInfo,
      irrigationValvesDrawingInfo,
      treesDrawingInfo,
    ],
  )

  const renderRow = (item: DevelopEliteMapLegendRow) => (
    <li key={item.id} className="develop-elite-map__legend-row">
      <DevelopEliteMapLegendSwatch item={item} />
      <span className="develop-elite-map__legend-label">{item.label}</span>
    </li>
  )

  const showStructuresLegend =
    isDevelopEliteMapDataLayerVisible(mapLayerVisibility, 'agro-structures') && legend.structures.length
  const showTreesLegend =
    isDevelopEliteMapDataLayerVisible(mapLayerVisibility, 'trees') && legend.trees.length
  const showIrrigationValvesLegend =
    isDevelopEliteMapDataLayerVisible(mapLayerVisibility, 'irrigation-valves') &&
    legend.irrigationValves.length
  const showIrrigationMainPipeLegend =
    isDevelopEliteMapDataLayerVisible(mapLayerVisibility, 'irrigation-main-pipe') &&
    legend.irrigationMainPipe.length
  const showAgriLocationLegend =
    isDevelopEliteMapDataLayerVisible(mapLayerVisibility, 'agri-location') && legend.agriLocation.length

  const compactLegend = useDevelopEliteCompactViewport()
  const [legendPulseLayerId, setLegendPulseLayerId] = useState<DevelopEliteMapDataLayerId | null>(null)

  useEffect(() => {
    const onFocus = (e: Event) => {
      const layerId = (e as CustomEvent<DevelopEliteMapFocusLegendLayerDetail>).detail?.layerId
      if (!layerId) return
      setLegendPulseLayerId(layerId)
      window.setTimeout(() => setLegendPulseLayerId(null), 2400)
    }
    window.addEventListener(DEVELOP_ELITE_MAP_FOCUS_LEGEND_LAYER_EVENT, onFocus)
    return () => window.removeEventListener(DEVELOP_ELITE_MAP_FOCUS_LEGEND_LAYER_EVENT, onFocus)
  }, [])

  const legendBody = (
        <div className="develop-elite-map__legend-rail-scroll">
          {showStructuresLegend ? (
            <>
              <p
                className={`develop-elite-map__legend-section-title${legendPulseLayerId === 'agro-structures' ? ' is-pulse' : ''}`}
              >
                Agro structures
              </p>
              <ul className="develop-elite-map__legend-list develop-elite-map__legend-list--rail">
                {legend.structures.map(renderRow)}
              </ul>
            </>
          ) : null}
          {showTreesLegend ? (
            <>
              <p
                className={`develop-elite-map__legend-section-title${legendPulseLayerId === 'trees' ? ' is-pulse' : ''}`}
              >
                Tree
              </p>
              <ul className="develop-elite-map__legend-list develop-elite-map__legend-list--rail">
                {legend.trees.map(renderRow)}
              </ul>
            </>
          ) : null}
          {showIrrigationValvesLegend ? (
            <>
              <p
                className={`develop-elite-map__legend-section-title${legendPulseLayerId === 'irrigation-valves' ? ' is-pulse' : ''}`}
              >
                Irrigation valves
              </p>
              <ul className="develop-elite-map__legend-list develop-elite-map__legend-list--rail">
                {legend.irrigationValves.map(renderRow)}
              </ul>
            </>
          ) : null}
          {showIrrigationMainPipeLegend ? (
            <>
              <p
                className={`develop-elite-map__legend-section-title${legendPulseLayerId === 'irrigation-main-pipe' ? ' is-pulse' : ''}`}
              >
                Irrigation main pipe
              </p>
              <ul className="develop-elite-map__legend-list develop-elite-map__legend-list--rail">
                {legend.irrigationMainPipe.map(renderRow)}
              </ul>
            </>
          ) : null}
          {showAgriLocationLegend ? (
            <>
              <p
                className={`develop-elite-map__legend-section-title${legendPulseLayerId === 'agri-location' ? ' is-pulse' : ''}`}
              >
                AgroLocation
              </p>
              <ul className="develop-elite-map__legend-list develop-elite-map__legend-list--rail">
                {legend.agriLocation.map(renderRow)}
              </ul>
            </>
          ) : null}
          <p className="develop-elite-map__legend-section-title">Map layers</p>
          <ul className="develop-elite-map__legend-list develop-elite-map__legend-list--rail develop-elite-map__legend-list--overlays">
            {legend.overlays.map(renderRow)}
          </ul>
        </div>
  )

  return (
    <aside
      className={`develop-elite-map__legend-rail${compactLegend ? ' develop-elite-map__legend-rail--stacked' : ''}`}
      aria-label="Map legend"
    >
      <div className="develop-elite-map__legend-rail-inner">
        {compactLegend ? (
          <details className="develop-elite-map__legend-fold" {...(compactLegend ? {} : { open: true })}>
            <summary className="develop-elite-map__legend-rail-title develop-elite-map__legend-fold-summary">
              Layer legend
            </summary>
            {legendBody}
          </details>
        ) : (
          <>
            <p className="develop-elite-map__legend-rail-title">Layer legend</p>
            {legendBody}
          </>
        )}
        <DevelopEliteMapInsightToolbar onSelectFieldKey={onSelectFieldKey} />
      </div>
    </aside>
  )
}

export function DevelopEliteMapTools({
  rootRef,
  viewportRef,
  geojson,
  treesGeojson,
  irrigationValvesGeojson,
  irrigationMainPipeGeojson,
  agriLocationGeojson,
  worldCountriesGeojson,
  countryLabels,
  basemapId,
  mapLayerVisibility,
  mapDataLayerOrder,
  mapDataLayerOpacity,
  dashboardConfig,
  drawingInfo,
  treesDrawingInfo,
  irrigationValvesDrawingInfo,
  irrigationMainPipeDrawingInfo,
  agriLocationDrawingInfo,
  onMapLayerVisibilityChange,
  onMapDataLayerOrderChange,
  onMapDataLayerOpacityChange,
  onBasemapChange,
  onSelectFieldKey,
  onPin,
}: ToolbarProps) {
  const { mapRef, viewMode3d, setViewMode3d } = useDevelopEliteMapLibre()
  const layerLive = useDevelopEliteMapLayerLiveOptional()
  const [panel, setPanel] = useState<PanelId>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchHits, setSearchHits] = useState<DevelopEliteMapSearchHit[]>([])
  const [searchStatus, setSearchStatus] = useState('')
  const [locateStatus, setLocateStatus] = useState('')
  const [layerPanelStatus, setLayerPanelStatus] = useState('')
  const [layerDialog, setLayerDialog] = useState<DevelopEliteMapDataLayerDialogState>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const searchSeq = useRef(0)
  const mapChrome = useDevelopEliteMapChrome()
  useEffect(() => {
    if (!mapChrome) return
    mapChrome.registerMapPanelOpener((id: DevelopEliteMapPanelId) => {
      setPanel(id)
    })
  }, [mapChrome])

  const basemapEntries = useMemo(() => listDevelopEliteBasemapEntries(), [])
  const activeBasemapId = useMemo(() => resolveBasemapId(basemapId), [basemapId])

  const toggleLayerLiveLegend = useCallback(() => {
    if (!layerLive) return
    layerLive.toggleLayerLiveLegend()
  }, [layerLive])

  const searchSources = useMemo<DevelopEliteMapSearchSources>(
    () => ({
      structures: geojson,
      trees: treesGeojson,
      irrigationValves: irrigationValvesGeojson,
      irrigationMainPipe: irrigationMainPipeGeojson,
      agriLocation: agriLocationGeojson,
      worldCountries: worldCountriesGeojson,
      countryLabels,
      mapLayerVisibility,
    }),
    [
      agriLocationGeojson,
      countryLabels,
      geojson,
      irrigationMainPipeGeojson,
      irrigationValvesGeojson,
      mapLayerVisibility,
      treesGeojson,
      worldCountriesGeojson,
    ],
  )
  const togglePanel = useCallback((id: PanelId) => {
    setPanel(prev => (prev === id ? null : id))
  }, [])

  useEffect(() => {
    if (!panel) return
    const onPointerDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (panelRef.current?.contains(t)) return
      if ((t as HTMLElement).closest?.('.develop-elite-map__tool')) return
      setPanel(null)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [panel])

  useEffect(() => {
    const onFs = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  const applySearchHit = useCallback(
    (
      map: MaplibreMap,
      hit: DevelopEliteMapSearchHit,
      sources: DevelopEliteMapSearchSources,
      handlers: {
        onPin: (pos: [number, number] | null) => void
        onSelectFieldKey: (key: string | null) => void
      },
    ) => {
      const cinematic = { viewMode3d }
      if (hit.kind === 'field') {
        handlers.onSelectFieldKey(hit.fieldKey)
        developEliteMapLibreFlyToFieldKey(map, sources.structures, hit.fieldKey, cinematic)
        handlers.onPin(null)
      } else if (hit.kind === 'place') {
        developEliteMapLibreFlyToLatLng(map, hit.lat, hit.lng, 14, cinematic)
        handlers.onPin([hit.lat, hit.lng])
      } else if (hit.kind === 'map-feature') {
        handlers.onSelectFieldKey(null)
        const collection = developEliteMapGeoJsonForLayer(sources, hit.sourceLayerId)
        if (
          collection &&
          developEliteMapLibreFlyToGeoJsonFeatureIndex(map, collection, hit.featureIndex, cinematic)
        ) {
          handlers.onPin(null)
        }
      } else if (hit.kind === 'layer') {
        handlers.onSelectFieldKey(null)
        const layerId = hit.layerId as DevelopEliteMapDataLayerId
        const collection = developEliteMapGeoJsonForLayer(sources, layerId)
        if (collection) {
          developEliteMapLibreFitGeoJson(map, collection, { maxZoom: 12 })
        }
        handlers.onPin(null)
      }
    },
    [viewMode3d],
  )

  const runSearch = useCallback(async () => {
    const map = mapRef.current
    const q = searchQuery.trim()
    if (!map || !q) return
    const seq = ++searchSeq.current
    setSearchStatus('Searching…')

    const direct = parseLatLngQuery(q)
    if (direct) {
      developEliteMapLibreFlyToLatLng(map, direct.lat, direct.lng, 15, { viewMode3d })
      onPin([direct.lat, direct.lng])
      setSearchStatus('Coordinates')
      setSearchHits([])
      return
    }

    const localHits = searchDevelopEliteMapLocal(q, searchSources)
    let placeHits: DevelopEliteMapSearchHit[] = []
    try {
      placeHits = await searchAcpPlaces(q, 5)
    } catch {
      /* geocode optional */
    }
    if (seq !== searchSeq.current) return

    const merged = [...localHits, ...placeHits]
    setSearchHits(merged)
    if (!merged.length) {
      setSearchStatus('No results')
      return
    }
    setSearchStatus(`${merged.length} result(s)`)
    applySearchHit(map, merged[0]!, searchSources, { onPin, onSelectFieldKey })
  }, [applySearchHit, mapRef, onPin, onSelectFieldKey, searchQuery, searchSources, viewMode3d])

  useEffect(() => {
    if (panel !== 'search') return
    const q = searchQuery.trim()
    if (q.length < 2) {
      setSearchHits([])
      setSearchStatus('')
      return
    }
    const t = window.setTimeout(() => void runSearch(), 320)
    return () => window.clearTimeout(t)
  }, [panel, searchQuery, runSearch])

  const applyHit = useCallback(
    (hit: DevelopEliteMapSearchHit) => {
      const map = mapRef.current
      if (!map) return
      applySearchHit(map, hit, searchSources, { onPin, onSelectFieldKey })
      setPanel(null)
    },
    [applySearchHit, mapRef, onPin, onSelectFieldKey, searchSources],
  )

  const onZoomIn = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    map.zoomTo(map.getZoom() + 1, { duration: 200 })
  }, [mapRef])

  const onZoomOut = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    map.zoomTo(map.getZoom() - 1, { duration: 200 })
  }, [mapRef])

  const onToolClick = useCallback(
    (toolId: string) => {
      const map = mapRef.current
      switch (toolId) {
        case 'search':
          togglePanel('search')
          break
        case 'layers':
          togglePanel('layers')
          break
        case 'satellite':
          togglePanel('satellite')
          break
        case 'basemap':
          togglePanel('basemap')
          break
        case 'fullscreen': {
          const el = rootRef.current
          if (!el) break
          if (document.fullscreenElement) void document.exitFullscreen()
          else void el.requestFullscreen?.()
          break
        }
        case 'home':
          if (map) {
            setViewMode3d(DEVELOP_ELITE_MAP_DEFAULT_VIEW_3D)
            restoreDevelopElitePortfolioGlobeBasemap(map, {
              basemapId: activeBasemapId,
              viewMode3d: DEVELOP_ELITE_MAP_DEFAULT_VIEW_3D,
            })
            developEliteMapLibreApplyDefaultPortfolioView(map, { animate: true, cinematic: false })
          }
          onPin(null)
          setPanel(null)
          break
        case 'locate': {
          if (!map || typeof navigator === 'undefined' || !navigator.geolocation) {
            setLocateStatus('GPS unavailable')
            return
          }
          setLocateStatus('Locating…')
          navigator.geolocation.getCurrentPosition(
            pos => {
              const { latitude: lat, longitude: lng } = pos.coords
              developEliteMapLibreFlyToLatLng(map, lat, lng, 15, { viewMode3d })
              onPin([lat, lng])
              setLocateStatus('')
              setPanel(null)
            },
            () => setLocateStatus('Location denied'),
            { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
          )
          break
        }
        case 'topographic3d': {
          const next = !viewMode3d
          setViewMode3d(next)
          if (map) {
            restoreDevelopElitePortfolioGlobeBasemap(map, {
              basemapId: activeBasemapId,
              viewMode3d: next,
            })
          }
          setPanel(null)
          break
        }
        default:
          break
      }
    },
    [activeBasemapId, mapRef, onPin, rootRef, setViewMode3d, togglePanel, viewMode3d, worldCountriesGeojson],
  )

  return (
    <>
      {panel ? (
        <div
          className={`develop-elite-map__panel${panel === 'layers' ? ' develop-elite-map__panel--layers' : ''}${panel === 'satellite' ? ' develop-elite-map__panel--satellite' : ''}`}
          ref={panelRef}
          onPointerDown={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
          onDoubleClick={e => e.stopPropagation()}
          onWheel={e => e.stopPropagation()}
          role="dialog"
          aria-label={
            panel === 'search'
              ? 'Map search'
              : panel === 'layers'
                ? 'Map layers'
                : panel === 'satellite'
                  ? 'Satellite Intelligence'
                  : 'Basemap gallery'
          }
        >
          {panel === 'search' ? (
            <>
              <label className="develop-elite-map__panel-search">
                <span className="visually-hidden">Search places and map layers</span>
                <input
                  type="search"
                  placeholder="Place, name, farm, or layer…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') void runSearch()
                  }}
                  autoFocus
                />
              </label>
              {searchStatus ? <p className="develop-elite-map__panel-hint">{searchStatus}</p> : null}
              <ul className="develop-elite-map__panel-list">
                {searchHits.map(hit => (
                  <li key={hit.id}>
                    <button type="button" className="develop-elite-map__panel-item" onClick={() => applyHit(hit)}>
                      <span>{hit.label}</span>
                      <span className="develop-elite-map__panel-meta">{hit.meta}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {panel === 'layers' ? (
            <div className="develop-elite-map__panel-layers">
              <p className="develop-elite-map__panel-title">Layers</p>
              {layerPanelStatus ? (
                <p className="develop-elite-map__panel-hint develop-elite-map__panel-hint--layer-status" role="status">
                  {layerPanelStatus}
                </p>
              ) : null}
              <DevelopEliteMapDataLayerList
                order={mapDataLayerOrder}
                visibility={mapLayerVisibility}
                layerOpacity={mapDataLayerOpacity}
                sources={searchSources}
                serviceUrlForLayer={id => developEliteMapServiceUrlForLayer(dashboardConfig, id)}
                drawingInfo={drawingInfo}
                treesDrawingInfo={treesDrawingInfo}
                irrigationValvesDrawingInfo={irrigationValvesDrawingInfo}
                irrigationMainPipeDrawingInfo={irrigationMainPipeDrawingInfo}
                agriLocationDrawingInfo={agriLocationDrawingInfo}
                onOrderChange={onMapDataLayerOrderChange}
                onVisibilityChange={onMapLayerVisibilityChange}
                onLayerOpacityChange={onMapDataLayerOpacityChange}
                onOpenDialog={(mode, layerId) => setLayerDialog({ mode, layerId })}
                onStatus={msg => {
                  setLayerPanelStatus(msg)
                  window.setTimeout(() => setLayerPanelStatus(''), 4000)
                }}
              />
              <DevelopEliteMapDataLayerActionDialogs
                dialog={layerDialog}
                onClose={() => setLayerDialog(null)}
                sources={searchSources}
                drawingInfo={drawingInfo}
                treesDrawingInfo={treesDrawingInfo}
                irrigationValvesDrawingInfo={irrigationValvesDrawingInfo}
                irrigationMainPipeDrawingInfo={irrigationMainPipeDrawingInfo}
                agriLocationDrawingInfo={agriLocationDrawingInfo}
                serviceUrl={
                  layerDialog
                    ? developEliteMapServiceUrlForLayer(dashboardConfig, layerDialog.layerId)
                    : undefined
                }
                dataSourceDef={
                  layerDialog ? developEliteDataSourceForMapLayer(layerDialog.layerId) ?? null : null
                }
              />
            </div>
          ) : null}
          {panel === 'satellite' ? (
            <div className="develop-elite-map__panel-satellite">
              <p className="develop-elite-map__panel-title">Satellite Intelligence</p>
              <DevelopEliteMapLayerLivePanel menuBoundsRef={viewportRef} />
            </div>
          ) : null}
          {panel === 'basemap' ? (
            <ul className="develop-elite-map__panel-list develop-elite-map__panel-list--scroll">
              {basemapEntries.map(entry => (
                <li key={entry.id}>
                  <button
                    type="button"
                    className={`develop-elite-map__panel-item develop-elite-map__panel-item--basemap${activeBasemapId === entry.id ? ' is-active' : ''}`}
                    onClick={() => {
                      onBasemapChange(entry.id)
                      setPanel(null)
                    }}
                  >
                    {entry.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {locateStatus ? <p className="develop-elite-map__toast" role="status">{locateStatus}</p> : null}
      <div className="develop-elite-map__tools">
        {TOOLS.map(tool => {
          const isTopographic3d = tool.id === 'topographic3d'
          const isActive =
            (isTopographic3d && viewMode3d) ||
            panel === tool.id ||
            (tool.id === 'fullscreen' && isFullscreen)
          const iconClass =
            tool.id === 'fullscreen' && isFullscreen
              ? 'fa-compress'
              : isTopographic3d && viewMode3d
                ? 'fa-map'
                : tool.icon
          const ariaLabel = isTopographic3d
            ? viewMode3d
              ? '3D Topographic — active (globe, terrain, structure extrusion)'
              : 'Turn on 3D Topographic'
            : tool.label
          return (
            <button
              key={tool.id}
              type="button"
              className={`develop-elite-map__tool${isTopographic3d ? ' develop-elite-map__tool--topographic3d' : ''}${isTopographic3d && viewMode3d ? ' develop-elite-map__tool--view3d' : ''}${isActive ? ' is-active' : ''}`}
              title={tool.label}
              aria-label={ariaLabel}
              aria-pressed={isActive}
              onClick={() => onToolClick(tool.id)}
            >
              <i className={`fa-solid ${iconClass}`} aria-hidden />
            </button>
          )
        })}
        <button
          type="button"
          className={`develop-elite-map__tool${layerLive?.layerLiveLegendOpen ? ' is-active' : ''}`}
          title="Layer Live legend — color keys for the active index layer."
          aria-label="Layer Live legend"
          aria-pressed={layerLive?.layerLiveLegendOpen ?? false}
          disabled={!layerLive}
          onClick={toggleLayerLiveLegend}
        >
          <i className="fa-solid fa-bars-staggered" aria-hidden />
        </button>
      </div>
      <div className="develop-elite-map__zoom-group develop-elite-map__zoom-group--bottom" role="group" aria-label="Zoom">
        <button
          type="button"
          className="develop-elite-map__tool develop-elite-map__tool--zoom"
          title="Zoom in"
          aria-label="Zoom in"
          onClick={onZoomIn}
        >
          <span aria-hidden>+</span>
        </button>
        <button
          type="button"
          className="develop-elite-map__tool develop-elite-map__tool--zoom"
          title="Zoom out"
          aria-label="Zoom out"
          onClick={onZoomOut}
        >
          <span aria-hidden>−</span>
        </button>
      </div>
    </>
  )
}
