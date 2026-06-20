import './AgroCloudPlatformDashboard.css'
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { AcpPlatformProvider } from './acpPlatformContext'
import { useAcpDashboardEngine } from './useAcpDashboardEngine'
import { AcpHeaderBar } from './panels/AcpHeaderBar'
import { AcpFieldsPanel } from './panels/AcpFieldsPanel'
import { AcpDecisionPanel } from './panels/AcpDecisionPanel'
import { AcpLiveAlertsPanel } from './panels/AcpLiveAlertsPanel'
import { AcpAnalyticsPanel } from './panels/AcpAnalyticsPanel'
import { AcpMapToolbar, type AcpMapToolbarHandle } from './map/AcpMapToolbar'
import { AcpWeatherAlertTicker } from './map/AcpMapWeatherAlertTicker'
import { AcpWeatherFieldProvider } from './map/AcpWeatherFieldProvider'
import { useAcpPlatform } from './acpPlatformContext'
import { purgeWorldCountriesFromAcpMapRegistry } from './map/acpPortalMapLayers'
import { isAcpCompactLayout, useBreakpoint } from './hooks/useBreakpoint'

const AcpMapCanvas = lazy(() =>
  import('./map/AcpMapCanvas').then(m => ({ default: m.AcpMapCanvas })),
)
const AcpSettingsCenter = lazy(() =>
  import('./admin/AcpSettingsCenter').then(m => ({ default: m.AcpSettingsCenter })),
)
const AcpTimeSeriesChart = lazy(() =>
  import('./panels/AcpTimeSeriesChart').then(m => ({ default: m.AcpTimeSeriesChart })),
)

type AcpMobileTab = 'map' | 'fields' | 'right'

function MapCanvasFallback() {
  return (
    <div className="acp-map-stage__loading" role="status" aria-live="polite">
      Loading map…
    </div>
  )
}

