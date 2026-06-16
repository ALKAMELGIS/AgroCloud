import { describe, expect, it, vi } from 'vitest'
import { applyAgroCloudMapWheelZoomAtPoint } from './agroCloudMapNavigation'

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
