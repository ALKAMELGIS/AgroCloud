import { describe, expect, it } from 'vitest'
import {
  computeStableGisFeatureKey,
  findFeatureIndexByStableKey,
  gisFeatureIdFromProperties,
} from './gisFeatureStableKey'

describe('gisFeatureStableKey', () => {
  it('uses OBJECT_ID from Example.xlsx attributes', () => {
    const ft = { type: 'Feature', properties: { OBJECT_ID: 'OBJ-042', AREA_HA: 1.2 }, geometry: null }
    expect(computeStableGisFeatureKey(ft, 7)).toBe('OBJECT_ID:OBJ-042')
  })

  it('skips placeholder None ids', () => {
    const ft = { type: 'Feature', properties: { OBJECT_ID: 'None' }, geometry: null }
    expect(computeStableGisFeatureKey(ft, 3)).toBe('idx:3')
  })

  it('finds feature by stable key', () => {
    const features = [
      { properties: { OBJECT_ID: 'OBJ-001' } },
      { properties: { OBJECT_ID: 'OBJ-002' } },
    ]
    expect(findFeatureIndexByStableKey(features, 'OBJECT_ID:OBJ-002')).toBe(1)
  })

  it('extracts Feature_ID alias', () => {
    expect(gisFeatureIdFromProperties({ Feature_ID: 'SF-00001' })?.key).toBe('Feature_ID:SF-00001')
  })
})
