import type { AgroCloudMapViewState } from '../../lib/agroCloudMapNavigation'

/** Default centered 2D globe — full Earth in the map canvas (Satellite Intelligence cockpit). */
export const SI_GLOBE_COCKPIT_2D_VIEW: AgroCloudMapViewState = {
  longitude: 20,
  latitude: 0,
  zoom: 1.06,
  pitch: 0,
  bearing: 0,
}

export const SI_GLOBE_COCKPIT_MAX_ZOOM = 2.75
export const SI_GLOBE_COCKPIT_MAX_PITCH = 12

export const SI_GLOBE_COCKPIT_FOG = {
  range: [0.4, 9] as [number, number],
  color: '#000000',
  'horizon-blend': 0.16,
  'high-color': '#000000',
  'space-color': '#000000',
  'star-intensity': 0.55,
}

/** One full Earth rotation — slow longitude spin; starfield stays fixed (no bearing spin). */
export const SI_GLOBE_COCKPIT_SPIN_SECONDS = 300

export function isSiGlobeCockpit2dActive(
  viewState: AgroCloudMapViewState,
  options?: {
    is3DView?: boolean
    hasRegionalFocus?: boolean
  },
): boolean {
  if (options?.is3DView) return false
  if (options?.hasRegionalFocus) return false
  const zoom = typeof viewState.zoom === 'number' ? viewState.zoom : 0
  const pitch = typeof viewState.pitch === 'number' ? viewState.pitch : 0
  return zoom <= SI_GLOBE_COCKPIT_MAX_ZOOM && pitch <= SI_GLOBE_COCKPIT_MAX_PITCH
}

export function applySiGlobeCockpitFog(
  map: {
    setFog?: (fog: typeof SI_GLOBE_COCKPIT_FOG) => void
    getCanvas?: () => HTMLCanvasElement
  } | null | undefined,
): void {
  if (!map?.setFog) return
  try {
    map.setFog(SI_GLOBE_COCKPIT_FOG)
    const canvas = map.getCanvas?.()
    if (canvas) canvas.style.removeProperty('background')
  } catch {
    /* ignore */
  }
}

type CockpitSpinMap = {
  getCenter: () => { lng: number; lat: number }
  setCenter: (center: [number, number]) => void
  on: (type: string, listener: (...args: unknown[]) => void) => void
  off: (type: string, listener: (...args: unknown[]) => void) => void
}

function wrapLongitude(lng: number): number {
  const wrapped = ((lng + 180) % 360 + 360) % 360 - 180
  return wrapped === -180 ? 180 : wrapped
}

export function bindSiGlobeCockpitSpin(
  map: CockpitSpinMap,
  options: {
    isPaused: () => boolean
    onUserEngaged?: () => void
  },
): () => void {
  let raf = 0
  let lastTs = 0
  const degPerMs = 360 / (SI_GLOBE_COCKPIT_SPIN_SECONDS * 1000)

  const step = (ts: number) => {
    raf = requestAnimationFrame(step)
    if (options.isPaused()) {
      lastTs = ts
      return
    }
    if (!lastTs) {
      lastTs = ts
      return
    }
    const delta = ts - lastTs
    lastTs = ts
    if (delta > 96) return
    try {
      const center = map.getCenter()
      const nextLng = wrapLongitude(center.lng + degPerMs * delta)
      map.setCenter([nextLng, center.lat])
    } catch {
      /* ignore */
    }
  }

  const onEngage = (ev?: { originalEvent?: unknown }) => {
    if (ev?.originalEvent) options.onUserEngaged?.()
  }

  map.on('mousedown', onEngage)
  map.on('touchstart', onEngage)
  map.on('wheel', onEngage)
  map.on('dragstart', onEngage)

  raf = requestAnimationFrame(step)

  return () => {
    cancelAnimationFrame(raf)
    map.off('mousedown', onEngage)
    map.off('touchstart', onEngage)
    map.off('wheel', onEngage)
    map.off('dragstart', onEngage)
  }
}
