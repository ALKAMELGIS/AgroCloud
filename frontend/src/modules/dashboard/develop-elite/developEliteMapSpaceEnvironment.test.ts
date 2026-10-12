import { describe, expect, it } from 'vitest'
import {
  computeDevelopEliteSpaceBlend,
  DEVELOP_ELITE_SPACE_ZOOM_FULL,
  interpolateDevelopEliteSpaceFog,
} from './developEliteMapSpaceEnvironment'

describe('developEliteMapSpaceEnvironment', () => {
  it('ramps space blend in when zooming out from field to portfolio', () => {
    expect(computeDevelopEliteSpaceBlend({ zoom: 6, pitch: 0, bearing: 0 })).toBeLessThan(0.08)
    const portfolio = computeDevelopEliteSpaceBlend({
      zoom: 1.9,
      pitch: 0,
      bearing: 0,
    })
    expect(portfolio).toBeGreaterThan(0.55)
    expect(
      computeDevelopEliteSpaceBlend({ zoom: DEVELOP_ELITE_SPACE_ZOOM_FULL, pitch: 0, bearing: 0 }),
    ).toBeGreaterThan(0.9)
  })

  it('increases star intensity with space blend', () => {
    const low = interpolateDevelopEliteSpaceFog(0.1)['star-intensity']
    const high = interpolateDevelopEliteSpaceFog(0.95)['star-intensity']
    expect(high).toBeGreaterThan(low)
    expect(high).toBeGreaterThan(0.7)
  })
})
