import { describe, expect, it, vi } from 'vitest'
import {
  developEliteMapLibreCinematicFlyToLngLat,
  developEliteMapLibreCinematicFlyToPortfolioHome,
} from './developEliteMapLibreCinematicFly'
import { DEVELOP_ELITE_MAP_DEFAULT_VIEW } from './developEliteMapViewport'

vi.mock('@/modules/gis/map/maplibreGlobeEnvironment', () => ({
  setMapLibreGlobeProjection: vi.fn(),
  applyMapLibreGlobeGalaxySky: vi.fn(),
}))

describe('developEliteMapLibreCinematicFlyToLngLat', () => {
  it('uses Google Earth-style flyTo (curve/speed, no short duration)', () => {
    const flyTo = vi.fn()
    const stop = vi.fn()
    const map = {
      flyTo,
      stop,
      getCenter: () => ({ lng: 10, lat: 20 }),
      getZoom: () => 3,
      getPitch: () => 52,
      getBearing: () => 0,
      once: vi.fn(),
      off: vi.fn(),
    }
    document.body.innerHTML = '<div class="develop-elite-map__viewport"></div>'

    const ok = developEliteMapLibreCinematicFlyToLngLat(map as never, 55.1, 25.2, 15, {
      viewMode3d: true,
      floorZoomToCurrent: true,
    })

    expect(ok).toBe(true)
    expect(stop).toHaveBeenCalled()
    expect(flyTo).toHaveBeenCalledOnce()
    const opts = flyTo.mock.calls[0][0]
    expect(opts.center).toEqual([55.1, 25.2])
    expect(opts.zoom).toBeGreaterThanOrEqual(15)
    expect(opts.curve).toBeGreaterThan(1)
    expect(opts.speed).toBeGreaterThan(0)
    expect(opts.maxDuration).toBeGreaterThan(3000)
    expect(opts.essential).toBe(true)
    expect(typeof opts.easing).toBe('function')
    expect(opts.duration).toBeUndefined()
  })
})

describe('developEliteMapLibreCinematicFlyToPortfolioHome', () => {
  it('flies to the fixed product default globe camera', () => {
    const flyTo = vi.fn()
    const map = {
      flyTo,
      stop: vi.fn(),
      getCenter: () => ({ lng: 0, lat: 0 }),
      getZoom: () => 5,
      getPitch: () => 0,
      getBearing: () => 0,
      once: vi.fn(),
      off: vi.fn(),
    }
    document.body.innerHTML = '<div class="develop-elite-map__viewport"></div>'

    developEliteMapLibreCinematicFlyToPortfolioHome(map as never)

    const opts = flyTo.mock.calls[0][0]
    expect(opts.center).toEqual([
      DEVELOP_ELITE_MAP_DEFAULT_VIEW.center[1],
      DEVELOP_ELITE_MAP_DEFAULT_VIEW.center[0],
    ])
    expect(opts.zoom).toBe(DEVELOP_ELITE_MAP_DEFAULT_VIEW.zoom)
    expect(opts.pitch).toBe(DEVELOP_ELITE_MAP_DEFAULT_VIEW.pitch)
  })
})
