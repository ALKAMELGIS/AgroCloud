import {
  forwardRef,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useImperativeHandle,
  useState,
} from 'react'
import { useAcpPlatform } from '../acpPlatformContext'
import { AcpAddGisLayerPanel } from './AcpAddGisLayerPanel'
import { AcpEsriBasemapFlyout } from './AcpEsriBasemapFlyout'
import { AcpMapLayersFlyout } from './AcpMapLayersFlyout'
import { AcpMapLegendFlyout } from './AcpMapLegendFlyout'
import { AcpMapPanel } from './AcpMapPanel'
import { AcpMapSearchPanel } from './AcpMapSearchPanel'
import { AcpMapToolErrorBoundary } from './AcpMapToolErrorBoundary'
import { AcpHideToolbarIcon } from './AcpHideToolbarIcon'

const AcpImageryTimeSeriesPanel = lazy(() =>
  import('./AcpImageryTimeSeriesPanel').then(m => ({ default: m.AcpImageryTimeSeriesPanel })),
)

type AcpMapPanelId = 'search' | 'adddata' | 'legend' | 'layers' | 'basemap' | 'timeseries'

export type { AcpMapPanelId }

export type AcpMapToolbarHandle = {
  closePanel: () => void
}

export type AcpMapToolbarLayout = 'overlay' | 'docked'

type AcpMapToolbarProps = {
  layout?: AcpMapToolbarLayout
  onPanelOpen?: () => void
  onActivePanelChange?: (panel: AcpMapPanelId | null) => void
}

function AcpMapToolPanel({ panel, onClose }: { panel: AcpMapPanelId; onClose: () => void }) {
  const body = (() => {
    switch (panel) {
      case 'search':
        return <AcpMapSearchPanel onClose={onClose} />
      case 'adddata':
        return <AcpAddGisLayerPanel onClose={onClose} />
      case 'legend':
        return <AcpMapLegendFlyout onClose={onClose} />
      case 'layers':
        return <AcpMapLayersFlyout onClose={onClose} />
      case 'basemap':
        return <AcpEsriBasemapFlyout onClose={onClose} />
      case 'timeseries':
        return (
          <Suspense fallback={<p className="acp-map-panel__empty">Loading chart…</p>}>
            <AcpImageryTimeSeriesPanel onClose={onClose} />
          </Suspense>
        )
      default:
        return null
    }
  })()

  return <AcpMapToolErrorBoundary>{body}</AcpMapToolErrorBoundary>
}

