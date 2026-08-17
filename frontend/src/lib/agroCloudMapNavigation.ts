import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react'

const AGRO_CLOUD_MAP_LOGO_MARK_URL = `${import.meta.env.BASE_URL}agrocloud-mark-leaves.png`

/** Mapbox GL map instance subset used for navigation helpers. */
export type AgroCloudMapboxMapLike = {
  dragPan?: { enable: () => void; disable: () => void }
  getBearing?: () => number
  getPitch?: () => number
}

export type AgroCloudOrbitDragState = {
  startX: number
  startY: number
  bearing0: number
  pitch0: number
  moved: boolean
  /** Right-button drag — auto-engages 3D elevation on movement. */
  rightElevation?: boolean
}

export type AgroCloudMapViewState = {
  bearing?: number
  pitch?: number
  longitude?: number
  latitude?: number
  zoom?: number
}

/** Shift+drag orbit sensitivity (matches Satellite Intelligence). */
export const AGRO_CLOUD_ORBIT_BEARING_SENSITIVITY = 0.42
export const AGRO_CLOUD_ORBIT_PITCH_SENSITIVITY = 0.38
export const AGRO_CLOUD_MAP_MAX_PITCH = 78
export const AGRO_CLOUD_MAP_MIN_PITCH = 0
/** Higher = faster wheel zoom (Mapbox default is 1/450). */
export const AGRO_CLOUD_MAP_WHEEL_ZOOM_RATE = 1 / 280

/** Swap Mapbox corner wordmark for AgroCloud (call after map load / style load). */
export function applyAgroCloudMapboxBranding(root: ParentNode | null | undefined): void {
  if (!root || typeof document === 'undefined') return

  const patch = () => {
    const logo = root.querySelector('.mapboxgl-ctrl-logo') as HTMLAnchorElement | null
    if (!logo || logo.dataset.agrocloudBranded === '1') return
    logo.dataset.agrocloudBranded = '1'
    logo.href = '#'
    logo.setAttribute('aria-label', 'AgroCloud')
    logo.title = 'AgroCloud'
    logo.removeAttribute('target')
    logo.rel = ''
    logo.classList.add('agrocloud-mapbox-logo')
    logo.style.setProperty('--agrocloud-map-logo-mark', `url("${AGRO_CLOUD_MAP_LOGO_MARK_URL}")`)
    logo.onclick = e => {
      e.preventDefault()
    }
  }

  patch()
  window.requestAnimationFrame(patch)
  hideAgroCloudMapboxAttribution(root)
}

/** Hide Mapbox/Esri compact "Tiles" attribution chip on map chrome. */
export function hideAgroCloudMapboxAttribution(root: ParentNode | null | undefined): void {
  if (!root || typeof document === 'undefined') return
  const remove = () => {
    root.querySelectorAll('.mapboxgl-ctrl-attrib, .mapboxgl-ctrl-attrib-button').forEach(el => {
      el.remove()
    })
  }
  remove()
  window.requestAnimationFrame(remove)
}

/** Spread onto react-map-gl `<Map>` / `<MapboxMap>` for AgroCloud navigation (no draw tools). */
export const AGRO_CLOUD_MAPBOX_NAVIGATION_PROPS = {
  dragRotate: true,
  pitchWithRotate: true,
  touchPitch: true,
  touchZoomRotate: true,
  doubleClickZoom: true,
  scrollZoom: true,
  cooperativeGestures: false as const,
  minPitch: AGRO_CLOUD_MAP_MIN_PITCH,
  maxPitch: AGRO_CLOUD_MAP_MAX_PITCH,
  renderWorldCopies: false,
}

export function clampAgroCloudMapPitch(pitch: number): number {
  return Math.max(AGRO_CLOUD_MAP_MIN_PITCH, Math.min(AGRO_CLOUD_MAP_MAX_PITCH, pitch))
}

export function setMapboxDragPanEnabled(map: AgroCloudMapboxMapLike | null | undefined, enabled: boolean): void {
  try {
    if (enabled) map?.dragPan?.enable()
    else map?.dragPan?.disable()
  } catch {
    /* ignore */
  }
}

