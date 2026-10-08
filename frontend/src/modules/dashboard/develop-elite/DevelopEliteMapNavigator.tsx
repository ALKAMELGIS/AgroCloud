import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { Map as MaplibreMap } from 'maplibre-gl'
import { useDevelopEliteMapLibre } from './developEliteMapLibreContext'
import {
  developEliteMapNavigatorPickZone,
  developEliteMapNavigatorPointerAngleRad,
  type DevelopEliteMapNavigatorZone,
} from './developEliteMapNavigatorGestures'

const PAN_STEP_PX = 72
const ZOOM_STEP = 1

const NAVIGATOR_FAB_HOST_ATTR = 'data-develop-elite-navigator-fab-host'

/** Inline compass so the navigator control stays visible even if icon fonts fail to load. */
export function DevelopEliteMapNavigatorCompassGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? 'develop-elite-map__navigator-compass-glyph'}
      viewBox="0 0 24 24"
      aria-hidden
      focusable="false"
    >
      <circle cx="12" cy="12" r="8.25" fill="none" stroke="currentColor" strokeWidth="1.35" />
      <path fill="currentColor" d="M12 5.25 13.65 12 12 18.75 10.35 12Z" />
      <path fill="currentColor" opacity="0.42" d="M12 5.25 10.35 12 12 18.75 13.65 12Z" />
    </svg>
  )
}

function developEliteMapNavigatorFabPortalHost(map: MaplibreMap): HTMLDivElement {
  const container = map.getContainer()
  const existing = container.querySelector<HTMLDivElement>(`[${NAVIGATOR_FAB_HOST_ATTR}]`)
  if (existing) return existing

  const host = document.createElement('div')
  host.setAttribute(NAVIGATOR_FAB_HOST_ATTR, '')
  host.className = 'develop-elite-map__navigator-fab-host maplibregl-ctrl'

  let corner = container.querySelector('.maplibregl-ctrl-bottom-left')
  if (!corner) {
    let controlRoot = container.querySelector('.maplibregl-control-container')
    if (!controlRoot) {
      controlRoot = document.createElement('div')
      controlRoot.className = 'maplibregl-control-container'
      container.appendChild(controlRoot)
    }
    corner = document.createElement('div')
    corner.className = 'maplibregl-ctrl-bottom-left'
    controlRoot.appendChild(corner)
  }
  corner.appendChild(host)
  return host
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  viewportRef: RefObject<HTMLDivElement | null>
  planarNavigation: boolean
  onPlanarNavigationChange: (planar: boolean) => void
}

function applyZoom(map: MaplibreMap, delta: number): void {
  map.zoomTo(map.getZoom() + delta, { duration: 180 })
}

function applyPan(map: MaplibreMap, dx: number, dy: number): void {
  map.panBy([-dx, -dy], { duration: 0 })
}

/** Right-click map → show navigator (always mounted). */
export function DevelopEliteMapNavigatorContextMenu({
  viewportRef,
  onOpenChange,
}: Pick<Props, 'viewportRef' | 'onOpenChange'>) {
  useEffect(() => {
    const root = viewportRef.current
    if (!root) return
    const onContextMenu = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (
        t.closest(
          '.develop-elite-map__panel, .develop-elite-map__tools, .develop-elite-map__navigator, .develop-elite-map__navigator-fab',
        )
      ) {
        return
      }
      e.preventDefault()
      onOpenChange(true)
    }
    root.addEventListener('contextmenu', onContextMenu)
    return () => root.removeEventListener('contextmenu', onContextMenu)
  }, [onOpenChange, viewportRef])
  return null
}

export function DevelopEliteMapNavigatorFab({
  open,
  onToggle,
}: {
  open: boolean
  onToggle: () => void
}) {
  const { mapRef, mapReady } = useDevelopEliteMapLibre()
  const [portalHost, setPortalHost] = useState<HTMLDivElement | null>(null)

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) {
      setPortalHost(null)
      return
    }
    const host = developEliteMapNavigatorFabPortalHost(map)
    setPortalHost(host)
    return () => {
      host.remove()
    }
  }, [mapReady, mapRef])

  const fab = (
    <button
      type="button"
      className={`develop-elite-map__navigator-fab${open ? ' is-active' : ''}`}
      title="Navigator — pan, rotate, zoom"
      aria-label="Navigator"
      aria-pressed={open}
      onPointerDown={e => e.stopPropagation()}
      onClick={e => {
        e.stopPropagation()
        onToggle()
      }}
    >
      <DevelopEliteMapNavigatorCompassGlyph />
    </button>
  )

  if (portalHost) return createPortal(fab, portalHost)
  return fab
}

