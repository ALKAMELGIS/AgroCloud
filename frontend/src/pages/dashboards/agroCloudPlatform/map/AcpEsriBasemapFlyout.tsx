import { useMemo } from 'react'
import { getBasemapThumbnail, listEsriBasemapEntries, resolveBasemapId } from '../../../satellite/basemapCatalog'
import { useAcpPlatform } from '../acpPlatformContext'
import { AcpMapPanel } from './AcpMapPanel'

type Props = { onClose: () => void }

export function AcpEsriBasemapFlyout({ onClose }: Props) {
  const acp = useAcpPlatform()
  const entries = useMemo(() => listEsriBasemapEntries(), [])
  const activeId = resolveBasemapId(acp.config.basemapId)

  return (
    <AcpMapPanel title="Basemap" onClose={onClose}>
      <div className="acp-map-panel__basemap-grid">
        {entries.map(entry => {
          const thumb = getBasemapThumbnail(entry, '')
          const selected = activeId === entry.id
          return (
            <button
              key={entry.id}
              type="button"
              className={`acp-map-panel__basemap${selected ? ' is-on' : ''}`}
              aria-pressed={selected}
              onClick={() => acp.applyConfig({ basemapId: entry.id })}
            >
              <img src={thumb} alt="" loading="lazy" />
              <span>{entry.label}</span>
            </button>
          )
        })}
      </div>
    </AcpMapPanel>
  )
}