function AgroCloudPlatformBody() {
  const acp = useAcpPlatform()
  const bp = useBreakpoint()
  const compact = isAcpCompactLayout(bp)
  const mapToolbarRef = useRef<AcpMapToolbarHandle>(null)
  const [mobileTab, setMobileTab] = useState<AcpMobileTab>('map')
  const [toolPanelOpen, setToolPanelOpen] = useState(false)
  const {
    filteredRows,
    liveAlertRows,
    displayKpiTotals,
    viewportScopeActive,
    distributionMapLinked,
    distributionRows,
    countries,
  } = useAcpDashboardEngine()

  useEffect(() => {
    purgeWorldCountriesFromAcpMapRegistry()
  }, [])

  useEffect(() => {
    if (!compact) {
      setMobileTab('map')
      setToolPanelOpen(false)
    }
  }, [compact])

  const closeSheets = useCallback(() => {
    setMobileTab('map')
    mapToolbarRef.current?.closePanel()
  }, [])

  const onMapPanelOpen = useCallback(() => {
    setMobileTab('map')
  }, [])

  const selectMobileTab = useCallback(
    (tab: AcpMobileTab) => {
      if (tab === 'map') {
        closeSheets()
        return
      }
      mapToolbarRef.current?.closePanel()
      setMobileTab(prev => (prev === tab ? 'map' : tab))
    },
    [closeSheets],
  )

  useEffect(() => {
    if (mobileTab === 'map' && !toolPanelOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSheets()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mobileTab, toolPanelOpen, closeSheets])

  const shellClass = [
    'acp-shell',
    compact ? 'acp-shell--compact' : '',
    mobileTab === 'fields' ? 'acp-shell--tab-fields' : '',
    mobileTab === 'right' ? 'acp-shell--tab-right' : '',
    toolPanelOpen ? 'acp-shell--tool-panel' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const showFields = acp.config.panels.fields
  const showRight =
    acp.config.panels.decision || acp.config.panels.liveAlerts || acp.config.panels.analytics

  const insightsPanel = showRight ? (
    <aside className="acp-panel acp-right">
      {compact ? (
        <div className="acp-right__drawer-bar">
          <span className="acp-right__drawer-title">Insights</span>
          <button
            type="button"
            className="acp-panel__drawer-close"
            aria-label="Close insights panel"
            onClick={closeSheets}
          >
            <i className="fa-solid fa-xmark" aria-hidden />
          </button>
        </div>
      ) : null}
      {acp.config.panels.decision ? <AcpDecisionPanel /> : null}
      {acp.config.panels.liveAlerts ? (
        <AcpLiveAlertsPanel
          rows={liveAlertRows}
          indicatorScopeRows={distributionRows}
          viewportScopeActive={viewportScopeActive}
        />
      ) : null}
      {acp.config.panels.analytics ? (
        <AcpAnalyticsPanel
          distributionRows={distributionRows}
          distributionMapLinked={distributionMapLinked}
          viewportScopeActive={viewportScopeActive}
        />
      ) : null}
    </aside>
  ) : null

  return (
    <div className={shellClass}>
      <AcpHeaderBar kpiTotals={displayKpiTotals} />
      {showFields ? (
        <AcpFieldsPanel
          rows={filteredRows}
          countries={countries}
          viewportScopeActive={viewportScopeActive}
          drawerMode={compact}
          onDrawerClose={closeSheets}
        />
      ) : null}
      <section className="acp-map-stage">
        <AcpWeatherFieldProvider>
          <AcpWeatherAlertTicker />
          <Suspense fallback={<MapCanvasFallback />}>
            <AcpMapCanvas />
          </Suspense>
        </AcpWeatherFieldProvider>
        {!compact ? (
          <AcpMapToolbar ref={mapToolbarRef} layout="overlay" onPanelOpen={onMapPanelOpen} />
        ) : null}
        {acp.engineError ? (
          <div className="acp-status-bar acp-status-bar--err" role="alert">
            {acp.engineError}
          </div>
        ) : acp.engineLoading && !acp.structuresHydrated ? (
          <div className="acp-status-bar" role="status">
            Loading Agro_Structures…
          </div>
        ) : acp.sentinelLoading ? (
          <div className="acp-status-bar" role="status">
            Loading Sentinel Live…
          </div>
        ) : null}
      </section>
      {!compact ? insightsPanel : null}
      {compact ? (
        <>
          {mobileTab === 'right' ? insightsPanel : null}
          <AcpMapToolbar
            ref={mapToolbarRef}
            layout="docked"
            onPanelOpen={onMapPanelOpen}
            onActivePanelChange={panel => setToolPanelOpen(Boolean(panel))}
          />
          <nav className="acp-bottom-bar" role="tablist" aria-label="Dashboard navigation">
            {showFields ? (
              <button
                type="button"
                role="tab"
                className={`acp-bottom-bar__btn${mobileTab === 'fields' ? ' is-active' : ''}`}
                aria-selected={mobileTab === 'fields'}
                onClick={() => selectMobileTab('fields')}
              >
                <i className="fa-solid fa-list" aria-hidden />
                <span>Fields</span>
              </button>
            ) : null}
            <button
              type="button"
              role="tab"
              className={`acp-bottom-bar__btn acp-bottom-bar__btn--map${mobileTab === 'map' ? ' is-active' : ''}`}
              aria-selected={mobileTab === 'map'}
              onClick={() => selectMobileTab('map')}
            >
              <i className="fa-solid fa-map" aria-hidden />
              <span>Map</span>
            </button>
            {showRight ? (
              <button
                type="button"
                role="tab"
                className={`acp-bottom-bar__btn${mobileTab === 'right' ? ' is-active' : ''}`}
                aria-selected={mobileTab === 'right'}
                onClick={() => selectMobileTab('right')}
              >
                <i className="fa-solid fa-chart-pie" aria-hidden />
                <span>Insights</span>
              </button>
            ) : null}
          </nav>
        </>
      ) : null}
      {acp.config.panels.timeSeriesChart ? (
        <Suspense fallback={null}>
          <AcpTimeSeriesChart />
        </Suspense>
      ) : null}
      <Suspense fallback={null}>
        <AcpSettingsCenter />
      </Suspense>
    </div>
  )
}

export default function AgroCloudPlatformDashboard() {
  return (
    <AcpPlatformProvider>
      <AgroCloudPlatformBody />
    </AcpPlatformProvider>
  )
}
