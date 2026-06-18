import { useAcpPlatform } from '../acpPlatformContext'
import { AcpMapPanel } from './AcpMapPanel'

const WMS_INDICES = [
  { id: 'NDVI', letter: 'N' },
  { id: 'NDMI', letter: 'N' },
  { id: 'NDWI', letter: 'N' },
  { id: 'EVI', letter: 'E' },
  { id: 'CHAS', letter: 'C' },
] as const

export function AcpWmsIndexGrid() {
  const acp = useAcpPlatform()

  return (
    <div className="acp-map-panel__wms-grid">
      {WMS_INDICES.map(({ id, letter }) => (
        <button
          key={id}
          type="button"
          className={`acp-map-panel__wms-btn${acp.selectedWmsLayer === id ? ' is-on' : ''}`}
          aria-pressed={acp.selectedWmsLayer === id}
          onClick={() => acp.setSelectedWmsLayer(id)}
        >
          <span className="acp-map-panel__wms-letter">{letter}</span>
          <span>{id}</span>
        </button>
      ))}
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
