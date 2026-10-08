import { describe, expect, it, vi } from 'vitest'
import { DEVELOP_ELITE_MAP_DEFAULT_VIEW } from './developEliteMapViewport'
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
    expect(easeTo).toHaveBeenCalledWith({
      center: [DEVELOP_ELITE_MAP_DEFAULT_VIEW.center[1], DEVELOP_ELITE_MAP_DEFAULT_VIEW.center[0]],
      zoom: DEVELOP_ELITE_MAP_DEFAULT_VIEW.zoom,
      pitch: 0,
      bearing: 0,
      duration: 0,
    })
  })
})
