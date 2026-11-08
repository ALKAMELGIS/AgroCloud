import { describe, expect, it, vi } from 'vitest'
import {
  applyDevelopEliteMapLibrePerformanceTuning,
  DEVELOP_ELITE_MAPLIBRE_PERFORMANCE_OPTIONS,
  DEVELOP_ELITE_MAPLIBRE_WHEEL_ZOOM_RATE,
} from './developEliteMapLibrePerformance'

describe('applyDevelopEliteMapLibrePerformanceTuning', () => {
  it('keeps prefetch off and uses a faster wheel zoom rate', () => {
    const setWheelZoomRate = vi.fn()
    const setPrefetchedZoomDelta = vi.fn()
    applyDevelopEliteMapLibrePerformanceTuning({
      scrollZoom: { enable: vi.fn(), setWheelZoomRate },
      doubleClickZoom: { enable: vi.fn() },
      touchZoomRotate: { enable: vi.fn() },
      boxZoom: { enable: vi.fn() },
      setFadeDuration: vi.fn(),
      setMaxParallelImageRequests: vi.fn(),
      setPrefetchedZoomDelta,
      setMaxTileCacheSize: vi.fn(),
      setMinTileCacheSize: vi.fn(),
      setRenderWorldCopies: vi.fn(),
    } as never)
    expect(setPrefetchedZoomDelta).toHaveBeenCalledWith(
      DEVELOP_ELITE_MAPLIBRE_PERFORMANCE_OPTIONS.prefetchZoomDelta,
    )
    expect(setWheelZoomRate).toHaveBeenCalledWith(DEVELOP_ELITE_MAPLIBRE_WHEEL_ZOOM_RATE)
    expect(DEVELOP_ELITE_MAPLIBRE_WHEEL_ZOOM_RATE).toBeGreaterThan(1 / 200)
  })
})
