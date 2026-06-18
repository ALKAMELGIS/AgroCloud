import { lazy, Suspense, useCallback, useMemo, useState } from 'react'
import { useGisContentPortal } from '../../../../lib/gisContentPortalStore'
import { useAcpPlatform } from '../acpPlatformContext'
import { addAcpGisPortalRowToMap } from './acpGisPortalActions'
import { isAcpExcludedPortalMapRow } from './acpPortalMapLayers'
import { AcpEsriBasemapFlyout } from './AcpEsriBasemapFlyout'
import { AcpMapLayersFlyout } from './AcpMapLayersFlyout'
import { AcpMapLegendFlyout } from './AcpMapLegendFlyout'
import { AcpMapPanel } from './AcpMapPanel'

const AcpImageryTimeSeriesPanel = lazy(() =>
  import('./AcpImageryTimeSeriesPanel').then(m => ({ default: m.AcpImageryTimeSeriesPanel })),
)

type AcpMapPanelId = 'adddata' | 'legend' | 'layers' | 'basemap' | 'timeseries'

function AcpMapToolPanel({ panel, onClose }: { panel: AcpMapPanelId; onClose: () => void }) {
  switch (panel) {
    case 'adddata':
      return <AcpAddDataPanel onClose={onClose} />
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
}

export function AcpMapToolbar() {
  const acp = useAcpPlatform()
  const toolbar = acp.config.mapToolbar
  const [railCollapsed, setRailCollapsed] = useState(false)
  const [activePanel, setActivePanel] = useState<AcpMapPanelId | null>(null)

  const closePanel = useCallback(() => setActivePanel(null), [])

  const togglePanel = useCallback(
    (id: AcpMapPanelId) => {
      if (id === 'adddata' && !toolbar.addData) return
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

  return (
    <div className="acp-map-chrome">
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
          <i
            className={`fa-solid ${railCollapsed ? 'fa-chevrons-down' : 'fa-chevrons-up'}`}
            aria-hidden="true"
          />
        </button>

        <nav className="acp-map-rail acp-map-toolbar__tools" aria-label="Map tools" hidden={railCollapsed}>
          {toolbar.addData ? (
            <button
              type="button"
              className={`acp-map-rail__btn${activePanel === 'adddata' ? ' is-on' : ''}`}
              title="Add data"
              aria-pressed={activePanel === 'adddata'}
              onClick={() => togglePanel('adddata')}
            >
              <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
            </button>
          ) : null}
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
        </nav>
      </div>
    </div>
  )
}

function AcpAddDataPanel({ onClose }: { onClose: () => void }) {
  const portal = useGisContentPortal()
  const acp = useAcpPlatform()
  const layers = useMemo(
    () => portal.rows.filter(r => r.type === 'feature-layer' && !isAcpExcludedPortalMapRow(r)),
    [portal.rows],
  )
  const [addingId, setAddingId] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  const onAdd = useCallback(
    (row: (typeof layers)[number]) => {
      setAddingId(row.id)
      setStatus(null)
      void (async () => {
        try {
          const result = await addAcpGisPortalRowToMap(row)
          if (result.isAgroStructures) acp.refreshEngine()
          else if (result.geojson) acp.mapFocusGeoJsonRef.current?.(result.geojson)
          setStatus(result.message)
          onClose()
        } catch (err) {
          setStatus(err instanceof Error ? err.message : `Failed to add "${row.title}".`)
        } finally {
          setAddingId(null)
        }
      })()
    },
    [acp, onClose],
  )

  return (
    <AcpMapPanel title="Add data" onClose={onClose}>
      <ul className="acp-map-panel__add-list">
        {layers.map(row => (
          <li key={row.id}>
            <button type="button" disabled={addingId === row.id} onClick={() => onAdd(row)}>
              {addingId === row.id ? 'Adding…' : row.title}
            </button>
          </li>
        ))}
      </ul>
      {!layers.length ? <p className="acp-map-panel__empty">No hosted layers.</p> : null}
      {status ? (
        <p className="acp-map-panel__empty" role="status">
          {status}
        </p>
      ) : null}
    </AcpMapPanel>
  )
}
