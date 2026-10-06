import L from 'leaflet'

type SimpleShapeDrawer = {
  _enabled?: boolean
  _shape?: L.Layer
  _startLatLng?: L.LatLng
  _onMouseMove?: (e: { latlng: L.LatLng }) => void
  _onMouseUp?: (e: { originalEvent?: Event }) => void
}

const MIN_TOUCH_RADIUS_M = 42
const MIN_TOUCH_BOX_M = 48

function metersToLatLngOffset(center: L.LatLng, metersEast: number, metersNorth: number): L.LatLng {
  const latRad = (center.lat * Math.PI) / 180
  const dLat = metersNorth / 111320
  const dLng = metersEast / (111320 * Math.cos(latRad) || 1)
  return L.latLng(center.lat + dLat, center.lng + dLng)
}

/** Nudge sketch so a tap-without-drag still produces a valid circle/rectangle. */
function ensureSimpleShapeFromStart(drawer: SimpleShapeDrawer, kind: 'circle' | 'rectangle'): void {
  if (drawer._shape || !drawer._startLatLng) return
  const edge =
    kind === 'circle'
      ? metersToLatLngOffset(drawer._startLatLng, MIN_TOUCH_RADIUS_M, 0)
      : metersToLatLngOffset(drawer._startLatLng, MIN_TOUCH_BOX_M, MIN_TOUCH_BOX_M)
  try {
    drawer._onMouseMove?.({ latlng: edge })
  } catch {
    /* leaflet-draw teardown */
  }
}

/**
 * After touch/pointer release, commit circle/rectangle if leaflet-draw did not finish
 * (common when React re-renders or the browser steals touchmove).
 */
export function attachSimpleShapeTouchCommit(
  map: L.Map,
  drawer: SimpleShapeDrawer,
  kind: 'circle' | 'rectangle',
): () => void {
  const container = map.getContainer()

  let commitInFlight = false

  const tryCommit = (originalEvent?: Event) => {
    if (!drawer._enabled) return
    if (commitInFlight) return
    commitInFlight = true
    requestAnimationFrame(() => {
      commitInFlight = false
      if (!drawer._enabled) return
      if (!drawer._startLatLng && !drawer._shape) return
      ensureSimpleShapeFromStart(drawer, kind)
      if (!drawer._shape) return
      try {
        drawer._onMouseUp?.({ originalEvent })
      } catch {
        /* drawer already finished */
      }
    })
  }

  /** Touch only — pointerup duplicates leaflet-draw mouseup and can corrupt sketch DOM. */
  const onTouchEnd = (event: TouchEvent) => {
    if (!event.changedTouches?.length) return
    tryCommit(event)
  }

  container.addEventListener('touchend', onTouchEnd, true)

  return () => {
    container.removeEventListener('touchend', onTouchEnd, true)
  }
}
