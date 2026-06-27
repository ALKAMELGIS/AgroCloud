import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react'
import { useSiInstanceScope } from '../siInstanceScope'
import { LayerLiveLegendPanel } from './LayerLiveLegendPanel'
import type { RemoteSensingLayerSelectGroup } from '../../../lib/agroCompositeIndices'
import './LayerLiveLegendFloatingPanel.css'

const POS_KEY_BASE = 'si-layer-live-float-pos-v2'
const SIZE_KEY_BASE = 'si-layer-live-float-size-v1'

/** Resize bounds (card width × scrollable body height), in px. */
const MIN_W = 240
const MAX_W = 560
const MIN_BODY_H = 150
const MAX_BODY_H = 760

type SavedPos = { x: number; y: number }
type SavedSize = { w: number; h: number }

function readSavedPos(storageKey: string): SavedPos | null {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return null
    const j = JSON.parse(raw) as { x?: unknown; y?: unknown }
    if (typeof j.x === 'number' && typeof j.y === 'number' && Number.isFinite(j.x) && Number.isFinite(j.y)) {
      return { x: j.x, y: j.y }
    }
  } catch {
    /* ignore */
  }
  return null
}

function writeSavedPos(p: SavedPos, storageKey: string) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(p))
  } catch {
    /* ignore */
  }
}

function readSavedSize(storageKey: string): SavedSize | null {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return null
    const j = JSON.parse(raw) as { w?: unknown; h?: unknown }
    if (typeof j.w === 'number' && typeof j.h === 'number' && Number.isFinite(j.w) && Number.isFinite(j.h)) {
      return {
        w: Math.min(MAX_W, Math.max(MIN_W, j.w)),
        h: Math.min(MAX_BODY_H, Math.max(MIN_BODY_H, j.h)),
      }
    }
  } catch {
    /* ignore */
  }
  return null
}

function writeSavedSize(s: SavedSize, storageKey: string) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(s))
  } catch {
    /* ignore */
  }
}

type LayerLiveLegendFloatingPanelProps = {
  open: boolean
  onClose: () => void
  /** Map viewport for drag clamping (`.si-map-container`). */
  containerRef: RefObject<HTMLElement | null>
  layerOptions: Array<{ id: string; label?: string }>
  layerGroups?: RemoteSensingLayerSelectGroup[]
  activeLayerId?: string
  /** AOI geometry for per-class Total Area in the legend. */
  aoiGeometry?: GeoJSON.Geometry | GeoJSON.Feature | null
  /** Scene date (ISO) the classification map is rendered for. */
  sceneDate?: string
  /** Optional multi-temporal series window shown in the metadata grid. */
  seriesStart?: string
  seriesEnd?: string
}

