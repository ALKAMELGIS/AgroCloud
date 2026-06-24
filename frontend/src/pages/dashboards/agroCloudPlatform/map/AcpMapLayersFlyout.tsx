import { useMemo } from 'react'
import { getGisContentMapRegistry, useGisContentPortal } from '../../../../lib/gisContentPortalStore'
import { useAcpPlatform } from '../acpPlatformContext'
import { AcpMapPanel } from './AcpMapPanel'
import { AcpLayerLiveDropdown } from './AcpLayerLiveDropdown'
import { AcpPortalLayerControls } from './AcpPortalLayerControls'

type Props = { onClose: () => void }

export function AcpMapLayersFlyout({ onClose }: Props) {
  const acp = useAcpPlatform()
  const portal = useGisContentPortal()
  const registry = useMemo(() => getGisContentMapRegistry(), [portal.version])
  const { layerVisibility } = acp

  return (
    <AcpMapPanel title="Layers" onClose={onClose} className="acp-map-panel--layers">
      <ul className="acp-map-panel__layer-list">
        <li>
          <label className="acp-map-panel__layer-row acp-map-panel__layer-row--sentinel">
            <input
              type="checkbox"
              checked={layerVisibility.sentinelWms}
              onChange={e => acp.setCoreLayerVisible('sentinelWms', e.target.checked)}
              aria-label="Show imagery layer on map"
            />
            <span>Show on map · {acp.activeWmsLayers.join(' + ') || acp.selectedWmsLayer}</span>
          </label>
        </li>
        <li className="acp-map-panel__layer-section acp-map-panel__layer-section--layer-live">
          <span className="acp-map-panel__layer-section-label">Layer Live</span>
          <AcpLayerLiveDropdown variant="panel" />
        </li>
        <li>
          <label className="acp-map-panel__layer-row">
            <input
              type="checkbox"
              checked={layerVisibility.weatherAlerts}
              onChange={e => acp.setCoreLayerVisible('weatherAlerts', e.target.checked)}
            />
            <span>Weather · map markers &amp; AOI</span>
          </label>
        </li>
        <li>
          <label className="acp-map-panel__layer-row">
            <input
              type="checkbox"
              checked={layerVisibility.liveChas}
              onChange={e => acp.setCoreLayerVisible('liveChas', e.target.checked)}
            />
            <span>Live Alerts · map markers</span>
          </label>
        </li>
        {registry.activeItemIds.length ? (
          <li className="acp-map-panel__layer-section">
            <span className="acp-map-panel__layer-section-label">Added GIS layers</span>
            <AcpPortalLayerControls />
          </li>
        ) : null}
      </ul>
    </AcpMapPanel>
  )
}
