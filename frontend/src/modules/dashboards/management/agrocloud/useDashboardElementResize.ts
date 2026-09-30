import { useCallback, useEffect, useRef, useState } from 'react'
import type { AgroCloudDashboardElementSize } from './agroCloudDashboardData'

export const DASHBOARD_ELEMENT_MIN_WIDTH = 120
export const DASHBOARD_ELEMENT_MAX_WIDTH = 960
export const DASHBOARD_ELEMENT_MIN_HEIGHT = 72
export const DASHBOARD_ELEMENT_MAX_HEIGHT = 640

export function clampDashboardElementSize(size: AgroCloudDashboardElementSize): AgroCloudDashboardElementSize {
  const next: AgroCloudDashboardElementSize = {}
  if (typeof size.width === 'number' && Number.isFinite(size.width)) {
    next.width = Math.round(Math.min(DASHBOARD_ELEMENT_MAX_WIDTH, Math.max(DASHBOARD_ELEMENT_MIN_WIDTH, size.width)))
  }
  if (typeof size.height === 'number' && Number.isFinite(size.height)) {
    next.height = Math.round(Math.min(DASHBOARD_ELEMENT_MAX_HEIGHT, Math.max(DASHBOARD_ELEMENT_MIN_HEIGHT, size.height)))
  }
  return next
}

type ResizeSession = {
  elementId: string
  startX: number
  startY: number
  startWidth: number
  startHeight: number
}

type Options = {
  editMode: boolean
  onResizeCommit?: (elementId: string, size: AgroCloudDashboardElementSize) => void
}

export function useDashboardElementResize({ editMode, onResizeCommit }: Options) {
  const sessionRef = useRef<ResizeSession | null>(null)
  const onResizeCommitRef = useRef(onResizeCommit)
  const cleanupRef = useRef<(() => void) | null>(null)
  const [resizingId, setResizingId] = useState<string | null>(null)
  const [liveSize, setLiveSize] = useState<AgroCloudDashboardElementSize | null>(null)

  onResizeCommitRef.current = onResizeCommit

  const endSession = useCallback((e: PointerEvent, commit: boolean) => {
    const session = sessionRef.current
    if (!session) return

    if (commit) {
      const width = session.startWidth + (e.clientX - session.startX)
      const height = session.startHeight + (e.clientY - session.startY)
      onResizeCommitRef.current?.(session.elementId, clampDashboardElementSize({ width, height }))
    }

    sessionRef.current = null
    setResizingId(null)
    setLiveSize(null)
    cleanupRef.current?.()
    cleanupRef.current = null
  }, [])

  const beginResize = useCallback(
    (elementId: string, clientX: number, clientY: number, anchor: HTMLElement) => {
      if (!editMode || !onResizeCommitRef.current) return

      cleanupRef.current?.()

      const rect = anchor.getBoundingClientRect()
      sessionRef.current = {
        elementId,
        startX: clientX,
        startY: clientY,
        startWidth: rect.width,
        startHeight: rect.height,
      }
      setResizingId(elementId)
      setLiveSize({ width: rect.width, height: rect.height })

      const onPointerMove = (e: PointerEvent) => {
        const session = sessionRef.current
        if (!session) return
        e.preventDefault()
        const width = session.startWidth + (e.clientX - session.startX)
        const height = session.startHeight + (e.clientY - session.startY)
        setLiveSize(clampDashboardElementSize({ width, height }))
      }

      const onPointerUp = (e: PointerEvent) => endSession(e, true)
      const onPointerCancel = (e: PointerEvent) => endSession(e, false)

      document.body.classList.add('agrocloud-dashboard-element-resizing')
      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerup', onPointerUp)
      window.addEventListener('pointercancel', onPointerCancel)

      cleanupRef.current = () => {
        document.body.classList.remove('agrocloud-dashboard-element-resizing')
        window.removeEventListener('pointermove', onPointerMove)
        window.removeEventListener('pointerup', onPointerUp)
        window.removeEventListener('pointercancel', onPointerCancel)
      }
    },
    [editMode, endSession],
  )

  useEffect(() => () => cleanupRef.current?.(), [])

  const liveSizeFor = useCallback(
    (elementId: string) => (resizingId === elementId ? liveSize : null),
    [liveSize, resizingId],
  )

  return {
    resizingId,
    beginResize,
    liveSizeFor,
    isResizing: resizingId != null,
  }
}
