import { useCallback, useEffect, useRef, useState } from 'react'
import type { DashboardLayoutDropIntent } from './agroCloudDashboardBodyLayout'
import {
  type LayoutDragDropTarget,
  resolveDropTargetAtPointer,
  snapPointerToGrid,
} from './dashboardLayoutDragEngine'

type Options = {
  editMode: boolean
  onLayoutDrop?: (draggedElementId: string, targetElementId: string, intent: DashboardLayoutDropIntent) => void
}

export function useDashboardLayoutDrag({ editMode, onLayoutDrop }: Options) {
  const hostElementsRef = useRef<Map<string, HTMLDivElement>>(new Map())
  const pointerRef = useRef({ x: 0, y: 0, shiftKey: false })
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [ghostPos, setGhostPos] = useState({ x: 0, y: 0 })
  const [dropTarget, setDropTarget] = useState<LayoutDragDropTarget | null>(null)
  const [precisionMode, setPrecisionMode] = useState(false)

  const registerHost = useCallback((elementId: string, node: HTMLDivElement | null) => {
    if (node) hostElementsRef.current.set(elementId, node)
    else hostElementsRef.current.delete(elementId)
  }, [])

  const collectHosts = useCallback(() => {
    return [...hostElementsRef.current.entries()].map(([elementId, node]) => ({
      elementId,
      rect: node.getBoundingClientRect(),
    }))
  }, [])

  const beginDrag = useCallback(
    (elementId: string, clientX: number, clientY: number, shiftKey: boolean) => {
      if (!editMode || !onLayoutDrop) return
      pointerRef.current = { x: clientX, y: clientY, shiftKey }
      setGhostPos({ x: clientX, y: clientY })
      setDraggingId(elementId)
      setDropTarget(null)
      setPrecisionMode(shiftKey)
    },
    [editMode, onLayoutDrop],
  )

  useEffect(() => {
    if (!draggingId) return

    const readTarget = (x: number, y: number, shiftKey: boolean) =>
      resolveDropTargetAtPointer(x, y, shiftKey, draggingId, collectHosts())

    const onPointerMove = (e: PointerEvent) => {
      e.preventDefault()
      const snapped = e.shiftKey ? snapPointerToGrid(e.clientX, e.clientY) : { x: e.clientX, y: e.clientY }
      pointerRef.current = { x: snapped.x, y: snapped.y, shiftKey: e.shiftKey }
      setPrecisionMode(e.shiftKey)
      setGhostPos(snapped)
      setDropTarget(readTarget(snapped.x, snapped.y, e.shiftKey))
    }

    const onKeyChange = (e: KeyboardEvent) => {
      if (e.key !== 'Shift') return
      const shiftKey = e.type === 'keydown'
      pointerRef.current = { ...pointerRef.current, shiftKey }
      setPrecisionMode(shiftKey)
      const { x, y } = pointerRef.current
      const snapped = shiftKey ? snapPointerToGrid(x, y) : { x, y }
      setGhostPos(snapped)
      setDropTarget(readTarget(snapped.x, snapped.y, shiftKey))
    }

    const onPointerUp = (e: PointerEvent) => {
      const target = readTarget(e.clientX, e.clientY, e.shiftKey)
      if (target && onLayoutDrop) onLayoutDrop(draggingId, target.targetElementId, target.intent)
      setDraggingId(null)
      setDropTarget(null)
    }

    document.body.classList.add('agrocloud-dashboard-layout-dragging')
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('keydown', onKeyChange)
    window.addEventListener('keyup', onKeyChange)

    return () => {
      document.body.classList.remove('agrocloud-dashboard-layout-dragging')
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('keydown', onKeyChange)
      window.removeEventListener('keyup', onKeyChange)
    }
  }, [collectHosts, draggingId, onLayoutDrop])

  return {
    draggingId,
    ghostPos,
    dropTarget,
    precisionMode,
    beginDrag,
    registerHost,
    isDragging: draggingId != null,
  }
}
