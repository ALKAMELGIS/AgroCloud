import { describe, expect, it } from 'vitest'
import {
  DEVELOP_ELITE_MAP_DEFAULT_VIEW,
  DEVELOP_ELITE_MAP_DEFAULT_VIEW_3D,
  DEVELOP_ELITE_PORTFOLIO_MAX_ZOOM,
  isDevelopEliteMapPortfolio3dActive,
  resolveDevelopElitePortfolioBounds,
} from './developEliteMapViewport'

describe('developEliteMapViewport', () => {
  it('uses fallback bounds when world countries are empty', () => {
    const b = resolveDevelopElitePortfolioBounds({ type: 'FeatureCollection', features: [] })
    expect(b.isValid()).toBe(true)
    expect(b.getSouth()).toBeLessThan(0)
    expect(b.getNorth()).toBeGreaterThan(40)
  })

  it('keeps portfolio max zoom at continental scale', () => {
    expect(DEVELOP_ELITE_PORTFOLIO_MAX_ZOOM).toBeLessThanOrEqual(5)
    expect(DEVELOP_ELITE_MAP_DEFAULT_VIEW.zoom).toBe(1.9)
    expect(DEVELOP_ELITE_MAP_DEFAULT_VIEW.center).toEqual([2.5, 17.5])
    expect(DEVELOP_ELITE_MAP_DEFAULT_VIEW.pitch).toBe(0)
  })

  it('does not enable 3D Topographic on browser refresh by default', () => {
    expect(DEVELOP_ELITE_MAP_DEFAULT_VIEW_3D).toBe(false)
    expect(isDevelopEliteMapPortfolio3dActive(false)).toBe(false)
    expect(isDevelopEliteMapPortfolio3dActive(true)).toBe(true)
  })
})
