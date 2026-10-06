import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Layer, Map as LeafletMap, Path } from 'leaflet'
import L from 'leaflet'
import { useMap } from 'react-leaflet'
import MapView from '@/shared/maps/MapView'
import { BasemapLayer } from '@/modules/gis/map/BasemapGallery'
import { resolveBasemapId } from '@/modules/gis/map/basemapCatalog'
import { computeStableGisFeatureKey } from '@/modules/gis/layers/gisFeatureStableKey'
import { layerOpacityFromDrawingInfo } from '@/modules/gis/layers/arcgisDrawingInfoLeaflet'
import { developEliteStructureLeafletStyle } from './developEliteMapLegend'
import {
  bindDevelopEliteMapLayerPopup,
  buildDevelopEliteArcgisFeaturePopupHtml,
  wireDevelopEliteMapFeatureActivate,
} from './developEliteMapFeaturePopup'
import {
  DevelopEliteMapGridDragLock,
  DevelopEliteMapInteractionTune,
  DevelopEliteMapInvalidateOnLayout,
  DevelopEliteMapLegendRail,
  DevelopEliteMapRefBridge,
  DevelopEliteMapTools,
  DevelopEliteMapTransientPin,
} from './DevelopEliteMapTools'
import { DevelopEliteMapArcgisLayer } from './DevelopEliteMapArcgisLayer'
import { DevelopEliteMapWorldCountriesLayer } from './DevelopEliteMapWorldCountriesLayer'
import { DevelopEliteMapVectorGeoJson } from './DevelopEliteMapVectorGeoJson'
import type { DevelopEliteMapDataLayerId } from './developEliteDashboardConfig'
import { DEVELOP_ELITE_MAP_DATA_LAYERS, isDevelopEliteMapDataLayerVisible } from './developEliteMapDataLayers'
import { filterDevelopEliteMapOverlayGeoJson } from './developEliteMapOverlayFilter'
import type { DevelopEliteMapView } from './developEliteKpiEngine'
import {
  DEVELOP_ELITE_MAP_DEFAULT_CENTER,
  DEVELOP_ELITE_MAP_DEFAULT_ZOOM,
  fitDevelopEliteCountryView,
  fitDevelopElitePortfolioView,
} from './developEliteMapViewport'
import { DevelopEliteMapImageryTimeSeriesHost } from './DevelopEliteMapImageryTimeSeries'
import { prefetchDevelopEliteImageryTimeSeriesPanel } from './developElitePrefetchImageryTimeSeries'
import { DevelopEliteMapChromeProvider } from './DevelopEliteMapChrome'
import { SiInstanceScopeProvider } from '@/app/providers/siInstanceScope'
import { DevelopEliteMapInsightEngine, DevelopEliteMapInsightProvider } from './DevelopEliteMapInsightTools'
import { DevelopEliteMapSwipeEngine } from './DevelopEliteMapSwipe'
import {
  DevelopEliteMapLayerLiveDrawBridge,
  DevelopEliteMapLayerLiveEngine,
  DevelopEliteMapLayerLiveSketchDimBridge,
  DevelopEliteMapLayerLiveProvider,
} from './DevelopEliteMapLayerLive'
import { useDevelopEliteCompactViewport } from './developEliteCompactViewport'
import {
  DevelopEliteMapDrawEngine,
  DevelopEliteMapDrawProvider,
  useDevelopEliteMapDraw,
} from './DevelopEliteMapDraw'
import { buildDevelopEliteStructureFeatureMeta } from './developEliteMapStructureMeta'
import { ensureDevelopEliteMapDataPane, ensureDevelopEliteMapWorldCountriesPane } from './developEliteMapPanes'
import {
  DEVELOP_ELITE_MAP_ZOOM_DELTA,
  DEVELOP_ELITE_MAP_ZOOM_SNAP,
} from './developEliteMapInteraction'
import { safeInvalidateLeafletMapSize } from '@/modules/gis/editing/leafletMapSketchInteraction'
type Props = {
  geojson: GeoJSON.FeatureCollection
  basemapId: string
  highlightFieldKey: string | null
  /** Incremented when the crops table requests fly-to (re-zoom even if selection unchanged). */
  mapFlyToRequest?: number
  drawingInfo: Record<string, unknown> | null
  countryLabels: Map<string, string> | null
  worldCountriesGeojson?: GeoJSON.FeatureCollection | null
  worldCountriesPortfolioExtentGeojson?: GeoJSON.FeatureCollection | null
  worldCountriesDrawingInfo?: Record<string, unknown> | null
  worldCountryDomain?: Map<string, string>
  countryFilter: string
  treesGeojson?: GeoJSON.FeatureCollection | null
  treesDrawingInfo?: Record<string, unknown> | null
  agriLocationGeojson?: GeoJSON.FeatureCollection | null
  agriLocationDrawingInfo?: Record<string, unknown> | null
  irrigationValvesGeojson?: GeoJSON.FeatureCollection | null
  irrigationValvesDrawingInfo?: Record<string, unknown> | null
  irrigationMainPipeGeojson?: GeoJSON.FeatureCollection | null
  irrigationMainPipeDrawingInfo?: Record<string, unknown> | null
  mapLayerVisibility: Record<DevelopEliteMapDataLayerId, boolean>
  mapDataLayerOrder: DevelopEliteMapDataLayerId[]
  onMapLayerVisibilityChange: (id: DevelopEliteMapDataLayerId, visible: boolean) => void
  onMapDataLayerOrderChange: (order: DevelopEliteMapDataLayerId[]) => void
  onBasemapChange: (basemapId: string) => void
  onSelectFieldKey: (key: string | null) => void
  onViewportChange?: (view: DevelopEliteMapView) => void
}

