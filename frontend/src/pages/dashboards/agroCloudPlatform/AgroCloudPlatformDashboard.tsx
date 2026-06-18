import './AgroCloudPlatformDashboard.css'
import { lazy, Suspense, useEffect } from 'react'
import { AcpPlatformProvider } from './acpPlatformContext'
import { useAcpDashboardEngine } from './useAcpDashboardEngine'
import { AcpHeaderBar } from './panels/AcpHeaderBar'
import { AcpFieldsPanel } from './panels/AcpFieldsPanel'
import { AcpDecisionPanel } from './panels/AcpDecisionPanel'
import { AcpLiveAlertsPanel } from './panels/AcpLiveAlertsPanel'
import { AcpAnalyticsPanel } from './panels/AcpAnalyticsPanel'
import { AcpMapToolbar } from './map/AcpMapToolbar'
import { AcpWeatherAlertTicker } from './map/AcpMapWeatherAlertTicker'
import { AcpWeatherFieldProvider } from './map/AcpWeatherFieldProvider'
import { useAcpPlatform } from './acpPlatformContext'
import { purgeWorldCountriesFromAcpMapRegistry } from './map/acpPortalMapLayers'

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

function AgroCloudPlatformBody() {
  const acp = useAcpPlatform()
  const {
    filteredRows,
    liveAlertRows,
    displayKpiTotals,
    viewportScopeActive,
    distributionRows,
    countries,
  } = useAcpDashboardEngine()

  useEffect(() => {
    purgeWorldCountriesFromAcpMapRegistry()
  }, [])

  return (
    <div className="acp-shell">
      <AcpHeaderBar kpiTotals={displayKpiTotals} />
      {acp.config.panels.fields ? (
        <AcpFieldsPanel rows={filteredRows} countries={countries} viewportScopeActive={viewportScopeActive} />
      ) : null}
      <section className="acp-map-stage">
        <AcpWeatherFieldProvider>
          <AcpWeatherAlertTicker />
          <Suspense fallback={<MapCanvasFallback />}>
            <AcpMapCanvas />
          </Suspense>
        </AcpWeatherFieldProvider>
        <AcpMapToolbar />
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
      <aside className="acp-panel acp-right">
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
            viewportScopeActive={viewportScopeActive}
          />
        ) : null}
      </aside>
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
