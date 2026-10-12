import type { Map as MaplibreMap } from 'maplibre-gl'
import { MAPLIBRE_GLOBE_FOG_GALAXY, MAPLIBRE_GLOBE_SKY_GALAXY } from '@/modules/gis/map/maplibreGlobeEnvironment'

/** Zoom at which the space backdrop is fully visible (far from Earth). */
export const DEVELOP_ELITE_SPACE_ZOOM_FULL = 0.85
/** Zoom at which stars / Milky Way fade out (near field / surface). */
export const DEVELOP_ELITE_SPACE_ZOOM_FADE_END = 5.25

export type DevelopEliteSpaceCamera = {
  zoom: number
  pitch: number
  bearing: number
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0 || 1))
  return t * t * (3 - 2 * t)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/**
 * 0 = near Earth (field zoom), 1 = deep space (portfolio / zoomed-out globe).
 * Pitch adds visible sky when the camera tilts off nadir.
 */
export function computeDevelopEliteSpaceBlend(camera: DevelopEliteSpaceCamera): number {
  const zoom = Number.isFinite(camera.zoom) ? camera.zoom : DEVELOP_ELITE_SPACE_ZOOM_FULL
  const pitch = Number.isFinite(camera.pitch) ? camera.pitch : 0
  const fromZoom = smoothstep(
    DEVELOP_ELITE_SPACE_ZOOM_FADE_END,
    DEVELOP_ELITE_SPACE_ZOOM_FULL,
    zoom,
  )
  const fromPitch = clamp01(pitch / 58) * 0.28
  return clamp01(Math.max(fromZoom, fromPitch * 0.85))
}

export type DevelopEliteSpaceFog = typeof MAPLIBRE_GLOBE_FOG_GALAXY

export function interpolateDevelopEliteSpaceFog(blend: number): DevelopEliteSpaceFog {
  const t = clamp01(blend)
  return {
    range: MAPLIBRE_GLOBE_FOG_GALAXY.range,
    color: MAPLIBRE_GLOBE_FOG_GALAXY.color,
    'high-color': MAPLIBRE_GLOBE_FOG_GALAXY['high-color'],
    'space-color': MAPLIBRE_GLOBE_FOG_GALAXY['space-color'],
    'horizon-blend': lerp(0.06, MAPLIBRE_GLOBE_FOG_GALAXY['horizon-blend'], t),
    'star-intensity': lerp(0.08, 0.82, t),
  }
}

export function applyDevelopEliteMapSpaceCssVars(
  host: HTMLElement | null | undefined,
  camera: DevelopEliteSpaceCamera,
): number {
  if (!host) return 0
  const blend = computeDevelopEliteSpaceBlend(camera)
  host.style.setProperty('--de-space-blend', String(Number(blend.toFixed(4))))
  host.style.setProperty('--de-space-bearing', `${camera.bearing}deg`)
  host.style.setProperty('--de-space-pitch', `${camera.pitch}deg`)
  host.classList.toggle('develop-elite-map__viewport--space-active', blend > 0.04)
  return blend
}

export function applyDevelopEliteMapSpaceEnvironment(
  map: MaplibreMap | null | undefined,
  host: HTMLElement | null | undefined,
): void {
  if (!map) return
  const zoom = map.getZoom()
  const pitch = map.getPitch()
  const bearing = map.getBearing()
  const blend = applyDevelopEliteMapSpaceCssVars(host, { zoom, pitch, bearing })

  try {
    if (blend <= 0.02) {
      map.setFog?.(null as never)
      map.setSky?.(undefined as never)
    } else {
      map.setFog?.(interpolateDevelopEliteSpaceFog(blend))
      map.setSky?.({
        ...MAPLIBRE_GLOBE_SKY_GALAXY,
        'sky-horizon-blend': lerp(0.02, MAPLIBRE_GLOBE_SKY_GALAXY['sky-horizon-blend'], blend),
        'horizon-fog-blend': lerp(0.04, MAPLIBRE_GLOBE_SKY_GALAXY['horizon-fog-blend'], blend),
      })
    }
  } catch {
    /* style swap */
  }
}

type SpaceBindMap = Pick<MaplibreMap, 'getZoom' | 'getPitch' | 'getBearing' | 'on' | 'off' | 'setFog' | 'setSky'>

/** Phase 3 — spherical stars + Milky Way CSS vars; fog cross-fade while zooming away from Earth. */
export function bindDevelopEliteMapSpaceEnvironment(
  map: SpaceBindMap,
  host: HTMLElement | null | undefined,
): () => void {
  let raf = 0
  const tick = () => {
    raf = 0
    applyDevelopEliteMapSpaceEnvironment(map as MaplibreMap, host)
  }
  const schedule = () => {
    if (raf) return
    raf = requestAnimationFrame(tick)
  }

  schedule()
  map.on('move', schedule)
  map.on('zoom', schedule)
  map.on('rotate', schedule)
  map.on('pitch', schedule)
  map.on('moveend', schedule)

  return () => {
    if (raf) cancelAnimationFrame(raf)
    map.off('move', schedule)
    map.off('zoom', schedule)
    map.off('rotate', schedule)
    map.off('pitch', schedule)
    map.off('moveend', schedule)
    host?.classList.remove('develop-elite-map__viewport--space-active')
  }
}
