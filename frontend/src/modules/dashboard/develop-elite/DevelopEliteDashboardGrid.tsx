import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import {
  DEVELOP_ELITE_GRID_BREAKPOINTS,
  DEVELOP_ELITE_GRID_COLS,
  DEVELOP_ELITE_GRID_ROW_HEIGHT,
  developEliteGridWidgetIds,
  developEliteCompactStackBreakpoint,
  developEliteNarrowGridRowPx,
  isDevelopEliteNarrowGridBreakpoint,
  type DevelopEliteGridBreakpoint,
  type DevelopEliteGridLayoutItem,
  type DevelopEliteResponsiveGridLayouts,
} from './developEliteGridLayout'
import { findGridDropTarget, metricsFromPointer } from './developEliteGridDrop'
import {
  applyGridCardResize,
  gridLayoutMaxRow,
  pointerToGridCell,
  reflowAfterWidgetRemoval,
  type GridDropContext,
} from './developEliteGridEngine'
import {
  duplicateDevelopEliteGridWidgetItem,
  removeDevelopEliteGridWidgetFromLayout,
  resolveDevelopEliteGridWidgetContentId,
  settingsTabForDevelopEliteWidget,
  type DevelopEliteGridWidgetMenuAction,
} from './developEliteGridWidgetActions'
import {
  cellChanged,
  commitDragAtPlaceholder,
  ghostRectFromPointer,
  previewSiblingsWhileDragging,
  type GridDragPlaceholder,
} from './developEliteGridDragPreview'
import { DevelopEliteGridDragGhost } from './DevelopEliteGridDragGhost'
import { developEliteGridWidgetLabel } from './developEliteGridWidgetLabels'
import { DevelopEliteGridCardControls } from './DevelopEliteGridCardControls'
import { resizeGridItemFromDelta, type GridResizeEdge } from './developEliteGridResize'
import { notifyDevelopEliteGridDrag, notifyDevelopEliteLayoutChanged } from './useDevelopEliteLiveLayout'

const GRID_MARGIN_X = 3
const GRID_MARGIN_Y = 3
const MIN_ROW_STRIDE_PX = 24

type Props = {
  layouts: DevelopEliteResponsiveGridLayouts
  kpiCardIds: string[]
  onLayoutsChange: (layouts: DevelopEliteResponsiveGridLayouts) => void
  onLayoutCommit: () => void
  gridRowStrideByBp?: Partial<Record<DevelopEliteGridBreakpoint, number>>
  onGridRowStrideCommit?: (breakpoint: DevelopEliteGridBreakpoint, rowStridePx: number) => void
  layoutEditMode: boolean
  widgets: Record<string, ReactNode>
  gridHiddenWidgets: string[]
  onGridHiddenWidgetsChange: (ids: string[]) => void
  onWidgetConfigure?: (widgetId: string, tab: ReturnType<typeof settingsTabForDevelopEliteWidget>) => void
  /** Phone/tablet: use list-free stacked layout and slide drawer for lists. */
  compactListLayout?: boolean
}

function resolveBreakpoint(width: number): DevelopEliteGridBreakpoint {
  if (width >= DEVELOP_ELITE_GRID_BREAKPOINTS.lg) return 'lg'
  if (width >= DEVELOP_ELITE_GRID_BREAKPOINTS.md) return 'md'
  if (width >= DEVELOP_ELITE_GRID_BREAKPOINTS.sm) return 'sm'
  if (width >= DEVELOP_ELITE_GRID_BREAKPOINTS.xs) return 'xs'
  return 'xxs'
}

function buildDropContext(
  ev: PointerEvent,
  root: HTMLElement,
  scrollTop: number,
  rowHeight: number,
): GridDropContext {
  return {
    shiftKey: ev.shiftKey,
    pointerClientX: ev.clientX,
    pointerClientY: ev.clientY,
    containerRect: root.getBoundingClientRect(),
    scrollTop,
    rowHeight,
    marginX: GRID_MARGIN_X,
    marginY: GRID_MARGIN_Y,
  }
}

