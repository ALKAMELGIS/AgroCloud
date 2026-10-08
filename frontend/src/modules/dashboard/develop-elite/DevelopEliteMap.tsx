import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { resolveBasemapId } from '@/modules/gis/map/basemapCatalog'
import { DevelopEliteMapLegendRail, DevelopEliteMapTools } from './DevelopEliteMapTools'
import type { DevelopEliteMapDataLayerId } from './developEliteDashboardConfig'
import { DevelopEliteMapImageryTimeSeriesHost } from './DevelopEliteMapImageryTimeSeries'
import { prefetchDevelopEliteImageryTimeSeriesPanel } from './developElitePrefetchImageryTimeSeries'
import { DevelopEliteMapChromeProvider } from './DevelopEliteMapChrome'
import { SiInstanceScopeProvider } from '@/app/providers/siInstanceScope'
import { DevelopEliteMapInsightProvider } from './DevelopEliteMapInsightTools'
import { DevelopEliteMapLayerLiveProvider } from './DevelopEliteMapLayerLive'
import { useDevelopEliteCompactViewport } from './developEliteCompactViewport'
import { DevelopEliteMapDrawProvider, useDevelopEliteMapDraw } from './DevelopEliteMapDraw'
import type { DevelopEliteMapView } from './developEliteKpiEngine'
import { DevelopEliteMapLibreProvider } from './developEliteMapLibreContext'
import { DevelopEliteMapLibreCanvas } from './DevelopEliteMapLibreCanvas'
import {
  DevelopEliteMapLibreFlyBridge,
  DevelopEliteMapLibreOverlays,
  DevelopEliteMapLibreViewportBridge,
} from './DevelopEliteMapLibreChrome'
import {
  DevelopEliteMapLibreGridDragLock,
  DevelopEliteMapLibreInsightEngine,
  DevelopEliteMapLibreInteractionTune,
  DevelopEliteMapLibreLayerLiveEngine,
  DevelopEliteMapLibreResizeBridge,
  DevelopEliteMapLibreTransientPin,
} from './DevelopEliteMapLibreEngines'
import { DevelopEliteMapLibreDrawEngine } from './DevelopEliteMapLibreDraw'
import { DevelopEliteMapLibreFeaturePopupBridge } from './DevelopEliteMapLibreFeaturePopupBridge'
import { DevelopEliteMapLayerLiveLegendHost } from './DevelopEliteMapLayerLiveLegendOverlay'
import { DevelopEliteGlobeCockpitCanvas } from './DevelopEliteGlobeCockpitCanvas'
import {
  DevelopEliteMapViewportTabs,
  type DevelopEliteMapCanvasTab,
} from './DevelopEliteMapViewportTabs'
import { DEVELOP_ELITE_DASHBOARD_REFRESH_EVENT } from './developEliteDashboardEvents'
import type { DevelopEliteDashboardConfig } from './developEliteDashboardConfig'

