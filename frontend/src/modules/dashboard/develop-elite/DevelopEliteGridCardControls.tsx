import { useCallback, type PointerEvent as ReactPointerEvent } from 'react'
import { GRID_RESIZE_EDGES, type GridResizeEdge } from './developEliteGridResize'
import {
  DevelopEliteGridWidgetMenu,
  type DevelopEliteGridWidgetMenuAction,
} from './developEliteGridWidgetMenu'

type Props = {
  layoutEditMode: boolean
  moveHint: string
  menuOpen: boolean
  onMenuOpenChange: (open: boolean) => void
  onMenuAction: (action: DevelopEliteGridWidgetMenuAction) => void
  onMovePointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void
  onResizeStart: (edge: GridResizeEdge) => void
  onResizeMove: (edge: GridResizeEdge, totalDeltaX: number, totalDeltaY: number) => void
  onResizeEnd: (edge: GridResizeEdge) => void
}

export function DevelopEliteGridCardControls({
  layoutEditMode,
  moveHint,
  menuOpen,
  onMenuOpenChange,
  onMenuAction,
  onMovePointerDown,
  onResizeStart,
  onResizeMove,
  onResizeEnd,
}: Props) {
  const onResizePointerDown = useCallback(
    (edge: GridResizeEdge, e: ReactPointerEvent<HTMLButtonElement>) => {
      if (!layoutEditMode) return
      e.preventDefault()
      e.stopPropagation()
      const handle = e.currentTarget
      handle.setPointerCapture(e.pointerId)
      onResizeStart(edge)
      document.body.classList.add('develop-elite--resizing')
      const startX = e.clientX
      const startY = e.clientY

      const cursorClass =
        edge === 'n' || edge === 's'
          ? 'develop-elite--resize-ns'
          : edge === 'e' || edge === 'w'
            ? 'develop-elite--resize-ew'
            : edge === 'ne' || edge === 'sw'
              ? 'develop-elite--resize-nesw'
              : 'develop-elite--resize-nwse'
      document.body.classList.add(cursorClass)

      const onMove = (ev: PointerEvent) => {
        onResizeMove(edge, ev.clientX - startX, ev.clientY - startY)
        const scroller = handle.closest('.develop-elite__grid-workspace') as HTMLElement | null
        if (!scroller) return
        const rect = scroller.getBoundingClientRect()
        const band = 36
        if (ev.clientY > rect.bottom - band) scroller.scrollTop += 18
        else if (ev.clientY < rect.top + band) scroller.scrollTop -= 18
        if (ev.clientX > rect.right - band) scroller.scrollLeft += 12
        else if (ev.clientX < rect.left + band) scroller.scrollLeft -= 12
      }

      const onUp = () => {
        try {
          handle.releasePointerCapture(e.pointerId)
        } catch {
          /* ignore */
        }
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
        document.body.classList.remove(
          'develop-elite--resizing',
          'develop-elite--resize-ns',
          'develop-elite--resize-ew',
          'develop-elite--resize-nesw',
          'develop-elite--resize-nwse',
        )
        onResizeEnd(edge)
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
    },
    [layoutEditMode, onResizeEnd, onResizeMove, onResizeStart],
  )

  const onGrabBarDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!layoutEditMode) return
      e.preventDefault()
      e.stopPropagation()
      onMovePointerDown(e)
    },
    [layoutEditMode, onMovePointerDown],
  )

  if (!layoutEditMode) return null

  return (
    <>
      <div className="develop-elite-grid-item__frame" aria-hidden />
      <div className="develop-elite-grid-item__controls">
        <div
          className={`develop-elite-grid-item__edit-chrome${menuOpen ? ' is-menu-open' : ''}`}
          role="toolbar"
          aria-label="Widget layout"
        >
          <button
            type="button"
            className="develop-elite-grid-item__drag-btn"
            title={moveHint}
            aria-label={moveHint}
            tabIndex={-1}
            onPointerDown={onGrabBarDown}
          >
            <i className="fa-solid fa-grip develop-elite-grid-item__drag-icon" aria-hidden />
          </button>
          <div className="develop-elite-grid-item__menu-anchor">
            <button
              type="button"
              className="develop-elite-grid-item__menu-btn"
              title="Widget menu"
              aria-label="Widget menu"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              tabIndex={-1}
              onPointerDown={e => e.stopPropagation()}
              onClick={e => {
                e.stopPropagation()
                e.preventDefault()
                onMenuOpenChange(!menuOpen)
              }}
            >
              <i className="fa-solid fa-ellipsis develop-elite-grid-item__menu-icon" aria-hidden />
            </button>
            <DevelopEliteGridWidgetMenu
              open={menuOpen}
              onClose={() => onMenuOpenChange(false)}
              onAction={onMenuAction}
            />
          </div>
        </div>
        {GRID_RESIZE_EDGES.map(edge => (
          <button
            key={edge}
            type="button"
            className={`develop-elite-grid-resize-handle develop-elite-grid-resize-handle--${edge}`}
            aria-label={`Resize card (${edge})`}
            tabIndex={-1}
            onPointerDown={ev => onResizePointerDown(edge, ev)}
          />
        ))}
      </div>
    </>
  )
}