function DevelopEliteMapDataPane() {
  const map = useMap()
  useLayoutEffect(() => {
    ensureDevelopEliteMapDataPane(map)
    ensureDevelopEliteMapWorldCountriesPane(map)
  }, [map])
  return null
}

function MapListViewport({ onChange }: { onChange?: (view: DevelopEliteMapView) => void }) {
  const map = useMap()
  useEffect(() => {
    if (!onChange) return
    let raf = 0
    const emit = () => {
      if (raf) cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        raf = 0
        const bounds = map.getBounds()
        onChange({
          zoom: map.getZoom(),
          west: bounds.getWest(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          north: bounds.getNorth(),
        })
      })
    }
    map.on('moveend', emit)
    emit()
    return () => {
      if (raf) cancelAnimationFrame(raf)
      map.off('moveend', emit)
    }
  }, [map, onChange])
  return null
}

function pulseDevelopEliteStructureLayer(layer: Layer) {
  const path = layer as Path
  const run = () => {
    const el = path.getElement?.()
    if (!el) return
    el.classList.remove('develop-elite-structure-flash')
    void el.getBoundingClientRect()
    el.classList.add('develop-elite-structure-flash')
  }
  if (path.getElement?.()) run()
  else layer.once('add', run)
}

const mapLayerLabel = (id: string) =>
  DEVELOP_ELITE_MAP_DATA_LAYERS.find(layer => layer.id === id)?.label ?? id

/** One-time portfolio extent — do not refit when structure filters change. */
function PortfolioMapExtent({
  portfolioExtentGeojson,
}: {
  portfolioExtentGeojson?: GeoJSON.FeatureCollection | null
}) {
  const map = useMap()
  const defaultViewApplied = useRef(false)
  const worldFitDone = useRef(false)

  useEffect(() => {
    if (!map) return

    const applyPortfolioOrDefault = () => {
      if (portfolioExtentGeojson?.features?.length) {
        fitDevelopElitePortfolioView(map, portfolioExtentGeojson, { animate: false })
        return true
      }
      if (!defaultViewApplied.current) {
        map.setView(DEVELOP_ELITE_MAP_DEFAULT_CENTER, DEVELOP_ELITE_MAP_DEFAULT_ZOOM, { animate: false })
        defaultViewApplied.current = true
      }
      return false
    }

    const refitNarrowPortfolio = () => {
      if (map.getSize().x >= 768) return
      if (!portfolioExtentGeojson?.features?.length) return
      fitDevelopElitePortfolioView(map, portfolioExtentGeojson, { animate: false })
    }

    if (portfolioExtentGeojson?.features?.length && !worldFitDone.current) {
      applyPortfolioOrDefault()
      requestAnimationFrame(() => {
        safeInvalidateLeafletMapSize(map, { animate: false })
        applyPortfolioOrDefault()
        worldFitDone.current = true
        defaultViewApplied.current = true
      })
    } else if (!worldFitDone.current) {
      applyPortfolioOrDefault()
    }

    window.addEventListener('develop-elite-layout-changed', refitNarrowPortfolio)
    return () => window.removeEventListener('develop-elite-layout-changed', refitNarrowPortfolio)
  }, [map, portfolioExtentGeojson])

  return null
}