type Props = {
  geojson: GeoJSON.FeatureCollection
  basemapId: string
  highlightFieldKey: string | null
  mapFlyToRequest?: number
  mapCountryFlyRequest?: number
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
  mapDataLayerOpacity: Record<DevelopEliteMapDataLayerId, number>
  dashboardConfig: DevelopEliteDashboardConfig
  onMapLayerVisibilityChange: (id: DevelopEliteMapDataLayerId, visible: boolean) => void
  onMapDataLayerOrderChange: (order: DevelopEliteMapDataLayerId[]) => void
  onMapDataLayerOpacityChange: (id: DevelopEliteMapDataLayerId, opacity: number) => void
  onBasemapChange: (basemapId: string) => void
  onSelectFieldKey: (key: string | null) => void
  onViewportChange?: (view: DevelopEliteMapView) => void
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
  mapCountryFlyRequest = 0,
  drawingInfo,
  treesDrawingInfo,
  agriLocationDrawingInfo,
  irrigationValvesDrawingInfo,
  irrigationMainPipeDrawingInfo,
  countryLabels,
  worldCountriesGeojson,
  worldCountriesDrawingInfo,
  worldCountriesPortfolioExtentGeojson,
  worldCountryDomain,
  countryFilter,
  treesGeojson,
  agriLocationGeojson,
  irrigationValvesGeojson,
  irrigationMainPipeGeojson,
  mapLayerVisibility,
  mapDataLayerOrder,
  mapDataLayerOpacity,
  dashboardConfig,
  onMapLayerVisibilityChange,
  onMapDataLayerOrderChange,
  onMapDataLayerOpacityChange,
  onBasemapChange,
  onSelectFieldKey,
  onViewportChange,
}: Props) {
  useEffect(() => {
    prefetchDevelopEliteImageryTimeSeriesPanel()
  }, [])

  const compactMapLayout = useDevelopEliteCompactViewport()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const [pin, setPin] = useState<[number, number] | null>(null)
  const [mapCanvasTab, setMapCanvasTab] = useState<DevelopEliteMapCanvasTab>('portfolio')

  const onMapCanvasTabChange = (tab: DevelopEliteMapCanvasTab) => {
    setMapCanvasTab(tab)
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event('develop-elite-layout-changed'))
      window.dispatchEvent(new Event(DEVELOP_ELITE_DASHBOARD_REFRESH_EVENT))
    })
  }
  const basemap = useMemo(() => {
    const resolved = resolveBasemapId(basemapId)
    if (resolved === 'esri-light-gray' || resolved === 'esri-dark-gray') {
      return 'google-satellite-hybrid'
    }
    return resolved
  }, [basemapId])
  const draw = useDevelopEliteMapDraw()

  const worldCountriesLayerGeojson = useMemo(() => {
    if (worldCountriesGeojson?.features?.length) return worldCountriesGeojson
    if (worldCountriesPortfolioExtentGeojson?.features?.length) {
      return worldCountriesPortfolioExtentGeojson
    }
    return null
  }, [worldCountriesGeojson, worldCountriesPortfolioExtentGeojson])

  const sentinelClipSource = useMemo(
    () =>
      worldCountriesPortfolioExtentGeojson?.features?.length
        ? worldCountriesPortfolioExtentGeojson
        : geojson,
    [geojson, worldCountriesPortfolioExtentGeojson],
  )

  return (
    <DevelopEliteMapChromeProvider>
      <DevelopEliteMapLayerLiveProvider primaryClip={draw?.clipGeoJson} fallbackClip={sentinelClipSource}>
        <DevelopEliteMapInsightProvider basemapId={basemap} onBasemapChange={onBasemapChange}>
          <DevelopEliteMapLibreProvider>
            <div
              className={`develop-elite-map develop-elite-map--legend-rail develop-elite-map--webgl${compactMapLayout ? ' develop-elite-map--stacked-legend' : ''}`}
              ref={rootRef}
            >
              <div className="develop-elite-map__viewport develop-elite-map__viewport--space" ref={viewportRef}>
                <DevelopEliteMapViewportTabs value={mapCanvasTab} onChange={onMapCanvasTabChange} />
                <div
                  className={`develop-elite-map__viewport-pane${mapCanvasTab !== 'portfolio' ? ' is-inactive' : ''}`}
                  id="de-map-pane-portfolio"
                  role="tabpanel"
                  aria-labelledby="de-map-tab-portfolio"
                >
                <DevelopEliteMapLibreCanvas basemapId={basemap} shellRef={viewportRef} />
                <DevelopEliteMapLibreOverlays
                  geojson={geojson}
                  structuresDrawingInfo={drawingInfo}
                  worldCountriesDrawingInfo={worldCountriesDrawingInfo}
                  treesDrawingInfo={treesDrawingInfo}
                  irrigationValvesDrawingInfo={irrigationValvesDrawingInfo}
                  irrigationMainPipeDrawingInfo={irrigationMainPipeDrawingInfo}
                  agriLocationDrawingInfo={agriLocationDrawingInfo}
                  worldCountriesGeojson={worldCountriesLayerGeojson}
                  worldCountriesPortfolioExtentGeojson={worldCountriesPortfolioExtentGeojson}
                  treesGeojson={treesGeojson}
                  irrigationValvesGeojson={irrigationValvesGeojson}
                  irrigationMainPipeGeojson={irrigationMainPipeGeojson}
                  agriLocationGeojson={agriLocationGeojson}
                  mapLayerVisibility={mapLayerVisibility}
                  mapDataLayerOrder={mapDataLayerOrder}
                  mapDataLayerOpacity={mapDataLayerOpacity}
                />
                <DevelopEliteMapLibreViewportBridge onViewportChange={onViewportChange} />
                <DevelopEliteMapLibreFlyBridge
                  basemapId={basemap}
                  countryFilter={countryFilter}
                  worldCountriesGeojson={worldCountriesGeojson}
                  portfolioExtentGeojson={worldCountriesPortfolioExtentGeojson}
                  worldCountryDomain={worldCountryDomain}
                  geojson={geojson}
                  highlightFieldKey={highlightFieldKey}
                  mapFlyToRequest={mapFlyToRequest}
                  mapCountryFlyRequest={mapCountryFlyRequest}
                />
                <DevelopEliteMapLibreDrawEngine />
                <DevelopEliteMapLibreInteractionTune />
                <DevelopEliteMapLibreGridDragLock />
                <DevelopEliteMapLibreResizeBridge />
                <DevelopEliteMapLibreTransientPin position={pin} />
                <DevelopEliteMapLibreLayerLiveEngine />
                <DevelopEliteMapLibreInsightEngine />
                <DevelopEliteMapLibreFeaturePopupBridge
                  structuresDrawingInfo={drawingInfo}
                  treesDrawingInfo={treesDrawingInfo}
                  irrigationValvesDrawingInfo={irrigationValvesDrawingInfo}
                  irrigationMainPipeDrawingInfo={irrigationMainPipeDrawingInfo}
                  agriLocationDrawingInfo={agriLocationDrawingInfo}
                  countryLabels={countryLabels}
                  onSelectFieldKey={onSelectFieldKey}
                />
                <DevelopEliteMapLayerLiveLegendHost viewportRef={viewportRef} />
                <DevelopEliteMapTools
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
                  mapDataLayerOpacity={mapDataLayerOpacity}
                  dashboardConfig={dashboardConfig}
                  drawingInfo={drawingInfo}
                  treesDrawingInfo={treesDrawingInfo}
                  irrigationValvesDrawingInfo={irrigationValvesDrawingInfo}
                  irrigationMainPipeDrawingInfo={irrigationMainPipeDrawingInfo}
                  agriLocationDrawingInfo={agriLocationDrawingInfo}
                  onMapLayerVisibilityChange={onMapLayerVisibilityChange}
                  onMapDataLayerOrderChange={onMapDataLayerOrderChange}
                  onMapDataLayerOpacityChange={onMapDataLayerOpacityChange}
                  onBasemapChange={onBasemapChange}
                  onSelectFieldKey={onSelectFieldKey}
                  onPin={setPin}
                />
                <span className="develop-elite-map__attrib">AgroCloud</span>
                <SiInstanceScopeProvider scope="develop-elite">
                  <DevelopEliteMapImageryTimeSeriesHost
                    containerRef={rootRef}
                    highlightFieldKey={highlightFieldKey}
                    onSelectFieldKey={onSelectFieldKey}
                  />
                </SiInstanceScopeProvider>
                </div>
                <div
                  className={`develop-elite-map__viewport-pane develop-elite-map__viewport-pane--globe${mapCanvasTab !== 'globe-cockpit' ? ' is-inactive' : ''}`}
                >
                  <DevelopEliteGlobeCockpitCanvas active={mapCanvasTab === 'globe-cockpit'} />
                </div>
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
          </DevelopEliteMapLibreProvider>
        </DevelopEliteMapInsightProvider>
      </DevelopEliteMapLayerLiveProvider>
    </DevelopEliteMapChromeProvider>
  )
}
