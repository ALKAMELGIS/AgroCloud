import type { CSSProperties, ReactNode } from 'react'
import type { GridDragGhostRect } from './developEliteGridDragPreview'

const HEAVY_WIDGET_IDS = new Set(['map'])

type Props = {
  widgetId: string
  label: string
  rect: GridDragGhostRect
  children?: ReactNode
}

export function DevelopEliteGridDragGhost({ widgetId, label, rect, children }: Props) {
  const style: CSSProperties = {
    position: 'absolute',
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    zIndex: 25,
    pointerEvents: 'none',
    boxSizing: 'border-box',
  }

  if (HEAVY_WIDGET_IDS.has(widgetId)) {
    return (
      <div className="develop-elite-grid-drag-ghost develop-elite-grid-drag-ghost--outline" style={style} aria-hidden>
        <span className="develop-elite-grid-drag-ghost__label">{label}</span>
      </div>
    )
  }

  return (
    <div className="develop-elite-grid-drag-ghost develop-elite-grid-drag-ghost--clone" style={style} aria-hidden>
      <div className="develop-elite-grid-drag-ghost__clone-inner">{children}</div>
    </div>
  )
}
