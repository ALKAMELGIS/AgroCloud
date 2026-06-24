import './AgroCloudPlatformDashboard.css'
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { AcpPlatformProvider } from './acpPlatformContext'
import { useAcpDashboardEngine } from './useAcpDashboardEngine'
import { AcpHeaderBar } from './panels/AcpHeaderBar'
import { AcpFieldsPanel } from './panels/AcpFieldsPanel'
import { AcpDecisionPanel } from './panels/AcpDecisionPanel'
import { AcpLiveAlertsPanel } from './panels/AcpLiveAlertsPanel'
import { AcpAnalyticsPanel } from './panels/AcpAnalyticsPanel'
import { AcpMapToolbar, type AcpMapPanelId, type AcpMapToolbarHandle } from './map/AcpMapToolbar'
import { AcpWeatherAlertTicker } from './map/AcpMapWeatherAlertTicker'
import { AcpWeatherFieldProvider } from './map/AcpWeatherFieldProvider'
import { useAcpPlatform } from './acpPlatformContext'
import { AcpMapToolErrorBoundary } from './map/AcpMapToolErrorBoundary'
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

function MapCanvasFallback() {
  return (
    <div className="acp-map-stage__loading" role="status" aria-live="polite">
      Loading map…
    </div>
  )
}

function AcpSectionNav({ showFields, showRight }: { showFields: boolean; showRight: boolean }) {
  const jump = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  return (
    <nav className="acp-section-nav" role="navigation" aria-label="Dashboard sections">
      {showFields ? (
        <button type="button" className="acp-section-nav__btn" onClick={() => jump('acp-section-fields')}>
          <i className="fa-solid fa-list" aria-hidden />
          <span>Fields</span>
        </button>
      ) : null}
      <button type="button" className="acp-section-nav__btn" onClick={() => jump('acp-section-map')}>
        <i className="fa-solid fa-map" aria-hidden />
        <span>Map</span>
      </button>
      {showRight ? (
        <button type="button" className="acp-section-nav__btn" onClick={() => jump('acp-section-insights')}>
          <i className="fa-solid fa-chart-pie" aria-hidden />
          <span>Insights</span>
        </button>
      ) : null}
    </nav>
  )
}

function AgroCloudPlatformBody() {
  const acp = useAcpPlatform()
  const bp = useBreakpoint()
  const compact = isAcpCompactLayout(bp)
  const mapToolbarRef = useRef<AcpMapToolbarHandle>(null)
  const [activeMapPanel, setActiveMapPanel] = useState<AcpMapPanelId | null>(null)
  const toolPanelOpen = activeMapPanel != null
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
    if (!compact) setActiveMapPanel(null)
  }, [compact])

  const onMapPanelOpen = useCallback(() => {
    if (!compact) return
    document.getElementById('acp-section-map')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [compact])

  const shellClass = [
    'acp-shell',
    `acp-shell--${bp}`,
    compact ? 'acp-shell--compact' : '',
    toolPanelOpen ? 'acp-shell--tool-panel' : '',
    acp.config.panels.timeSeriesChart ? 'acp-shell--has-timeseries-chart' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const showFields = acp.config.panels.fields
  const showRight =
    acp.config.panels.decision || acp.config.panels.liveAlerts || acp.config.panels.analytics

  const insightsPanel = showRight ? (
    <aside className="acp-panel acp-right" id="acp-section-insights">
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

  const fieldsPanelInner = showFields ? (
    <AcpFieldsPanel
      rows={filteredRows}
      countries={countries}
      viewportScopeActive={viewportScopeActive}
    />
  ) : null

  const fieldsPanel = fieldsPanelInner ? (
    compact ? (
      <div id="acp-section-fields" className="acp-compact-section">
        {fieldsPanelInner}
      </div>
    ) : (
      <div id="acp-section-fields">{fieldsPanelInner}</div>
    )
  ) : null

  const timeSeriesChart = acp.config.panels.timeSeriesChart ? (
    <Suspense fallback={null}>
      <AcpTimeSeriesChart />
    </Suspense>
  ) : null

  const mapStage = (
    <section
      id="acp-section-map"
      className="acp-map-stage"
    >
        <AcpWeatherFieldProvider>
        <AcpWeatherAlertTicker />
        <AcpMapToolErrorBoundary>
          <Suspense fallback={<MapCanvasFallback />}>
            <AcpMapCanvas />
          </Suspense>
        </AcpMapToolErrorBoundary>
      </AcpWeatherFieldProvider>
      {!compact ? (
        <AcpMapToolbar
          ref={mapToolbarRef}
          layout="overlay"
          onPanelOpen={onMapPanelOpen}
          onActivePanelChange={setActiveMapPanel}
        />
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
      {!compact ? timeSeriesChart : null}
    </section>
  )

  return (
    <div className={shellClass}>
      <AcpHeaderBar kpiTotals={displayKpiTotals} />

      {compact ? (
        <>
          <div className="acp-compact-main">
            {mapStage}
            {fieldsPanel}
            {showRight ? (
              <div className="acp-compact-section acp-compact-section--insights">{insightsPanel}</div>
            ) : null}
            {timeSeriesChart}
          </div>
          <AcpMapToolbar
            ref={mapToolbarRef}
            layout="docked"
            onPanelOpen={onMapPanelOpen}
            onActivePanelChange={setActiveMapPanel}
          />
          <AcpSectionNav showFields={showFields} showRight={showRight} />
        </>
      ) : (
        <>
          {fieldsPanel}
          {mapStage}
          {insightsPanel}
        </>
      )}

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
