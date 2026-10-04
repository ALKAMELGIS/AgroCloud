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
import { developEliteListItemMatchesSearch } from './developEliteListSearch'
import {
  DEVELOP_ELITE_COMPACT_LIST_WIDGET_IDS,
  useDevelopEliteCompactViewport,
} from './developEliteCompactViewport'

function developEliteFarmSearchHaystack(item: { title: string; subtitle?: string }) {
  return `${item.title} ${item.subtitle ?? ''}`
}

type DashboardData = ReturnType<typeof useDevelopEliteDashboardData>

type Props = {
  layout: DevelopEliteLayoutConfig
  visibleKpiCards: DevelopEliteKpiCardConfig[]
  formatHeroArea: (n: number) => string
  data: DashboardData
  filteredCountries: Array<{ code: string; label: string }>
  filteredZones: Array<{ zoneId: string; label: string }>
  countrySearch: string
  setCountrySearch: Dispatch<SetStateAction<string>>
  zoneSearch: string
  setZoneSearch: Dispatch<SetStateAction<string>>
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
  filteredZones,
  countrySearch,
  setCountrySearch,
  zoneSearch,
  setZoneSearch,
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
      tableHighlightRowId: data.tableHighlightRowId,
      selectedFieldKey: data.filters.selectedFieldKey,
      onTableRowClick: data.focusTableRow,
      onTableRowDoubleClick: data.activateTableRowOnMap,
    }),
    [
      data.chartSlices,
      data.tableRows,
      data.config.tableColumns,
      data.config.charts,
      data.tableHighlightRowId,
      data.filters.selectedFieldKey,
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
            mapLayerVisibility={data.mapLayerVisibility}
            mapDataLayerOrder={data.mapDataLayerOrder}
            onMapLayerVisibilityChange={data.setMapLayerVisible}
            onMapDataLayerOrderChange={data.setMapDataLayerOrder}
            worldCountriesGeojson={data.mapWorldCountriesGeoJson}
            worldCountriesPortfolioExtentGeojson={data.mapWorldCountriesPortfolioExtentGeoJson}
            worldCountriesDrawingInfo={data.worldCountriesDrawingInfo}
            basemapId={data.config.basemapId}
            highlightFieldKey={data.filters.selectedFieldKey}
            drawingInfo={data.structuresDrawingInfo}
            countryLabels={data.countryLabels}
            worldCountryDomain={data.worldCountryDomain}
            countryFilter={data.filters.country}
            onBasemapChange={id => data.patchConfig({ basemapId: id })}
            onSelectFieldKey={key => data.selectFarm(key)}
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
      data.mapLayerVisibility,
      data.mapDataLayerOrder,
      data.setMapLayerVisible,
      data.setMapDataLayerOrder,
      data.mapWorldCountriesGeoJson,
      data.mapWorldCountriesPortfolioExtentGeoJson,
      data.worldCountriesDrawingInfo,
      data.config.basemapId,
      data.filters.selectedFieldKey,
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
              <label className="develop-elite__search">
                <i className="fa-solid fa-magnifying-glass" aria-hidden />
                <input
                  type="search"
                  placeholder="Search"
                  value={data.filters.locationSearch}
                  onChange={e => data.setLocationSearch(e.target.value)}
                />
              </label>
              <ul className="develop-elite__list develop-elite__list--scroll">
                {data.farmList.map(item => (
                  <li key={item.fieldKey}>
                    <button
                      type="button"
                      className={`develop-elite__list-btn${data.filters.selectedFieldKey === item.fieldKey ? ' is-active' : ''}`}
                      onClick={() =>
                        data.selectFarm(data.filters.selectedFieldKey === item.fieldKey ? null : item.fieldKey)
                      }
                    >
                      <span
                        className={`develop-elite__list-title${
                          developEliteListItemMatchesSearch(
                            developEliteFarmSearchHaystack(item),
                            data.filters.locationSearch,
                          )
                            ? ' develop-elite__list-title--search-hit'
                            : ''
                        }`}
                      >
                        {item.title}
                      </span>
                      {item.subtitle ? <span className="develop-elite__list-sub">{item.subtitle}</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
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
              <label className="develop-elite__search">
                <i className="fa-solid fa-magnifying-glass" aria-hidden />
                <input
                  type="search"
                  placeholder="Search"
                  value={countrySearch}
                  onChange={e => setCountrySearch(e.target.value)}
                />
              </label>
              <ul className="develop-elite__list develop-elite__list--scroll">
                <li>
                  <button
                    type="button"
                    className={`develop-elite__list-btn${data.filters.country === 'all' ? ' is-active' : ''}`}
                    onClick={() => data.selectCountry('all')}
                  >
                    All countries
                  </button>
                </li>
                {filteredCountries.map(c => (
                  <li key={c.code}>
                    <button
                      type="button"
                      className={`develop-elite__list-btn${data.filters.country === c.code ? ' is-active' : ''}`}
                      onClick={() => data.selectCountry(c.code)}
                    >
                      <span
                        className={`develop-elite__list-title${
                          developEliteListItemMatchesSearch(`${c.label} ${c.code}`, countrySearch)
                            ? ' develop-elite__list-title--search-hit'
                            : ''
                        }`}
                      >
                        {c.label}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
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
            <label className="develop-elite__search">
              <i className="fa-solid fa-magnifying-glass" aria-hidden />
              <input
                type="search"
                placeholder="Search"
                value={data.filters.locationSearch}
                onChange={e => data.setLocationSearch(e.target.value)}
              />
            </label>
            <ul className="develop-elite__list develop-elite__list--scroll">
              {data.farmList.map(item => (
                <li key={item.fieldKey}>
                  <button
                    type="button"
                    className={`develop-elite__list-btn${data.filters.selectedFieldKey === item.fieldKey ? ' is-active' : ''}`}
                    onClick={() =>
                      data.selectFarm(data.filters.selectedFieldKey === item.fieldKey ? null : item.fieldKey)
                    }
                  >
                    <span
                      className={`develop-elite__list-title${
                        developEliteListItemMatchesSearch(
                          developEliteFarmSearchHaystack(item),
                          data.filters.locationSearch,
                        )
                          ? ' develop-elite__list-title--search-hit'
                          : ''
                      }`}
                    >
                      {item.title}
                    </span>
                    {item.subtitle ? <span className="develop-elite__list-sub">{item.subtitle}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
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
            <label className="develop-elite__search">
              <i className="fa-solid fa-magnifying-glass" aria-hidden />
              <input
                type="search"
                placeholder="Search"
                value={countrySearch}
                onChange={e => setCountrySearch(e.target.value)}
              />
            </label>
            <ul className="develop-elite__list develop-elite__list--scroll">
              <li>
                <button
                  type="button"
                  className={`develop-elite__list-btn${data.filters.country === 'all' ? ' is-active' : ''}`}
                  onClick={() => data.selectCountry('all')}
                >
                  All countries
                </button>
              </li>
              {filteredCountries.map(c => (
                <li key={c.code}>
                  <button
                    type="button"
                    className={`develop-elite__list-btn${data.filters.country === c.code ? ' is-active' : ''}`}
                    onClick={() => data.selectCountry(c.code)}
                  >
                    <span
                      className={`develop-elite__list-title${
                        developEliteListItemMatchesSearch(`${c.label} ${c.code}`, countrySearch)
                          ? ' develop-elite__list-title--search-hit'
                          : ''
                      }`}
                    >
                      {c.label}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </DevelopEliteResizeHost>
        </DevelopEliteGridWidget>
      ),
      zones: (
        <DevelopEliteGridWidget className="develop-elite-grid-widget--zones">
          <DevelopEliteResizeHost as="aside" className="develop-elite__zones-col develop-elite__zones-col--in-grid" aria-label="Zones">
            <label className="develop-elite__search">
              <i className="fa-solid fa-magnifying-glass" aria-hidden />
              <input
                type="search"
                placeholder="Search"
                value={zoneSearch}
                onChange={e => setZoneSearch(e.target.value)}
              />
            </label>
            <ul className="develop-elite__list develop-elite__list--scroll">
              {filteredZones.map(z => (
                <li key={z.zoneId}>
                  <button
                    type="button"
                    className={`develop-elite__zone-btn${data.filters.zoneId === z.zoneId ? ' is-active' : ''}`}
                    onClick={() => data.selectZone(data.filters.zoneId === z.zoneId ? 'all' : z.zoneId)}
                  >
                    <span
                      className={`develop-elite__list-title${
                        developEliteListItemMatchesSearch(`${z.label} ${z.zoneId}`, zoneSearch)
                          ? ' develop-elite__list-title--search-hit'
                          : ''
                      }`}
                    >
                      {z.label}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
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
    filteredZones,
    formatHeroArea,
    mapWidget,
    commitLayoutPatch,
    nudgeLayout,
    persistLayout,
    setCountrySearch,
    setZoneSearch,
    visibleKpiCards,
    zoneSearch,
  ])

  return (
    <div className="develop-elite__grid-workspace">
      <DevelopEliteDashboardGrid
        layouts={gridLayouts}
        kpiCardIds={kpiCardIds}
        onLayoutsChange={next => commitLayoutPatch({ gridLayouts: next })}
        onLayoutCommit={() => {}}
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
