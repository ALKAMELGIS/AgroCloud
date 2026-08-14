import { describe, expect, it, vi } from 'vitest'
import {
  bindSiGlobeCockpitSpin,
  isSiGlobeCockpit2dActive,
  SI_GLOBE_COCKPIT_2D_VIEW,
  SI_GLOBE_COCKPIT_FOG,
  SI_GLOBE_COCKPIT_MAX_ZOOM,
} from './siGlobeCockpit'

describe('siGlobeCockpit', () => {
  it('uses Mapbox globe atmosphere and stars', () => {
    expect(SI_GLOBE_COCKPIT_FOG['space-color']).toBe('#000000')
    expect(SI_GLOBE_COCKPIT_FOG['high-color']).toBe('#000000')
    expect(SI_GLOBE_COCKPIT_FOG['horizon-blend']).toBe(0.16)
    expect(SI_GLOBE_COCKPIT_FOG['star-intensity']).toBe(0.55)
  })

  it('defaults to centered 2D world view', () => {
    expect(SI_GLOBE_COCKPIT_2D_VIEW.latitude).toBe(0)
    expect(SI_GLOBE_COCKPIT_2D_VIEW.pitch).toBe(0)
    expect(SI_GLOBE_COCKPIT_2D_VIEW.zoom).toBeLessThan(1.2)
  })

  it('detects cockpit mode at world zoom', () => {
    expect(
      isSiGlobeCockpit2dActive(SI_GLOBE_COCKPIT_2D_VIEW, { is3DView: false, hasRegionalFocus: false }),
    ).toBe(true)
    expect(
      isSiGlobeCockpit2dActive(
        { ...SI_GLOBE_COCKPIT_2D_VIEW, zoom: SI_GLOBE_COCKPIT_MAX_ZOOM + 0.5 },
        { is3DView: false, hasRegionalFocus: false },
      ),
    ).toBe(false)
    expect(
      isSiGlobeCockpit2dActive(SI_GLOBE_COCKPIT_2D_VIEW, { is3DView: true, hasRegionalFocus: false }),
    ).toBe(false)
    expect(
      isSiGlobeCockpit2dActive(SI_GLOBE_COCKPIT_2D_VIEW, { is3DView: false, hasRegionalFocus: true }),
    ).toBe(false)
  })

  it('spins Earth via longitude without rotating map bearing', async () => {
    vi.stubGlobal(
      'requestAnimationFrame',
      (cb: FrameRequestCallback) => window.setTimeout(() => cb(performance.now()), 16) as unknown as number,
    )
    vi.stubGlobal(
      'cancelAnimationFrame',
      (id: number) => window.clearTimeout(id),
    )

    let lng = 20
    let lat = 0
    const map = {
      getCenter: () => ({ lng, lat }),
      setCenter: (center: [number, number]) => {
        lng = center[0]
        lat = center[1]
      },
      on: vi.fn(),
      off: vi.fn(),
    }

    const unbind = bindSiGlobeCockpitSpin(map, { isPaused: () => false })

    await vi.waitFor(() => {
      expect(lng).not.toBe(20)
    })

    expect(lat).toBe(0)
    unbind()
    vi.unstubAllGlobals()
  })
})
