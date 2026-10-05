import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import type { Map as LeafletMap } from 'leaflet'
import { CircleMarker, useMap } from 'react-leaflet'
import { searchAcpPlaces } from '@/modules/dashboards/gis/agroCloudPlatform/map/acpMapSearch'
import {
  developEliteMapGeoJsonForLayer,
  searchDevelopEliteMapLocal,
  type DevelopEliteMapSearchHit,
  type DevelopEliteMapSearchSources,
} from './developEliteMapSearch'
import { listDevelopEliteBasemapEntries } from '@/modules/gis/map/BasemapGallery'
import { resolveBasemapId } from '@/modules/gis/map/basemapCatalog'
import { parseLatLngQuery } from '@/modules/remote-sensing/weather/openMeteoWeather'
import type { DevelopEliteMapDataLayerId } from './developEliteDashboardConfig'
import { isDevelopEliteMapDataLayerVisible } from './developEliteMapDataLayers'
import { DevelopEliteMapDataLayerList } from './DevelopEliteMapDataLayerList'
import { buildDevelopEliteMapLegendSections, type DevelopEliteMapLegendRow } from './developEliteMapLegend'
import { flyToFieldKey, flyToGeoJsonExtent, flyToGeoJsonFeatureIndex, flyToLatLng } from './developEliteMapFly'
import { DevelopEliteMapInsightToolbar } from './DevelopEliteMapInsightTools'
import { DevelopEliteMapLayerLivePanel } from './DevelopEliteMapLayerLive'
import { useDevelopEliteMapChrome, type DevelopEliteMapPanelId } from './DevelopEliteMapChrome'
import { fitDevelopElitePortfolioView } from './developEliteMapViewport'
import { useDevelopEliteCompactViewport } from './developEliteCompactViewport'
import { DEVELOP_ELITE_DASHBOARD_REFRESH_EVENT } from './developEliteDashboardEvents'

const TOOLS: Array<{ id: string; icon: string; label: string }> = [
  { id: 'search', icon: 'fa-magnifying-glass', label: 'Search map' },
  { id: 'layers', icon: 'fa-layer-group', label: 'Layers' },
  { id: 'satellite', icon: 'fa-satellite-dish', label: 'Satellite Intelligence' },
  { id: 'basemap', icon: 'fa-table-cells', label: 'Basemap' },
  { id: 'fullscreen', icon: 'fa-expand', label: 'Full screen' },
  { id: 'home', icon: 'fa-house', label: 'Portfolio map extent' },
  { id: 'locate', icon: 'fa-location-crosshairs', label: 'My location' },
]

type PanelId = 'search' | 'layers' | 'satellite' | 'basemap' | null

type ToolbarProps = {
  mapRef: RefObject<LeafletMap | null>
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
  onMapLayerVisibilityChange: (id: DevelopEliteMapDataLayerId, visible: boolean) => void
  onMapDataLayerOrderChange: (order: DevelopEliteMapDataLayerId[]) => void
  onBasemapChange: (id: string) => void
  onSelectFieldKey: (key: string | null) => void
  onPin: (pos: [number, number] | null) => void
}