export type AgroCloudMapboxMapScrollLike = AgroCloudMapboxMapLike & {
  scrollZoom?: { enable?: () => void; disable?: () => void; setWheelZoomRate?: (rate: number) => void }
  doubleClickZoom?: { enable?: () => void; disable?: () => void }
  touchZoomRotate?: { enable?: () => void; disable?: () => void }
  boxZoom?: { enable?: () => void; disable?: () => void }
  getCanvas?: () => HTMLCanvasElement
  getZoom?: () => number
  getMinZoom?: () => number
  getMaxZoom?: () => number
  jumpTo?: (opts: {
    center?: [number, number]
    zoom?: number
    bearing?: number
    pitch?: number
  }) => void
  easeTo?: (opts: {
    center?: [number, number]
    zoom?: number
    bearing?: number
    pitch?: number
    around?: [number, number]
    duration?: number
  }) => void
  setFadeDuration?: (duration: number) => void
  setProjection?: (projection: { name: string }) => void
  getProjection?: () => { name?: string } | string | undefined
  setMaxParallelImageRequests?: (count: number) => void
  setPrefetchedZoomDelta?: (delta: number) => void
  setMinTileCacheSize?: (bytes: number) => void
  setMaxTileCacheSize?: (bytes: number) => void
  triggerRepaint?: () => void
}

export type SyncAgroCloudMapboxCameraOptions = {
  duration?: number
  /** When set, only bearing/pitch are applied (orbit / tilt). */
  orientationOnly?: boolean
}

/** Apply react-map-gl viewState to the native Mapbox camera (uncontrolled map mode). */
export function syncAgroCloudMapboxCamera(
  map: AgroCloudMapboxMapScrollLike | null | undefined,
  viewState: AgroCloudMapViewState,
  options?: SyncAgroCloudMapboxCameraOptions,
): void {
  if (!map) return
  const duration = options?.duration ?? 0
  const opts: {
    center?: [number, number]
    zoom?: number
    bearing?: number
    pitch?: number
    duration?: number
  } = { duration }

  if (!options?.orientationOnly) {
    if (Number.isFinite(viewState.longitude) && Number.isFinite(viewState.latitude)) {
      opts.center = [viewState.longitude!, viewState.latitude!]
    }
    if (Number.isFinite(viewState.zoom)) opts.zoom = viewState.zoom
  }
  if (Number.isFinite(viewState.bearing)) opts.bearing = viewState.bearing
  if (Number.isFinite(viewState.pitch)) opts.pitch = viewState.pitch

  try {
    if (duration > 0) map.easeTo?.(opts)
    else map.jumpTo?.(opts)
  } catch {
    /* ignore */
  }
}

import { patchMapRasterSourcesMaxNativeZoom } from './rasterTileZoom'

/** Snappy pan/zoom: instant tiles, responsive wheel, no tile cross-fade. */
export function applyAgroCloudMapPerformanceTuning(
  map: AgroCloudMapboxMapScrollLike | null | undefined,
  options?: {
    tileCacheMb?: number
    maxParallelImageRequests?: number
    prefetchZoomDelta?: number
  },
): void {
  if (!map) return
  ensureAgroCloudMapScrollZoom(map)
  try {
    map.setFadeDuration?.(0)
    map.setMaxParallelImageRequests?.(options?.maxParallelImageRequests ?? 10)
    map.setPrefetchedZoomDelta?.(options?.prefetchZoomDelta ?? 2)
    const cacheMb = options?.tileCacheMb ?? 48
    map.setMaxTileCacheSize?.(cacheMb * 1024 * 1024)
  } catch {
    /* ignore — not all Mapbox builds expose cache tuning */
  }
  try {
    patchMapRasterSourcesMaxNativeZoom(map as Parameters<typeof patchMapRasterSourcesMaxNativeZoom>[0])
  } catch {
    /* ignore style/source races during load */
  }
}

