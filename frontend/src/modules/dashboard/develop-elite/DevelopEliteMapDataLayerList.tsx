import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DevelopEliteMapDataLayerId } from './developEliteDashboardConfig'
import {
  isDevelopEliteMapDataLayerVisible,
  moveMapDataLayerInOrder,
  orderDevelopEliteMapDataLayerDefs,
} from './developEliteMapDataLayers'
import {
  buildDevelopEliteMapLegendSections,
  developEliteMapDataLayerLegendPreviews,
} from './developEliteMapLegend'
import { DevelopEliteMapDataLayerSwatch } from './DevelopEliteMapLegendSwatch'
import { DevelopEliteMapDataLayerRowMenu } from './DevelopEliteMapDataLayerRowMenu'
import type { DevelopEliteMapSearchSources } from './developEliteMapSearch'
import type { DevelopEliteMapDataLayerDialogMode } from './DevelopEliteMapDataLayerActionDialogs'

type Props = {
  order: DevelopEliteMapDataLayerId[]
  visibility: Record<DevelopEliteMapDataLayerId, boolean>
  layerOpacity: Record<DevelopEliteMapDataLayerId, number>
  sources: DevelopEliteMapSearchSources
  serviceUrlForLayer: (id: DevelopEliteMapDataLayerId) => string
  drawingInfo?: Record<string, unknown> | null
  treesDrawingInfo?: Record<string, unknown> | null
  irrigationValvesDrawingInfo?: Record<string, unknown> | null
  irrigationMainPipeDrawingInfo?: Record<string, unknown> | null
  agriLocationDrawingInfo?: Record<string, unknown> | null
  onOrderChange: (order: DevelopEliteMapDataLayerId[]) => void
  onVisibilityChange: (id: DevelopEliteMapDataLayerId, visible: boolean) => void
  onLayerOpacityChange: (id: DevelopEliteMapDataLayerId, opacity: number) => void
  onOpenDialog: (mode: DevelopEliteMapDataLayerDialogMode, layerId: DevelopEliteMapDataLayerId) => void
  onStatus?: (message: string) => void
}

export function DevelopEliteMapDataLayerList({
  order,
  visibility,
  drawingInfo = null,
  treesDrawingInfo,
  irrigationValvesDrawingInfo,
  irrigationMainPipeDrawingInfo,
  agriLocationDrawingInfo,
  layerOpacity,
  sources,
  serviceUrlForLayer,
  onOrderChange,
  onVisibilityChange,
  onLayerOpacityChange,
  onOpenDialog,
  onStatus,
}: Props) {
  const layers = useMemo(() => orderDevelopEliteMapDataLayerDefs(order), [order])
  const legend = useMemo(
    () =>
      buildDevelopEliteMapLegendSections(
        drawingInfo,
        treesDrawingInfo,
        agriLocationDrawingInfo,
        irrigationValvesDrawingInfo,
        irrigationMainPipeDrawingInfo,
      ),
    [
      agriLocationDrawingInfo,
      drawingInfo,
      irrigationMainPipeDrawingInfo,
      irrigationValvesDrawingInfo,
      treesDrawingInfo,
    ],
  )
  const [dragId, setDragId] = useState<DevelopEliteMapDataLayerId | null>(null)
  const [dropTargetId, setDropTargetId] = useState<DevelopEliteMapDataLayerId | null>(null)
  const [optionsMenuLayerId, setOptionsMenuLayerId] = useState<DevelopEliteMapDataLayerId | null>(null)

  const finishDrag = useCallback(() => {
    setDragId(null)
    setDropTargetId(null)
  }, [])

  useEffect(() => {
    if (!optionsMenuLayerId) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('.si-env-layer-options-menu') || t.closest('.si-env-layer-action-btn--menu')) return
      setOptionsMenuLayerId(null)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [optionsMenuLayerId])

  const onDropOn = useCallback(
    (targetId: DevelopEliteMapDataLayerId) => {
      if (!dragId || dragId === targetId) {
        finishDrag()
        return
      }
      onOrderChange(moveMapDataLayerInOrder(order, dragId, targetId))
      finishDrag()
    },
    [dragId, finishDrag, onOrderChange, order],
  )

  return (
    <ul className="develop-elite-map__data-layer-list" aria-label="Map data layers">
      {layers.map(layer => {
        const visible = isDevelopEliteMapDataLayerVisible(visibility, layer.id)
        const symbology = developEliteMapDataLayerLegendPreviews(layer.id, legend)
        const isDragging = dragId === layer.id
        const isDropTarget = dropTargetId === layer.id && dragId && dragId !== layer.id
        return (
          <li
            key={layer.id}
            className={`develop-elite-map__data-layer-row${isDragging ? ' is-dragging' : ''}${isDropTarget ? ' is-drop-target' : ''}`}
            onDragOver={e => {
              e.preventDefault()
              if (dragId && dragId !== layer.id) setDropTargetId(layer.id)
            }}
            onDragLeave={() => {
              if (dropTargetId === layer.id) setDropTargetId(null)
            }}
            onDrop={e => {
              e.preventDefault()
              onDropOn(layer.id)
            }}
          >
            <span
              className="develop-elite-map__data-layer-grip"
              title="Drag to reorder"
              draggable
              onDragStart={e => {
                setDragId(layer.id)
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/plain', layer.id)
              }}
              onDragEnd={finishDrag}
            >
              <i className="fa-solid fa-grip-vertical" aria-hidden />
            </span>
            <button
              type="button"
              className={`develop-elite-map__data-layer-toggle${visible ? ' is-on' : ' is-off'}`}
              title={visible ? 'Hide layer' : 'Show layer'}
              aria-label={`${visible ? 'Hide' : 'Show'} ${layer.label}`}
              aria-pressed={visible}
              onClick={() => onVisibilityChange(layer.id, !visible)}
            >
              <span className={`develop-elite-map__data-layer-eye${visible ? ' is-on' : ' is-off'}`} aria-hidden>
                <i className={`fa-solid ${visible ? 'fa-eye' : 'fa-eye-slash'}`} />
              </span>
              <DevelopEliteMapDataLayerSwatch rows={symbology} />
              <span className="develop-elite-map__data-layer-name">{layer.label}</span>
            </button>
            <DevelopEliteMapDataLayerRowMenu
              layer={layer}
              open={optionsMenuLayerId === layer.id}
              onToggleOpen={() => setOptionsMenuLayerId(v => (v === layer.id ? null : layer.id))}
              onCloseMenu={() => setOptionsMenuLayerId(null)}
              sources={sources}
              serviceUrl={serviceUrlForLayer(layer.id)}
              order={order}
              onOrderChange={onOrderChange}
              layerOpacity={layerOpacity}
              onLayerOpacityChange={onLayerOpacityChange}
              onVisibilityChange={onVisibilityChange}
              onOpenDialog={onOpenDialog}
              onStatus={onStatus}
            />
          </li>
        )
      })}
    </ul>
  )
}
