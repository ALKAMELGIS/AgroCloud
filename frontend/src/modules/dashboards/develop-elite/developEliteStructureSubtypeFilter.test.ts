import { describe, expect, it } from 'vitest'
import {
  DEVELOP_ELITE_FARM_PLOT_STRUCTURE_CODE,
  DEVELOP_ELITE_PIVOT_STRUCTURE_CODE,
} from './developEliteMapRasterConfig'
import { filterAgroStructuresBySubtype } from './developEliteStructureSubtypeFilter'

function feature(code: number): GeoJSON.Feature {
  return {
    type: 'Feature',
    properties: { Structure_Type: code },
    geometry: { type: 'Point', coordinates: [0, 0] },
  }
}

describe('filterAgroStructuresBySubtype', () => {
  const fc: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [
      feature(DEVELOP_ELITE_FARM_PLOT_STRUCTURE_CODE),
      feature(DEVELOP_ELITE_PIVOT_STRUCTURE_CODE),
      feature(1000),
    ],
  }

  it('returns farm plots and other structure types when pivot off', () => {
    const out = filterAgroStructuresBySubtype(fc, { farmPlots: true, pivot: false })
    expect(out.features).toHaveLength(2)
    expect(out.features.some(f => f.properties?.Structure_Type === DEVELOP_ELITE_FARM_PLOT_STRUCTURE_CODE)).toBe(
      true,
    )
    expect(out.features.some(f => f.properties?.Structure_Type === DEVELOP_ELITE_PIVOT_STRUCTURE_CODE)).toBe(false)
  })

  it('returns pivot and other structure types when farm plots off', () => {
    const out = filterAgroStructuresBySubtype(fc, { farmPlots: false, pivot: true })
    expect(out.features).toHaveLength(2)
    expect(out.features.some(f => f.properties?.Structure_Type === DEVELOP_ELITE_PIVOT_STRUCTURE_CODE)).toBe(true)
    expect(
      out.features.some(f => f.properties?.Structure_Type === DEVELOP_ELITE_FARM_PLOT_STRUCTURE_CODE),
    ).toBe(false)
  })

  it('returns both subtype codes plus other types when both enabled', () => {
    const out = filterAgroStructuresBySubtype(fc, { farmPlots: true, pivot: true })
    expect(out.features).toHaveLength(3)
  })

  it('returns all features when both subtypes off (master layer still on)', () => {
    const out = filterAgroStructuresBySubtype(fc, { farmPlots: false, pivot: false })
    expect(out.features).toHaveLength(3)
  })
})