/** Mercator at field zoom is far cheaper than globe; globe only for world overview. */
export const AGRO_CLOUD_GLOBE_MAX_ZOOM = 4.5

export function syncAgroCloudMapProjectionForZoom(
  map: AgroCloudMapboxMapScrollLike | null | undefined,
  zoom: number,
): void {
  if (!map?.setProjection) return
  const wantGlobe = zoom < AGRO_CLOUD_GLOBE_MAX_ZOOM
  try {
    const current = map.getProjection?.()
    const name =
      typeof current === 'string'
        ? current
        : typeof current === 'object' && current
          ? String((current as { name?: string }).name ?? '')
          : ''
    const isGlobe = name === 'globe'
    if (wantGlobe && !isGlobe) map.setProjection({ name: 'globe' })
    else if (!wantGlobe && isGlobe) map.setProjection({ name: 'mercator' })
  } catch {
    /* ignore projection swap races during style load */
  }
}

/** Re-enable wheel zoom after style swaps (Mapbox can leave handlers off). */
export function ensureAgroCloudMapScrollZoom(map: AgroCloudMapboxMapScrollLike | null | undefined): void {
  if (!map) return
  try {
    map.scrollZoom?.enable?.()
    map.scrollZoom?.setWheelZoomRate?.(AGRO_CLOUD_MAP_WHEEL_ZOOM_RATE)
    map.doubleClickZoom?.enable?.()
    map.touchZoomRotate?.enable?.()
    map.boxZoom?.enable?.()
  } catch {
    /* ignore */
  }
}

function wheelDeltaToZoomStep(e: WheelEvent): number {
  if (e.deltaMode === 1) return e.deltaY * 0.02
  if (e.deltaMode === 2) return e.deltaY * 0.4
  return e.deltaY * 0.0018
}

/** Wheel zoom at cursor (used when overlays sit above the canvas). */
export function applyAgroCloudMapWheelZoomAtPoint(
  map: AgroCloudMapboxMapScrollLike | null | undefined,
  e: WheelEvent,
): void {
  if (!map) return
  const surface = typeof map.getCanvas === 'function' ? map.getCanvas() : null
  if (!surface) return
  const rect = surface.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  if (x < 0 || y < 0 || x > rect.width || y > rect.height) return

  const zoom = typeof map.getZoom === 'function' ? map.getZoom() : 0
  const minZ = typeof map.getMinZoom === 'function' ? map.getMinZoom() : 0
  const maxZ = typeof map.getMaxZoom === 'function' ? map.getMaxZoom() : 22
  const next = Math.max(minZ, Math.min(maxZ, zoom - wheelDeltaToZoomStep(e)))
  if (next === zoom) return

  try {
    map.easeTo?.({ zoom: next, around: [x, y], duration: 0 })
  } catch {
    try {
      map.easeTo?.({ zoom: next, duration: 0 })
    } catch {
      /* ignore */
    }
  }
}

