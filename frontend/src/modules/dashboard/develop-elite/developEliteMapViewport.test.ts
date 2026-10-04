import { describe, expect, it } from 'vitest'
import {
  DEVELOP_ELITE_MAP_DEFAULT_ZOOM,
  DEVELOP_ELITE_PORTFOLIO_MAX_ZOOM,
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
    expect(DEVELOP_ELITE_MAP_DEFAULT_ZOOM).toBeLessThanOrEqual(4)
  })
})
