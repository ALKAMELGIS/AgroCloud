import { useCallback } from 'react'
import type { GisContentMapLayerConfig } from '../../lib/gisContentRepository'
import {
  registerGisContentMapLayer,
  unregisterGisContentMapLayer,
  updateGisContentMapLayerConfig,
  useGisContentPortal,
} from '../../lib/gisContentPortalStore'
import './GisContentMapLayerPanel.css'

type Props = {
  itemId: string
  title: string
  mapAddable: boolean
  onToast?: (message: string) => void
}

export function GisContentMapLayerPanel({ itemId, title, mapAddable, onToast }: Props) {
  const portal = useGisContentPortal()
  const registry = portal.getMapRegistry()
  const config = portal.getMapLayerConfig(itemId)
  const isOnMap = registry.activeItemIds.includes(itemId) && config.visible

  const patch = useCallback(
    (next: Partial<GisContentMapLayerConfig>) => {
      updateGisContentMapLayerConfig(itemId, next)
    },
    [itemId],
  )

  const toggleMap = useCallback(() => {
    if (!mapAddable) {
      onToast?.('This item type cannot be shown on the map.')
      return
    }
    if (isOnMap) {
      unregisterGisContentMapLayer(itemId)
      onToast?.(`"${title}" removed from active map layers.`)
    } else {
      registerGisContentMapLayer(itemId)
      onToast?.(`"${title}" added to the map — changes sync to dashboards instantly.`)
    }
  }, [isOnMap, itemId, mapAddable, onToast, title])

  if (!mapAddable) {
    return (
      <p className="gis-map-layer-panel__muted">
        Map symbology is available for feature layers, web maps, scenes, and 3D layers.
      </p>
    )
  }

  return (
    <div className="gis-map-layer-panel">
      <div className="gis-map-layer-panel__row">
        <label className="gis-map-layer-panel__toggle">
          <input type="checkbox" checked={isOnMap} onChange={toggleMap} />
          <span>Show on map & dashboards</span>
        </label>
      </div>

      {isOnMap ? (
        <>
          <div className="gis-map-layer-panel__field">
            <label htmlFor={`gis-opacity-${itemId}`}>Opacity</label>
            <input
              id={`gis-opacity-${itemId}`}
              type="range"
              min={0}
              max={100}
              value={Math.round(config.opacity * 100)}
              onChange={e => patch({ opacity: Number(e.target.value) / 100 })}
            />
            <span className="gis-map-layer-panel__value">{Math.round(config.opacity * 100)}%</span>
          </div>

          <div className="gis-map-layer-panel__grid">
            <div className="gis-map-layer-panel__field">
              <label htmlFor={`gis-minzoom-${itemId}`}>Min zoom</label>
              <input
                id={`gis-minzoom-${itemId}`}
                type="number"
                min={0}
                max={22}
                step={0.5}
                value={config.minZoom ?? ''}
                placeholder="Any"
                onChange={e => {
                  const raw = e.target.value.trim()
                  patch({ minZoom: raw ? Number(raw) : undefined })
                }}
              />
            </div>
            <div className="gis-map-layer-panel__field">
              <label htmlFor={`gis-maxzoom-${itemId}`}>Max zoom</label>
              <input
                id={`gis-maxzoom-${itemId}`}
                type="number"
                min={0}
                max={22}
                step={0.5}
                value={config.maxZoom ?? ''}
                placeholder="Any"
                onChange={e => {
                  const raw = e.target.value.trim()
                  patch({ maxZoom: raw ? Number(raw) : undefined })
                }}
              />
            </div>
          </div>

          <div className="gis-map-layer-panel__grid">
            <div className="gis-map-layer-panel__field">
              <label htmlFor={`gis-fill-${itemId}`}>Fill color</label>
              <input
                id={`gis-fill-${itemId}`}
                type="color"
                value={toHexColor(config.style?.fillColor, '#34d399')}
                onChange={e => patch({ style: { ...config.style, fillColor: e.target.value } })}
              />
            </div>
            <div className="gis-map-layer-panel__field">
              <label htmlFor={`gis-stroke-${itemId}`}>Stroke color</label>
              <input
                id={`gis-stroke-${itemId}`}
                type="color"
                value={toHexColor(config.style?.strokeColor, '#1b5e3c')}
                onChange={e => patch({ style: { ...config.style, strokeColor: e.target.value } })}
              />
            </div>
          </div>

          <div className="gis-map-layer-panel__field">
            <label htmlFor={`gis-stroke-width-${itemId}`}>Stroke width</label>
            <input
              id={`gis-stroke-width-${itemId}`}
              type="number"
              min={0.5}
              max={8}
              step={0.5}
              value={config.style?.strokeWidth ?? 1.5}
              onChange={e => patch({ style: { ...config.style, strokeWidth: Number(e.target.value) } })}
            />
          </div>

          <p className="gis-map-layer-panel__hint">
            Changes apply immediately on Map Canvas, Intelligence Dashboard, Satellite Intelligence, and AOI tools.
          </p>
        </>
      ) : null}
    </div>
  )
}

function toHexColor(value: string | undefined, fallback: string): string {
  if (!value) return fallback
  if (value.startsWith('#') && (value.length === 7 || value.length === 4)) return value.slice(0, 7)
  return fallback
}