export const AcpMapToolbar = forwardRef<AcpMapToolbarHandle, AcpMapToolbarProps>(function AcpMapToolbar(
  { layout = 'overlay', onPanelOpen, onActivePanelChange },
  ref,
) {
  const acp = useAcpPlatform()
  const toolbar = acp.config.mapToolbar
  const docked = layout === 'docked'
  const [railCollapsed, setRailCollapsed] = useState(false)
  const [activePanel, setActivePanel] = useState<AcpMapPanelId | null>(null)

  const closePanel = useCallback(() => setActivePanel(null), [])

  useImperativeHandle(ref, () => ({ closePanel }), [closePanel])

  useEffect(() => {
    onActivePanelChange?.(activePanel)
  }, [activePanel, onActivePanelChange])

  useEffect(() => {
    if (activePanel) onPanelOpen?.()
  }, [activePanel, onPanelOpen])

  const togglePanel = useCallback(
    (id: AcpMapPanelId) => {
      if (id === 'search' && !toolbar.search) return
      if (id === 'legend' && !toolbar.legend) return
      if (id === 'layers' && !toolbar.layers) return
      if (id === 'basemap' && !toolbar.basemap) return
      if (id === 'timeseries' && !toolbar.timeSeries) return
      setActivePanel(prev => (prev === id ? null : id))
    },
    [toolbar],
  )

  const goHome = useCallback(() => {
    acp.mapHomeRef.current?.()
  }, [acp.mapHomeRef])

  const toggleRail = useCallback(() => {
    setRailCollapsed(prev => {
      if (!prev) setActivePanel(null)
      return !prev
    })
  }, [])

  const railButtons = (
    <>
      {toolbar.search ? (
        <button
          type="button"
          className={`acp-map-rail__btn${activePanel === 'search' ? ' is-on' : ''}`}
          title="Search map"
          aria-label="Search map"
          aria-pressed={activePanel === 'search'}
          onClick={() => togglePanel('search')}
        >
          <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
        </button>
      ) : null}
      <button
        type="button"
        className={`acp-map-rail__btn${activePanel === 'adddata' ? ' is-on' : ''}`}
        title="Add GIS Layer Data"
        aria-label="Add GIS Layer Data"
        aria-pressed={activePanel === 'adddata'}
        onClick={() => togglePanel('adddata')}
      >
        <i className="fa-solid fa-circle-plus" aria-hidden="true" />
      </button>
      {toolbar.legend ? (
        <button
          type="button"
          className={`acp-map-rail__btn${activePanel === 'legend' ? ' is-on' : ''}`}
          title="Legend"
          aria-pressed={activePanel === 'legend'}
          onClick={() => togglePanel('legend')}
        >
          <i className="fa-solid fa-swatchbook" aria-hidden="true" />
        </button>
      ) : null}
      {toolbar.home ? (
        <button type="button" className="acp-map-rail__btn" title="Home" onClick={goHome}>
          <i className="fa-solid fa-house" aria-hidden="true" />
        </button>
      ) : null}
      {toolbar.view3d ? (
        <button
          type="button"
          className={`acp-map-rail__btn${acp.mapViewMode3d ? ' is-on' : ''}`}
          title={acp.mapViewMode3d ? 'Switch to 2D map' : 'Switch to 3D map (right-drag to orbit)'}
          aria-label={acp.mapViewMode3d ? 'Switch to 2D map' : 'Switch to 3D map'}
          aria-pressed={acp.mapViewMode3d}
          onClick={acp.toggleMapViewMode3d}
        >
          <i
            className={`fa-solid ${acp.mapViewMode3d ? 'fa-map' : 'fa-cube'}`}
            aria-hidden="true"
          />
        </button>
      ) : null}
      {toolbar.layers ? (
        <button
          type="button"
          className={`acp-map-rail__btn${activePanel === 'layers' ? ' is-on' : ''}`}
          title="Layers"
          aria-pressed={activePanel === 'layers'}
          onClick={() => togglePanel('layers')}
        >
          <i className="fa-solid fa-layer-group" aria-hidden="true" />
        </button>
      ) : null}
      {toolbar.basemap ? (
        <button
          type="button"
          className={`acp-map-rail__btn${activePanel === 'basemap' ? ' is-on' : ''}`}
          title="Basemap"
          aria-pressed={activePanel === 'basemap'}
          onClick={() => togglePanel('basemap')}
        >
          <i className="fa-solid fa-map" aria-hidden="true" />
        </button>
      ) : null}
      {toolbar.timeSeries ? (
        <button
          type="button"
          className={`acp-map-rail__btn${activePanel === 'timeseries' ? ' is-on' : ''}`}
          title="Imagery Time Series"
          aria-pressed={activePanel === 'timeseries'}
          onClick={() => togglePanel('timeseries')}
        >
          <i className="fa-solid fa-chart-line" aria-hidden="true" />
        </button>
      ) : null}
    </>
  )

  if (docked) {
    return (
      <>
        {activePanel ? (
          <div className="acp-tool-panel-slot" role="region" aria-label="Map tool panel">
            <AcpMapToolPanel panel={activePanel} onClose={closePanel} />
          </div>
        ) : null}
        <div className="acp-tools-dock">
          <button
            type="button"
            className="acp-map-rail__btn acp-map-rail__btn--toggle acp-map-rail__btn--toggle-dock"
            title={railCollapsed ? 'Show map tools' : 'Hide toolbar'}
            aria-label={railCollapsed ? 'Show map tools' : 'Hide toolbar'}
            aria-expanded={!railCollapsed}
            onClick={toggleRail}
          >
            <AcpHideToolbarIcon collapsed={railCollapsed} />
          </button>
          <nav
            className="acp-map-rail acp-tools-dock__rail"
            aria-label="Map tools"
            hidden={railCollapsed}
          >
            {railButtons}
          </nav>
        </div>
      </>
    )
  }

  return (
    <div
      className={[
        'acp-map-chrome',
        activePanel ? ' acp-map-chrome--panel-open' : '',
      ].join('')}
    >
      {activePanel && !railCollapsed ? (
        <div className="acp-map-tool-panel">
          <AcpMapToolPanel panel={activePanel} onClose={closePanel} />
        </div>
      ) : null}

      <div className={`acp-map-toolbar${railCollapsed ? ' acp-map-toolbar--closed' : ''}`}>
        <button
          type="button"
          className="acp-map-rail__btn acp-map-rail__btn--toggle"
          title={railCollapsed ? 'Show map tools' : 'Hide toolbar'}
          aria-label={railCollapsed ? 'Show map tools' : 'Hide toolbar'}
          aria-expanded={!railCollapsed}
          onClick={toggleRail}
        >
          <AcpHideToolbarIcon collapsed={railCollapsed} />
        </button>

        <nav className="acp-map-rail acp-map-toolbar__tools" aria-label="Map tools" hidden={railCollapsed}>
          {railButtons}
        </nav>
      </div>
    </div>
  )
})
