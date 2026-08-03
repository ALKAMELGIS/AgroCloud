import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import type { GisSelectionHit } from '../../../../lib/gisSelection/types'
import { useMapOverlayIsolation } from '../../useMapOverlayIsolation'
import './gisSelection.css'

export type GisSelectionAttributeTablePanelProps = {
  open: boolean
  hits: GisSelectionHit[]
  onClose: () => void
}

type Pos = { left: number; top: number }

function formatValue(v: unknown): string {
  if (v == null) return '—'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

export function GisSelectionAttributeTablePanel({
  open,
  hits,
  onClose,
}: GisSelectionAttributeTablePanelProps) {
  const rootRef = useRef<HTMLElement | null>(null)
  const [pos, setPos] = useState<Pos | null>(null)
  const dragRef = useRef<{
    startX: number
    startY: number
    originLeft: number
    originTop: number
  } | null>(null)
  const isolation = useMapOverlayIsolation(open, { native: true })

  useEffect(() => {
    if (!open) setPos(null)
  }, [open])

  const clamp = useCallback((left: number, top: number): Pos => {
    const el = rootRef.current
    const w = el?.offsetWidth ?? 280
    const h = el?.offsetHeight ?? 120
    const maxL = Math.max(8, window.innerWidth - w - 8)
    const maxT = Math.max(8, window.innerHeight - h - 8)
    return {
      left: Math.min(maxL, Math.max(8, left)),
      top: Math.min(maxT, Math.max(8, top)),
    }
  }, [])

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      isolation.onPointerDown?.(e)
      const t = e.target as HTMLElement | null
      if (!t?.closest('.gis-sel-attr-table__drag')) return
      const el = rootRef.current
      if (!el) return
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const next = clamp(rect.left, rect.top)
      setPos(next)
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        originLeft: next.left,
        originTop: next.top,
      }
      el.setPointerCapture?.(e.pointerId)
      el.classList.add('is-dragging')
    },
    [clamp, isolation],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const d = dragRef.current
      if (!d) return
      e.preventDefault()
      setPos(
        clamp(d.originLeft + (e.clientX - d.startX), d.originTop + (e.clientY - d.startY)),
      )
    },
    [clamp],
  )

  const endDrag = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (!dragRef.current) return
    dragRef.current = null
    rootRef.current?.classList.remove('is-dragging')
    try {
      rootRef.current?.releasePointerCapture?.(e.pointerId)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    if (!pos) return
    const onResize = () => setPos(p => (p ? clamp(p.left, p.top) : p))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [pos, clamp])

  const setRefs = useCallback(
    (node: HTMLElement | null) => {
      rootRef.current = node
      const isoRef = isolation.ref
      if (typeof isoRef === 'function') isoRef(node as HTMLDivElement)
    },
    [isolation.ref],
  )

  if (!open) return null

  const fieldSet = new Set<string>()
  for (const hit of hits) {
    Object.keys(hit.properties ?? {}).forEach(k => fieldSet.add(k))
  }
  const fields = [...fieldSet].sort((a, b) => a.localeCompare(b))

  const style: CSSProperties | undefined = pos
    ? { left: pos.left, top: pos.top, right: 'auto' }
    : undefined

  return (
    <aside
      ref={setRefs}
      className={'gis-sel-attr-table' + (pos ? ' gis-sel-attr-table--free' : '')}
      role="complementary"
      aria-label="Selected feature attributes"
      dir="ltr"
      style={style}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onWheel={isolation.onWheel}
      onClick={isolation.onClick}
      onDoubleClick={isolation.onDoubleClick}
      onContextMenu={isolation.onContextMenu}
      onMouseDown={isolation.onMouseDown}
      onMouseUp={isolation.onMouseUp}
      onTouchStart={isolation.onTouchStart}
      onTouchMove={isolation.onTouchMove}
    >
      <header className="gis-sel-attr-table__head">
        <span className="gis-sel-attr-table__drag" title="Drag to move" aria-label="Drag panel">
          <i className="fa-solid fa-grip-vertical" aria-hidden />
        </span>
        <span className="gis-sel-attr-table__title">
          <i className="fa-solid fa-table" aria-hidden /> Attributes ({hits.length})
        </span>
        <button type="button" className="gis-sel-attr-table__close" aria-label="Close" onClick={onClose}>
          <i className="fa-solid fa-xmark" aria-hidden />
        </button>
      </header>

      <div className="gis-sel-attr-table__body">
        {!hits.length ? (
          <p className="gis-sel-attr-table__empty">Click features on the map to inspect attributes.</p>
        ) : !fields.length ? (
          <p className="gis-sel-attr-table__empty">Selected features have no attribute fields.</p>
        ) : (
          <div className="gis-sel-attr-table__scroll">
            <table>
              <thead>
                <tr>
                  <th>Layer</th>
                  {fields.map(f => (
                    <th key={f}>{f}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {hits.map(hit => (
                  <tr key={`${hit.layerId}::${hit.featureKey}`}>
                    <td title={hit.layerName}>{hit.layerName}</td>
                    {fields.map(f => (
                      <td key={f} title={formatValue(hit.properties?.[f])}>
                        {formatValue(hit.properties?.[f])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </aside>
  )
}
