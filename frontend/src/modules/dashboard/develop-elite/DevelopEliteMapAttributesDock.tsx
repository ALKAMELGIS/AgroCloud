import { useCallback, useRef, useState, type ReactNode } from 'react'

export type DevelopEliteMapAttributesDockRow = { id: number; [key: string]: unknown }

export type DevelopEliteMapAttributesDockColumn = {
  id: string
  header: string
  render: (row: DevelopEliteMapAttributesDockRow) => ReactNode
}

const DEFAULT_HEIGHT_PX = 132
const MIN_HEIGHT_PX = 72
const MAX_HEIGHT_VH = 0.38
const MAX_HEIGHT_CAP_PX = 420

type Props = {
  layerLabel: string
  rows: DevelopEliteMapAttributesDockRow[]
  columns: DevelopEliteMapAttributesDockColumn[]
  onClose: () => void
}

export function DevelopEliteMapAttributesDock({ layerLabel, rows, columns, onClose }: Props) {
  const [minimized, setMinimized] = useState(false)
  const [heightPx, setHeightPx] = useState(DEFAULT_HEIGHT_PX)
  const resizeRef = useRef<{ startY: number; startH: number } | null>(null)

  const onTitlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (minimized || e.button !== 0) return
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      resizeRef.current = { startY: e.clientY, startH: heightPx }
    },
    [heightPx, minimized],
  )

  const onTitlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = resizeRef.current
    if (!drag) return
    const maxH = Math.min(window.innerHeight * MAX_HEIGHT_VH, MAX_HEIGHT_CAP_PX)
    const next = Math.min(maxH, Math.max(MIN_HEIGHT_PX, drag.startH + (drag.startY - e.clientY)))
    setHeightPx(next)
  }, [])

  const endTitleDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    resizeRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* already released */
    }
  }, [])

  return (
    <div
      className="develop-elite-map__attributes-dock-host"
      role="region"
      aria-label={`${layerLabel} attributes`}
      onPointerDown={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
      onWheel={e => e.stopPropagation()}
    >
      <div
        className={`develop-elite-map__attributes-dock${minimized ? ' is-minimized' : ''}`}
        style={minimized ? undefined : { height: heightPx }}
      >
        <div
          className="develop-elite-map__attributes-dock-titlebar"
          title="Drag to resize · Double-click to collapse"
          onPointerDown={onTitlePointerDown}
          onPointerMove={onTitlePointerMove}
          onPointerUp={endTitleDrag}
          onPointerCancel={endTitleDrag}
          onDoubleClick={() => setMinimized(prev => !prev)}
        >
          <span className="develop-elite-map__attributes-dock-grip" aria-hidden />
          <h3 className="develop-elite-map__attributes-dock-title">
            <i className="fa-solid fa-table-cells" aria-hidden />
            <span className="develop-elite-map__attributes-dock-title-text">{layerLabel}</span>
            <span className="develop-elite-map__attributes-dock-count">
              {rows.length} feature{rows.length === 1 ? '' : 's'}
            </span>
          </h3>
          <div className="develop-elite-map__attributes-dock-winbtns">
            <button
              type="button"
              className="develop-elite-map__attributes-dock-winbtn"
              title={minimized ? 'Expand table' : 'Collapse table'}
              aria-label={minimized ? 'Expand table' : 'Collapse table'}
              onClick={() => setMinimized(prev => !prev)}
            >
              <i className={`fa-solid fa-chevron-${minimized ? 'up' : 'down'}`} aria-hidden />
            </button>
            <button
              type="button"
              className="develop-elite-map__attributes-dock-winbtn develop-elite-map__attributes-dock-winbtn--close"
              title="Close"
              aria-label="Close attributes"
              onClick={onClose}
            >
              <i className="fa-solid fa-xmark" aria-hidden />
            </button>
          </div>
        </div>
        {!minimized ? (
          <div className="develop-elite-map__attributes-dock-body">
            {rows.length === 0 || !columns.length ? (
              <p className="develop-elite-map__attributes-dock-empty">No attributes for this layer.</p>
            ) : (
              <div className="develop-elite-map__attributes-dock-scroll">
                <table className="develop-elite-map__attributes-dock-table">
                  <thead>
                    <tr>
                      {columns.map(col => (
                        <th key={col.id} scope="col">
                          {col.header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(row => (
                      <tr key={row.id}>
                        {columns.map(col => (
                          <td key={col.id}>{col.render(row)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="develop-elite-map__attributes-dock-foot">
              Showing up to {rows.length} loaded feature{rows.length === 1 ? '' : 's'} · Map stays interactive above
            </p>
          </div>
        ) : null}
      </div>
    </div>
  )
}