function shouldConsumeWheelOnScrollHost(host: HTMLElement, e: WheelEvent): boolean {
  const style = window.getComputedStyle(host)
  const canScrollY =
    (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
    host.scrollHeight > host.clientHeight + 1
  const canScrollX =
    (style.overflowX === 'auto' || style.overflowX === 'scroll') &&
    host.scrollWidth > host.clientWidth + 1

  if (canScrollY) {
    if (e.deltaY < 0 && host.scrollTop > 0) return true
    if (e.deltaY > 0 && host.scrollTop + host.clientHeight < host.scrollHeight - 1) return true
  }
  if (canScrollX) {
    if (e.deltaX < 0 && host.scrollLeft > 0) return true
    if (e.deltaX > 0 && host.scrollLeft + host.clientWidth < host.scrollWidth - 1) return true
  }
  return false
}

/**
 * Forward wheel zoom to Mapbox when floating chrome (timeline, toolbox, etc.) sits above the canvas.
 * Mark internal scroll areas with `data-agrocloud-map-wheel-scroll`.
 */
export function bindAgroCloudMapWheelZoomPassthrough(
  host: HTMLElement | null | undefined,
  getMap: () => AgroCloudMapboxMapScrollLike | null | undefined,
): () => void {
  if (!host || typeof window === 'undefined') return () => {}

  const onWheel = (e: WheelEvent) => {
    const map = getMap()
    if (!map) return

    const target = e.target
    if (target instanceof HTMLElement && target.closest('.mapboxgl-canvas')) return

    const scrollHost = target instanceof HTMLElement
      ? (target.closest('[data-agrocloud-map-wheel-scroll]') as HTMLElement | null)
      : null
    if (scrollHost && shouldConsumeWheelOnScrollHost(scrollHost, e)) return

    const canvas = typeof map.getCanvas === 'function' ? map.getCanvas() : null
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    if (
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom
    ) {
      return
    }

    e.preventDefault()
    e.stopPropagation()
    ensureAgroCloudMapScrollZoom(map)
    applyAgroCloudMapWheelZoomAtPoint(map, e)
  }

  host.addEventListener('wheel', onWheel, { passive: false, capture: true })
  return () => host.removeEventListener('wheel', onWheel, { capture: true })
}

export function readMapBearingPitch(
  map: AgroCloudMapboxMapLike | null | undefined,
  fallback: Pick<AgroCloudMapViewState, 'bearing' | 'pitch'>,
): { bearing: number; pitch: number } {
  let bearing = typeof fallback.bearing === 'number' ? fallback.bearing : 0
  let pitch = typeof fallback.pitch === 'number' ? fallback.pitch : 0
  try {
    if (typeof map?.getBearing === 'function') bearing = map.getBearing()
    if (typeof map?.getPitch === 'function') pitch = map.getPitch()
  } catch {
    /* ignore */
  }
  return { bearing, pitch }
}

export function computeAgroCloudOrbitViewState(
  orbit: AgroCloudOrbitDragState,
  clientX: number,
  clientY: number,
): Pick<AgroCloudMapViewState, 'bearing' | 'pitch'> {
  const dx = clientX - orbit.startX
  const dy = clientY - orbit.startY
  return {
    bearing: orbit.bearing0 + dx * AGRO_CLOUD_ORBIT_BEARING_SENSITIVITY,
    pitch: clampAgroCloudMapPitch(orbit.pitch0 - dy * AGRO_CLOUD_ORBIT_PITCH_SENSITIVITY),
  }
}

export function isPrimaryPointerButton(ev: MouseEvent | TouchEvent): boolean {
  if ('button' in ev && ev.button !== 0) return false
  return true
}

/** Shift + primary button starts custom orbit (navigation-only; no pan). */
export function canStartAgroCloudShiftOrbitDrag(ev: MouseEvent | undefined, blocked = false): ev is MouseEvent {
  if (blocked || !ev) return false
  if (!isPrimaryPointerButton(ev)) return false
  return ev.shiftKey
}

/** Right button (no Shift) — tilt/orbit and auto-enable 3D elevation while dragging. */
export function canStartAgroCloudRightElevationOrbitDrag(
  ev: MouseEvent | undefined,
  blocked = false,
): ev is MouseEvent {
  if (blocked || !ev) return false
  if (ev.shiftKey) return false
  return ev.button === 2
}

export function canStartAgroCloudOrbitDrag(ev: MouseEvent | undefined, blocked = false): ev is MouseEvent {
  return canStartAgroCloudShiftOrbitDrag(ev, blocked) || canStartAgroCloudRightElevationOrbitDrag(ev, blocked)
}

/** @deprecated Use {@link canStartAgroCloudShiftOrbitDrag}. */
export function canStartAgroCloudOrbitDragFromShift(ev: MouseEvent | undefined, blocked = false): ev is MouseEvent {
  return canStartAgroCloudShiftOrbitDrag(ev, blocked)
}

export function createAgroCloudOrbitDragState(
  ev: MouseEvent,
  bearing0: number,
  pitch0: number,
  rightElevation = false,
): AgroCloudOrbitDragState {
  return {
    startX: ev.clientX,
    startY: ev.clientY,
    bearing0,
    pitch0,
    moved: false,
    rightElevation,
  }
}

export type UseAgroCloudMapOrbitNavigationOptions = {
  setViewState: Dispatch<SetStateAction<AgroCloudMapViewState>>
  getViewState: () => AgroCloudMapViewState
  getMapInstance: () => AgroCloudMapboxMapLike | null | undefined
  /** When true, orbit drag will not start (e.g. active draw tool in Satellite Intelligence). */
  isOrbitBlocked?: () => boolean
  /** Called when orbit ended after movement (suppress follow-up map click). */
  onOrbitMoved?: () => void
  /** Called when right-drag orbit moves (auto 3D elevation). */
  onElevationOrbitEngaged?: () => void
  /** Attach global pointerup listeners (default true). Set false if host manages pointerup. */
  listenGlobalPointerUp?: boolean
}

export function useAgroCloudMapOrbitNavigation({
  setViewState,
  getViewState,
  getMapInstance,
  isOrbitBlocked,
  onOrbitMoved,
  onElevationOrbitEngaged,
  listenGlobalPointerUp = true,
}: UseAgroCloudMapOrbitNavigationOptions) {
  const orbitRef = useRef<AgroCloudOrbitDragState | null>(null)

  const endOrbitDrag = useCallback((): boolean => {
    const orbit = orbitRef.current
    if (!orbit) return false
    orbitRef.current = null
    setMapboxDragPanEnabled(getMapInstance(), true)
    if (orbit.moved) onOrbitMoved?.()
    return orbit.moved
  }, [getMapInstance, onOrbitMoved])

  const tryStartOrbitFromMapEvent = useCallback(
    (evt: { originalEvent?: MouseEvent } | null | undefined): boolean => {
      const orig = evt?.originalEvent
      const blocked = isOrbitBlocked?.() ?? false
      const rightElevation = canStartAgroCloudRightElevationOrbitDrag(orig, blocked)
      if (!rightElevation && !canStartAgroCloudShiftOrbitDrag(orig, blocked)) return false

      const { bearing, pitch } = readMapBearingPitch(getMapInstance(), getViewState())
      orbitRef.current = createAgroCloudOrbitDragState(orig!, bearing, pitch, rightElevation)
      setMapboxDragPanEnabled(getMapInstance(), false)
      try {
        orig!.preventDefault()
      } catch {
        /* ignore */
      }
      return true
    },
    [getMapInstance, getViewState, isOrbitBlocked],
  )

  const applyOrbitMoveFromMapEvent = useCallback(
    (evt: { originalEvent?: MouseEvent } | null | undefined): boolean => {
      const orbit = orbitRef.current
      const orig = evt?.originalEvent
      if (!orbit || !orig || !('clientX' in orig)) return false

      const dx = orig.clientX - orbit.startX
      const dy = orig.clientY - orbit.startY
      if (Math.abs(dx) + Math.abs(dy) > 2) orbit.moved = true

      if (orbit.rightElevation && orbit.moved) {
        onElevationOrbitEngaged?.()
      }

      const next = computeAgroCloudOrbitViewState(orbit, orig.clientX, orig.clientY)
      const merged = { ...getViewState(), ...next }
      syncAgroCloudMapboxCamera(getMapInstance(), merged, { orientationOnly: true })
      setViewState(prev => ({ ...prev, ...next }))
      return true
    },
    [getMapInstance, getViewState, onElevationOrbitEngaged, setViewState],
  )

  useEffect(() => {
    if (!listenGlobalPointerUp) return
    const onUp = () => {
      endOrbitDrag()
    }
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [endOrbitDrag, listenGlobalPointerUp])

  return {
    orbitRef,
    tryStartOrbitFromMapEvent,
    applyOrbitMoveFromMapEvent,
    endOrbitDrag,
    setDragPanEnabled: (enabled: boolean) => setMapboxDragPanEnabled(getMapInstance(), enabled),
  }
}
