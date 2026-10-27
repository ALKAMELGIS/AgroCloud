import { describe, expect, it, vi } from 'vitest'
import { resolveDevelopEliteMapDefaultView } from './developEliteMapViewport'
import { developEliteMapLibreApplyDefaultPortfolioView } from './developEliteMapLibreNavigation'

vi.mock('@/modules/gis/map/maplibreGlobeEnvironment', () => ({
  setMapLibreGlobeProjection: vi.fn(),
  applyMapLibreGlobeGalaxySky: vi.fn(),
}))

describe('developEliteMapLibreApplyDefaultPortfolioView', () => {
  it('eases to flat portfolio home (pitch 0)', () => {
    const easeTo = vi.fn()
    const map = { easeTo, flyTo: vi.fn(), getPitch: () => 0, getBearing: () => 0 }
    developEliteMapLibreApplyDefaultPortfolioView(map as never, { animate: false })
    const view = resolveDevelopEliteMapDefaultView()
    expect(easeTo).toHaveBeenCalledWith({
      center: [view.center[1], view.center[0]],
      zoom: view.zoom,
      pitch: 0,
      bearing: 0,
      duration: 0,
    })
  })
})