/** Fly map when user picks a country in the sidebar or header (not on initial load). */
function CountryMapFlyTo({
  countryFilter,
  worldCountriesGeojson,
  portfolioExtentGeojson,
  worldCountryDomain,
}: {
  countryFilter: string
  worldCountriesGeojson?: GeoJSON.FeatureCollection | null
  portfolioExtentGeojson?: GeoJSON.FeatureCollection | null
  worldCountryDomain?: Map<string, string>
}) {
  const map = useMap()
  const ready = useRef(false)
  const lastFilter = useRef<string | null>(null)

  useEffect(() => {
    if (!map) return
    const code = (countryFilter || 'all').trim() || 'all'

    if (!ready.current) {
      ready.current = true
      lastFilter.current = code
      return
    }

    if (lastFilter.current === code) return
    lastFilter.current = code

    if (code === 'all') {
      fitDevelopElitePortfolioView(map, portfolioExtentGeojson, { animate: true })
      return
    }

    if (worldCountriesGeojson?.features?.length) {
      const countryExtent = filterDevelopEliteMapOverlayGeoJson(
        worldCountriesGeojson,
        {
          country: code,
          zoneId: 'all',
          selectedFieldKey: null,
          locationSearch: '',
        },
        'world-countries',
        worldCountryDomain,
      )
      if (countryExtent.features.length) {
        fitDevelopEliteCountryView(map, countryExtent, { animate: true })
        return
      }
    }

    fitDevelopElitePortfolioView(map, portfolioExtentGeojson, { animate: true })
  }, [map, countryFilter, worldCountriesGeojson, portfolioExtentGeojson, worldCountryDomain])

  return null
}

function FlyToHighlight({
  geojson,
  highlightFieldKey,
  flyRequest,
}: {
  geojson: GeoJSON.FeatureCollection
  highlightFieldKey: string | null
  flyRequest: number
}) {
  const map = useMap()
  useEffect(() => {
    if (!map || !highlightFieldKey) return
    const hit = geojson.features.find(
      (f, i) => computeStableGisFeatureKey(f, i) === highlightFieldKey,
    )
    if (!hit?.geometry) return
    try {
      const layer = L.geoJSON(hit as GeoJSON.GeoJsonObject)
      const b = layer.getBounds()
      if (b.isValid()) map.flyToBounds(b, { padding: [48, 48], maxZoom: 16, duration: 0.8 })
    } catch {
      /* ignore */
    }
  }, [map, geojson, highlightFieldKey, flyRequest])
  return null
}

function DevelopEliteMapRoot(props: Props) {
  return (
    <DevelopEliteMapDrawProvider>
      <DevelopEliteMapContent {...props} />
    </DevelopEliteMapDrawProvider>
  )
}

export const DevelopEliteMap = memo(DevelopEliteMapRoot)

