import { describe, expect, it, vi } from 'vitest'
import {
  AGRO_CLOUD_MAP_PREFETCH_ZOOM_DELTA,
  AGRO_CLOUD_MAP_TILE_CACHE_MB,
  applyAgroCloudMapPerformanceTuning,
  applyAgroCloudMapWheelZoomAtPoint,
  computeAgroCloudOrbitViewState,
  createAgroCloudOrbitDragState,
  enforceOrbitCameraLock,
} from './agroCloudMapNavigation'

describe('agroCloudMapNavigation performance tuning', () => {
  it('raises cache, prefetch, and parallel tile requests for smooth navigation', () => {
    const setFadeDuration = vi.fn()
    const setMaxParallelImageRequests = vi.fn()
    const setPrefetchedZoomDelta = vi.fn()
    const setMaxTileCacheSize = vi.fn()
    const setMinTileCacheSize = vi.fn()
    applyAgroCloudMapPerformanceTuning({
      scrollZoom: { enable: vi.fn(), setWheelZoomRate: vi.fn() },
      doubleClickZoom: { enable: vi.fn() },
      touchZoomRotate: { enable: vi.fn() },
      boxZoom: { enable: vi.fn() },
      setFadeDuration,
      setMaxParallelImageRequests,
      setPrefetchedZoomDelta,
      setMaxTileCacheSize,
      setMinTileCacheSize,
    })
    expect(setFadeDuration).toHaveBeenCalledWith(0)
    expect(setPrefetchedZoomDelta).toHaveBeenCalledWith(AGRO_CLOUD_MAP_PREFETCH_ZOOM_DELTA)
    expect(setMaxTileCacheSize).toHaveBeenCalledWith(AGRO_CLOUD_MAP_TILE_CACHE_MB * 1024 * 1024)
    expect(setMinTileCacheSize).toHaveBeenCalled()
    expect(setMaxParallelImageRequests).toHaveBeenCalled()
  })
})

describe('agroCloudMapNavigation orbit', () => {
  it('right-drag orbit changes bearing and pitch (3D orbit)', () => {
    const orbit = createAgroCloudOrbitDragState(
      { clientX: 100, clientY: 100, button: 2, shiftKey: false } as MouseEvent,
      10,
      45,
      { zoom0: 12, longitude0: 0, latitude0: 0 },
      true,
    )
    const next = computeAgroCloudOrbitViewState(orbit, 160, 200)
    expect(next.bearing).toBeGreaterThan(10)
    expect(next.pitch).toBeLessThan(45)
  })
})

describe('agroCloudMapNavigation orbit zoom lock', () => {
  it('restores zoom when Mapbox drifts during orbit', () => {
    const jumpTo = vi.fn()
    enforceOrbitCameraLock(
      {
        getZoom: () => 10.5,
        getCenter: () => ({ lng: 1, lat: 2 }),
        jumpTo,
      },
      { zoom0: 12, longitude0: 0, latitude0: 0 },
    )
    expect(jumpTo).toHaveBeenCalledWith(
      expect.objectContaining({ zoom: 12, center: [0, 0], duration: 0 }),
    )
  })
})

describe('agroCloudMapNavigation scroll zoom', () => {
  it('zooms toward cursor via easeTo around point', () => {
    const easeTo = vi.fn()
    const map = {
      getCanvas: () =>
        ({
          getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
        }) as HTMLCanvasElement,
      getZoom: () => 10,
      getMinZoom: () => 0,
      getMaxZoom: () => 18,
      easeTo,
    }

    applyAgroCloudMapWheelZoomAtPoint(map, {
      clientX: 400,
      clientY: 300,
      deltaY: -120,
      deltaMode: 0,
    } as WheelEvent)

    expect(easeTo).toHaveBeenCalledWith(
      expect.objectContaining({
        around: [400, 300],
        zoom: expect.any(Number),
        duration: 0,
      }),
    )
    expect(easeTo.mock.calls[0][0].zoom).toBeGreaterThan(10)
  })
})
