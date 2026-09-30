import { useEffect, useMemo } from 'react'
import type { AgroCloudDashboardConfig, AgroCloudDashboardElementKind } from './agroCloudDashboardData'
import {
  listDashboardLayerOptions,
  type DashboardLayerOption,
  widgetKindNeedsLayerSelection,
} from './agroCloudDashboardLayerSelection'

export type SelectLayerModalProps = {
  open: boolean
  widgetKind: AgroCloudDashboardElementKind | null
  config: AgroCloudDashboardConfig
  /** Render above another dashboard modal (e.g. indicator configure). */
  stacked?: boolean
  onClose: () => void
  onSelectLayer: (option: DashboardLayerOption) => void
  onBrowseAllLayers: () => void
  onNewDataExpression: () => void
}

function emptyStateMessage(kind: AgroCloudDashboardElementKind | null): { title: string; lead: string } {
  if (kind === 'map') {
    return {
      title: 'No layers yet.',
      lead: 'Add a map to your dashboard to visualize data from its layers, or select an option below.',
    }
  }
  return {
    title: 'No layers yet.',
    lead: 'Add a map to your dashboard to visualize data from its layers, or select an option below.',
  }
}

export function SelectLayerModal({
  open,
  widgetKind,
  config,
  stacked = false,
  onClose,
  onSelectLayer,
  onBrowseAllLayers,
  onNewDataExpression,
}: SelectLayerModalProps) {
  const layerOptions = useMemo(
    () => (open ? listDashboardLayerOptions(config) : []),
    [config, open],
  )

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !widgetKind || !widgetKindNeedsLayerSelection(widgetKind)) return null

  const { title, lead } = emptyStateMessage(widgetKind)
  const hasLayers = layerOptions.length > 0

  return (
    <div
      className={`agrocloud-select-layer-backdrop${stacked ? ' agrocloud-select-layer-backdrop--stacked' : ''}`}
      role="presentation"
      onClick={onClose}
    >
      <div
        className="agrocloud-select-layer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="agrocloud-select-layer-title"
        onClick={e => e.stopPropagation()}
      >
        <header className="agrocloud-select-layer__header">
          <h2 id="agrocloud-select-layer-title">Select a layer</h2>
          <button type="button" className="agrocloud-select-layer__close" aria-label="Close" onClick={onClose}>
            <i className="fa-solid fa-xmark" aria-hidden />
          </button>
        </header>

        <div className="agrocloud-select-layer__body">
          {hasLayers ? (
            <div className="agrocloud-select-layer__list-wrap">
              <p className="agrocloud-select-layer__list-lead">
                Choose a layer from your dashboard data sources, or browse GIS Content below.
              </p>
              <ul className="agrocloud-select-layer__list" role="listbox" aria-label="Dashboard layers">
                {layerOptions.map(option => (
                  <li key={`${option.dataSourceId}:${option.layerId}`}>
                    <button
                      type="button"
                      className="agrocloud-select-layer__list-item"
                      role="option"
                      onClick={() => onSelectLayer(option)}
                    >
                      <span className="agrocloud-select-layer__list-item-name">{option.layerName}</span>
                      <span className="agrocloud-select-layer__list-item-source">{option.sourceTitle}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="agrocloud-select-layer__actions agrocloud-select-layer__actions--inline">
                <button type="button" className="agrocloud-select-layer__btn-outline" onClick={onBrowseAllLayers}>
                  Browse all layers
                </button>
                <button type="button" className="agrocloud-select-layer__btn-outline" onClick={onNewDataExpression}>
                  New data expression
                </button>
              </div>
            </div>
          ) : (
            <div className="agrocloud-select-layer__empty">
              <h3 className="agrocloud-select-layer__empty-title">{title}</h3>
              <p className="agrocloud-select-layer__empty-lead">{lead}</p>
              <div className="agrocloud-select-layer__actions">
                <button type="button" className="agrocloud-select-layer__btn-outline" onClick={onBrowseAllLayers}>
                  Browse all layers
                </button>
                <button type="button" className="agrocloud-select-layer__btn-outline" onClick={onNewDataExpression}>
                  New data expression
                </button>
              </div>
            </div>
          )}
        </div>

        <footer className="agrocloud-select-layer__footer">
          <button type="button" className="agrocloud-select-layer__btn-cancel" onClick={onClose}>
            Cancel
          </button>
        </footer>
      </div>
    </div>
  )
}