function DevelopEliteMapLegendSwatch({ item }: { item: DevelopEliteMapLegendRow }) {
  if (item.symbolStyle === 'directional-line') {
    const stroke = item.outlineColor || '#004da8'
    const w = Math.max(2, Math.min(5, item.outlineWidth))
    return (
      <span className="develop-elite-map__legend-swatch develop-elite-map__legend-swatch--directional-line" aria-hidden>
        <svg width="52" height="14" viewBox="0 0 52 14">
          <line x1="1" y1="7" x2="36" y2="7" stroke={stroke} strokeWidth={w} strokeLinecap="round" />
          <polygon points="38,7 50,2 50,12" fill={stroke} />
        </svg>
      </span>
    )
  }
  const preview = item.symbolStyle === 'point' ? item.pointPreview : undefined
  if (preview?.kind === 'picture' && preview.imageUrl) {
    const w = preview.imageWidth ?? 18
    const h = preview.imageHeight ?? 18
    const scale = Math.min(1, 16 / Math.max(w, h))
    return (
      <img
        className="develop-elite-map__legend-swatch develop-elite-map__legend-swatch--point-img"
        src={preview.imageUrl}
        alt=""
        width={Math.max(12, Math.round(w * scale))}
        height={Math.max(12, Math.round(h * scale))}
        aria-hidden
      />
    )
  }
  if (preview) {
    const r = Math.max(3, Math.min(7, preview.radius))
    return (
      <span className="develop-elite-map__legend-swatch develop-elite-map__legend-swatch--point" aria-hidden>
        <svg width="16" height="16" viewBox="0 0 16 16">
          <circle
            cx="8"
            cy="8"
            r={r}
            fill={preview.fillColor}
            stroke={preview.strokeColor}
            strokeWidth={preview.strokeWidth}
          />
        </svg>
      </span>
    )
  }
  return (
    <span
      className={`develop-elite-map__legend-swatch${item.hollow ? ' is-hollow' : ''}`}
      style={{
        backgroundColor: item.hollow ? 'transparent' : item.fillColor,
        borderColor: item.outlineColor,
        borderWidth: Math.max(1, item.outlineWidth),
      }}
      aria-hidden
    />
  )
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

  const legendBody = (
        <div className="develop-elite-map__legend-rail-scroll">
          {showStructuresLegend ? (
            <>
              <p className="develop-elite-map__legend-section-title">Agro structures</p>
              <ul className="develop-elite-map__legend-list develop-elite-map__legend-list--rail">
                {legend.structures.map(renderRow)}
              </ul>
            </>
          ) : null}
          {showTreesLegend ? (
            <>
              <p className="develop-elite-map__legend-section-title">Tree</p>
              <ul className="develop-elite-map__legend-list develop-elite-map__legend-list--rail">
                {legend.trees.map(renderRow)}
              </ul>
            </>
          ) : null}
          {showIrrigationValvesLegend ? (
            <>
              <p className="develop-elite-map__legend-section-title">Irrigation valves</p>
              <ul className="develop-elite-map__legend-list develop-elite-map__legend-list--rail">
                {legend.irrigationValves.map(renderRow)}
              </ul>
            </>
          ) : null}
          {showIrrigationMainPipeLegend ? (
            <>
              <p className="develop-elite-map__legend-section-title">Irrigation main pipe</p>
              <ul className="develop-elite-map__legend-list develop-elite-map__legend-list--rail">
                {legend.irrigationMainPipe.map(renderRow)}
              </ul>
            </>
          ) : null}
          {showAgriLocationLegend ? (
            <>
              <p className="develop-elite-map__legend-section-title">AgroLocation</p>
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

export function DevelopEliteMapTransientPin({ position }: { position: [number, number] | null }) {
  if (!position) return null
  return (
    <CircleMarker
      center={position}
      radius={8}
      pathOptions={{ color: '#4ade80', fillColor: '#22c55e', fillOpacity: 0.85, weight: 2 }}
    />
  )
}

export function DevelopEliteMapTools({
  mapRef,
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
  onMapLayerVisibilityChange,
  onMapDataLayerOrderChange,
  onBasemapChange,
  onSelectFieldKey,
  onPin,
}: ToolbarProps) {
  const [panel, setPanel] = useState<PanelId>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchHits, setSearchHits] = useState<DevelopEliteMapSearchHit[]>([])
  const [searchStatus, setSearchStatus] = useState('')
  const [locateStatus, setLocateStatus] = useState('')
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
      map: LeafletMap,
      hit: DevelopEliteMapSearchHit,
      sources: DevelopEliteMapSearchSources,
      handlers: {
        onPin: (pos: [number, number] | null) => void
        onSelectFieldKey: (key: string | null) => void
      },
    ) => {
      if (hit.kind === 'field') {
        handlers.onSelectFieldKey(hit.fieldKey)
        flyToFieldKey(map, sources.structures, hit.fieldKey)
        handlers.onPin(null)
      } else if (hit.kind === 'place') {
        flyToLatLng(map, hit.lat, hit.lng)
        handlers.onPin([hit.lat, hit.lng])
      } else if (hit.kind === 'map-feature') {
        handlers.onSelectFieldKey(null)
        const collection = developEliteMapGeoJsonForLayer(sources, hit.sourceLayerId)
        if (collection && flyToGeoJsonFeatureIndex(map, collection, hit.featureIndex)) {
          handlers.onPin(null)
        }
      } else if (hit.kind === 'layer') {
        handlers.onSelectFieldKey(null)
        const layerId = hit.layerId as DevelopEliteMapDataLayerId
        const collection = developEliteMapGeoJsonForLayer(sources, layerId)
        if (collection) {
          flyToGeoJsonExtent(map, collection, { padding: [32, 32], maxZoom: 12 })
        }
        handlers.onPin(null)
      }
    },
    [],
  )

  const runSearch = useCallback(async () => {
    const map = mapRef.current
    const q = searchQuery.trim()
    if (!map || !q) return
    const seq = ++searchSeq.current
    setSearchStatus('Searching…')

    const direct = parseLatLngQuery(q)
    if (direct) {
      flyToLatLng(map, direct.lat, direct.lng)
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
  }, [applySearchHit, mapRef, onPin, onSelectFieldKey, searchQuery, searchSources])

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
    mapRef.current?.zoomIn()
  }, [mapRef])

  const onZoomOut = useCallback(() => {
    mapRef.current?.zoomOut()
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
          if (map) fitDevelopElitePortfolioView(map, worldCountriesGeojson, { animate: true })
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
              flyToLatLng(map, lat, lng, 15)
              onPin([lat, lng])
              setLocateStatus('')
              setPanel(null)
            },
            () => setLocateStatus('Location denied'),
            { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
          )
          break
        }
        default:
          break
      }
    },
    [mapRef, onPin, rootRef, togglePanel, worldCountriesGeojson],
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
              <DevelopEliteMapDataLayerList
                order={mapDataLayerOrder}
                visibility={mapLayerVisibility}
                onOrderChange={onMapDataLayerOrderChange}
                onVisibilityChange={onMapLayerVisibilityChange}
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
        {TOOLS.map(tool => (
          <button
            key={tool.id}
            type="button"
            className={`develop-elite-map__tool${panel === tool.id || (tool.id === 'fullscreen' && isFullscreen) ? ' is-active' : ''}`}
            title={tool.label}
            aria-label={tool.label}
            aria-pressed={panel === tool.id || (tool.id === 'fullscreen' && isFullscreen)}
            onClick={() => onToolClick(tool.id)}
          >
            <i
              className={`fa-solid ${tool.id === 'fullscreen' && isFullscreen ? 'fa-compress' : tool.icon}`}
              aria-hidden
            />
          </button>
        ))}
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

