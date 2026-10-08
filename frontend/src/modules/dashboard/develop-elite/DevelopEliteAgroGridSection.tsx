import { useMemo, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { DevelopEliteCharts } from './DevelopEliteCharts'
import { DevelopEliteMap } from './DevelopEliteMap'
import { DevelopEliteDashboardGrid } from './DevelopEliteDashboardGrid'
import { DevelopEliteGridWidget } from './DevelopEliteGridWidget'
import { DevelopEliteKpiIcon } from './DevelopEliteKpiIcon'
import { DevelopEliteResizeHandle, DevelopEliteResizeHost } from './DevelopEliteResizeHandle'
import { buildDefaultDevelopEliteGridLayouts, syncDevelopEliteGridLayoutsForWidgets } from './developEliteGridLayout'
import type { DevelopEliteLayoutConfig } from './developEliteLayoutConfig'
import type { DevelopEliteKpiCardConfig } from './developEliteDashboardConfig'
import type { useDevelopEliteDashboardData } from './useDevelopEliteDashboardData'
import { DevelopEliteCountryListPanel } from './DevelopEliteCountryListPanel'
import { DevelopEliteFarmListPanel } from './DevelopEliteFarmListPanel'
import {
  DEVELOP_ELITE_COMPACT_LIST_WIDGET_IDS,
  useDevelopEliteCompactViewport,
} from './developEliteCompactViewport'

type DashboardData = ReturnType<typeof useDevelopEliteDashboardData>

type Props = {
  layout: DevelopEliteLayoutConfig
  visibleKpiCards: DevelopEliteKpiCardConfig[]
  formatHeroArea: (n: number) => string
  data: DashboardData
  filteredCountries: Array<{ code: string; label: string }>
  countrySearch: string
  setCountrySearch: Dispatch<SetStateAction<string>>
  nudgeLayout: (
    patch:
      | Partial<DevelopEliteLayoutConfig>
      | ((prev: DevelopEliteLayoutConfig) => Partial<DevelopEliteLayoutConfig>),
  ) => void
  persistLayout: () => void
  commitLayoutPatch: (
    patch?:
      | Partial<DevelopEliteLayoutConfig>
      | ((prev: DevelopEliteLayoutConfig) => Partial<DevelopEliteLayoutConfig>),
  ) => void
  layoutEditMode: boolean
  onWidgetConfigure?: (widgetId: string, tab: 'data' | 'kpi' | 'charts' | 'map' | 'appearance') => void
}

export function DevelopEliteAgroGridSection({
  layout,
  visibleKpiCards,
  formatHeroArea,
  data,
  filteredCountries,
  countrySearch,
  setCountrySearch,
  nudgeLayout,
  persistLayout,
  commitLayoutPatch,
  layoutEditMode,
  onWidgetConfigure,
}: Props) {
  const compactViewport = useDevelopEliteCompactViewport()
  const kpiCardIds = useMemo(() => visibleKpiCards.map(c => c.id), [visibleKpiCards])

  const gridHiddenWidgets = useMemo(() => {
    const base = layout.gridHiddenWidgets ?? []
    if (!compactViewport) return base
    return Array.from(new Set([...base, ...DEVELOP_ELITE_COMPACT_LIST_WIDGET_IDS]))
  }, [compactViewport, layout.gridHiddenWidgets])

  const gridLayouts = useMemo(() => {
    const saved = layout.gridLayouts ?? buildDefaultDevelopEliteGridLayouts(kpiCardIds)
    return syncDevelopEliteGridLayoutsForWidgets(
      saved,
      kpiCardIds,
      items => items,
      gridHiddenWidgets,
    )
  }, [gridHiddenWidgets, layout.gridLayouts, kpiCardIds])

  const chartProps = useMemo(
    () => ({
      slices: data.chartSlices,
      tableRows: data.tableRows,
      tableColumns: data.config.tableColumns,
      charts: data.config.charts,
      valueLabel: data.config.chartValueLabel,
      tableHighlightRowId: data.tableHighlightRowId,
      tableFlashRowId: data.tableFlashRowId,
      selectedFieldKey: data.mapFieldHighlightKey,
      onTableRowClick: data.focusTableRow,
      onTableRowDoubleClick: data.activateTableRowOnMap,
      chartCropHighlight: data.chartCropTypeFilter,
      onChartSliceClick: data.selectChartCropType,
    }),
    [
      data.chartSlices,
      data.chartCropTypeFilter,
      data.selectChartCropType,
      data.tableRows,
      data.config.tableColumns,
      data.config.charts,
      data.config.chartValueLabel,
      data.tableHighlightRowId,
      data.tableFlashRowId,
      data.mapFieldHighlightKey,
      data.focusTableRow,
      data.activateTableRowOnMap,
    ],
  )

  const mapWidget = useMemo(
    () => (
      <DevelopEliteGridWidget className="develop-elite-grid-widget--map">
        <DevelopEliteResizeHost className="develop-elite__map-wrap develop-elite__map-wrap--in-grid">
          <DevelopEliteMap
            geojson={data.mapGeoJson}
            treesGeojson={data.mapTreesGeoJson}
            treesDrawingInfo={data.treesDrawingInfo}
            agriLocationGeojson={data.mapAgriLocationGeoJson}
            agriLocationDrawingInfo={data.agriLocationDrawingInfo}
            irrigationValvesGeojson={data.mapIrrigationValvesGeoJson}
            irrigationValvesDrawingInfo={data.irrigationValvesDrawingInfo}
            irrigationMainPipeGeojson={data.mapIrrigationMainPipeGeoJson}
            irrigationMainPipeDrawingInfo={data.irrigationMainPipeDrawingInfo}
            mapLayerVisibility={data.mapLayerVisibility}
            mapDataLayerOrder={data.mapDataLayerOrder}
            mapDataLayerOpacity={data.mapDataLayerOpacity}
            dashboardConfig={data.config}
            onMapLayerVisibilityChange={data.setMapLayerVisible}
            onMapDataLayerOrderChange={data.setMapDataLayerOrder}
            onMapDataLayerOpacityChange={data.setMapDataLayerOpacity}
            worldCountriesGeojson={data.mapWorldCountriesGeoJson}
            worldCountriesPortfolioExtentGeojson={data.mapWorldCountriesPortfolioExtentGeoJson}
            worldCountriesDrawingInfo={data.worldCountriesDrawingInfo}
            basemapId={data.config.basemapId}
            highlightFieldKey={data.mapFieldHighlightKey}
            mapFlyToRequest={data.mapFlyToRequest}
            mapCountryFlyRequest={data.mapCountryFlyRequest}
            drawingInfo={data.structuresDrawingInfo}
            countryLabels={data.countryLabels}
            worldCountryDomain={data.worldCountryDomain}
            countryFilter={data.filters.country}
            onBasemapChange={id => data.patchConfig({ basemapId: id })}
            onSelectFieldKey={key => (key ? data.focusFarmOnMap(key) : data.selectFarm(null))}
            onViewportChange={data.setMapView}
          />
        </DevelopEliteResizeHost>
      </DevelopEliteGridWidget>
    ),
    [
      data.mapGeoJson,
      data.mapTreesGeoJson,
      data.treesDrawingInfo,
      data.mapAgriLocationGeoJson,
      data.agriLocationDrawingInfo,
      data.mapIrrigationValvesGeoJson,
      data.irrigationValvesDrawingInfo,
      data.mapIrrigationMainPipeGeoJson,
      data.irrigationMainPipeDrawingInfo,
      data.mapLayerVisibility,
      data.mapDataLayerOrder,
      data.setMapLayerVisible,
      data.setMapDataLayerOrder,
      data.mapWorldCountriesGeoJson,
      data.mapWorldCountriesPortfolioExtentGeoJson,
      data.worldCountriesDrawingInfo,
      data.config.basemapId,
      data.mapFieldHighlightKey,
      data.mapFlyToRequest,
      data.mapCountryFlyRequest,
      data.structuresDrawingInfo,
      data.countryLabels,
      data.worldCountryDomain,
      data.filters.country,
      data.patchConfig,
      data.selectFarm,
      data.setMapView,
    ],
  )

  const widgets = useMemo(() => {
    const map: Record<string, ReactNode> = {
      'kpi-hero-zone': (
        <DevelopEliteGridWidget className="develop-elite-grid-widget--kpi">
          <article className="develop-elite__kpi-card develop-elite__kpi-card--hero develop-elite__kpi-card--hero-only develop-elite-resize-host">
            <span className="develop-elite__kpi-title develop-elite__kpi-title--area">Zone area (ha)</span>
            <div className="develop-elite__kpi-metric develop-elite__kpi-metric--hero">
              <i className="fa-solid fa-draw-polygon develop-elite__kpi-icon develop-elite__kpi-icon--hero" aria-hidden />
              <strong className="develop-elite__kpi-value">
                {formatHeroArea(data.kpis.heroZoneLayerTotalAreaHa)}
              </strong>
            </div>
          </article>
        </DevelopEliteGridWidget>
      ),
      'kpi-hero': (
        <DevelopEliteGridWidget className="develop-elite-grid-widget--kpi">
          <article className="develop-elite__kpi-card develop-elite__kpi-card--hero develop-elite__kpi-card--hero-only develop-elite-resize-host">
            <span className="develop-elite__kpi-title develop-elite__kpi-title--area">Cultivated Area (HA)</span>
            <div className="develop-elite__kpi-metric develop-elite__kpi-metric--hero">
              <i className="fa-solid fa-leaf develop-elite__kpi-icon develop-elite__kpi-icon--hero" aria-hidden />
              <strong className="develop-elite__kpi-value">{formatHeroArea(data.kpis.heroTotalAreaHa)}</strong>
            </div>
          </article>
        </DevelopEliteGridWidget>
      ),
      sidebar: (
        <DevelopEliteGridWidget className="develop-elite-grid-widget--sidebar">
          <DevelopEliteResizeHost as="aside" className="develop-elite__sidebar develop-elite__sidebar--in-grid">
            <DevelopEliteResizeHost className="develop-elite__panel develop-elite__panel--farms">
              <DevelopEliteFarmListPanel data={data} />
              <DevelopEliteResizeHandle
                edge="bottom"
                label="Resize farms / countries split"
                onDrag={(_, dy) =>
                  nudgeLayout(prev => ({ sidebarFarmsPercent: prev.sidebarFarmsPercent + dy * 0.12 }))
                }
                onDragEnd={persistLayout}
              />
            </DevelopEliteResizeHost>
            <div className="develop-elite__panel develop-elite__panel--countries">
              <DevelopEliteCountryListPanel
                data={data}
                filteredCountries={filteredCountries}
                countrySearch={countrySearch}
                setCountrySearch={setCountrySearch}
              />
            </div>
          </DevelopEliteResizeHost>
        </DevelopEliteGridWidget>
      ),
      'sidebar-farms': (
        <DevelopEliteGridWidget className="develop-elite-grid-widget--sidebar-farms">
          <DevelopEliteResizeHost
            as="aside"
            className="develop-elite__sidebar develop-elite__sidebar--in-grid develop-elite__panel develop-elite__panel--farms develop-elite__panel--farms-only"
            aria-label="Farms"
          >
            <DevelopEliteFarmListPanel data={data} />
          </DevelopEliteResizeHost>
        </DevelopEliteGridWidget>
      ),
      'sidebar-countries': (
        <DevelopEliteGridWidget className="develop-elite-grid-widget--sidebar-countries">
          <DevelopEliteResizeHost
            as="aside"
            className="develop-elite__sidebar develop-elite__sidebar--in-grid develop-elite__panel develop-elite__panel--countries develop-elite__panel--countries-only"
            aria-label="Countries"
          >
            <DevelopEliteCountryListPanel
              data={data}
              filteredCountries={filteredCountries}
              countrySearch={countrySearch}
              setCountrySearch={setCountrySearch}
            />
          </DevelopEliteResizeHost>
        </DevelopEliteGridWidget>
      ),
      structures: (
        <DevelopEliteGridWidget className="develop-elite-grid-widget--structures">
          <DevelopEliteResizeHost className="develop-elite__structure-stack develop-elite__structure-stack--in-grid" aria-label="Structure counts">
            <DevelopEliteResizeHost className="develop-elite__structure-box develop-elite__structure-box--glasshouse">
              <span className="develop-elite__structure-label">Glasshouse</span>
              <div className="develop-elite__structure-metric">
                <i className="fa-solid fa-house develop-elite__structure-icon" aria-hidden />
                <strong>{data.sideCounts.glasshouse}</strong>
              </div>
            </DevelopEliteResizeHost>
            <DevelopEliteResizeHost className="develop-elite__structure-box develop-elite__structure-box--nethouse">
              <span className="develop-elite__structure-label">Nethouse</span>
              <div className="develop-elite__structure-metric">
                <i className="fa-solid fa-house develop-elite__structure-icon" aria-hidden />
                <strong>{data.sideCounts.nethouse}</strong>
              </div>
            </DevelopEliteResizeHost>
            <div className="develop-elite__structure-box develop-elite__structure-box--greenhouse">
              <span className="develop-elite__structure-label">Greenhouse</span>
              <div className="develop-elite__structure-metric">
                <i className="fa-solid fa-house develop-elite__structure-icon" aria-hidden />
                <strong>{data.sideCounts.greenhouse}</strong>
              </div>
            </div>
          </DevelopEliteResizeHost>
        </DevelopEliteGridWidget>
      ),
      map: mapWidget,
      'chart-pie': (
        <DevelopEliteGridWidget className="develop-elite-grid-widget--chart">
          <DevelopEliteCharts {...chartProps} part="pie" />
        </DevelopEliteGridWidget>
      ),
      'chart-bar': (
        <DevelopEliteGridWidget className="develop-elite-grid-widget--chart">
          <DevelopEliteCharts {...chartProps} part="bar" />
        </DevelopEliteGridWidget>
      ),
      'chart-table': (
        <DevelopEliteGridWidget className="develop-elite-grid-widget--chart">
          <DevelopEliteCharts {...chartProps} part="table" />
        </DevelopEliteGridWidget>
      ),
    }

    for (const card of visibleKpiCards) {
      map[`kpi-${card.id}`] = (
        <DevelopEliteGridWidget key={card.id} className="develop-elite-grid-widget--kpi">
          <article
            className={`develop-elite__kpi-card develop-elite__kpi-card--${card.id} develop-elite-resize-host`}
          >
            <span className="develop-elite__kpi-title">{card.title}</span>
            <div className="develop-elite__kpi-metric">
              <DevelopEliteKpiIcon cardId={card.id} icon={card.icon} />
              <strong className="develop-elite__kpi-value">{data.kpis.cards[card.id] ?? '—'}</strong>
            </div>
            {card.subtitle ? (
              <span className="develop-elite__kpi-sub develop-elite__kpi-sub--below">{card.subtitle}</span>
            ) : null}
          </article>
        </DevelopEliteGridWidget>
      )
    }

    return map
  }, [
    chartProps,
    countrySearch,
    data.farmList,
    data.filters.country,
    data.filters.locationSearch,
    data.filters.selectedFieldKey,
    data.filters.zoneId,
    data.kpis,
    data.patchConfig,
    data.selectCountry,
    data.selectFarm,
    data.selectZone,
    data.setLocationSearch,
    data.sideCounts,
    filteredCountries,
    formatHeroArea,
    mapWidget,
    commitLayoutPatch,
    nudgeLayout,
    persistLayout,
    setCountrySearch,
    visibleKpiCards,
  ])

  return (
    <div className="develop-elite__grid-workspace">
      <DevelopEliteDashboardGrid
        layouts={gridLayouts}
        kpiCardIds={kpiCardIds}
        onLayoutsChange={next => commitLayoutPatch({ gridLayouts: next })}
        onLayoutCommit={persistLayout}
        gridRowStrideByBp={layout.gridRowStrideByBp}
        onGridRowStrideCommit={(bp, rowStridePx) =>
          commitLayoutPatch(prev => ({
            gridRowStrideByBp: { ...(prev.gridRowStrideByBp ?? {}), [bp]: rowStridePx },
          }))
        }
        layoutEditMode={layoutEditMode}
        widgets={widgets}
        gridHiddenWidgets={gridHiddenWidgets}
        compactListLayout={compactViewport}
        onGridHiddenWidgetsChange={ids => commitLayoutPatch({ gridHiddenWidgets: ids })}
        onWidgetConfigure={onWidgetConfigure}
      />
    </div>
  )
}
