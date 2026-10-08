import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react'
import { useSiInstanceScope } from '@/app/providers/siInstanceScope'
import { buildLayerLiveLegendList } from './layerLiveLegendCatalog'
import { LayerLiveLegendPanel } from './LayerLiveLegendPanel'
import type { LayerLegendCloudCoverPct } from './layerLegendCloudCoverStats'
import type { RemoteSensingLayerSelectGroup } from './agroCompositeIndices'
import type { SiMapSwipeCompareSides } from '@/modules/gis/map/SiMapSwipeControl'
import './LayerLiveLegendFloatingPanel.css'

const POS_KEY_BASE = 'si-layer-live-float-pos-v2'
const SIZE_KEY_BASE = 'si-layer-live-float-size-v1'
const POS_KEY_EMBED = 'si-layer-live-float-embed-pos-v1'
const SIZE_KEY_EMBED = 'si-layer-live-float-embed-size-v2'

/** Develop Elite / map-embed Layer Live card — fixed default footprint. */
export const LAYER_LIVE_MAP_EMBED_DEFAULT_SIZE = { w: 320, h: 118 } as const

/** Resize bounds (card width × scrollable body height), in px. */
const MIN_W = 240
const MAX_W = 560
const MIN_BODY_H = 150
const MAX_BODY_H = 760

const EMBED_MIN_W = 220
const EMBED_MAX_W = 360
const EMBED_MIN_BODY_H = 96
const EMBED_MAX_BODY_H = 200
const EMBED_HEAD_H = 32

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

function readEmbedSavedSize(storageKey: string): SavedSize | null {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return null
    const j = JSON.parse(raw) as { w?: unknown; h?: unknown }
    if (typeof j.w === 'number' && typeof j.h === 'number' && Number.isFinite(j.w) && Number.isFinite(j.h)) {
      return {
        w: Math.min(EMBED_MAX_W, Math.max(EMBED_MIN_W, j.w)),
        h: Math.min(EMBED_MAX_BODY_H, Math.max(EMBED_MIN_BODY_H, j.h)),
      }
    }
  } catch {
    /* ignore */
  }
  return null
}