export function DevelopEliteMapNavigator({
  open,
  onOpenChange,
  viewportRef,
  planarNavigation,
  onPlanarNavigationChange,
}: Props) {
  const { mapRef, viewMode3d } = useDevelopEliteMapLibre()
  const discRef = useRef<HTMLDivElement | null>(null)
  const gestureRef = useRef<{
    zone: DevelopEliteMapNavigatorZone
    startX: number
    startY: number
    startBearing: number
    startPitch: number
    startAngle: number
    pointerId: number
  } | null>(null)

  const resetNorth = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    map.easeTo({
      bearing: 0,
      pitch: viewMode3d ? map.getPitch() : 0,
      duration: 320,
    })
  }, [mapRef, viewMode3d])

  const faceCardinal = useCallback(
    (bearing: number) => {
      const map = mapRef.current
      if (!map) return
      map.easeTo({ bearing, duration: 280 })
    },
    [mapRef],
  )

  const onDiscPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const map = mapRef.current
      const disc = discRef.current
      if (!map || !disc || e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      const rect = disc.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      const dx = e.clientX - cx
      const dy = e.clientY - cy
      const dist = Math.hypot(dx, dy)
      const maxR = Math.min(rect.width, rect.height) / 2
      const norm = maxR > 0 ? dist / maxR : 0
      const zone = developEliteMapNavigatorPickZone(norm, viewMode3d)
      gestureRef.current = {
        zone,
        startX: e.clientX,
        startY: e.clientY,
        startBearing: map.getBearing(),
        startPitch: map.getPitch(),
        startAngle: developEliteMapNavigatorPointerAngleRad(e.clientX, e.clientY, cx, cy),
        pointerId: e.pointerId,
      }
      disc.setPointerCapture(e.pointerId)
    },
    [mapRef, viewMode3d],
  )

  const onDiscPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const map = mapRef.current
      const g = gestureRef.current
      if (!map || !g || g.pointerId !== e.pointerId) return
      e.preventDefault()
      const dx = e.clientX - g.startX
      const dy = e.clientY - g.startY
      if (g.zone === 'pan') {
        applyPan(map, dx, dy)
        g.startX = e.clientX
        g.startY = e.clientY
        return
      }
      if (g.zone === 'rotate') {
        const disc = discRef.current
        if (!disc) return
        const rect = disc.getBoundingClientRect()
        const cx = rect.left + rect.width / 2
        const cy = rect.top + rect.height / 2
        const angle = developEliteMapNavigatorPointerAngleRad(e.clientX, e.clientY, cx, cy)
        const deltaDeg = ((angle - g.startAngle) * 180) / Math.PI
        map.setBearing(g.startBearing + deltaDeg)
        return
      }
      if (g.zone === 'look' && viewMode3d) {
        map.setBearing(g.startBearing + dx * 0.35)
        map.setPitch(Math.max(0, Math.min(85, g.startPitch - dy * 0.25)))
      }
    },
    [mapRef, viewMode3d],
  )

  const onDiscPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current
    if (!g || g.pointerId !== e.pointerId) return
    gestureRef.current = null
    discRef.current?.releasePointerCapture(e.pointerId)
  }, [])

  const onMoveUp = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    if (viewMode3d && !planarNavigation) {
      map.easeTo({ pitch: Math.max(0, map.getPitch() - 8), duration: 200 })
    } else {
      applyPan(map, 0, -PAN_STEP_PX)
    }
  }, [mapRef, planarNavigation, viewMode3d])

  const onMoveDown = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    if (viewMode3d && !planarNavigation) {
      map.easeTo({ pitch: Math.min(85, map.getPitch() + 8), duration: 200 })
    } else {
      applyPan(map, 0, PAN_STEP_PX)
    }
  }, [mapRef, planarNavigation, viewMode3d])

  if (!open) return null

  return (
    <div
      className="develop-elite-map__navigator"
      role="group"
      aria-label="Map navigator"
      onPointerDown={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
      onDoubleClick={e => e.stopPropagation()}
      onWheel={e => e.stopPropagation()}
    >
      <div className="develop-elite-map__navigator-header">
        <button
          type="button"
          className="develop-elite-map__navigator-btn develop-elite-map__navigator-btn--mini"
          title="Hide navigator"
          aria-label="Hide navigator"
          onClick={() => onOpenChange(false)}
        >
          <i className="fa-solid fa-chevron-down" aria-hidden />
        </button>
        {viewMode3d ? (
          <button
            type="button"
            className={`develop-elite-map__navigator-btn develop-elite-map__navigator-btn--mini${planarNavigation ? ' is-active' : ''}`}
            title="Planar navigation — pan on the ring; off uses tilt on up/down."
            aria-label="Planar navigation"
            aria-pressed={planarNavigation}
            onClick={() => onPlanarNavigationChange(!planarNavigation)}
          >
            <i className="fa-solid fa-up-down-left-right" aria-hidden />
          </button>
        ) : null}
        <button
          type="button"
          className="develop-elite-map__navigator-btn develop-elite-map__navigator-btn--mini"
          title="Reset north"
          aria-label="Reset north"
          onClick={resetNorth}
        >
          <i className="fa-solid fa-compass" aria-hidden />
        </button>
      </div>
      <div className="develop-elite-map__navigator-body">
        <button
          type="button"
          className="develop-elite-map__navigator-btn develop-elite-map__navigator-btn--side develop-elite-map__navigator-btn--up"
          title="Move up"
          aria-label="Move up"
          onClick={onMoveUp}
        >
          <i className="fa-solid fa-arrow-up" aria-hidden />
        </button>
        <button
          type="button"
          className="develop-elite-map__navigator-btn develop-elite-map__navigator-btn--side develop-elite-map__navigator-btn--zoom-in"
          title="Zoom in"
          aria-label="Zoom in"
          onClick={() => {
            const map = mapRef.current
            if (map) applyZoom(map, ZOOM_STEP)
          }}
        >
          <i className="fa-solid fa-plus" aria-hidden />
        </button>
        <div
          className="develop-elite-map__navigator-disc"
          ref={discRef}
          onPointerDown={onDiscPointerDown}
          onPointerMove={onDiscPointerMove}
          onPointerUp={onDiscPointerUp}
          onPointerCancel={onDiscPointerUp}
        >
          <span className="develop-elite-map__navigator-ring develop-elite-map__navigator-ring--pan" aria-hidden />
          <span className="develop-elite-map__navigator-ring develop-elite-map__navigator-ring--rotate" aria-hidden />
          <button
            type="button"
            className="develop-elite-map__navigator-north"
            title="North — click to reset bearing"
            aria-label="North — reset bearing"
            onClick={resetNorth}
          >
            <i className="fa-solid fa-location-arrow" aria-hidden />
          </button>
          <button
            type="button"
            className="develop-elite-map__navigator-cardinal develop-elite-map__navigator-cardinal--n"
            title="Face north"
            aria-label="Face north"
            onClick={() => faceCardinal(0)}
          />
          <button
            type="button"
            className="develop-elite-map__navigator-cardinal develop-elite-map__navigator-cardinal--e"
            title="Face east"
            aria-label="Face east"
            onClick={() => faceCardinal(90)}
          />
          <button
            type="button"
            className="develop-elite-map__navigator-cardinal develop-elite-map__navigator-cardinal--s"
            title="Face south"
            aria-label="Face south"
            onClick={() => faceCardinal(180)}
          />
          <button
            type="button"
            className="develop-elite-map__navigator-cardinal develop-elite-map__navigator-cardinal--w"
            title="Face west"
            aria-label="Face west"
            onClick={() => faceCardinal(-90)}
          />
        </div>
        <button
          type="button"
          className="develop-elite-map__navigator-btn develop-elite-map__navigator-btn--side develop-elite-map__navigator-btn--down"
          title="Move down"
          aria-label="Move down"
          onClick={onMoveDown}
        >
          <i className="fa-solid fa-arrow-down" aria-hidden />
        </button>
        <button
          type="button"
          className="develop-elite-map__navigator-btn develop-elite-map__navigator-btn--side develop-elite-map__navigator-btn--zoom-out"
          title="Zoom out"
          aria-label="Zoom out"
          onClick={() => {
            const map = mapRef.current
            if (map) applyZoom(map, -ZOOM_STEP)
          }}
        >
          <i className="fa-solid fa-minus" aria-hidden />
        </button>
      </div>
      <p className="develop-elite-map__navigator-hint">
        {viewMode3d
          ? 'Outer ring: pan · Middle: rotate · Center: look · Right‑click map to show'
          : 'Outer ring: pan · Inner: rotate · Tap north to reset · Right‑click map to show'}
      </p>
    </div>
  )
}