function DevelopEliteMapContent({
  geojson,
  basemapId,
  highlightFieldKey,
  mapFlyToRequest = 0,
  drawingInfo,
  countryLabels,
  worldCountriesGeojson,
  worldCountriesPortfolioExtentGeojson,
  worldCountriesDrawingInfo,
  worldCountryDomain,
  countryFilter,
  treesGeojson,
  treesDrawingInfo,
  agriLocationGeojson,
  agriLocationDrawingInfo,
  irrigationValvesGeojson,
  irrigationValvesDrawingInfo,
  irrigationMainPipeGeojson,
  irrigationMainPipeDrawingInfo,
  mapLayerVisibility,
  mapDataLayerOrder,
  onMapLayerVisibilityChange,
  onMapDataLayerOrderChange,
  onBasemapChange,
  onSelectFieldKey,
  onViewportChange,
}: Props) {
  useEffect(() => {
    prefetchDevelopEliteImageryTimeSeriesPanel()
  }, [])

  const compactMapLayout = useDevelopEliteCompactViewport()
  const mapRef = useRef<LeafletMap | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const [pin, setPin] = useState<[number, number] | null>(null)
  const basemap = useMemo(() => resolveBasemapId(basemapId), [basemapId])
  const layerOpacity = useMemo(() => layerOpacityFromDrawingInfo(drawingInfo), [drawingInfo])
  const showStructures = isDevelopEliteMapDataLayerVisible(mapLayerVisibility, 'agro-structures')
  const showWorldCountries = isDevelopEliteMapDataLayerVisible(mapLayerVisibility, 'world-countries')
  const showTrees = isDevelopEliteMapDataLayerVisible(mapLayerVisibility, 'trees')
  const showAgriLocation = isDevelopEliteMapDataLayerVisible(mapLayerVisibility, 'agri-location')
  const showIrrigationValves = isDevelopEliteMapDataLayerVisible(
    mapLayerVisibility,
    'irrigation-valves',
  )
  const showIrrigationMainPipe = isDevelopEliteMapDataLayerVisible(
    mapLayerVisibility,
    'irrigation-main-pipe',
  )

  const structureFeatureMeta = useMemo(
    () => buildDevelopEliteStructureFeatureMeta(geojson),
    [geojson],
  )
  const structureLayersByKeyRef = useRef(new Map<string, Layer>())

  const styleFeature = useCallback(
    (feature?: GeoJSON.Feature) => {
      const key = feature ? structureFeatureMeta.get(feature)?.key : null
      const highlighted = Boolean(highlightFieldKey && key === highlightFieldKey)
      return developEliteStructureLeafletStyle(drawingInfo, (feature?.properties ?? {}) as Record<string, unknown>, {
        layerOpacity,
        highlighted,
      })
    },
    [drawingInfo, highlightFieldKey, layerOpacity, structureFeatureMeta],
  )

  const drawingSig = useMemo(() => JSON.stringify(drawingInfo ?? null), [drawingInfo])

  useEffect(() => {
    structureLayersByKeyRef.current.clear()
  }, [geojson, drawingSig])

  useEffect(() => {
    if (!highlightFieldKey || !mapFlyToRequest) return
    const layer = structureLayersByKeyRef.current.get(highlightFieldKey)
    if (layer) pulseDevelopEliteStructureLayer(layer)
  }, [highlightFieldKey, mapFlyToRequest])

  const onEachStructureFeature = useCallback(
    (feature: GeoJSON.Feature, layer: Layer) => {
      const key = structureFeatureMeta.get(feature)?.key ?? computeStableGisFeatureKey(feature, 0)
      structureLayersByKeyRef.current.set(key, layer)
      const props = (feature.properties ?? {}) as Record<string, unknown>
      bindDevelopEliteMapLayerPopup(
        layer,
        buildDevelopEliteArcgisFeaturePopupHtml(mapLayerLabel('agro-structures'), props, {
          layerKey: 'agro-structures',
          drawingInfo,
          countryLabels,
        }),
        undefined,
        mapRef.current,
      )
      wireDevelopEliteMapFeatureActivate(
        layer,
        () => onSelectFieldKey(key),
        () => structureLayersByKeyRef.current.get(key) ?? layer,
      )
    },
    [countryLabels, drawingInfo, onSelectFieldKey, structureFeatureMeta],
  )

  const orderedMapLayers = useMemo(() => {
    const bottomToTop = [...mapDataLayerOrder].reverse()
    return bottomToTop.map(id => {
      if (id === 'world-countries') {
        return null
      }
      if (id === 'trees' && showTrees && treesGeojson?.features?.length) {
        return (
          <DevelopEliteMapArcgisLayer
            key="trees"
            layerKey="trees"
            layerLabel={mapLayerLabel('trees')}
            geojson={treesGeojson}
            drawingInfo={treesDrawingInfo ?? null}
          />
        )
      }
      if (
        id === 'irrigation-valves' &&
        showIrrigationValves &&
        irrigationValvesGeojson?.features?.length
      ) {
        return (
          <DevelopEliteMapArcgisLayer
            key="irrigation-valves"
            layerKey="irrigation-valves"
            layerLabel={mapLayerLabel('irrigation-valves')}
            geojson={irrigationValvesGeojson}
            drawingInfo={irrigationValvesDrawingInfo ?? null}
          />
        )
      }
      if (
        id === 'irrigation-main-pipe' &&
        showIrrigationMainPipe &&
        irrigationMainPipeGeojson?.features?.length
      ) {
        return (
          <DevelopEliteMapArcgisLayer
            key="irrigation-main-pipe"
            layerKey="irrigation-main-pipe"
            layerLabel={mapLayerLabel('irrigation-main-pipe')}
            geojson={irrigationMainPipeGeojson}
            drawingInfo={irrigationMainPipeDrawingInfo ?? null}
          />
        )
      }
      if (id === 'agri-location' && showAgriLocation && agriLocationGeojson?.features?.length) {
        return (
          <DevelopEliteMapArcgisLayer
            key="agri-location"
            layerKey="agri-location"
            layerLabel={mapLayerLabel('agri-location')}
            geojson={agriLocationGeojson}
            drawingInfo={agriLocationDrawingInfo ?? null}
          />
        )
      }
      if (id === 'agro-structures' && showStructures && geojson.features.length) {
        return (
          <DevelopEliteMapVectorGeoJson
            key={`structures-${geojson.features.length}-${drawingSig}`}
            layerKey={`structures-${geojson.features.length}-${drawingSig}`}
            data={geojson as GeoJSON.GeoJsonObject}
            style={styleFeature}
            onEachFeature={onEachStructureFeature}
          />
        )
      }
      return null
    })
  }, [
    drawingSig,
    geojson,
    highlightFieldKey,
    mapDataLayerOrder,
    onEachStructureFeature,
    showStructures,
    agriLocationDrawingInfo,
    agriLocationGeojson,
    irrigationValvesDrawingInfo,
    irrigationValvesGeojson,
    irrigationMainPipeDrawingInfo,
    irrigationMainPipeGeojson,
    showAgriLocation,
    showIrrigationMainPipe,
    showIrrigationValves,
    showTrees,
    styleFeature,
    treesDrawingInfo,
    treesGeojson,
  ])

  const sentinelClipSource = useMemo(
    () =>
      worldCountriesPortfolioExtentGeojson?.features?.length
        ? worldCountriesPortfolioExtentGeojson
        : geojson,
    [geojson, worldCountriesPortfolioExtentGeojson],
  )

  const worldCountriesLayerGeojson = useMemo(() => {
    if (worldCountriesGeojson?.features?.length) return worldCountriesGeojson
    if (worldCountriesPortfolioExtentGeojson?.features?.length) {
      return worldCountriesPortfolioExtentGeojson
    }
    return null
  }, [worldCountriesGeojson, worldCountriesPortfolioExtentGeojson])

  const draw = useDevelopEliteMapDraw()
  return (
    <DevelopEliteMapChromeProvider>
    <DevelopEliteMapLayerLiveProvider
      primaryClip={draw?.clipGeoJson}
      fallbackClip={sentinelClipSource}
    >
    <DevelopEliteMapInsightProvider basemapId={basemap} onBasemapChange={onBasemapChange}>
    <div
      className={`develop-elite-map develop-elite-map--legend-rail${compactMapLayout ? ' develop-elite-map--stacked-legend' : ''}`}
      ref={rootRef}
    >
      <div className="develop-elite-map__viewport" ref={viewportRef}>
        <MapView
          center={DEVELOP_ELITE_MAP_DEFAULT_CENTER}
          zoom={DEVELOP_ELITE_MAP_DEFAULT_ZOOM}
          zoomSnap={DEVELOP_ELITE_MAP_ZOOM_SNAP}
          zoomDelta={DEVELOP_ELITE_MAP_ZOOM_DELTA}
          showBaseLayer={false}
          showZoomControl={false}
          showScaleControl={false}
          attributionControl={false}
          developEliteMap
          onMapReady={map => {
            ensureDevelopEliteMapDataPane(map)
            ensureDevelopEliteMapWorldCountriesPane(map)
            mapRef.current = map
          }}
        >
          <DevelopEliteMapDataPane />
          <DevelopEliteMapRefBridge mapRef={mapRef} />
          <DevelopEliteMapInvalidateOnLayout />
          <DevelopEliteMapInteractionTune />
          <DevelopEliteMapGridDragLock />
          <BasemapLayer selectedBasemap={basemap} stableDuringInteraction />
          {showWorldCountries && worldCountriesLayerGeojson?.features?.length ? (
            <DevelopEliteMapWorldCountriesLayer geojson={worldCountriesLayerGeojson} />
          ) : null}
          {orderedMapLayers}
          <DevelopEliteMapTransientPin position={pin} />
          <PortfolioMapExtent portfolioExtentGeojson={worldCountriesPortfolioExtentGeojson} />
          <CountryMapFlyTo
            countryFilter={countryFilter}
            worldCountriesGeojson={worldCountriesGeojson}
            portfolioExtentGeojson={worldCountriesPortfolioExtentGeojson}
            worldCountryDomain={worldCountryDomain}
          />
          <FlyToHighlight
            geojson={geojson}
            highlightFieldKey={highlightFieldKey}
            flyRequest={mapFlyToRequest}
          />
          {onViewportChange ? <MapListViewport onChange={onViewportChange} /> : null}
          <DevelopEliteMapInsightEngine />
          <DevelopEliteMapSwipeEngine />
          <DevelopEliteMapDrawEngine />
          <DevelopEliteMapLayerLiveDrawBridge />
          <DevelopEliteMapLayerLiveSketchDimBridge />
          <DevelopEliteMapLayerLiveEngine />
        </MapView>
        <DevelopEliteMapTools
          mapRef={mapRef}
          rootRef={rootRef}
          viewportRef={viewportRef}
          geojson={geojson}
          treesGeojson={treesGeojson}
          irrigationValvesGeojson={irrigationValvesGeojson}
          irrigationMainPipeGeojson={irrigationMainPipeGeojson}
          agriLocationGeojson={agriLocationGeojson}
          worldCountriesGeojson={worldCountriesGeojson}
          countryLabels={countryLabels}
          basemapId={basemap}
          mapLayerVisibility={mapLayerVisibility}
          mapDataLayerOrder={mapDataLayerOrder}
          onMapLayerVisibilityChange={onMapLayerVisibilityChange}
          onMapDataLayerOrderChange={onMapDataLayerOrderChange}
          onBasemapChange={onBasemapChange}
          onSelectFieldKey={onSelectFieldKey}
          onPin={setPin}
        />
        <span className="develop-elite-map__attrib">Powered by Esri</span>
        <SiInstanceScopeProvider scope="develop-elite">
          <DevelopEliteMapImageryTimeSeriesHost
            containerRef={rootRef}
            highlightFieldKey={highlightFieldKey}
            onSelectFieldKey={onSelectFieldKey}
          />
        </SiInstanceScopeProvider>
      </div>
      <DevelopEliteMapLegendRail
        drawingInfo={drawingInfo}
        treesDrawingInfo={treesDrawingInfo}
        irrigationValvesDrawingInfo={irrigationValvesDrawingInfo}
        irrigationMainPipeDrawingInfo={irrigationMainPipeDrawingInfo}
        agriLocationDrawingInfo={agriLocationDrawingInfo}
        mapLayerVisibility={mapLayerVisibility}
        onSelectFieldKey={onSelectFieldKey}
      />
    </div>
    </DevelopEliteMapInsightProvider>
    </DevelopEliteMapLayerLiveProvider>
    </DevelopEliteMapChromeProvider>
  )
}
