import { describe, expect, it } from 'vitest'
import { clampSiMapPopupToContainer, shiftMarkerOffsetForDock } from './siMapDockReservedZone'

describe('siMapDockReservedZone', () => {
  it('shifts marker left when popup would overlap dock reserve', () => {
    expect(shiftMarkerOffsetForDock(900, 300, 1000, 320, 12)).toBeLessThan(0)
    expect(shiftMarkerOffsetForDock(400, 300, 1000, 320, 12)).toBe(0)
  })

  it('clamps popup left edge away from trailing dock reserve', () => {
    const result = clampSiMapPopupToContainer({
      containerWidth: 1000,
      containerHeight: 800,
      popupWidth: 320,
      popupHeight: 240,
      anchorX: 920,
      anchorY: 400,
      dockReservePx: 300,
      pad: 10,
      offset: 14,
    })
    expect(result.left).toBeLessThanOrEqual(1000 - 320 - 10 - 300)
    expect(result.top).toBeGreaterThanOrEqual(10)
  })
})