/** Keeps map ref in sync when using react-leaflet context (fallback if onMapReady races). */
export function DevelopEliteMapRefBridge({ mapRef }: { mapRef: RefObject<LeafletMap | null> }) {
  const map = useMap()
  useEffect(() => {
    mapRef.current = map
  }, [map, mapRef])
  return null
}

export function DevelopEliteMapInteractionTune() {
  const map = useMap()
  useEffect(() => {
    let interacting = 0
    const bump = (delta: number) => {
      interacting = Math.max(0, interacting + delta)
      const container = map.getContainer()
      if (container) container.classList.toggle('develop-elite-map--interacting', interacting > 0)
    }
    const onMoveStart = () => bump(1)
    const onMoveEnd = () => bump(-1)
    const onZoomStart = () => bump(1)
    const onZoomEnd = () => bump(-1)
    map.on('movestart', onMoveStart)
    map.on('moveend', onMoveEnd)
    map.on('zoomstart', onZoomStart)
    map.on('zoomend', onZoomEnd)
    return () => {
      map.off('movestart', onMoveStart)
      map.off('moveend', onMoveEnd)
      map.off('zoomstart', onZoomStart)
      map.off('zoomend', onZoomEnd)
      map.getContainer()?.classList.remove('develop-elite-map--interacting')
    }
  }, [map])
  return null
}

export function DevelopEliteMapInvalidateOnLayout() {
  const map = useMap()
  useEffect(() => {
    let zooming = false
    let dragging = false
    const onZoomStart = () => {
      zooming = true
    }
    const onZoomEnd = () => {
      zooming = false
    }
    const onDragStart = () => {
      dragging = true
    }
    const onDragEnd = () => {
      dragging = false
    }
    map.on('zoomstart', onZoomStart)
    map.on('zoomend', onZoomEnd)
    map.on('dragstart', onDragStart)
    map.on('dragend', onDragEnd)
    const refresh = () => {
      if (zooming || dragging) return
      requestAnimationFrame(() => {
        try {
          map.invalidateSize()
        } catch {
          /* map teardown */
        }
      })
    }
    window.addEventListener('develop-elite-layout-changed', refresh)
    window.addEventListener(DEVELOP_ELITE_DASHBOARD_REFRESH_EVENT, refresh)
    window.addEventListener('orientationchange', refresh)
    const root = map.getContainer()?.closest('.develop-elite-map')
    const ro =
      root && typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => refresh())
        : null
    if (root && ro) ro.observe(root)
    refresh()
    return () => {
      map.off('zoomstart', onZoomStart)
      map.off('zoomend', onZoomEnd)
      map.off('dragstart', onDragStart)
      map.off('dragend', onDragEnd)
      window.removeEventListener('develop-elite-layout-changed', refresh)
      window.removeEventListener(DEVELOP_ELITE_DASHBOARD_REFRESH_EVENT, refresh)
      window.removeEventListener('orientationchange', refresh)
      ro?.disconnect()
    }
  }, [map])
  return null
}

/** Disables Leaflet pan/zoom while a dashboard card is grid-dragging (Shift+drag). */
export function DevelopEliteMapGridDragLock() {
  const map = useMap()
  useEffect(() => {
    const enableMap = () => {
      try {
        map.dragging.enable()
        map.touchZoom.enable()
        map.doubleClickZoom.enable()
        map.boxZoom.enable()
        map.scrollWheelZoom.enable()
      } catch {
        /* map teardown */
      }
    }
    const disableMap = () => {
      try {
        map.dragging.disable()
        map.touchZoom.disable()
        map.doubleClickZoom.disable()
        map.boxZoom.disable()
        map.scrollWheelZoom.disable()
      } catch {
        /* map teardown */
      }
    }
    const onGridDrag = (ev: Event) => {
      const active = Boolean((ev as CustomEvent<{ active: boolean }>).detail?.active)
      if (active) disableMap()
      else enableMap()
    }
    window.addEventListener('develop-elite-grid-drag', onGridDrag)
    return () => {
      window.removeEventListener('develop-elite-grid-drag', onGridDrag)
      enableMap()
    }
  }, [map])
  return null
}
