import { useMemo } from 'react'
import { getGisContentMapRegistry, useGisContentPortal } from '../../../../lib/gisContentPortalStore'
import { isAgroStructuresPortalRow } from '../../../../lib/gisHostedFeatureLayerPortal'
import { useAcpPlatform } from '../acpPlatformContext'
import { AcpMapPanel } from './AcpMapPanel'
import { AcpWmsIndexGrid } from './AcpWmsIndexFlyout'
import { isAcpExcludedPortalMapRow } from './acpPortalMapLayers'

type Props = { onClose: () => void }

export function AcpMapLayersFlyout({ onClose }: Props) {
  const acp = useAcpPlatform()
  const portal = useGisContentPortal()
  const registry = useMemo(() => getGisContentMapRegistry(), [portal.version])
  const { layerVisibility } = acp

  return (
    <AcpMapPanel title="Layers" onClose={onClose}>
      <ul className="acp-map-panel__layer-list">
        <li>
          <label className="acp-map-panel__layer-row acp-map-panel__layer-row--sentinel">
            <input
              type="checkbox"
              checked={layerVisibility.sentinelWms}
              onChange={e => acp.setCoreLayerVisible('sentinelWms', e.target.checked)}
              aria-label="Show imagery layer on map"
            />
            <span>Show on map · Sentinel {acp.selectedWmsLayer}</span>
          </label>
        </li>
        <li className="acp-map-panel__layer-section">
          <span className="acp-map-panel__layer-section-label">Sentinel index</span>
          <AcpWmsIndexGrid />
        </li>
        <li>
          <label className="acp-map-panel__layer-row">
            <input
              type="checkbox"
              checked={layerVisibility.liveAlertTicker}
              onChange={e => acp.setCoreLayerVisible('liveAlertTicker', e.target.checked)}
              aria-label="Show Live Alert weather ticker bar"
            />
            <span>Live Alert · ticker bar</span>
          </label>
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
        {registry.activeItemIds.map(id => {
          const row = portal.rows.find(r => r.id === id)
          if (!row || isAcpExcludedPortalMapRow(row)) return null
          const isAgroStructures = isAgroStructuresPortalRow(row)
          const visible = acp.isPortalLayerVisible(id)
          return (
            <li key={id}>
              <label className="acp-map-panel__layer-row">
                <input
                  type="checkbox"
                  checked={visible}
                  onChange={e => {
                    const on = e.target.checked
                    acp.setPortalLayerVisible(id, on)
                    if (isAgroStructures) acp.setCoreLayerVisible('aoi', on)
                  }}
                />
                <span>{row.title}</span>
              </label>
            </li>
          )
        })}
      </ul>
    </AcpMapPanel>
  )
}