function writeEmbedSavedSize(s: SavedSize, storageKey: string) {
  writeSavedSize(
    {
      w: Math.min(EMBED_MAX_W, Math.max(EMBED_MIN_W, s.w)),
      h: Math.min(EMBED_MAX_BODY_H, Math.max(EMBED_MIN_BODY_H, s.h)),
    },
    storageKey,
  )
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
  /**
   * When MapSwipe is open, show Before / After legend tabs for each compare side.
   * Pass null/undefined when swipe is closed.
   */
  mapSwipeCompare?: SiMapSwipeCompareSides | null
  aoiCloudCover?: LayerLegendCloudCoverPct | null
  /** Compact card clamped inside a dashboard map cell (Develop Elite grid map). */
  embeddedInMap?: boolean
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
  mapSwipeCompare = null,
  aoiCloudCover = null,
  embeddedInMap = false,
}: LayerLiveLegendFloatingPanelProps) {
  const { scopedStorageKey } = useSiInstanceScope()
  const posStorageKey = scopedStorageKey(embeddedInMap ? POS_KEY_EMBED : POS_KEY_BASE)
  const sizeStorageKey = scopedStorageKey(embeddedInMap ? SIZE_KEY_EMBED : SIZE_KEY_BASE)
  const rootRef = useRef<HTMLElement | null>(null)
  const dragRef = useRef<{ dx: number; dy: number; startX: number; startY: number; w: number; h: number } | null>(
    null,
  )
  const resizeRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null)
  const [pos, setPos] = useState<SavedPos | null>(() => readSavedPos(posStorageKey))
  const [size, setSize] = useState<SavedSize | null>(() =>
    embeddedInMap ? readEmbedSavedSize(sizeStorageKey) : readSavedSize(sizeStorageKey),
  )
  const [dragging, setDragging] = useState(false)
  const [resizing, setResizing] = useState(false)
  const [swipeTab, setSwipeTab] = useState<'before' | 'after'>('before')

  const swipeActive = Boolean(mapSwipeCompare?.before?.layerId && mapSwipeCompare?.after?.layerId)
  const legendLayerId = swipeActive
    ? swipeTab === 'after'
      ? mapSwipeCompare!.after.layerId
      : mapSwipeCompare!.before.layerId
    : activeLayerId
  const legendSceneDate = swipeActive
    ? swipeTab === 'after'
      ? mapSwipeCompare!.after.sceneDate
      : mapSwipeCompare!.before.sceneDate
    : sceneDate

  const floatHeadTitle = useMemo(() => {
    if (!legendLayerId) return 'Color key'
    const hit = layerOptions.find(o => o.id === legendLayerId)
    if (!hit) return legendLayerId
    const spec = buildLayerLiveLegendList([hit])[0]
    return spec?.title ?? hit.label ?? legendLayerId
  }, [legendLayerId, layerOptions])

  useEffect(() => {
    if (!swipeActive) setSwipeTab('before')
  }, [swipeActive])

  const embedLimits = useCallback(() => {
    const box = containerRef.current?.getBoundingClientRect()
    if (!box || !embeddedInMap) {
      return { maxW: MAX_W, maxBodyH: MAX_BODY_H, minW: MIN_W, minBodyH: MIN_BODY_H }
    }
    const pad = 8
    return {
      maxW: Math.min(EMBED_MAX_W, box.width - pad * 2),
      maxBodyH: Math.min(EMBED_MAX_BODY_H, box.height - EMBED_HEAD_H - pad * 3 - 28),
      minW: EMBED_MIN_W,
      minBodyH: EMBED_MIN_BODY_H,
    }
  }, [containerRef, embeddedInMap])

  const clampToContainer = useCallback(
    (x: number, y: number, elW: number, elH: number) => {
      const box = containerRef.current?.getBoundingClientRect()
      if (!box) return { x, y }
      const pad = embeddedInMap ? 8 : 10
      const maxX = Math.max(pad, box.width - elW - pad)
      const maxY = Math.max(pad, box.height - elH - pad)
      return {
        x: Math.min(maxX, Math.max(pad, x)),
        y: Math.min(maxY, Math.max(pad, y)),
      }
    },
    [containerRef, embeddedInMap],
  )

  useLayoutEffect(() => {
    if (!open || !embeddedInMap || !containerRef.current) return
    const box = containerRef.current.getBoundingClientRect()
    const limits = embedLimits()
    const defaultW = Math.min(
      limits.maxW,
      Math.max(limits.minW, LAYER_LIVE_MAP_EMBED_DEFAULT_SIZE.w),
    )
    const defaultBodyH = Math.min(
      limits.maxBodyH,
      Math.max(limits.minBodyH, LAYER_LIVE_MAP_EMBED_DEFAULT_SIZE.h),
    )

    setSize(s => {
      const raw = s ?? { w: defaultW, h: defaultBodyH }
      const next = {
        w: Math.min(limits.maxW, Math.max(limits.minW, raw.w)),
        h: Math.min(limits.maxBodyH, Math.max(limits.minBodyH, raw.h)),
      }
      const cardH = next.h + EMBED_HEAD_H
      setPos(p => {
        if (p) return clampToContainer(p.x, p.y, next.w, cardH)
        const pad = 8
        return clampToContainer(
          pad,
          Math.max(pad, box.height - cardH - pad - 24),
          next.w,
          cardH,
        )
      })
      return next
    })
  }, [open, embeddedInMap, clampToContainer, embedLimits])

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
      const limits = embedLimits()
      let maxW = limits.maxW
      let maxH = limits.maxBodyH
      if (box && root) {
        const r = root.getBoundingClientRect()
        maxW = Math.min(limits.maxW, box.right - 12 - r.left)
        maxH = Math.min(limits.maxBodyH, box.bottom - 12 - r.top - 52 /* header */)
      }
      const w = Math.max(limits.minW, Math.min(maxW, resizeRef.current.startW + dx))
      const h = Math.max(limits.minBodyH, Math.min(maxH, resizeRef.current.startH + dy))
      setSize({ w, h })
    },
    [containerRef, embedLimits],
  )

  const onResizePointerUp = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (resizeRef.current) {
        resizeRef.current = null
        setSize(s => {
          if (!s) return s
          if (embeddedInMap) writeEmbedSavedSize(s, sizeStorageKey)
          else writeSavedSize(s, sizeStorageKey)
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
    [embeddedInMap, sizeStorageKey],
  )

  const resetSize = useCallback(() => {
    if (embeddedInMap) {
      const limits = embedLimits()
      const next = {
        w: Math.min(limits.maxW, Math.max(limits.minW, LAYER_LIVE_MAP_EMBED_DEFAULT_SIZE.w)),
        h: Math.min(limits.maxBodyH, Math.max(limits.minBodyH, LAYER_LIVE_MAP_EMBED_DEFAULT_SIZE.h)),
      }
      setSize(next)
      writeEmbedSavedSize(next, sizeStorageKey)
      return
    }
    setSize(null)
    try {
      localStorage.removeItem(sizeStorageKey)
    } catch {
      /* ignore */
    }
  }, [embeddedInMap, embedLimits, sizeStorageKey])

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
  const bodyStyle: CSSProperties =
    size != null
      ? embeddedInMap
        ? { height: size.h, maxHeight: size.h, minHeight: size.h, overflowY: 'auto', overflowX: 'hidden' }
        : { maxHeight: size.h }
      : {}

  return (
    <aside
      ref={rootRef}
      className={`si-layer-live-float${embeddedInMap ? ' si-layer-live-float--map-embed si-layer-live-float--legend-horizontal' : ''}${size != null ? ' si-layer-live-float--sized' : ''}${dragging ? ' si-layer-live-float--dragging' : ''}${resizing ? ' si-layer-live-float--resizing' : ''}`}
      style={style}
      dir="ltr"
      role="dialog"
      aria-label={`${floatHeadTitle} — Layer Live legend`}
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
            <span className="si-layer-live-float__head-title">{floatHeadTitle}</span>
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
          {swipeActive ? (
            <div className="si-layer-live-float__tabs" role="tablist" aria-label="MapSwipe legend side">
              <button
                type="button"
                role="tab"
                aria-selected={swipeTab === 'before'}
                className={swipeTab === 'before' ? 'is-on' : undefined}
                onClick={() => setSwipeTab('before')}
              >
                Before
                <span className="si-layer-live-float__tab-meta">
                  {mapSwipeCompare!.before.layerId}
                  {mapSwipeCompare!.before.sceneDate
                    ? ` · ${mapSwipeCompare!.before.sceneDate}`
                    : ''}
                </span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={swipeTab === 'after'}
                className={swipeTab === 'after' ? 'is-on' : undefined}
                onClick={() => setSwipeTab('after')}
              >
                After
                <span className="si-layer-live-float__tab-meta">
                  {mapSwipeCompare!.after.layerId}
                  {mapSwipeCompare!.after.sceneDate ? ` · ${mapSwipeCompare!.after.sceneDate}` : ''}
                </span>
              </button>
            </div>
          ) : null}
          <LayerLiveLegendPanel
            key={
              swipeActive
                ? `swipe-${swipeTab}-${legendLayerId}-${legendSceneDate}`
                : `live-${activeLayerId}-${sceneDate}`
            }
            layerOptions={layerOptions}
            layerGroups={layerGroups}
            activeLayerId={legendLayerId}
            aoiGeometry={aoiGeometry}
            sceneDate={legendSceneDate}
            seriesStart={seriesStart}
            seriesEnd={seriesEnd}
            aoiCloudCover={aoiCloudCover}
            legendScaleLayout={embeddedInMap ? 'horizontal' : 'vertical'}
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