export function LayerLiveLegendFloatingPanel({
  open,
  onClose,
  containerRef,
  layerOptions,
  layerGroups,
  activeLayerId,
  aoiGeometry,
  sceneDate,
  seriesStart,
  seriesEnd,
}: LayerLiveLegendFloatingPanelProps) {
  const { scopedStorageKey } = useSiInstanceScope()
  const posStorageKey = scopedStorageKey(POS_KEY_BASE)
  const sizeStorageKey = scopedStorageKey(SIZE_KEY_BASE)
  const rootRef = useRef<HTMLElement | null>(null)
  const dragRef = useRef<{ dx: number; dy: number; startX: number; startY: number; w: number; h: number } | null>(
    null,
  )
  const resizeRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null)
  const [pos, setPos] = useState<SavedPos | null>(() => readSavedPos(posStorageKey))
  const [size, setSize] = useState<SavedSize | null>(() => readSavedSize(sizeStorageKey))
  const [dragging, setDragging] = useState(false)
  const [resizing, setResizing] = useState(false)

  const clampToContainer = useCallback(
    (x: number, y: number, elW: number, elH: number) => {
      const box = containerRef.current?.getBoundingClientRect()
      if (!box) return { x, y }
      const pad = 10
      const maxX = Math.max(pad, box.width - elW - pad)
      const maxY = Math.max(pad, box.height - elH - pad)
      return {
        x: Math.min(maxX, Math.max(pad, x)),
        y: Math.min(maxY, Math.max(pad, y)),
      }
    },
    [containerRef],
  )

  useLayoutEffect(() => {
    if (!open || !rootRef.current || !containerRef.current) return
    const box = containerRef.current.getBoundingClientRect()
    const r = rootRef.current.getBoundingClientRect()
    setPos(p => {
      if (!p) return p
      const next = clampToContainer(p.x, p.y, r.width, r.height)
      if (next.x === p.x && next.y === p.y) return p
      return next
    })
  }, [open, clampToContainer, containerRef])

  const onDragPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return
      if ((e.target as HTMLElement).closest('button, [data-drag-exclude]')) return
      const root = rootRef.current
      const box = containerRef.current?.getBoundingClientRect()
      if (!root || !box) return
      const r = root.getBoundingClientRect()
      dragRef.current = {
        dx: e.clientX - r.left,
        dy: e.clientY - r.top,
        startX: r.left - box.left,
        startY: r.top - box.top,
        w: r.width,
        h: r.height,
      }
      setDragging(true)
      ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
      e.preventDefault()
    },
    [containerRef],
  )

  const onDragPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (!dragRef.current || !containerRef.current) return
      const box = containerRef.current.getBoundingClientRect()
      const nx = e.clientX - box.left - dragRef.current.dx
      const ny = e.clientY - box.top - dragRef.current.dy
      const next = clampToContainer(nx, ny, dragRef.current.w, dragRef.current.h)
      setPos(next)
    },
    [clampToContainer, containerRef],
  )

  const onDragPointerUp = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (dragRef.current) {
      dragRef.current = null
      setPos(p => {
        if (p) writeSavedPos(p, posStorageKey)
        return p
      })
    }
    setDragging(false)
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
    } catch {
      /* ignore */
    }
  }, [])

  // ── Resize (bottom-right handle) ───────────────────────────────────────
  const onResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return
      const root = rootRef.current
      if (!root) return
      const r = root.getBoundingClientRect()
      const bodyEl = root.querySelector('.si-layer-live-float__body') as HTMLElement | null
      const bodyH = bodyEl ? bodyEl.getBoundingClientRect().height : 320
      resizeRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startW: r.width,
        startH: size?.h ?? bodyH,
      }
      setResizing(true)
      ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
      e.preventDefault()
      e.stopPropagation()
    },
    [size],
  )

  const onResizePointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (!resizeRef.current) return
      const box = containerRef.current?.getBoundingClientRect()
      const root = rootRef.current
      const dx = e.clientX - resizeRef.current.startX
      const dy = e.clientY - resizeRef.current.startY
      // Keep the card inside the map container as it grows.
      let maxW = MAX_W
      let maxH = MAX_BODY_H
      if (box && root) {
        const r = root.getBoundingClientRect()
        maxW = Math.min(MAX_W, box.right - 12 - r.left)
        maxH = Math.min(MAX_BODY_H, box.bottom - 12 - r.top - 52 /* header */)
      }
      const w = Math.max(MIN_W, Math.min(maxW, resizeRef.current.startW + dx))
      const h = Math.max(MIN_BODY_H, Math.min(maxH, resizeRef.current.startH + dy))
      setSize({ w, h })
    },
    [containerRef],
  )

  const onResizePointerUp = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (resizeRef.current) {
        resizeRef.current = null
        setSize(s => {
          if (s) writeSavedSize(s, sizeStorageKey)
          return s
        })
      }
      setResizing(false)
      try {
        ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
      } catch {
        /* ignore */
      }
    },
    [sizeStorageKey],
  )

  const resetSize = useCallback(() => {
    setSize(null)
    try {
      localStorage.removeItem(sizeStorageKey)
    } catch {
      /* ignore */
    }
  }, [sizeStorageKey])

  useEffect(() => {
    const onResize = () => {
      setPos(p => {
        if (!p || !rootRef.current || !containerRef.current) return p
        const box = containerRef.current.getBoundingClientRect()
        const r = rootRef.current.getBoundingClientRect()
        const next = clampToContainer(r.left - box.left, r.top - box.top, r.width, r.height)
        if (next.x === p.x && next.y === p.y) return p
        return next
      })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [clampToContainer, containerRef])

  if (!open) return null

  const style: CSSProperties = {
    ...(pos != null ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' } : {}),
    ...(size != null ? { width: size.w } : {}),
  }
  const bodyStyle: CSSProperties = size != null ? { maxHeight: size.h } : {}

  return (
    <aside
      ref={rootRef}
      className={`si-layer-live-float${dragging ? ' si-layer-live-float--dragging' : ''}${resizing ? ' si-layer-live-float--resizing' : ''}`}
      style={style}
      dir="ltr"
      role="dialog"
      aria-label="Layer Live legend"
      aria-modal="false"
    >
      <div className="si-layer-live-float__chrome">
        <div
          className="si-layer-live-float__head"
          onPointerDown={onDragPointerDown}
          onPointerMove={onDragPointerMove}
          onPointerUp={onDragPointerUp}
          onPointerCancel={onDragPointerUp}
          title="Drag to move"
        >
          <span className="si-layer-live-float__grip" aria-hidden>
            <i className="fa-solid fa-grip-vertical" />
          </span>
          <div className="si-layer-live-float__head-text">
            <span className="si-layer-live-float__kicker">Layer Live</span>
            <span className="si-layer-live-float__head-title">Color key</span>
          </div>
          <button
            type="button"
            className="si-layer-live-float__close"
            data-drag-exclude
            onClick={onClose}
            aria-label="Close Layer Live legend"
            title="Close"
          >
            <i className="fa-solid fa-xmark" aria-hidden />
          </button>
        </div>
        <div className="si-layer-live-float__body" style={bodyStyle}>
          <LayerLiveLegendPanel
            layerOptions={layerOptions}
            layerGroups={layerGroups}
            activeLayerId={activeLayerId}
            aoiGeometry={aoiGeometry}
            sceneDate={sceneDate}
            seriesStart={seriesStart}
            seriesEnd={seriesEnd}
            activeOnly
          />
        </div>
        <button
          type="button"
          className="si-layer-live-float__resize"
          data-drag-exclude
          onPointerDown={onResizePointerDown}
          onPointerMove={onResizePointerMove}
          onPointerUp={onResizePointerUp}
          onPointerCancel={onResizePointerUp}
          onDoubleClick={resetSize}
          aria-label="Resize legend card (double-click to reset)"
          title="Drag to resize · double-click to reset"
        >
          <i className="fa-solid fa-up-right-and-down-left-from-center" aria-hidden />
        </button>
      </div>
    </aside>
  )
}
