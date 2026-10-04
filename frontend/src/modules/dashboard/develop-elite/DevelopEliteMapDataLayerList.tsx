import { useCallback, useMemo, useState } from 'react'
import type { DevelopEliteMapDataLayerId } from './developEliteDashboardConfig'
import {
  isDevelopEliteMapDataLayerVisible,
  moveMapDataLayerInOrder,
  orderDevelopEliteMapDataLayerDefs,
} from './developEliteMapDataLayers'

type Props = {
  order: DevelopEliteMapDataLayerId[]
  visibility: Record<DevelopEliteMapDataLayerId, boolean>
  onOrderChange: (order: DevelopEliteMapDataLayerId[]) => void
  onVisibilityChange: (id: DevelopEliteMapDataLayerId, visible: boolean) => void
}

export function DevelopEliteMapDataLayerList({
  order,
  visibility,
  onOrderChange,
  onVisibilityChange,
}: Props) {
  const layers = useMemo(() => orderDevelopEliteMapDataLayerDefs(order), [order])
  const [dragId, setDragId] = useState<DevelopEliteMapDataLayerId | null>(null)
  const [dropTargetId, setDropTargetId] = useState<DevelopEliteMapDataLayerId | null>(null)

  const finishDrag = useCallback(() => {
    setDragId(null)
    setDropTargetId(null)
  }, [])

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
              <span className="develop-elite-map__data-layer-name">{layer.label}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
