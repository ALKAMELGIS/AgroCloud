import { useAcpPlatform } from '../acpPlatformContext'
import { ACP_WMS_LAYER_CATALOG, normalizeAcpWmsLayerId } from '../acpWmsLayerCatalog'
import { AcpMapPanel } from './AcpMapPanel'

export function AcpWmsIndexGrid() {
  const acp = useAcpPlatform()

  return (
    <div className="acp-map-panel__wms-grid">
      {ACP_WMS_LAYER_CATALOG.map(layer => {
        const id = layer.id
        const active = acp.activeWmsLayers.some(l => normalizeAcpWmsLayerId(l) === id)
        const isPrimary = normalizeAcpWmsLayerId(acp.selectedWmsLayer) === id
        return (
          <button
            key={id}
            type="button"
            className={`acp-map-panel__wms-btn${active ? ' is-on' : ''}${isPrimary ? ' is-primary' : ''}`}
            aria-pressed={active}
            onClick={() => {
              if (!acp.layerVisibility.sentinelWms) acp.setCoreLayerVisible('sentinelWms', true)
              if (active) acp.setPrimaryWmsLayer(id)
              else acp.setSelectedWmsLayer(id)
            }}
            title={id === 'CHAS_ALERT' ? 'CHAS Alert — derived 4-level overlay' : undefined}
          >
            <span className="acp-map-panel__wms-letter">{layer.letter}</span>
            <span>{layer.label}</span>
          </button>
        )
      })}
    </div>
  )
}

type Props = { onClose: () => void }

/** @deprecated Use Layers flyout — kept for reuse of AcpWmsIndexGrid. */
export function AcpWmsIndexFlyout({ onClose }: Props) {
  return (
    <AcpMapPanel title="WMS indices" onClose={onClose}>
      <AcpWmsIndexGrid />
    </AcpMapPanel>
  )
}

export { AcpLayerLiveDropdown } from './AcpLayerLiveDropdown'