function computeRowStridePx(gridHeight: number, rowCount: number): number {
  const rows = Math.max(1, rowCount)
  const gaps = GRID_MARGIN_Y * (rows - 1)
  const padding = GRID_MARGIN_Y * 2
  const inner = Math.max(0, gridHeight - padding - gaps)
  if (inner <= 0) return DEVELOP_ELITE_GRID_ROW_HEIGHT
  return Math.max(MIN_ROW_STRIDE_PX, inner / rows)
}

export function DevelopEliteDashboardGrid({
  layouts,
  kpiCardIds,
  onLayoutsChange,
  onLayoutCommit,
  gridRowStrideByBp,
  onGridRowStrideCommit,
  layoutEditMode,
  widgets,
  gridHiddenWidgets,
  onGridHiddenWidgetsChange,
  onWidgetConfigure,
  compactListLayout = false,
}: Props) {
  const [openMenuWidgetId, setOpenMenuWidgetId] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const scrollParentRef = useRef<HTMLElement | null>(null)
  const [width, setWidth] = useState(1200)
  const [gridHeight, setGridHeight] = useState(0)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [resizingId, setResizingId] = useState<string | null>(null)
  const [shiftActive, setShiftActive] = useState(false)
  const [stackTargetId, setStackTargetId] = useState<string | null>(null)
  const [draftLayout, setDraftLayout] = useState<DevelopEliteGridLayoutItem[] | null>(null)
  const draftLayoutRef = useRef<DevelopEliteGridLayoutItem[] | null>(null)
  const layoutRef = useRef<DevelopEliteGridLayoutItem[]>([])
  const rowStrideRef = useRef(DEVELOP_ELITE_GRID_ROW_HEIGHT)
  const resizeSessionRef = useRef<{
    edge: GridResizeEdge
    item: DevelopEliteGridLayoutItem
    layout: DevelopEliteGridLayoutItem[]
  } | null>(null)
  const dragSessionRef = useRef<{
    startItem: DevelopEliteGridLayoutItem
    startLayout: DevelopEliteGridLayoutItem[]
    grabOffsetX: number
    grabOffsetY: number
    rowCountLocked: number
    lastPlaceholder: GridDragPlaceholder | null
  } | null>(null)
  const [placeholder, setPlaceholder] = useState<GridDragPlaceholder | null>(null)
  const [ghostPoint, setGhostPoint] = useState<{ clientX: number; clientY: number } | null>(null)
  const [dragRowCountLocked, setDragRowCountLocked] = useState<number | null>(null)

  const breakpoint = useMemo(() => resolveBreakpoint(width), [width])
  const layoutBreakpoint = useMemo(() => {
    if (compactListLayout && width > 0 && width < DEVELOP_ELITE_GRID_BREAKPOINTS.lg) {
      return developEliteCompactStackBreakpoint(width)
    }
    return breakpoint
  }, [breakpoint, compactListLayout, width])
  const cols = DEVELOP_ELITE_GRID_COLS[layoutBreakpoint]

  const activeLayout = useMemo(() => {
    const fromBp = layouts[layoutBreakpoint]
    if (fromBp?.length) return fromBp
    return layouts.lg ?? layouts.md ?? []
  }, [layoutBreakpoint, layouts])

  const displayLayout = draftLayout ?? activeLayout
  layoutRef.current = displayLayout
  draftLayoutRef.current = draftLayout

  const layoutForPaint = displayLayout

  const narrowStackLayout =
    compactListLayout || isDevelopEliteNarrowGridBreakpoint(layoutBreakpoint)
  const rowCount = dragRowCountLocked ?? gridLayoutMaxRow(layoutForPaint)
  const visualLayout = layoutForPaint

  const setDraftLayoutLive = useCallback((next: DevelopEliteGridLayoutItem[] | null) => {
    draftLayoutRef.current = next
    setDraftLayout(next)
  }, [])

  const editRowLockRef = useRef<number | null>(null)
  if (layoutEditMode && editRowLockRef.current == null && gridHeight > 0 && rowCount > 0) {
    editRowLockRef.current = computeRowStridePx(gridHeight, rowCount)
  }
  const editRowPx = layoutEditMode ? editRowLockRef.current : null
  const narrowRowPx =
    narrowStackLayout && !layoutEditMode ? developEliteNarrowGridRowPx(layoutBreakpoint) : null

  const savedRowStridePx = gridRowStrideByBp?.[layoutBreakpoint] ?? null

  const rowUnitPx = useMemo(() => {
    if (layoutEditMode && editRowPx != null) return editRowPx
    if (narrowRowPx != null) return narrowRowPx
    if (savedRowStridePx != null && savedRowStridePx > 0) return savedRowStridePx
    if (gridHeight > 0 && rowCount > 0) return computeRowStridePx(gridHeight, rowCount)
    return DEVELOP_ELITE_GRID_ROW_HEIGHT
  }, [
    editRowPx,
    gridHeight,
    layoutEditMode,
    narrowRowPx,
    rowCount,
    savedRowStridePx,
  ])
  const rowStridePx = rowUnitPx + GRID_MARGIN_Y
  rowStrideRef.current = rowUnitPx

  const colUnitPx = useMemo(() => {
    if (width <= 0 || cols <= 0) return 1
    const gaps = GRID_MARGIN_X * (cols - 1)
    const padding = GRID_MARGIN_X * 2
    const inner = Math.max(1, width - padding - gaps)
    return inner / cols
  }, [cols, width])

  const widgetIds = useMemo(() => developEliteGridWidgetIds(kpiCardIds), [kpiCardIds])

  useLayoutEffect(() => {
    const el = rootRef.current
    if (!el) return
    const workspace = el.parentElement
    scrollParentRef.current = el.closest('.develop-elite__scroll-main') as HTMLElement | null

    const measure = () => {
      const h = workspace?.clientHeight ?? el.clientHeight
      if (h > 0) setGridHeight(h)
      const w = el.clientWidth
      if (w > 0) setWidth(w)
    }

    const ro = new ResizeObserver(() => {
      measure()
      notifyDevelopEliteLayoutChanged()
    })
    if (workspace) ro.observe(workspace)
    ro.observe(el)
    measure()
    return () => ro.disconnect()
  }, [])

  const gridAreaStyle = useCallback(
    (item: DevelopEliteGridLayoutItem): CSSProperties => ({
      gridColumn: `${item.x + 1} / span ${item.w}`,
      gridRow: `${item.y + 1} / span ${item.h}`,
      minHeight: 0,
      minWidth: 0,
      zIndex:
        draggingId === item.i || resizingId === item.i
          ? 20
          : stackTargetId === item.i
            ? 12
            : 1,
    }),
    [draggingId, resizingId, stackTargetId],
  )

  const patchActiveLayout = useCallback(
    (nextLayout: DevelopEliteGridLayoutItem[]) => {
      onLayoutsChange({ ...layouts, [layoutBreakpoint]: nextLayout })
    },
    [layoutBreakpoint, layouts, onLayoutsChange],
  )

  const patchAllBreakpoints = useCallback(
    (mutate: (layout: DevelopEliteGridLayoutItem[], cols: number) => DevelopEliteGridLayoutItem[]) => {
      const next: DevelopEliteResponsiveGridLayouts = { ...layouts }
      for (const bp of Object.keys(DEVELOP_ELITE_GRID_COLS) as DevelopEliteGridBreakpoint[]) {
        const bpCols = DEVELOP_ELITE_GRID_COLS[bp]
        const base = next[bp] ?? layouts[bp] ?? []
        next[bp] = mutate(base, bpCols)
      }
      onLayoutsChange(next)
      notifyDevelopEliteLayoutChanged()
      onLayoutCommit()
    },
    [layouts, onLayoutCommit, onLayoutsChange],
  )

  const onWidgetMenuAction = useCallback(
    (widgetId: string, action: DevelopEliteGridWidgetMenuAction) => {
      if (action === 'configure') {
        onWidgetConfigure?.(widgetId, settingsTabForDevelopEliteWidget(widgetId))
        return
      }
      if (action === 'duplicate') {
        patchAllBreakpoints((layout, bpCols) => {
          const duped = duplicateDevelopEliteGridWidgetItem(layout, widgetId, bpCols)
          return duped ?? layout
        })
        return
      }
      if (action === 'delete') {
        if (widgetId === 'kpi-hero' || widgetId === 'kpi-hero-zone') return
        const base = resolveDevelopEliteGridWidgetContentId(widgetId)
        if (widgetId === base) {
          const nextHidden = Array.from(new Set([...gridHiddenWidgets, base]))
          onGridHiddenWidgetsChange(nextHidden)
        }
        patchAllBreakpoints((layout, bpCols) =>
          reflowAfterWidgetRemoval(removeDevelopEliteGridWidgetFromLayout(layout, widgetId), bpCols),
        )
      }
    },
    [gridHiddenWidgets, onGridHiddenWidgetsChange, onWidgetConfigure, patchAllBreakpoints],
  )

  const updateDragPreview = useCallback(
    (ev: PointerEvent) => {
      const session = dragSessionRef.current
      const root = rootRef.current
      if (!session || !root) return

      setGhostPoint({ clientX: ev.clientX, clientY: ev.clientY })

      const scrollTop = scrollParentRef.current?.scrollTop ?? 0
      const rowHeight = rowStrideRef.current
      const ctx = buildDropContext(ev, root, scrollTop, rowHeight)
      setShiftActive(ctx.shiftKey)

      const cell = pointerToGridCell(
        ev.clientX,
        ev.clientY,
        ctx.containerRect,
        scrollTop,
        cols,
        rowHeight,
        GRID_MARGIN_X,
        GRID_MARGIN_Y,
        session.startItem.w,
        session.startItem.h,
      )
      const nextPlaceholder: GridDragPlaceholder = {
        x: cell.x,
        y: cell.y,
        w: session.startItem.w,
        h: session.startItem.h,
      }

      if (ctx.shiftKey) {
        const metrics = metricsFromPointer(
          ev.clientX,
          ev.clientY,
          ctx.containerRect,
          scrollTop,
          cols,
          rowHeight,
          GRID_MARGIN_X,
          GRID_MARGIN_Y,
        )
        const target = findGridDropTarget(session.startLayout, metrics.cellX, metrics.cellY, session.startItem.i)
        setStackTargetId(target?.i ?? null)
      } else {
        setStackTargetId(null)
      }

      if (!cellChanged(session.lastPlaceholder, nextPlaceholder)) return

      session.lastPlaceholder = nextPlaceholder
      const nextRowLock = Math.max(session.rowCountLocked, nextPlaceholder.y + nextPlaceholder.h)
      session.rowCountLocked = nextRowLock
      setDragRowCountLocked(nextRowLock)
      setPlaceholder(nextPlaceholder)

      const siblings = previewSiblingsWhileDragging(
        session.startLayout,
        session.startItem.i,
        session.startItem,
        nextPlaceholder,
        cols,
        ctx,
      )
      setDraftLayoutLive(siblings)
    },
    [cols, setDraftLayoutLive],
  )

  const onCardMovePointerDown = useCallback(
    (item: DevelopEliteGridLayoutItem, e: ReactPointerEvent<HTMLDivElement>) => {
      if (!layoutEditMode) return
      e.preventDefault()
      e.stopPropagation()
      const root = rootRef.current
      if (!root) return

      const handle = e.currentTarget
      const startItem = { ...item }
      const startLayout = layoutRef.current.map(l => ({ ...l }))
      const scrollTop = scrollParentRef.current?.scrollTop ?? 0
      const rootRect = root.getBoundingClientRect()
      const rowHeight = rowStrideRef.current
      const cellLeft = GRID_MARGIN_X + startItem.x * (colUnitPx + GRID_MARGIN_X)
      const cellTop = GRID_MARGIN_Y + startItem.y * (rowHeight + GRID_MARGIN_Y)
      const grabOffsetX = e.clientX - rootRect.left - cellLeft
      const grabOffsetY = e.clientY - rootRect.top + scrollTop - cellTop

      const initialCell = pointerToGridCell(
        e.clientX,
        e.clientY,
        rootRect,
        scrollTop,
        cols,
        rowHeight,
        GRID_MARGIN_X,
        GRID_MARGIN_Y,
        startItem.w,
        startItem.h,
      )
      const initialPlaceholder: GridDragPlaceholder = {
        x: initialCell.x,
        y: initialCell.y,
        w: startItem.w,
        h: startItem.h,
      }

      const initialRowLock = Math.max(gridLayoutMaxRow(startLayout), initialPlaceholder.y + initialPlaceholder.h)
      dragSessionRef.current = {
        startItem,
        startLayout,
        grabOffsetX,
        grabOffsetY,
        rowCountLocked: initialRowLock,
        lastPlaceholder: null,
      }
      setDragRowCountLocked(initialRowLock)

      handle.setPointerCapture(e.pointerId)
      setDraggingId(item.i)
      setPlaceholder(initialPlaceholder)
      setGhostPoint({ clientX: e.clientX, clientY: e.clientY })
      document.body.classList.add('develop-elite--widget-dragging')
      notifyDevelopEliteGridDrag(true)

      const ctx0 = buildDropContext(e.nativeEvent, root, scrollTop, rowHeight)
      setDraftLayoutLive(
        previewSiblingsWhileDragging(startLayout, startItem.i, startItem, initialPlaceholder, cols, ctx0),
      )
      dragSessionRef.current.lastPlaceholder = initialPlaceholder

      const cleanupListeners = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
      }

      const onMove = (ev: PointerEvent) => {
        updateDragPreview(ev)
      }

      const onUp = (ev: PointerEvent) => {
        const session = dragSessionRef.current
        dragSessionRef.current = null
        try {
          handle.releasePointerCapture(ev.pointerId)
        } catch {
          /* ignore */
        }
        cleanupListeners()
        document.body.classList.remove('develop-elite--widget-dragging')
        notifyDevelopEliteGridDrag(false)
        setDraggingId(null)
        setShiftActive(false)
        setStackTargetId(null)
        setPlaceholder(null)
        setGhostPoint(null)
        setDragRowCountLocked(null)

        if (!session) {
          setDraftLayoutLive(null)
          return
        }

        const scrollTopEnd = scrollParentRef.current?.scrollTop ?? 0
        const rowHeightEnd = rowStrideRef.current
        const ctx = buildDropContext(ev, root, scrollTopEnd, rowHeightEnd)
        const cell = pointerToGridCell(
          ev.clientX,
          ev.clientY,
          ctx.containerRect,
          scrollTopEnd,
          cols,
          rowHeightEnd,
          GRID_MARGIN_X,
          GRID_MARGIN_Y,
          session.startItem.w,
          session.startItem.h,
        )
        const dropPlaceholder: GridDragPlaceholder = {
          x: cell.x,
          y: cell.y,
          w: session.startItem.w,
          h: session.startItem.h,
        }
        const packed = commitDragAtPlaceholder(session.startLayout, session.startItem, dropPlaceholder, cols, ctx)
        setDraftLayoutLive(null)
        patchActiveLayout(packed)
        notifyDevelopEliteLayoutChanged()
        onLayoutCommit()
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
    },
    [colUnitPx, cols, layoutEditMode, onLayoutCommit, patchActiveLayout, setDraftLayoutLive, updateDragPreview],
  )

  useEffect(() => {
    if (!draggingId) return
    return () => document.body.classList.remove('develop-elite--widget-dragging')
  }, [draggingId])

  const prevLayoutEditModeRef = useRef(layoutEditMode)

  useEffect(() => {
    const wasEditing = prevLayoutEditModeRef.current
    prevLayoutEditModeRef.current = layoutEditMode

    if (wasEditing && !layoutEditMode) {
      const stride = editRowLockRef.current
      const snapshot = draftLayoutRef.current ?? layoutRef.current
      patchActiveLayout(snapshot)
      setDraftLayoutLive(null)
      notifyDevelopEliteLayoutChanged()
      if (stride != null && stride > 0) {
        onGridRowStrideCommit?.(layoutBreakpoint, Math.round(stride))
      }
      editRowLockRef.current = null
      onLayoutCommit()
    }

    if (layoutEditMode) return
    setOpenMenuWidgetId(null)
    if (!wasEditing) {
      setDraftLayoutLive(null)
    }
    setDraggingId(null)
    setResizingId(null)
    setStackTargetId(null)
    setShiftActive(false)
    setPlaceholder(null)
    setGhostPoint(null)
    setDragRowCountLocked(null)
    dragSessionRef.current = null
    resizeSessionRef.current = null
    document.body.classList.remove(
      'develop-elite--widget-dragging',
      'develop-elite--resizing',
      'develop-elite--resize-ns',
      'develop-elite--resize-ew',
      'develop-elite--resize-nesw',
      'develop-elite--resize-nwse',
    )
    notifyDevelopEliteGridDrag(false)
  }, [
    layoutBreakpoint,
    layoutEditMode,
    onGridRowStrideCommit,
    onLayoutCommit,
    patchActiveLayout,
    setDraftLayoutLive,
  ])

  const beginResizeSession = useCallback(
    (item: DevelopEliteGridLayoutItem, edge: GridResizeEdge) => {
      const layoutSnapshot = layoutRef.current.map(l => ({ ...l }))
      const startItem = layoutSnapshot.find(l => l.i === item.i) ?? item
      resizeSessionRef.current = { edge, item: { ...startItem }, layout: layoutSnapshot }
      setResizingId(item.i)
    },
    [],
  )

  const onResizeMove = useCallback(
    (item: DevelopEliteGridLayoutItem, edge: GridResizeEdge, totalDeltaX: number, totalDeltaY: number) => {
      const session = resizeSessionRef.current
      if (!session || session.item.i !== item.i || session.edge !== edge) return
      const resized = resizeGridItemFromDelta(
        session.item,
        edge,
        totalDeltaX,
        totalDeltaY,
        cols,
        colUnitPx + GRID_MARGIN_X,
        rowStrideRef.current + GRID_MARGIN_Y,
      )
      setDraftLayoutLive(applyGridCardResize(session.layout, resized, cols))
    },
    [colUnitPx, cols],
  )

  const endResizeSession = useCallback(() => {
    const next = draftLayoutRef.current ?? layoutRef.current
    resizeSessionRef.current = null
    setResizingId(null)
    setDraftLayoutLive(null)
    patchActiveLayout(next)
    notifyDevelopEliteLayoutChanged()
    onLayoutCommit()
  }, [onLayoutCommit, patchActiveLayout, setDraftLayoutLive])

  const fixedRowPx = rowUnitPx
  const useFixedRowGrid = fixedRowPx > 0
  const editGridHeight = useFixedRowGrid && fixedRowPx != null
    ? rowCount * fixedRowPx + GRID_MARGIN_Y * Math.max(0, rowCount - 1) + GRID_MARGIN_Y * 2
    : 0

  const gridStyle: CSSProperties = {
    display: 'grid',
    width: '100%',
    height: useFixedRowGrid ? editGridHeight : '100%',
    flex: useFixedRowGrid ? '0 0 auto' : '1 1 auto',
    minHeight: 0,
    boxSizing: 'border-box',
    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
    gridTemplateRows: useFixedRowGrid && fixedRowPx != null
      ? `repeat(${rowCount}, ${fixedRowPx}px)`
      : `repeat(${rowCount}, minmax(0, 1fr))`,
    columnGap: GRID_MARGIN_X,
    rowGap: GRID_MARGIN_Y,
    padding: `${GRID_MARGIN_Y}px ${GRID_MARGIN_X}px`,
    alignContent: 'stretch',
    alignItems: 'stretch',
  }

  const layoutById = useMemo(() => new Map(visualLayout.map(item => [item.i, item])), [visualLayout])
  const committedById = useMemo(
    () => new Map(displayLayout.map(item => [item.i, item])),
    [displayLayout],
  )

  const dragSession = dragSessionRef.current
  const ghostRect =
    ghostPoint && draggingId && dragSession && rootRef.current
      ? ghostRectFromPointer(
          ghostPoint.clientX,
          ghostPoint.clientY,
          rootRef.current.getBoundingClientRect(),
          scrollParentRef.current?.scrollTop ?? 0,
          dragSession.grabOffsetX,
          dragSession.grabOffsetY,
          dragSession.startItem.w,
          dragSession.startItem.h,
          colUnitPx,
          rowUnitPx,
          GRID_MARGIN_X,
          GRID_MARGIN_Y,
        )
      : null

  const moveHint = shiftActive
    ? 'Hold shift to group'
    : 'Drag to new position'

  return (
    <div
      ref={rootRef}
      className={`develop-elite__dashboard-grid develop-elite__dashboard-grid--css${shiftActive ? ' is-shift-stack' : ''}${layoutEditMode ? ' is-layout-edit' : ''}`}
      style={gridStyle}
      data-shift-active={shiftActive ? 'true' : 'false'}
      data-row-stride={String(Math.round(rowStridePx))}
    >
      {placeholder ? (
        <div
          className="develop-elite-grid-drop-preview"
          style={{
            gridColumn: `${placeholder.x + 1} / span ${placeholder.w}`,
            gridRow: `${placeholder.y + 1} / span ${placeholder.h}`,
            zIndex: 17,
            pointerEvents: 'none',
          }}
          aria-hidden
        />
      ) : null}
      {ghostRect && draggingId ? (
        <DevelopEliteGridDragGhost
          widgetId={draggingId}
          label={developEliteGridWidgetLabel(draggingId)}
          rect={ghostRect}
        >
          {widgets[draggingId]}
        </DevelopEliteGridDragGhost>
      ) : null}
      {widgetIds
        .filter(id => widgets[id] != null && layoutById.has(id))
        .map(id => {
          const visualItem = layoutById.get(id)!
          const committedItem = committedById.get(id) ?? visualItem
          const isResizing = resizingId === id
          const isDragSource = draggingId === id
          const isStackTarget = stackTargetId === id
          return (
            <div
              key={id}
              className={`develop-elite-grid-item develop-elite-grid-item--cell${isResizing ? ' is-resizing' : ''}${isDragSource ? ' is-drag-source' : ''}${isStackTarget ? ' is-stack-target' : ''}`}
              style={gridAreaStyle(visualItem)}
            >
              <DevelopEliteGridCardControls
                layoutEditMode={layoutEditMode}
                moveHint={moveHint}
                menuOpen={openMenuWidgetId === id}
                onMenuOpenChange={open => setOpenMenuWidgetId(open ? id : null)}
                onMenuAction={action => onWidgetMenuAction(id, action)}
                onMovePointerDown={e => onCardMovePointerDown(committedItem, e)}
                onResizeStart={edge => beginResizeSession(committedItem, edge)}
                onResizeMove={(edge, dx, dy) => onResizeMove(committedItem, edge, dx, dy)}
                onResizeEnd={() => endResizeSession()}
              />
              <div className="develop-elite-grid-item__content">
                {widgets[resolveDevelopEliteGridWidgetContentId(id)] ?? widgets[id]}
              </div>
            </div>
          )
        })}
    </div>
  )
}
