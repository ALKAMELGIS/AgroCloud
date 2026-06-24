import { useMemo } from 'react'
import {
  getGisContentMapRegistry,
  reorderGisContentMapLayers,
  unregisterGisContentMapLayer,
  updateGisContentMapLayerConfig,
  useGisContentPortal,
} from '../../../../lib/gisContentPortalStore'
import { isAcpOgcRasterPortalRow, readAcpOgcLayerMetaForRow } from '../../../../lib/acpOgcLayerMeta'
import { isAgroStructuresPortalRow } from '../../../../lib/gisHostedFeatureLayerPortal'
import { useAcpPlatform } from '../acpPlatformContext'
import { isAcpExcludedPortalMapRow } from './acpPortalMapLayers'

export function AcpPortalLayerControls() {
  const acp = useAcpPlatform()
  const portal = useGisContentPortal()
  const registry = useMemo(() => getGisContentMapRegistry(), [portal.version])

  const managedIds = registry.activeItemIds.filter(id => {
    const row = portal.rows.find(r => r.id === id)
    return row && !isAcpExcludedPortalMapRow(row)
  })

  if (!managedIds.length) {
    return <p className="acp-map-panel__empty">No added GIS layers yet. Use + Add data.</p>
  }

  const moveLayer = (id: string, direction: -1 | 1) => {
    const idx = managedIds.indexOf(id)
    if (idx < 0) return
    const target = idx + direction
    if (target < 0 || target >= managedIds.length) return
    const next = [...managedIds]
    const [item] = next.splice(idx, 1)
    next.splice(target, 0, item!)
    reorderGisContentMapLayers(next)
  }

  return (
    <ul className="acp-gis-layer-manager">
      {managedIds.map((id, index) => {
        const row = portal.rows.find(r => r.id === id)
        if (!row) return null
        const config = registry.configs[id] ?? { visible: true, opacity: 1, order: index }
        const isAgroStructures = isAgroStructuresPortalRow(row)
        const isOgc = isAcpOgcRasterPortalRow(row)
        const ogcMeta = isOgc ? readAcpOgcLayerMetaForRow(row) : null
        const visible = acp.isPortalLayerVisible(id)
        const filter = acp.portalLayerFilters[id]
        const isSelected = acp.selectedPortalFeature?.layerId === id

        return (
          <li key={id} className={`acp-gis-layer-manager__item${isSelected ? ' is-selected' : ''}`}>
            <div className="acp-gis-layer-manager__head">
              <label className="acp-gis-layer-manager__visible">
                <input
                  type="checkbox"
                  checked={visible}
                  onChange={e => {
                    const on = e.target.checked
                    acp.setPortalLayerVisible(id, on)
                    updateGisContentMapLayerConfig(id, { visible: on })
                    if (isAgroStructures) acp.setCoreLayerVisible('aoi', on)
                  }}
                  aria-label={`Toggle ${row.title}`}
                />
                <span>{row.title}</span>
              </label>
              <div className="acp-gis-layer-manager__order">
                <button type="button" disabled={index === 0} onClick={() => moveLayer(id, -1)} aria-label="Move up">
                  <i className="fa-solid fa-chevron-up" aria-hidden />
                </button>
                <button
                  type="button"
                  disabled={index === managedIds.length - 1}
                  onClick={() => moveLayer(id, 1)}
                  aria-label="Move down"
                >
                  <i className="fa-solid fa-chevron-down" aria-hidden />
                </button>
                <button
                  type="button"
                  className="acp-gis-layer-manager__remove"
                  aria-label={`Remove ${row.title}`}
                  onClick={() => {
                    unregisterGisContentMapLayer(id)
                    acp.setPortalLayerAttributeFilter(id, null)
                    if (acp.selectedPortalFeature?.layerId === id) acp.setSelectedPortalFeature(null)
                  }}
                >
                  <i className="fa-solid fa-trash-can" aria-hidden />
                </button>
              </div>
            </div>

            <label className="acp-gis-layer-manager__opacity">
              <span>Opacity {Math.round((config.opacity ?? 1) * 100)}%</span>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round((config.opacity ?? 1) * 100)}
                onChange={e =>
                  updateGisContentMapLayerConfig(id, { opacity: Number(e.target.value) / 100 })
                }
              />
            </label>

            {isOgc && ogcMeta ? (
              <p className="acp-gis-layer-manager__meta">
                {ogcMeta.dataFormat.toUpperCase()} · {ogcMeta.layerName}
              </p>
            ) : (
              <div className="acp-gis-layer-manager__filter">
                <span>Filter</span>
                <input
                  type="text"
                  placeholder="Field"
                  value={filter?.property ?? ''}
                  onChange={e =>
                    acp.setPortalLayerAttributeFilter(id, {
                      property: e.target.value,
                      value: filter?.value ?? '',
                    })
                  }
                />
                <input
                  type="text"
                  placeholder="Value"
                  value={filter?.value ?? ''}
                  onChange={e =>
                    acp.setPortalLayerAttributeFilter(id, {
                      property: filter?.property ?? '',
                      value: e.target.value,
                    })
                  }
                />
              </div>
            )}

            {isSelected && acp.selectedPortalFeature ? (
              <p className="acp-gis-layer-manager__pick" role="status">
                Selected feature on map
              </p>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
